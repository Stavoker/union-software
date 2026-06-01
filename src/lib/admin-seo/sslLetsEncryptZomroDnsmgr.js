import { createRequire } from "module";
import dns from "dns/promises";
import { Resolver } from "dns";
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
  return records.map((chunk) => chunk.join("")).map((s) => String(s || "").trim());
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
  const exp = String(expected || "").trim();
  let nsList = [];
  let resolveNsError = null;
  try {
    nsList = await dns.resolveNs(zone);
  } catch (e) {
    resolveNsError = e?.message || String(e);
    const fallback = (Array.isArray(authoritativeNsFallback) ? authoritativeNsFallback : [])
      .map((h) => String(h || "").trim().toLowerCase())
      .filter(Boolean);
    if (fallback.length) {
      nsList = fallback;
      console.info(
        `[ssl-zomro-dnsmgr][${zone}] resolveNs failed (${resolveNsError}); using configured NS fallback (${fallback.length} hosts)`
      );
    } else {
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

/** Let's Encrypt resolves via public DNS; без NS у батьківській зоні буде NXDOMAIN на _acme-challenge. */
async function assertPublicZoneDelegation(zoneApex, logTag) {
  const zone = String(zoneApex || "").trim().toLowerCase();
  try {
    const ns = await dns.resolveNs(zone);
    if (!ns.length) {
      throw new Error("empty NS set");
    }
    if (logTag) {
      console.info(`${logTag} public delegation OK (${ns.length} NS): ${ns.slice(0, 4).join(", ")}`);
    }
    return ns;
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(
      `SSL: зона ${zone} ще не видна в публічному DNS (${msg}). Дочекайтесь NS у реєстраторі (dig NS ${zone} +short). Поки делегування немає, Let's Encrypt отримає NXDOMAIN на _acme-challenge — сертифікат не видасться.`
    );
  }
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
  dnsRemoveDelayMs = 120000,
  minAuthoritativeNsReady = 3,
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  txtCreateFunc = "domain.record.edit",
  txtDeleteFunc = "domain.record.delete",
  /** When public resolveNs(apex) is ENOTFOUND (new domain), query these NS directly (e.g. Zomro from automation form). */
  authoritativeNsFallback = [],
}) {
  if (!zoneApex || !email || !dnsmgrUrl || !zomroUsername || !zomroPassword) {
    throw new Error("SSL(Zomro dnsmgr): required zoneApex/email/dnsmgrUrl/zomroUsername/zomroPassword");
  }

  const logTag = `[ssl-zomro-dnsmgr][${String(zoneApex).trim().toLowerCase()}]`;
  console.info(`${logTag} starting ACME DNS-01 (staging=${!!useStaging})`);

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
        minAuthoritativeNsReady: Number(minAuthoritativeNsReady) || 0,
        authoritativeNsFallback,
      });
      await assertPublicZoneDelegation(zoneApex, logTag);
      const settleDelay = Number(dnsPostPropagationDelayMs) || 0;
      if (settleDelay > 0) {
        console.info(`${logTag} post-TXT settle delay ${settleDelay}ms (LE validation will follow)`);
        await new Promise((r) => setTimeout(r, settleDelay));
        console.info(`${logTag} post-TXT settle delay done`);
      }
      const recheck = await authoritativeNsTxtDigestStatus(fqdn, digest, zoneApex, {
        authoritativeNsFallback,
      });
      const requiredRecheck = resolveRequiredNsCount(recheck.totalCount, Number(minAuthoritativeNsReady) || 0);
      const recheckOk = recheck.okCount >= requiredRecheck;
      console.info(
        `${logTag} pre-LE authoritative recheck: ${recheckOk ? `${recheck.okCount}/${recheck.totalCount} ready (required ${requiredRecheck})` : `MISSING quorum: ${JSON.stringify(recheck.failures).slice(0, 400)}`}`
      );
      if (!recheckOk) {
        throw new Error(
          `SSL: TXT quorum not reached before LE (retry): ${JSON.stringify(recheck.failures).slice(0, 400)}`
        );
      }
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
