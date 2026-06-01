import dns from "dns/promises";
import { fetchWithRetry } from "./fetchRetry.js";
import { resolveNsBestEffort } from "./publicDns.js";
import { resolveZomroAuthToken } from "./zomroAuth.js";
import { addMasterDomainZomroDnsmgr } from "./zomroDnsmgr.js";
import { issueLetsEncryptCertificateDns01Spaceship } from "./sslLetsEncryptSpaceship.js";
import { issueLetsEncryptCertificateDns01ZomroDnsmgr } from "./sslLetsEncryptZomroDnsmgr.js";
import { createHostProjectDirectory } from "./hostProjectCleanup.js";
import { deploySslCertificateToHost } from "./hostNginxSslDeploy.js";
import { ensurePhpNginxForDeployedDomain } from "./hostDomainFolders.js";

const SPACESHIP_BASE_URL = "https://spaceship.dev/api/v1";
const ZOMRO_BASE_URL = "https://api.zomro.com/";

/**
 * `api.zomro.com` — публічний API Zomro (zomroPost: зона, A-запис, корзина VPS).
 * `dnsmgr` (ZOMRO_DNSMGR_URL) — окрема панель DNS на вузлі (func=auth → domain.edit); див. `zomroDnsmgr.js`.
 * Spaceship — лише реєстратор, не цей шлях.
 */
function buildSpaceshipHeaders(apiKey, apiSecret) {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Secret": apiSecret,
  };
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text || !text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

function normalizeDomainLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function normalizeZone(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function normalizeNameservers(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
  }

  return String(input || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

async function spaceshipRequest(path, options) {
  const response = await fetchWithRetry(`${SPACESHIP_BASE_URL}${path}`, options, {
    retries: 2,
    retryDelayMs: 1000,
    label: `Spaceship ${options?.method || "GET"} ${path}`,
  });
  const payload = await readJsonSafe(response);
  return { response, payload };
}

async function zomroPost(formValues) {
  const form = new FormData();
  for (const [key, value] of Object.entries(formValues)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    form.set(key, String(value));
  }

  const response = await fetchWithRetry(
    ZOMRO_BASE_URL,
    {
      method: "POST",
      body: form,
      cache: "no-store",
    },
    {
      retries: 2,
      retryDelayMs: 1200,
      label: `Zomro func=${formValues.func || "unknown"}`,
    }
  );
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Zomro request failed (${formValues.func || "unknown"})`);
  }
  return payload;
}

function extractLineItemId(payload) {
  return (
    payload?.doc?.["lineitem.id"]?.$ ||
    payload?.doc?.lineitem?.id?.$ ||
    payload?.lineitem?.id ||
    payload?.lineitemId ||
    null
  );
}

async function waitForSpaceshipOperation(operationId, apiKey, apiSecret) {
  const headers = buildSpaceshipHeaders(apiKey, apiSecret);
  const maxChecks = 12;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxChecks; attempt += 1) {
    const { response, payload } = await spaceshipRequest(`/async-operations/${operationId}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || "Failed to read Spaceship async operation status");
    }

    const status = String(payload?.status || "").toLowerCase();
    if (status === "success") {
      return payload;
    }
    if (status === "failed") {
      throw new Error(payload?.message || "Spaceship async operation failed");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Spaceship async operation timeout");
}

/** Поточні NS зони з публічного DNS (до зміни NS у цьому прогоні). Порожній масив — делегування ще не видно / немає. */
async function resolveCurrentDelegationNs(zoneApex) {
  const z = String(zoneApex || "").trim().toLowerCase();
  if (!z) {
    return [];
  }
  const { ns } = await resolveNsBestEffort(z);
  return ns;
}

async function waitForDelegationNsReady(zoneApex, { timeoutMs = 600000, pollMs = 10000 } = {}) {
  const startedAt = Date.now();
  let last = [];
  while (Date.now() - startedAt < timeoutMs) {
    const ns = await resolveCurrentDelegationNs(zoneApex);
    if (ns.length > 0) {
      return { nsHosts: ns, waitedMs: Date.now() - startedAt };
    }
    last = ns;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { nsHosts: last, waitedMs: Date.now() - startedAt };
}

function delegationLooksLikeZomro(nsHosts) {
  return Array.isArray(nsHosts) && nsHosts.some((h) => h.includes("zomro"));
}

async function emitDomainStep(input, domain, step) {
  const id = step?.id || "step";
  const status = step?.pending ? "pending" : step?.skipped ? "skipped" : step?.ok ? "ok" : "fail";
  console.info(`[domain-automation][${domain}] ${id}: ${status}`);
  if (typeof input?.onStep === "function") {
    try {
      await input.onStep({ domain, step });
    } catch (e) {
      console.warn(`[domain-automation][${domain}] onStep(${id}) failed:`, e?.message || e);
    }
  }
}

export async function automateDomainProvisioning(input) {
  const domainLabel = normalizeDomainLabel(input?.domainLabel);
  const zone = normalizeZone(input?.zone);
  const nameservers = normalizeNameservers(input?.nameservers);
  const fullDomain = `${domainLabel}.${zone}`;
  console.info(`[domain-automation][${fullDomain}] provisioning started (skipPurchase=${!!input?.skipPurchase})`);

  const apiKey = String(input?.spaceshipApiKey || "").trim();
  const apiSecret = String(input?.spaceshipApiSecret || "").trim();
  const contactId = String(input?.contactId || "").trim();
  const years = Number(input?.years || 1);

  const hostIp = String(input?.hostIp || "").trim();
  const deployHostIp = String(input?.deployHostIp || hostIp || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const deploySshUser = String(input?.deploySshUser || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const deploySshPassword = String(input?.deploySshPassword || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const deploySshPort = Number(input?.deploySshPort || process.env.SUBDOMAIN_HOST_PORT || 22);
  const deployProjectsBaseDir =
    String(input?.deployProjectsBaseDir || process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() ||
    "/var/www";
  const hostRecordName = String(input?.hostRecordName || "@").trim() || "@";
  const skipPurchase = !!input?.skipPurchase;
  const zomroVpsEnabled = !!input?.zomroVpsEnabled;
  const zomroDnsmgrEnabled = !!input?.zomroDnsmgrEnabled;
  const zomroApiDnsEnabled = input?.zomroApiDnsEnabled !== undefined ? !!input.zomroApiDnsEnabled : !zomroDnsmgrEnabled;
  const zomroDnsmgrUrl = String(input?.zomroDnsmgrUrl || "").trim();
  const zomroDnsmgrDomainEmail = String(input?.zomroDnsmgrDomainEmail || "").trim();
  const zomroPanelUser = String(input?.zomroUsername || "").trim();
  const zomroPanelPass = String(input?.zomroPassword || "").trim();
  const sslEmail = String(input?.sslLetsEncryptEmail || "").trim();
  const sslStaging = !!input?.sslLetsEncryptStaging;
  /** undefined = не задано в body/env; для Zomro dnsmgr тоді пропускаємо локальний DNS-verify acme-client (у ньому баг з chunked TXT). */
  const sslSkipVerifyRaw = input?.sslLetsEncryptSkipVerify;
  const sslSkipVerify = sslSkipVerifyRaw === undefined ? false : !!sslSkipVerifyRaw;
  const sslDnsPropagationTimeoutMs = Number(input?.sslDnsPropagationTimeoutMs || 120000);
  const sslDnsPropagationPollMs = Number(input?.sslDnsPropagationPollMs || 5000);
  const sslMinAuthoritativeNsReady = Number(
    input?.sslMinAuthoritativeNsReady ?? process.env.SSL_MIN_AUTHORITATIVE_NS_READY ?? 3
  );
  const sslDnsRemoveDelayMs = Number(
    input?.sslDnsRemoveDelayMs ?? process.env.SSL_DNS_CHALLENGE_REMOVE_DELAY_MS ?? 120000
  );
  const sslDelegationWaitTimeoutMs = Number(
    input?.sslDelegationWaitTimeoutMs ?? process.env.SSL_DELEGATION_WAIT_TIMEOUT_MS ?? 600000
  );
  const sslDelegationWaitPollMs = Number(
    input?.sslDelegationWaitPollMs ?? process.env.SSL_DELEGATION_WAIT_POLL_MS ?? 10000
  );
  const rawPostDelay = Number(input?.sslDnsPostPropagationDelayMs ?? process.env.SSL_ZOMRO_DNS_POST_DELAY_MS);
  const sslZomroDnsPostDelayMs = Number.isFinite(rawPostDelay) && rawPostDelay >= 0 ? Math.floor(rawPostDelay) : 90000;
  const sslAsync = input?.sslAsync !== false;
  const sslAsyncRetryMs = Number(input?.sslAsyncRetryMs || 10000);
  const onSslRetry = typeof input?.onSslRetry === "function" ? input.onSslRetry : null;
  const zomroDnsmgrTxtCreateFunc = String(input?.zomroDnsmgrTxtCreateFunc || "domain.record.edit").trim();
  const zomroDnsmgrTxtDeleteFunc = String(input?.zomroDnsmgrTxtDeleteFunc || "domain.record.delete").trim();

  if (!domainLabel || !zone) {
    throw new Error("Domain label and zone are required");
  }
  if (!apiKey || !apiSecret) {
    throw new Error("Spaceship API key and secret are required");
  }
  if (!nameservers.length) {
    throw new Error("At least one nameserver is required");
  }
  if (!skipPurchase && !contactId) {
    throw new Error("Spaceship contact ID is required for purchase");
  }
  if (!hostIp) {
    throw new Error("Host IP is required");
  }

  const headers = buildSpaceshipHeaders(apiKey, apiSecret);
  const steps = [];
  const needZomroApiAuth = !!(zomroApiDnsEnabled || zomroVpsEnabled);
  let zomroAuth = null;
  if (needZomroApiAuth) {
    const zomroResolved = await resolveZomroAuthToken({
      zomroAuthThroughKey: input?.zomroAuthThroughKey,
      zomroAuthToken: input?.zomroAuthToken,
      zomroAuthinfo: input?.zomroAuthinfo,
      zomroUsername: input?.zomroUsername,
      zomroPassword: input?.zomroPassword,
      zomroBillmgrUrl: input?.zomroBillmgrUrl,
      zomroBillmgrHost: input?.zomroBillmgrHost,
      zomroBillmgrPort: input?.zomroBillmgrPort,
      zomroBillmgrUseHttps: input?.zomroBillmgrUseHttps,
      zomroDnsmgrUrl: input?.zomroDnsmgrUrl,
    });
    zomroAuth = zomroResolved.token;
    steps.push({
      id: "zomro-auth-resolve",
      ok: true,
      source: zomroResolved.source,
      details: zomroResolved.details ?? null,
    });
  } else {
    steps.push({
      id: "zomro-auth-resolve",
      ok: true,
      skipped: true,
      source: "not_required_dnsmgr_only",
      details: null,
    });
  }

  if (!skipPurchase) {
    const availabilityCheck = await spaceshipRequest(`/domains/${fullDomain}/available`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!availabilityCheck.response.ok) {
      throw new Error(
        availabilityCheck.payload?.detail ||
          availabilityCheck.payload?.message ||
          "Failed to check domain availability in Spaceship"
      );
    }
    steps.push({ id: "spaceship-availability", ok: true, details: availabilityCheck.payload });

    const purchaseBody = {
      autoRenew: false,
      years: Number.isFinite(years) && years > 0 ? years : 1,
      privacyProtection: {
        level: "high",
        userConsent: true,
      },
      contacts: {
        registrant: contactId,
        admin: contactId,
        tech: contactId,
        billing: contactId,
      },
    };
    const purchaseResponse = await spaceshipRequest(`/domains/${fullDomain}`, {
      method: "POST",
      headers,
      body: JSON.stringify(purchaseBody),
    });

    if (purchaseResponse.response.status === 202) {
      const operationId = purchaseResponse.response.headers.get("spaceship-async-operationid");
      if (!operationId) {
        throw new Error("Spaceship purchase accepted but operation id is missing");
      }
      const operationResult = await waitForSpaceshipOperation(operationId, apiKey, apiSecret);
      const purchaseStep = { id: "spaceship-purchase", ok: true, asyncOperationId: operationId, details: operationResult };
      steps.push(purchaseStep);
      await emitDomainStep(input, fullDomain, purchaseStep);
    } else if (purchaseResponse.response.ok) {
      const purchaseStep = { id: "spaceship-purchase", ok: true, details: purchaseResponse.payload };
      steps.push(purchaseStep);
      await emitDomainStep(input, fullDomain, purchaseStep);
    } else {
      throw new Error(
        purchaseResponse.payload?.detail || purchaseResponse.payload?.message || "Failed to purchase domain in Spaceship"
      );
    }
  }

  const nameserverResponse = await spaceshipRequest(`/domains/${fullDomain}/nameservers`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      provider: "custom",
      hosts: nameservers,
    }),
  });
  if (!nameserverResponse.response.ok) {
    throw new Error(
      nameserverResponse.payload?.detail || nameserverResponse.payload?.message || "Failed to update Spaceship nameservers"
    );
  }
  const nsStep = { id: "spaceship-nameservers", ok: true, details: nameserverResponse.payload };
  steps.push(nsStep);
  await emitDomainStep(input, fullDomain, nsStep);

  if (zomroDnsmgrEnabled) {
    if (!zomroDnsmgrUrl) {
      throw new Error("Zomro DNS panel: set ZOMRO_DNSMGR_URL (например https://ns.server-panel.net:1500/dnsmgr)");
    }
    if (!zomroDnsmgrDomainEmail) {
      throw new Error("Zomro DNS panel: set ZOMRO_DNSMGR_DOMAIN_EMAIL or передайте zomroDnsmgrDomainEmail в запросе");
    }
    if (!zomroPanelUser || !zomroPanelPass) {
      throw new Error("Zomro DNS panel: для func=auth на dnsmgr нужны ZOMRO_USERNAME и ZOMRO_PASSWORD (отдельно от ZOMRO_AUTH_TOKEN)");
    }
    const dnsmgrResult = await addMasterDomainZomroDnsmgr({
      dnsmgrUrl: zomroDnsmgrUrl,
      zomroUsername: zomroPanelUser,
      zomroPassword: zomroPanelPass,
      fullDomain,
      ip: hostIp,
      email: zomroDnsmgrDomainEmail,
    });
    steps.push({ id: "zomro-dnsmgr-panel-domain", ok: true, details: dnsmgrResult });
  }

  const zoneFunc = String(input?.zomroZoneFunc || "").trim();
  const recordFunc = String(input?.zomroRecordFunc || "").trim();
  const zoneExtra = input?.zomroZoneExtraParams && typeof input.zomroZoneExtraParams === "object" ? input.zomroZoneExtraParams : {};
  const recordExtra =
    input?.zomroRecordExtraParams && typeof input.zomroRecordExtraParams === "object" ? input.zomroRecordExtraParams : {};

  if (zomroApiDnsEnabled) {
    if (!zoneFunc || !recordFunc) {
      throw new Error("Zomro function names are required for zone and record operations");
    }

    const zonePayload = await zomroPost({
      func: zoneFunc,
      auth: zomroAuth,
      out: "json",
      domain: fullDomain,
      ...zoneExtra,
    });
    steps.push({ id: "zomro-zone", ok: true, details: zonePayload });

    const recordPayload = await zomroPost({
      func: recordFunc,
      auth: zomroAuth,
      out: "json",
      domain: fullDomain,
      name: hostRecordName,
      type: "A",
      ttl: 3600,
      value: hostIp,
      ...recordExtra,
    });
    steps.push({ id: "zomro-record", ok: true, details: recordPayload });
  } else {
    steps.push({
      id: "zomro-zone",
      ok: true,
      skipped: true,
      reason: "zomroApiDnsEnabled=false (dnsmgr-only mode)",
    });
    steps.push({
      id: "zomro-record",
      ok: true,
      skipped: true,
      reason: "zomroApiDnsEnabled=false (dnsmgr-only mode)",
    });
  }

  if (zomroVpsEnabled) {
    const vpsPricelist = String(input?.vpsPricelist || "").trim();
    const vpsOrderPeriod = String(input?.vpsOrderPeriod || "-50").trim();
    const vpsInstancesOs = String(input?.vpsInstancesOs || "").trim();
    const vpsDatacenter = String(input?.vpsDatacenter || "").trim();
    const vpsOrderCount = String(input?.vpsOrderCount || "1").trim();
    const vpsUseSshKey = String(input?.vpsUseSshKey || "off").trim();
    const vpsPassword = String(input?.vpsPassword || "").trim();
    const vpsServername = String(input?.vpsServername || `${domainLabel}-vps`).trim();
    const vpsAddonKey = String(input?.vpsAddonKey || "").trim();
    const vpsAddonValue = String(input?.vpsAddonValue || "").trim();
    const vpsPromocode = String(input?.vpsPromocode || "").trim();
    const vpsPaymethodId = String(input?.vpsPaymethodId || "0").trim();

    if (!vpsPricelist || !vpsInstancesOs || !vpsDatacenter) {
      throw new Error("VPS flow enabled: pricelist, instances_os and datacenter are required");
    }

    const pricelistPayload = await zomroPost({
      func: "v2.instances.order.pricelist",
      auth: zomroAuth,
      out: "json",
    });
    steps.push({ id: "zomro-vps-pricelist", ok: true, details: pricelistPayload });

    const orderParamPayload = await zomroPost({
      func: "v2.instances.order.param",
      auth: zomroAuth,
      out: "json",
      order_period: vpsOrderPeriod,
      pricelist: vpsPricelist,
    });
    steps.push({ id: "zomro-vps-order-param", ok: true, details: orderParamPayload });

    const createOrderPayload = await zomroPost({
      func: "v2.instances.order.param",
      auth: zomroAuth,
      out: "json",
      sok: "ok",
      order_period: vpsOrderPeriod,
      licence_agreement: "on",
      pricelist: vpsPricelist,
      order_count: vpsOrderCount,
      force_use_new_cart: "on",
      instances_os: vpsInstancesOs,
      use_ssh_key: vpsUseSshKey,
      password: vpsUseSshKey === "on" ? undefined : vpsPassword,
      servername: vpsServername,
      datacenter: vpsDatacenter,
      ...(vpsAddonKey && vpsAddonValue ? { [vpsAddonKey]: vpsAddonValue } : {}),
    });
    const lineItemId = extractLineItemId(createOrderPayload);
    if (!lineItemId) {
      throw new Error("Zomro VPS lineitem id is missing in create-order response");
    }
    steps.push({ id: "zomro-vps-cart-add", ok: true, lineItemId, details: createOrderPayload });

    if (vpsPromocode) {
      const promoPayload = await zomroPost({
        func: "cart",
        auth: zomroAuth,
        out: "json",
        sok: "ok",
        promocode: vpsPromocode,
        clicked_button: "apply_promocode",
      });
      steps.push({ id: "zomro-vps-promocode", ok: true, details: promoPayload });
    }

    const confirmPayload = await zomroPost({
      func: "cartorder.create.confirm",
      auth: zomroAuth,
      out: "json",
      sok: "ok",
      elid: lineItemId,
      paymethod_id: vpsPaymethodId,
    });
    steps.push({ id: "zomro-vps-confirm", ok: true, lineItemId, details: confirmPayload });
  }

  const hostCreateWithTarget = await createHostProjectDirectory(fullDomain, {
    sshHost: deployHostIp,
    sshUser: deploySshUser,
    sshPassword: deploySshPassword,
    sshPort: deploySshPort,
  });
  steps.push({
    id: "host-project-dir-create",
    ok: !!hostCreateWithTarget.hostCreated,
    warning: hostCreateWithTarget.hostWarning || null,
    remoteProjectDir: hostCreateWithTarget.remoteProjectDir || null,
    deployHostIp: deployHostIp || null,
  });

  let sslAsyncTask = null;
  if (sslEmail) {
    let delegationNsHosts = await resolveCurrentDelegationNs(fullDomain);
    const requestedNsLookLikeZomro = delegationLooksLikeZomro(nameservers);
    const needDelegationWait =
      delegationNsHosts.length === 0 ||
      (requestedNsLookLikeZomro && !delegationLooksLikeZomro(delegationNsHosts));
    if (needDelegationWait) {
      const configuredTimeout =
        Number.isFinite(sslDelegationWaitTimeoutMs) && sslDelegationWaitTimeoutMs > 0 ? sslDelegationWaitTimeoutMs : 600000;
      const syncCapRaw = Number(process.env.SSL_DELEGATION_SYNC_WAIT_CAP_MS);
      const syncCapMs = Number.isFinite(syncCapRaw) && syncCapRaw > 0 ? syncCapRaw : 300000;
      const waited = await waitForDelegationNsReady(fullDomain, {
        timeoutMs: Math.min(configuredTimeout, syncCapMs),
        pollMs: Number.isFinite(sslDelegationWaitPollMs) && sslDelegationWaitPollMs > 0 ? sslDelegationWaitPollMs : 10000,
      });
      delegationNsHosts = waited.nsHosts;
      steps.push({
        id: "ssl-delegation-wait",
        ok: delegationNsHosts.length > 0,
        waitedMs: waited.waitedMs,
        delegationNsHosts: delegationNsHosts.length ? delegationNsHosts : null,
        warning: delegationNsHosts.length
          ? null
          : "Delegation NS still not visible in public DNS after wait; SSL may fail and retry.",
      });
    }
    const sslUseZomroDnsmgr =
      (delegationLooksLikeZomro(delegationNsHosts) || requestedNsLookLikeZomro) &&
      zomroDnsmgrUrl &&
      zomroPanelUser &&
      zomroPanelPass;

    if (delegationLooksLikeZomro(delegationNsHosts) && !sslUseZomroDnsmgr) {
      throw new Error(
        "SSL: делегування DNS уже на Zomro (NS містять zomro), тож TXT для ACME через API Spaceship не потрапляє в публічний DNS. Додай ZOMRO_DNSMGR_URL і ZOMRO_USERNAME/ZOMRO_PASSWORD у .env (панель dnsmgr), або тимчасово поверни NS на DNS Spaceship до видачі сертифіката."
      );
    }

    const sslProviderLabel = sslUseZomroDnsmgr ? "zomro-dnsmgr" : "spaceship";
    const sslTimeoutMs = sslUseZomroDnsmgr
      ? Math.max(Number(sslDnsPropagationTimeoutMs) || 0, 180000)
      : sslDnsPropagationTimeoutMs;

    const zomroNsFallback = requestedNsLookLikeZomro ? nameservers : [];
    const runSslOnce = sslUseZomroDnsmgr
      ? () =>
          issueLetsEncryptCertificateDns01ZomroDnsmgr({
            zoneApex: fullDomain,
            email: sslEmail,
            useStaging: sslStaging,
            skipChallengeVerification: sslSkipVerifyRaw === false ? false : true,
            dnsPropagationTimeoutMs: sslTimeoutMs,
            dnsPropagationPollMs: sslDnsPropagationPollMs,
            minAuthoritativeNsReady: Number.isFinite(sslMinAuthoritativeNsReady) ? sslMinAuthoritativeNsReady : 3,
            dnsPostPropagationDelayMs: sslZomroDnsPostDelayMs,
            dnsRemoveDelayMs: sslDnsRemoveDelayMs,
            dnsmgrUrl: zomroDnsmgrUrl,
            zomroUsername: zomroPanelUser,
            zomroPassword: zomroPanelPass,
            txtCreateFunc: zomroDnsmgrTxtCreateFunc,
            txtDeleteFunc: zomroDnsmgrTxtDeleteFunc,
            authoritativeNsFallback: zomroNsFallback,
            delegationWaitTimeoutMs: sslDelegationWaitTimeoutMs,
            delegationWaitPollMs: sslDelegationWaitPollMs,
          })
      : () =>
          issueLetsEncryptCertificateDns01Spaceship({
            zoneApex: fullDomain,
            email: sslEmail,
            apiKey,
            apiSecret,
            useStaging: sslStaging,
            skipChallengeVerification: sslSkipVerify,
            dnsPropagationTimeoutMs: sslDnsPropagationTimeoutMs,
            dnsPropagationPollMs: sslDnsPropagationPollMs,
            dnsRemoveDelayMs: sslDnsRemoveDelayMs,
          });

    if (sslAsync) {
      const sslPendingStep = {
        id: "spaceship-ssl-letsencrypt-dns01",
        ok: false,
        pending: true,
        staging: sslStaging,
        provider: sslProviderLabel,
        delegationNsHosts: delegationNsHosts.length ? delegationNsHosts : null,
        warning:
          sslUseZomroDnsmgr
            ? "SSL у фоні: DNS-01 через Zomro dnsmgr (делегування вже на Zomro NS)"
            : "SSL background job started; waiting for DNS propagation/validation",
      };
      steps.push(sslPendingStep);
      await emitDomainStep(input, fullDomain, sslPendingStep);
      sslAsyncTask = (async () => {
        const logPrefix = `[ssl-async][${fullDomain}][${sslProviderLabel}]`;
        console.info(`${logPrefix} background job started`);
        let attempt = 0;
        for (;;) {
          attempt += 1;
          console.info(`${logPrefix} attempt ${attempt} starting`);
          try {
            const sslOut = await runSslOnce();
            console.info(`${logPrefix} attempt ${attempt} finished OK (certificate received)`);
            return sslOut;
          } catch (error) {
            const msg = error?.message || "SSL retry failed";
            console.warn(`${logPrefix} attempt ${attempt} failed: ${msg}`);
            if (onSslRetry) {
              try {
                await onSslRetry({
                  attempt,
                  errorMessage: msg,
                  nextRetryMs: sslAsyncRetryMs > 0 ? sslAsyncRetryMs : 60000,
                  domain: fullDomain,
                });
              } catch {}
            }
            const waitMs = sslAsyncRetryMs > 0 ? sslAsyncRetryMs : 60000;
            console.info(`${logPrefix} retry in ${waitMs}ms`);
            await new Promise((r) => setTimeout(r, waitMs));
          }
        }
      })();
    } else {
      try {
        const sslResult = await runSslOnce();
        const certPem = sslResult.certificatePem && String(sslResult.certificatePem).trim();
        steps.push({
          id: "spaceship-ssl-letsencrypt-dns01",
          ok: !!certPem,
          staging: sslStaging,
          provider: sslProviderLabel,
          challengeRecords: sslResult.challengeRecords,
          certificatePem: sslResult.certificatePem,
          privateKeyPem: sslResult.privateKeyPem,
        });
        if (certPem) {
          try {
            const deploy = await deploySslCertificateToHost({
              domain: fullDomain,
              certificatePem: sslResult.certificatePem,
              privateKeyPem: sslResult.privateKeyPem,
              deployHostIp,
              sshUser: deploySshUser,
              sshPassword: deploySshPassword,
              sshPort: deploySshPort,
              projectsBaseDir: deployProjectsBaseDir,
            });
            let stackReady = undefined;
            if (!deploy.skipped && deploy.ok) {
              try {
                const host = {
                  hostIp: deployHostIp,
                  sshUser: deploySshUser,
                  sshPassword: deploySshPassword,
                  sshPort: deploySshPort,
                  projectsDir: deployProjectsBaseDir,
                };
                const stackResult = await ensurePhpNginxForDeployedDomain({
                  host,
                  domain: fullDomain,
                });
                stackReady = stackResult.stackReady;
              } catch {
                stackReady = false;
              }
            }
            steps.push({
              id: "host-nginx-ssl-deploy",
              ok: deploy.skipped ? true : !!deploy.ok,
              skipped: !!deploy.skipped,
              reason: deploy.reason || null,
              warning: deploy.warning || null,
              remoteProjectDir: deploy.remoteProjectDir || null,
              sslDir: deploy.sslDir || null,
              nginxConfPath: deploy.nginxConfPath || null,
              nginxLinkPath: deploy.nginxLinkPath || null,
              nginxReloaded: !!deploy.nginxReloaded,
              stackReady,
            });
          } catch (e) {
            steps.push({
              id: "host-nginx-ssl-deploy",
              ok: false,
              warning: e?.message || String(e),
            });
          }
        }
      } catch (e) {
        steps.push({
          id: "spaceship-ssl-letsencrypt-dns01",
          ok: false,
          staging: sslStaging,
          provider: sslProviderLabel,
          warning: e?.message || "SSL challenge failed",
          diagnostics: e?.sslDiagnostics || null,
        });
        const wrapped = new Error(e?.message || "SSL challenge failed");
        wrapped.partialResult = {
          ok: false,
          domain: fullDomain,
          nameservers,
          hostIp,
          skipPurchase,
          domainPurchased: !skipPurchase,
          steps,
        };
        throw wrapped;
      }
    }
  }

  const result = {
    ok: true,
    domain: fullDomain,
    nameservers,
    hostIp,
    skipPurchase,
    domainPurchased: !skipPurchase,
    steps,
  };
  if (sslAsyncTask) {
    result.__sslAsyncTask = sslAsyncTask;
  }
  return result;
}
