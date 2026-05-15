import { createRequire } from "module";
import dns from "dns/promises";

const require = createRequire(import.meta.url);
const acme = require("acme-client");

const SPACESHIP_BASE = "https://spaceship.dev/api/v1";

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
    return { raw: text };
  }
}

/** acme-client для dns-01 дає вже готове значення TXT у keyAuthorization (див. getChallengeKeyAuthorization). */
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

async function waitForTxtPropagation(fqdn, expectedValue, { timeoutMs = 120000, intervalMs = 5000 } = {}) {
  const startedAt = Date.now();
  const expected = String(expectedValue || "").trim();
  if (!expected) {
    throw new Error("SSL: expected TXT challenge value is empty");
  }

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const records = await dns.resolveTxt(fqdn);
      const flattened = records.map((chunk) => chunk.join("")).map((s) => String(s || "").trim());
      if (flattened.includes(expected)) {
        return true;
      }
    } catch {
      // TXT may not be visible yet.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const diagnostics = await collectDnsPropagationDiagnostics(fqdn, expected).catch(() => null);
  const err = new Error(`SSL: TXT record did not propagate in time for ${fqdn}`);
  err.sslDiagnostics = diagnostics;
  throw err;
}

async function collectDnsPropagationDiagnostics(fqdn, expectedValue) {
  const result = {
    fqdn,
    expectedValue,
    recursiveTxt: [],
    authoritativeNs: [],
    authoritativeTxtByNs: [],
  };
  try {
    const recursive = await dns.resolveTxt(fqdn);
    result.recursiveTxt = recursive.map((chunk) => chunk.join(""));
  } catch (e) {
    result.recursiveError = e?.message || String(e);
  }
  const zone = String(fqdn || "").replace(/^_acme-challenge\./, "");
  try {
    const nsList = await dns.resolveNs(zone);
    result.authoritativeNs = nsList;
    for (const nsHost of nsList) {
      const nsIps = [];
      try {
        nsIps.push(...(await dns.resolve4(nsHost)));
      } catch {}
      try {
        nsIps.push(...(await dns.resolve6(nsHost)));
      } catch {}
      if (!nsIps.length) {
        result.authoritativeTxtByNs.push({ ns: nsHost, error: "NS host has no A/AAAA records" });
        continue;
      }
      const resolver = new dns.Resolver();
      resolver.setServers(nsIps.map((ip) => String(ip)));
      try {
        const txt = await resolver.resolveTxt(fqdn);
        result.authoritativeTxtByNs.push({
          ns: nsHost,
          serverIps: nsIps,
          txt: txt.map((chunk) => chunk.join("")),
        });
      } catch (e) {
        result.authoritativeTxtByNs.push({
          ns: nsHost,
          serverIps: nsIps,
          error: e?.message || String(e),
        });
      }
    }
  } catch (e) {
    result.authoritativeNsError = e?.message || String(e);
  }
  return result;
}

async function spaceshipPutDnsRecords(domain, body, apiKey, apiSecret) {
  const response = await fetch(`${SPACESHIP_BASE}/dns/records/${encodeURIComponent(domain)}`, {
    method: "PUT",
    headers: buildSpaceshipHeaders(apiKey, apiSecret),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      payload?.detail || payload?.message || `Spaceship DNS PUT failed (${response.status})`
    );
  }
  return payload;
}

async function spaceshipDeleteDnsRecords(domain, items, apiKey, apiSecret) {
  const response = await fetch(`${SPACESHIP_BASE}/dns/records/${encodeURIComponent(domain)}`, {
    method: "DELETE",
    headers: buildSpaceshipHeaders(apiKey, apiSecret),
    body: JSON.stringify(items),
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok && response.status !== 204) {
    throw new Error(
      payload?.detail || payload?.message || `Spaceship DNS DELETE failed (${response.status})`
    );
  }
  return payload;
}

/**
 * Let's Encrypt через DNS-01 у Spaceship (поки NS ще вказують на Spaceship DNS).
 * Виконувати до зміни NS на сторонні (Zomro).
 */
export async function issueLetsEncryptCertificateDns01Spaceship({
  zoneApex,
  email,
  apiKey,
  apiSecret,
  useStaging = false,
  skipChallengeVerification = false,
  dnsPropagationTimeoutMs = 120000,
  dnsPropagationPollMs = 5000,
  dnsRemoveDelayMs = 120000,
}) {
  if (!zoneApex || !email || !apiKey || !apiSecret) {
    throw new Error("SSL: zoneApex, email, apiKey, apiSecret are required");
  }

  const accountKey = await acme.crypto.createPrivateRsaKey();
  const client = new acme.Client({
    directoryUrl: useStaging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey,
  });

  const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
    altNames: [String(zoneApex).trim().toLowerCase()],
  });

  const challengeRecords = [];

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

      await spaceshipPutDnsRecords(
        zoneApex,
        {
          force: true,
          items: [{ type: "TXT", name, value: digest, ttl: 120 }],
        },
        apiKey,
        apiSecret
      );
      await waitForTxtPropagation(fqdn, digest, {
        timeoutMs: Number(dnsPropagationTimeoutMs) || 120000,
        intervalMs: Number(dnsPropagationPollMs) || 5000,
      });
    },
    challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
      const digest = dns01TxtFromKeyAuthorization(keyAuthorization);
      const fqdn = acmeChallengeFqdn(authz.identifier.value);
      const name = txtRecordNameRelativeToZone(fqdn, zoneApex);
      const removeDelay = Number(dnsRemoveDelayMs) || 0;
      if (removeDelay > 0) {
        await new Promise((r) => setTimeout(r, removeDelay));
      }
      try {
        await spaceshipDeleteDnsRecords(
          zoneApex,
          [{ type: "TXT", name, value: digest }],
          apiKey,
          apiSecret
        );
      } catch {
        // best-effort cleanup
      }
    },
  });

  const certPem = Buffer.isBuffer(certificate) ? certificate.toString("utf8") : String(certificate);
  const keyPem = certificateKey.toString();

  return {
    certificatePem: certPem,
    privateKeyPem: keyPem,
    challengeRecords,
  };
}
