import {
  INTEGRATION_SETTING_DEFINITIONS,
  envKeyToColumn,
} from "@/lib/integration-setting-definitions";

export { INTEGRATION_SETTING_DEFINITIONS, envKeyToColumn };

export const INTEGRATION_SETTING_KEYS = INTEGRATION_SETTING_DEFINITIONS.map((d) => d.key);

export function getPublicIntegrationDefinitions() {
  return INTEGRATION_SETTING_DEFINITIONS.map((d) => ({
    key: d.key,
    section: d.section,
    secret: d.secret,
    kind: d.kind || "text",
    hint: d.hint || "",
  }));
}

/** Завантажити налаштування користувача та виконати fn з підставленим process.env. */
export async function runWithUserIntegrationSettings(supabase, userId, fn) {
  let userEnv = {};
  try {
    userEnv = await loadIntegrationSettingsForUser(supabase, userId);
  } catch {
    userEnv = {};
  }
  return withUserIntegrationEnv(userEnv, fn);
}

export function isIntegrationSettingsTableError(message) {
  return /account_integration_settings/i.test(String(message || ""));
}

const SECRET_KEYS = new Set(
  INTEGRATION_SETTING_DEFINITIONS.filter((d) => d.secret).map((d) => d.key)
);

function normalizeStoredValues(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out = {};
  for (const key of INTEGRATION_SETTING_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[key] = s;
  }
  return out;
}

import {
  isAcceptableClaudeApiKey,
  normalizeClaudeApiKeyInput,
} from "@/lib/generator-llm-endpoint";

const CLAUDE_KEY_RE = /^CLAUDE_API_KEY_\d+$/i;

export { normalizeClaudeApiKeyInput, isAcceptableClaudeApiKey as isValidClaudeApiKey };

/** Рядок БД: legacy `values` jsonb + колонки; колонки мають пріоритет. */
export function rowToEnvMap(row) {
  if (!row || typeof row !== "object") {
    return {};
  }
  let out = {};
  if (row.values && typeof row.values === "object" && !Array.isArray(row.values)) {
    out = normalizeStoredValues(row.values);
  }
  for (const key of INTEGRATION_SETTING_KEYS) {
    const col = envKeyToColumn(key);
    if (!Object.prototype.hasOwnProperty.call(row, col)) continue;
    const v = row[col];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[key] = s;
    else delete out[key];
  }
  return out;
}

/** map ENV_KEY → value → рядок для upsert (null = очистити). */
export function envMapToDbRow(userId, values) {
  const normalized = normalizeStoredValues(values);
  const row = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  for (const key of INTEGRATION_SETTING_KEYS) {
    row[envKeyToColumn(key)] = normalized[key] ?? null;
  }
  return row;
}

/** Для API automation: map ключ → значення (лише непорожні). */
export function integrationValuesToEnvMap(values) {
  return normalizeStoredValues(values);
}

/** Тимчасово підставляє збережені значення в process.env (для admin-seo, що читає env напряму). */
export async function withUserIntegrationEnv(userEnv, fn) {
  const map = integrationValuesToEnvMap(userEnv);
  const previous = {};
  for (const [key, value] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      previous[key] = process.env[key];
    }
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(map)) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) {
        process.env[key] = previous[key];
      } else {
        delete process.env[key];
      }
    }
  }
}

/** Маскований прев’ю секрету для UI (повне значення не віддаємо). */
export function maskSecretForDisplay(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  const head = s.slice(0, Math.min(12, Math.floor(s.length / 3)));
  const tail = s.slice(-4);
  const hidden = Math.max(4, s.length - head.length - tail.length);
  return `${head}${"•".repeat(Math.min(hidden, 12))}${tail}`;
}

/** Env map (CLAUDE_API_KEY_01) або рядок Supabase. */
function resolveIntegrationValues(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  const looksLikeEnvMap = INTEGRATION_SETTING_KEYS.some((k) =>
    Object.prototype.hasOwnProperty.call(stored, k)
  );
  if (looksLikeEnvMap) {
    return normalizeStoredValues(stored);
  }
  return rowToEnvMap(stored);
}

/** Відповідь для UI: storedPreview — що показувати в інпуті; fields — лише під час редагування. */
export function toPublicSettingsResponse(stored) {
  const values = resolveIntegrationValues(stored);
  const fields = {};
  const configured = {};
  const storedPreview = {};
  for (const def of INTEGRATION_SETTING_DEFINITIONS) {
    const raw = values[def.key] || "";
    const has = !!raw;
    configured[def.key] = has;
    if (!def.secret) {
      fields[def.key] = raw;
      storedPreview[def.key] = has ? raw : "";
    } else {
      fields[def.key] = "";
      storedPreview[def.key] = has ? maskSecretForDisplay(raw) : "";
    }
  }
  return { fields, configured, storedPreview };
}

/** Злиття PATCH з існуючим; порожній secret = не змінювати. */
export function mergeIntegrationSettings(existing, patch) {
  const current = rowToEnvMap(existing);
  const next = { ...current };
  if (!patch || typeof patch !== "object") {
    return next;
  }
  for (const key of INTEGRATION_SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      continue;
    }
    const incoming = patch[key];
    if (incoming === undefined || incoming === null) {
      continue;
    }
    let s = String(incoming).trim();
    if (SECRET_KEYS.has(key) && !s) {
      continue;
    }
    if (CLAUDE_KEY_RE.test(key) && s) {
      s = normalizeClaudeApiKeyInput(s);
      const baseUrl =
        next.ANTHROPIC_BASE_URL ??
        current.ANTHROPIC_BASE_URL ??
        process.env.ANTHROPIC_BASE_URL;
      if (!isAcceptableClaudeApiKey(s, baseUrl)) {
        const err = new Error(`INVALID_CLAUDE_KEY:${key}`);
        err.code = "INVALID_CLAUDE_KEY";
        err.envKey = key;
        throw err;
      }
    }
    if (!s) {
      delete next[key];
    } else {
      next[key] = s;
    }
  }
  return next;
}

export async function loadIntegrationSettingsForUser(supabase, userId) {
  const { data, error } = await supabase
    .from("account_integration_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return rowToEnvMap(data);
}

export async function saveIntegrationSettingsForUser(supabase, userId, values) {
  const payload = envMapToDbRow(userId, values);
  const { error } = await supabase.from("account_integration_settings").upsert(payload, {
    onConflict: "user_id",
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** body > user DB > process.env */
export function pickIntegrationConfig(body, userEnv) {
  const env = userEnv || {};
  const pick = (envKey, bodyKeys = []) => {
    for (const bk of bodyKeys) {
      if (body && body[bk] !== undefined && body[bk] !== null && String(body[bk]).trim() !== "") {
        return String(body[bk]).trim();
      }
    }
    if (env[envKey]) return env[envKey];
    return String(process.env[envKey] || "").trim();
  };

  return {
    pick,
    env,
    envBool(name) {
      const v = pick(name).toLowerCase();
      return v === "1" || v === "true" || v === "yes";
    },
  };
}

export function envBoolFrom(userEnv, name) {
  const { envBool } = pickIntegrationConfig({}, userEnv);
  return envBool(name);
}

export function resolveZomroDnsmgrEnabled(body, userEnv) {
  if (body && Object.prototype.hasOwnProperty.call(body, "zomroDnsmgrEnabled")) {
    return !!body.zomroDnsmgrEnabled;
  }
  return envBoolFrom(userEnv, "ZOMRO_DNSMGR_ENABLED");
}

export function resolveZomroApiDnsEnabled(body, userEnv) {
  if (body && Object.prototype.hasOwnProperty.call(body, "zomroApiDnsEnabled")) {
    return !!body.zomroApiDnsEnabled;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "zomroDnsmgrEnabled")) {
    return body.zomroDnsmgrEnabled ? envBoolFrom(userEnv, "ZOMRO_API_DNS_ENABLED") : true;
  }
  const dnsmgr = envBoolFrom(userEnv, "ZOMRO_DNSMGR_ENABLED");
  if (dnsmgr) {
    return envBoolFrom(userEnv, "ZOMRO_API_DNS_ENABLED");
  }
  return true;
}

export function buildDomainAutomationCredentials(body, userEnv) {
  const { pick, envBool } = pickIntegrationConfig(body, userEnv);

  return {
    spaceshipApiKey: pick("SPACESHIP_API_KEY", ["spaceshipApiKey"]),
    spaceshipApiSecret: pick("SPACESHIP_API_SECRET", ["spaceshipApiSecret"]),
    contactId: pick("SPACESHIP_CONTACT_ID", ["contactId"]),
    zomroAuthToken: pick("ZOMRO_AUTH_TOKEN", ["zomroAuthToken"]),
    zomroAuthThroughKey: pick("ZOMRO_AUTH_THROUGH_KEY", ["zomroAuthThroughKey"]),
    zomroAuthinfo: pick("ZOMRO_AUTHINFO", ["zomroAuthinfo"]),
    zomroUsername: pick("ZOMRO_USERNAME", ["zomroUsername"]),
    zomroPassword: pick("ZOMRO_PASSWORD", ["zomroPassword"]),
    zomroBillmgrUrl: pick("ZOMRO_BILLMGR_URL", ["zomroBillmgrUrl"]),
    zomroBillmgrHost: pick("ZOMRO_BILLMGR_HOST", ["zomroBillmgrHost"]),
    zomroBillmgrPort: pick("ZOMRO_BILLMGR_PORT", ["zomroBillmgrPort"]),
    zomroBillmgrUseHttps: !envBool("ZOMRO_BILLMGR_USE_HTTP"),
    sslLetsEncryptEmail: pick("SSL_LETSENCRYPT_EMAIL", ["sslLetsEncryptEmail"]),
    sslLetsEncryptStaging: body?.sslLetsEncryptStaging ?? envBool("SSL_LETSENCRYPT_STAGING"),
    sslLetsEncryptSkipVerify: (() => {
      if (body && Object.prototype.hasOwnProperty.call(body, "sslLetsEncryptSkipVerify")) {
        return !!body.sslLetsEncryptSkipVerify;
      }
      const v = pick("SSL_LETSENCRYPT_SKIP_VERIFY");
      if (!v) return undefined;
      return envBool("SSL_LETSENCRYPT_SKIP_VERIFY");
    })(),
    zomroDnsmgrUrl: pick("ZOMRO_DNSMGR_URL"),
    zomroDnsmgrDomainEmail: pick("ZOMRO_DNSMGR_DOMAIN_EMAIL", ["zomroDnsmgrDomainEmail"]),
    zomroDnsmgrTxtCreateFunc: pick("ZOMRO_DNSMGR_TXT_CREATE_FUNC", ["zomroDnsmgrTxtCreateFunc"]),
    zomroDnsmgrTxtDeleteFunc: pick("ZOMRO_DNSMGR_TXT_DELETE_FUNC", ["zomroDnsmgrTxtDeleteFunc"]),
    deploySshUser: pick("SUBDOMAIN_HOST_USER"),
    deploySshPassword: pick("SUBDOMAIN_HOST_PASSWORD"),
    deploySshPort: Number(pick("SUBDOMAIN_HOST_PORT") || 22),
    hostIpFallback: pick("SUBDOMAIN_HOST_IP"),
    projectsDirFallback:
      pick("SUBDOMAIN_HOST_PROJECTS_DIR") || "/var/www",
    hostSslDeployEnabled: envBool("SUBDOMAIN_HOST_SSL_DEPLOY"),
    userEnv: userEnv || {},
  };
}

function pickNumericEnv(pick, key, fallback) {
  const v = pick(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Опції для automateDomainProvisioning (body + deploy + creds). */
export function buildProvisioningOptions(oneBody, deployTarget, creds, userEnv, overrides = {}) {
  const userEnvMap = creds.userEnv || userEnv || {};
  const { pick } = pickIntegrationConfig(oneBody, userEnvMap);
  return {
    ...oneBody,
    spaceshipApiKey: creds.spaceshipApiKey,
    spaceshipApiSecret: creds.spaceshipApiSecret,
    contactId: creds.contactId,
    zomroAuthToken: creds.zomroAuthToken,
    zomroAuthThroughKey: creds.zomroAuthThroughKey,
    zomroAuthinfo: creds.zomroAuthinfo,
    zomroUsername: creds.zomroUsername,
    zomroPassword: creds.zomroPassword,
    zomroBillmgrUrl: creds.zomroBillmgrUrl,
    zomroBillmgrHost: creds.zomroBillmgrHost,
    zomroBillmgrPort: creds.zomroBillmgrPort,
    zomroBillmgrUseHttps: creds.zomroBillmgrUseHttps,
    hostIp: oneBody?.hostIp || deployTarget.hostIp,
    deployHostIp: deployTarget.deployHostIp,
    deploySshUser: deployTarget.deploySshUser || creds.deploySshUser,
    deploySshPassword: deployTarget.deploySshPassword || creds.deploySshPassword,
    deploySshPort: deployTarget.deploySshPort || creds.deploySshPort,
    deployProjectsBaseDir:
      deployTarget.projectsDir ||
      creds.projectsDirFallback ||
      "/var/www",
    sslLetsEncryptEmail: creds.sslLetsEncryptEmail,
    sslLetsEncryptStaging: creds.sslLetsEncryptStaging,
    sslLetsEncryptSkipVerify: creds.sslLetsEncryptSkipVerify,
    zomroDnsmgrUrl: creds.zomroDnsmgrUrl,
    zomroDnsmgrEnabled: resolveZomroDnsmgrEnabled(oneBody, userEnvMap),
    zomroApiDnsEnabled: resolveZomroApiDnsEnabled(oneBody, userEnvMap),
    zomroDnsmgrDomainEmail: creds.zomroDnsmgrDomainEmail,
    zomroDnsmgrTxtCreateFunc: creds.zomroDnsmgrTxtCreateFunc,
    zomroDnsmgrTxtDeleteFunc: creds.zomroDnsmgrTxtDeleteFunc,
    sslAsyncRetryMs: pickNumericEnv(
      pick,
      "SSL_ASYNC_RETRY_MS",
      Number(oneBody?.sslAsyncRetryMs || process.env.SSL_ASYNC_RETRY_MS || 10000)
    ),
    sslMinAuthoritativeNsReady: pickNumericEnv(pick, "SSL_MIN_AUTHORITATIVE_NS_READY", 3),
    sslDnsRemoveDelayMs: pickNumericEnv(pick, "SSL_DNS_CHALLENGE_REMOVE_DELAY_MS", 120000),
    sslDelegationWaitTimeoutMs: pickNumericEnv(pick, "SSL_DELEGATION_WAIT_TIMEOUT_MS", 600000),
    sslDelegationWaitPollMs: pickNumericEnv(pick, "SSL_DELEGATION_WAIT_POLL_MS", 10000),
    sslDnsPostPropagationDelayMs: pickNumericEnv(pick, "SSL_ZOMRO_DNS_POST_DELAY_MS", 90000),
    ...overrides,
  };
}
