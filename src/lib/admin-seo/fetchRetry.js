/**
 * fetch з повторами для зовнішніх API (Zomro dnsmgr, api.zomro.com, Spaceship).
 */

export function describeFetchNetworkError(lastError, url, label) {
  const msg = lastError?.message || "unknown";
  const code = lastError?.cause?.code || lastError?.code || "";
  let host = "";
  try {
    host = new URL(String(url || "")).host;
  } catch {
    /* ignore */
  }
  const target = host ? ` → ${host}` : "";
  const isDnsmgrPanel =
    /:1500\b/.test(host) || /\/dnsmgr\b/i.test(String(url || ""));
  let hint = "";
  if (
    isDnsmgrPanel &&
    (code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      /fetch failed|timeout|ECONNREFUSED|aborted/i.test(msg))
  ) {
    hint =
      " Не вдається підключитися до панелі Zomro dnsmgr (порт 1500): перевірте ZOMRO_DNSMGR_URL у Settings, доступ з машини де працює Union (firewall, VPN, whitelist IP у Zomro). З локального ПК часто працює лише з VPS; альтернатива — вимкнути dnsmgr у формі й використати api.zomro.com (ZOMRO_AUTH_TOKEN + func зони/A).";
  } else if (code === "ENOTFOUND") {
    hint = " Хост не знайдено — перевірте URL у налаштуваннях.";
  }
  return `${label}: network fetch failed (${msg}${code ? `, ${code}` : ""}${target})${hint}`;
}

export async function fetchWithRetry(
  url,
  options = {},
  { retries = 2, retryDelayMs = 1200, label = "request", timeoutMs = 20000 } = {}
) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const signal =
        options.signal ||
        (typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(timeoutMs)
          : undefined);
      return await fetch(url, signal ? { ...options, signal } : options);
    } catch (e) {
      lastError = e;
      if (attempt > retries) {
        break;
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  throw new Error(describeFetchNetworkError(lastError, url, label));
}
