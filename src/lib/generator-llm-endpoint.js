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

/** Базовий URL API (Anthropic або локальний проксі, напр. http://localhost:3001). */
export function getAnthropicBaseUrl() {
  return normalizeAnthropicBaseUrl(process.env.ANTHROPIC_BASE_URL);
}

export function getAnthropicMessagesUrl() {
  return `${getAnthropicBaseUrl()}/v1/messages`;
}

/** Чи задано не стандартний api.anthropic.com (локальний gateway / Kiro / LiteLLM). */
export function usesCustomAnthropicBaseUrl(baseUrl) {
  const base = normalizeAnthropicBaseUrl(
    baseUrl !== undefined ? baseUrl : process.env.ANTHROPIC_BASE_URL
  );
  return !/^https?:\/\/api\.anthropic\.com$/i.test(base);
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
  if (usesCustomAnthropicBaseUrl()) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

/** Рядок для логу збірки: тип ключа + endpoint. */
export function describeClaudeKeyForBuildLog(apiKey) {
  const key = normalizeClaudeApiKeyInput(apiKey);
  if (!key) return "нет";
  if (key.startsWith("sk-ant-")) {
    return `есть (Anthropic sk-ant-…, ${getAnthropicBaseUrl()})`;
  }
  if (usesCustomAnthropicBaseUrl()) {
    return `есть (прокси sk-…, ${getAnthropicMessagesUrl()})`;
  }
  return "есть, но для sk-… нужен ANTHROPIC_BASE_URL (напр. http://localhost:3001)";
}

/**
 * Розширене повідомлення для HTTP-помилок LLM (зокрема локальний gateway).
 */
export function formatAnthropicHttpError(status, rawText) {
  const body = String(rawText || "").slice(0, 400);
  let msg = `Anthropic HTTP ${status}: ${body}`;
  if (!usesCustomAnthropicBaseUrl()) return msg;

  const url = getAnthropicMessagesUrl();
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
