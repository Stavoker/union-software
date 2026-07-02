import { createRequire } from "module";
import dns from "dns/promises";
import { Resolver } from "dns";
import { resolveNsBestEffort } from "./publicDns.js";
import { upsertDnsmgrTxtRecord, deleteAllDnsmgrTxtRecordsForName } from "./zomroDnsmgr.js";

const require = createRequire(import.meta.url);
const acme = require("acme-client");

/** acme-client передає для dns-01 уже готове значення TXT (base64url SHA256 від token.thumbprint); не хешувати повторно. */
function dns01TxtFromKeyAuthorization(keyAuthorization) {
  return String(keyAuthorization || "").trim();
}

function acmeChallengeFqdn(identifierValue) {
  const id = String(identifierValue || "").trim();
  if (id.startsWith("*.")) {
    return `_acme-challenge.${id.slice(2)}`;
  }
  return `_acme-challenge.${id}`;
}

function txtRecordNameRelativeToZone(challengeFqdn, zoneApex) {
  const fqdn = challengeFqdn.toLowerCase();
  const zone = String(zoneApex || "").trim().toLowerCase();
  if (!zone) {
    throw new Error("SSL: zone apex is required");
  }
  if (fqdn === zone) {
    return "@";
  }
  const suffix = `.${zone}`;
  if (!fqdn.endsWith(suffix)) {
    throw new Error(`SSL: challenge host ${fqdn} is not under zone ${zone}`);
  }
  return fqdn.slice(0, -suffix.length);
}

function flattenTxtRecords(records) {
  return records
    .map((chunk) => chunk.join(""))
    .map((s) => normalizeDnsTxtValue(s))
    .filter(Boolean);
}

function normalizeDnsTxtValue(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "");
}

/** TXT з конкретного NS-хоста (як перевіряє multi-vantage LE). */
function resolveTxtViaAuthoritativeNs(nsHost, fqdn) {
  return new Promise((resolve, reject) => {
    const resolver = new Resolver();
    const ns = String(nsHost || "").trim();
    Promise.all([dns.resolve4(ns).catch(() => []), dns.resolve6(ns).catch(() => [])])
      .then(([v4, v6]) => {
        const ips = [...v4.map(String), ...v6.map(String)].filter(Boolean);
        if (!ips.length) {
          reject(new Error(`NS ${ns} has no A/AAAA`));
          return;
        }
        resolver.setServers(ips);
        resolver.resolveTxt(fqdn, (err, val) => {
          if (err) {
            reject(err);
          } else {
            resolve(val);
          }
        });
      })
      .catch(reject);
  });
}

/**
 * Чи всі авторитативні NS зони `zoneApex` віддають очікуваний digest для `fqdn`.
 * Рекурсивний resolv недостатній: один NS може вже мати TXT, інші — ще ні, а LE перевіряє з різних точок.
 */
async function authoritativeNsTxtDigestStatus(fqdn, expected, zoneApex, { authoritativeNsFallback = [] } = {}) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  const exp = normalizeDnsTxtValue(expected);
  const fallback = (Array.isArray(authoritativeNsFallback) ? authoritativeNsFallback : [])
    .map((h) => String(h || "").trim().toLowerCase())
    .filter(Boolean);
  let nsList = [];
  let resolveNsError = null;
  if (fallback.length) {
    nsList = fallback;
  } else {
    try {
      nsList = await dns.resolveNs(zone);
    } catch (e) {
      resolveNsError = e?.message || String(e);
      return {
        allOk: false,
        nsList: [],
        failures: [{ ns: "(resolveNs)", error: resolveNsError }],
        okCount: 0,
        totalCount: 0,
      };
    }
  }
  const failures = [];
  let okCount = 0;
  for (const nsHost of nsList) {
    const h = String(nsHost || "").trim().toLowerCase();
    try {
      const records = await resolveTxtViaAuthoritativeNs(h, fqdn);
      const flat = flattenTxtRecords(records);
      const onlyExpected = flat.length === 1 && flat[0] === exp;
      if (!onlyExpected) {
        failures.push({
          ns: h,
          error: flat.includes(exp) ? "multiple TXT RRs or stale values" : "digest mismatch or empty",
          got: flat.slice(0, 4),
        });
      } else {
        okCount += 1;
      }
    } catch (e) {
      failures.push({ ns: h, error: e?.message || String(e) });
    }
  }
  return { allOk: failures.length === 0, nsList, failures, okCount, totalCount: nsList.length };
}

function resolveRequiredNsCount(totalCount, minAuthoritativeNsReady) {
  const total = Number(totalCount) || 0;
  const minRaw = Number(minAuthoritativeNsReady);
  if (!Number.isFinite(minRaw) || minRaw <= 0) {
    return total > 0 ? total : 1;
  }
  return Math.max(1, Math.min(total, Math.floor(minRaw)));
}

async function authoritativeNsTxtPresence(fqdn, zoneApex, { authoritativeNsFallback = [] } = {}) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  const fallback = (Array.isArray(authoritativeNsFallback) ? authoritativeNsFallback : [])
    .map((h) => String(h || "").trim().toLowerCase())
    .filter(Boolean);
  let nsList = fallback.length ? fallback : [];
  if (!nsList.length) {
    try {
      nsList = await dns.resolveNs(zone);
    } catch {
      return { nsList: [], present: [] };
    }
  }
  const present = [];
  for (const nsHost of nsList) {
    const h = String(nsHost || "").trim().toLowerCase();
    try {
      const records = await resolveTxtViaAuthoritativeNs(h, fqdn);
      const flat = flattenTxtRecords(records);
      if (flat.length) {
        present.push({ ns: h, got: flat.slice(0, 4) });
      }
    } catch {
      /* NXDOMAIN / empty is fine */
    }
  }
  return { nsList, present };
}

async function waitForTxtClearedOnAuthoritativeNs(
  fqdn,
  zoneApex,
  {
    timeoutMs = 120000,
    intervalMs = 5000,
    logLabel = "",
    authoritativeNsFallback = [],
  } = {}
) {
  const tag = String(logLabel || "").trim();
  const startedAt = Date.now();
  let poll = 0;
  while (Date.now() - startedAt < timeoutMs) {
    poll += 1;
    const { nsList, present } = await authoritativeNsTxtPresence(fqdn, zoneApex, {
      authoritativeNsFallback,
    });
    if (!present.length) {
      if (tag) {
        console.info(`${tag} prior TXT cleared on all ${nsList.length} NS after +${Math.round((Date.now() - startedAt) / 1000)}s`);
      }
      return true;
    }
    if (tag && (poll === 1 || poll % 6 === 0)) {
      console.info(
        `${tag} waiting prior TXT cleanup on ${present.length}/${nsList.length} NS (+${Math.round((Date.now() - startedAt) / 1000)}s)`
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (tag) {
    console.warn(`${tag} prior TXT cleanup timeout after ${Math.round(timeoutMs / 1000)}s; continuing with new challenge`);
  }
  return false;
}

/** Let's Encrypt resolves via public DNS; без NS у батьківській зоні буде NXDOMAIN на _acme-challenge. */
async function waitForPublicZoneDelegation(
  zoneApex,
  logTag,
  { timeoutMs = 600000, pollMs = 10000 } = {}
) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  const startedAt = Date.now();
  let lastErr = "";
  let poll = 0;
  let lastLogAt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    poll += 1;
    const resolved = await resolveNsBestEffort(zone);
    if (resolved.ns.length) {
      if (logTag) {
        console.info(
          `${logTag} public delegation OK (${resolved.ns.length} NS, ${resolved.source}) after +${Math.round((Date.now() - startedAt) / 1000)}s: ${resolved.ns.slice(0, 4).join(", ")}`
        );
      }
      return resolved.ns;
    }
    lastErr = resolved.error || "empty NS set";
    const elapsed = Date.now() - startedAt;
    if (logTag && (poll === 1 || elapsed - lastLogAt >= 30000)) {
      lastLogAt = elapsed;
      console.info(
        `${logTag} waiting public NS delegation (+${Math.round(elapsed / 1000)}s / ${Math.round(timeoutMs / 1000)}s): ${lastErr}`
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `SSL_DNS_ZONE_NOT_PUBLIC|zone=${zone}|timeoutSec=${Math.round(timeoutMs / 1000)}|detail=${lastErr || "timeout"}`
  );
}

async function waitForTxtPropagation(
  fqdn,
  expectedValue,
  zoneApex,
  {
    timeoutMs = 180000,
    intervalMs = 5000,
    logLabel = "",
    minAuthoritativeNsReady = 0,
    authoritativeNsFallback = [],
  } = {}
) {
  const startedAt = Date.now();
  const expected = String(expectedValue || "").trim();
  let poll = 0;
  let lastLogAt = 0;
  const tag = String(logLabel || "").trim();
  while (Date.now() - startedAt < timeoutMs) {
    poll += 1;
    const elapsed = Date.now() - startedAt;
    if (tag && (poll === 1 || elapsed - lastLogAt >= 30000)) {
      lastLogAt = elapsed;
      console.info(`${tag} TXT propagation poll #${poll} (+${Math.round(elapsed / 1000)}s / ${Math.round(timeoutMs / 1000)}s) ${fqdn}`);
    }
    const auth = await authoritativeNsTxtDigestStatus(fqdn, expected, zoneApex, {
      authoritativeNsFallback: authoritativeNsFallback,
    });
    const required = resolveRequiredNsCount(auth.totalCount, minAuthoritativeNsReady);
    const quorumOk = auth.okCount >= required;
    if (quorumOk) {
      if (tag) {
        console.info(
          `${tag} TXT on ${auth.okCount}/${auth.totalCount} authoritative NS (required ${required}) after +${Math.round((Date.now() - startedAt) / 1000)}s (${fqdn})`
        );
      }
      return true;
    }
    if (tag && (poll === 1 || elapsed - lastLogAt >= 30000)) {
      const hint = JSON.stringify(auth.failures || []).slice(0, 500);
      console.info(`${tag} waiting NS sync (${auth.okCount}/${auth.totalCount}, required ${required}): ${hint}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`SSL: TXT did not appear on required authoritative NS in time for ${fqdn}`);
}

export async function issueLetsEncryptCertificateDns01ZomroDnsmgr({
  zoneApex,
  email,
  useStaging = false,
  /** acme-client verifyDnsChallenge wrongly treats TXT character-strings as separate records; we already check authoritative NS. */
  skipChallengeVerification = true,
  dnsPropagationTimeoutMs = 180000,
  dnsPropagationPollMs = 5000,
  dnsPostPropagationDelayMs = 90000,
  dnsTxtCleanupSettleMs = 30000,
  dnsRemoveDelayMs = 120000,
  minAuthoritativeNsReady = 3,
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  txtCreateFunc = "domain.record.edit",
  txtDeleteFunc = "domain.record.delete",
  /** When public resolveNs(apex) is ENOTFOUND (new domain), query these NS directly (e.g. Zomro from automation form). */
  authoritativeNsFallback = [],
  delegationWaitTimeoutMs = 600000,
  delegationWaitPollMs = 10000,
}) {
  if (!zoneApex || !email || !dnsmgrUrl || !zomroUsername || !zomroPassword) {
    throw new Error("SSL(Zomro dnsmgr): required zoneApex/email/dnsmgrUrl/zomroUsername/zomroPassword");
  }

  const nsQuorum = Number(minAuthoritativeNsReady) > 0 ? Number(minAuthoritativeNsReady) : 3;

  const logTag = `[ssl-zomro-dnsmgr][${String(zoneApex).trim().toLowerCase()}]`;
  console.info(`${logTag} starting ACME DNS-01 (staging=${!!useStaging})`);

  await waitForPublicZoneDelegation(zoneApex, logTag, {
    timeoutMs: Number(delegationWaitTimeoutMs) || 600000,
    pollMs: Number(delegationWaitPollMs) || 10000,
  });

  const accountKey = await acme.crypto.createPrivateRsaKey();
  const client = new acme.Client({
    directoryUrl: useStaging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey,
  });

  const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
    altNames: [String(zoneApex).trim().toLowerCase()],
  });

  const challengeRecords = [];
  console.info(`${logTag} acme client.auto (order + dns-01)…`);
  const certificate = await client.auto({
    csr: certificateCsr,
    email: String(email).trim(),
    termsOfServiceAgreed: true,
    challengePriority: ["dns-01"],
    skipChallengeVerification: !!skipChallengeVerification,
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      if (challenge.type !== "dns-01") {
        throw new Error(`SSL: unexpected challenge type ${challenge.type}`);
      }
      const digest = dns01TxtFromKeyAuthorization(keyAuthorization);
      const fqdn = acmeChallengeFqdn(authz.identifier.value);
      const name = txtRecordNameRelativeToZone(fqdn, zoneApex);
      challengeRecords.push({ name, digest });

      console.info(`${logTag} dns-01 challenge: TXT name="${name}" fqdn=${fqdn} func=${txtCreateFunc}`);
      const cleared = await deleteAllDnsmgrTxtRecordsForName({
        dnsmgrUrl,
        zomroUsername,
        zomroPassword,
        domain: zoneApex,
        name,
        func: txtDeleteFunc,
      });
      if (cleared.removed > 0) {
        console.info(`${logTag} removed ${cleared.removed} prior TXT RR(s) for ${name} before new challenge`);
      }
      if (cleared.error) {
        console.warn(`${logTag} prior TXT cleanup warning: ${cleared.error}`);
      }
      const cleanupSettleMs = Number(dnsTxtCleanupSettleMs) || 0;
      if (cleanupSettleMs > 0) {
        await waitForTxtClearedOnAuthoritativeNs(fqdn, zoneApex, {
          timeoutMs: cleanupSettleMs,
          intervalMs: Math.max(3000, Number(dnsPropagationPollMs) || 5000),
          logLabel: logTag,
          authoritativeNsFallback,
        });
      }
      await upsertDnsmgrTxtRecord({
        dnsmgrUrl,
        zomroUsername,
        zomroPassword,
        domain: zoneApex,
        name,
        value: digest,
        ttl: 120,
        func: txtCreateFunc,
      });
      console.info(
        `${logTag} TXT written via dnsmgr; waiting public DNS (timeout ${Number(dnsPropagationTimeoutMs) || 180000}ms, poll ${Number(dnsPropagationPollMs) || 5000}ms)`
      );
      await waitForTxtPropagation(fqdn, digest, zoneApex, {
        timeoutMs: Number(dnsPropagationTimeoutMs) || 180000,
        intervalMs: Number(dnsPropagationPollMs) || 5000,
        logLabel: logTag,
        minAuthoritativeNsReady: nsQuorum,
        authoritativeNsFallback,
      });
      const settleDelay = Number(dnsPostPropagationDelayMs) || 0;
      if (settleDelay > 0) {
        console.info(`${logTag} post-TXT settle delay ${settleDelay}ms (LE validation will follow)`);
        await new Promise((r) => setTimeout(r, settleDelay));
        console.info(`${logTag} post-TXT settle delay done`);
      }
      console.info(`${logTag} pre-LE authoritative recheck (quorum ${nsQuorum} NS)…`);
      await waitForTxtPropagation(fqdn, digest, zoneApex, {
        timeoutMs: Math.max(Number(dnsPropagationTimeoutMs) || 180000, 120000),
        intervalMs: Number(dnsPropagationPollMs) || 5000,
        logLabel: `${logTag} pre-LE`,
        minAuthoritativeNsReady: nsQuorum,
        authoritativeNsFallback,
      });
    },
    challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
      const fqdn = acmeChallengeFqdn(authz.identifier.value);
      const name = txtRecordNameRelativeToZone(fqdn, zoneApex);
      const removeDelay = Number(dnsRemoveDelayMs) || 0;
      if (removeDelay > 0) {
        console.info(`${logTag} challenge cleanup delay ${removeDelay}ms before removing TXT (LE secondary checks)`);
        await new Promise((r) => setTimeout(r, removeDelay));
      }
      console.info(`${logTag} removing all challenge TXT name="${name}" fqdn=${fqdn}`);
      const cleared = await deleteAllDnsmgrTxtRecordsForName({
        dnsmgrUrl,
        zomroUsername,
        zomroPassword,
        domain: zoneApex,
        name,
        func: txtDeleteFunc,
      });
      if (cleared.removed > 0) {
        console.info(`${logTag} removed ${cleared.removed} TXT RR(s) for ${name}`);
      }
    },
  });

  const certPem = Buffer.isBuffer(certificate) ? certificate.toString("utf8") : String(certificate);
  const keyPem = certificateKey.toString();
  console.info(`${logTag} certificate issued OK`);
  return { certificatePem: certPem, privateKeyPem: keyPem, challengeRecords };
}
