/** LLM endpoint + валідація ключів (без Node-only залежностей — OK для client). */

export function normalizeClaudeApiKeyInput(raw) {
  return String(raw || "")
    .trim()
    .replace(/\u2022/g, "")
    .replace(/•+/g, "");
}

export function normalizeAnthropicBaseUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return "https://api.anthropic.com";
  return s;
}

export function isLoopbackAnthropicBase(base) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(base || "").trim());
}

/** ECONNREFUSED до localhost — типова помилка, коли ANTHROPIC_BASE_URL не збігається з типом ключа. */
export function isLoopbackAnthropicNetError(messagesUrl, code, err) {
  if (!isLoopbackAnthropicBase(String(messagesUrl || "").replace(/\/v1\/messages\/?$/i, ""))) {
    return false;
  }
  const c = String(code || err?.cause?.code || err?.code || "").toUpperCase();
  return c === "ECONNREFUSED" || c === "ENOTFOUND" || /fetch failed/i.test(String(err?.message || ""));
}

/**
 * sk-ant-… → завжди api.anthropic.com, якщо в Settings лишився localhost з .env.example.
 * Локальний проксі (http://localhost:3001) — лише для sk-… без sk-ant-.
 */
export function resolveAnthropicBaseUrl(apiKey) {
  const key = normalizeClaudeApiKeyInput(apiKey);
  const configured = normalizeAnthropicBaseUrl(process.env.ANTHROPIC_BASE_URL);
  if (key.startsWith("sk-ant-") && isLoopbackAnthropicBase(configured)) {
    return "https://api.anthropic.com";
  }
  return configured;
}

/** Базовий URL API (Anthropic або локальний проксі, напр. http://localhost:3001). */
export function getAnthropicBaseUrl(apiKey) {
  return resolveAnthropicBaseUrl(apiKey);
}

export function getAnthropicMessagesUrl(apiKey) {
  return `${resolveAnthropicBaseUrl(apiKey)}/v1/messages`;
}

/** Чи ігнорували localhost у користь api.anthropic.com для sk-ant- */
export function anthropicBaseUrlOverrideNote(apiKey) {
  const key = normalizeClaudeApiKeyInput(apiKey);
  const configured = normalizeAnthropicBaseUrl(process.env.ANTHROPIC_BASE_URL);
  if (key.startsWith("sk-ant-") && isLoopbackAnthropicBase(configured)) {
    return (
      `ANTHROPIC_BASE_URL=${configured} ігноровано для sk-ant-… → https://api.anthropic.com ` +
      "(очистіть поле в Settings, якщо проксі не потрібен)"
    );
  }
  return null;
}

/** Чи задано не стандартний api.anthropic.com (локальний gateway / Kiro / LiteLLM). */
export function usesCustomAnthropicBaseUrl(baseUrl, apiKey) {
  const base = resolveAnthropicBaseUrl(
    apiKey !== undefined ? apiKey : process.env.CLAUDE_API_KEY_01 || ""
  );
  const fromArg =
    baseUrl !== undefined ? normalizeAnthropicBaseUrl(baseUrl) : null;
  const effective = fromArg && !isLoopbackAnthropicBase(fromArg) ? fromArg : base;
  return !/^https?:\/\/api\.anthropic\.com$/i.test(effective);
}

/**
 * @param {string} raw
 * @param {string} [baseUrl] — опційно (форма Settings або merged env)
 */
export function isAcceptableClaudeApiKey(raw, baseUrl) {
  const key = normalizeClaudeApiKeyInput(raw);
  if (!key || key.length < 16) return false;
  if (key.startsWith("sk-ant-")) return true;
  if (usesCustomAnthropicBaseUrl(baseUrl) && /^sk-[a-z0-9]/i.test(key)) {
    return true;
  }
  return false;
}

/** @deprecated alias */
export function isValidClaudeApiKey(raw, baseUrl) {
  return isAcceptableClaudeApiKey(raw, baseUrl);
}

/** Заголовки для POST /v1/messages (Anthropic + типові локальні проксі). */
export function buildAnthropicRequestHeaders(apiKey) {
  const key = normalizeClaudeApiKeyInput(apiKey);
  const headers = {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  if (usesCustomAnthropicBaseUrl(undefined, key)) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

/** Рядок для логу збірки: тип ключа + endpoint. */
export function describeClaudeKeyForBuildLog(apiKey) {
  const key = normalizeClaudeApiKeyInput(apiKey);
  if (!key) return "нет";
  const url = getAnthropicMessagesUrl(key);
  if (key.startsWith("sk-ant-")) {
    const note = anthropicBaseUrlOverrideNote(key);
    return note
      ? `есть (Anthropic sk-ant-…, ${url}; ${note})`
      : `есть (Anthropic sk-ant-…, ${url})`;
  }
  if (usesCustomAnthropicBaseUrl(undefined, key)) {
    return `есть (прокси sk-…, ${url})`;
  }
  return "есть, но для sk-… нужен ANTHROPIC_BASE_URL (напр. http://localhost:3001)";
}

/**
 * Розширене повідомлення для HTTP-помилок LLM (зокрема локальний gateway).
 */
/**
 * Opus 4.7+ відхиляє temperature/top_p/top_k (400 «deprecated») — поле треба не надсилати.
 * @param {string} model
 */
export function claudeModelOmitsSamplingParams(model) {
  const m = String(model || "")
    .trim()
    .toLowerCase();
  return /claude-opus-4-[78]\b/.test(m) || /^claude-opus-4-[78]$/.test(m);
}

/**
 * Тіло POST /v1/messages без sampling-полів для моделей, що їх не приймають.
 * @param {{
 *   model: string;
 *   maxTokens: number;
 *   system?: string;
 *   userContent: string;
 *   temperature?: number;
 *   maxSystemLen?: number;
 * }} opts
 */
export function buildAnthropicMessagesBody(opts) {
  const {
    model,
    maxTokens,
    system,
    userContent,
    temperature,
    maxSystemLen = 200000,
  } = opts;
  /** @type {Record<string, unknown>} */
  const body = {
    model: String(model || "").trim(),
    max_tokens: maxTokens,
    system: String(system || "").slice(0, maxSystemLen),
    messages: [{ role: "user", content: userContent }],
  };
  if (
    !claudeModelOmitsSamplingParams(model) &&
    temperature !== undefined &&
    temperature !== null &&
    Number.isFinite(Number(temperature))
  ) {
    body.temperature = Number(temperature);
  }
  return body;
}

export function formatAnthropicHttpError(status, rawText, apiKey) {
  const body = String(rawText || "").slice(0, 400);
  let msg = `Anthropic HTTP ${status}: ${body}`;
  if (!usesCustomAnthropicBaseUrl(undefined, apiKey)) return msg;

  const url = getAnthropicMessagesUrl(apiKey);
  if (status === 400 && /Request failed with status code 400/i.test(body)) {
    msg +=
      ` — прокси ${url} не смог выполнить запрос к upstream (Kiro/провайдер в AIClient2API). ` +
      "Проверьте консоль прокси: авторизация Kiro, срок токена, активный провайдер и модель " +
      `(сейчас ANTHROPIC_MODEL=${String(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim()}).`;
  } else if (status === 401 || status === 403) {
    msg += ` — проверьте Public API Key прокси и заголовок x-api-key (${url}).`;
  }
  return msg;
}
