/**
 * Zomro: панель керування DNS (endpoint `.../dnsmgr` на вузлі хостингу, напр. ns.server-panel.net:1500).
 *
 * Це НЕ Spaceship: Spaceship — реєстратор (API api.spaceship / spaceship.dev), купівля домену і DNS до зміни NS.
 * Це НЕ той самий виклик, що `https://api.zomro.com/`: публічний API Zomro (func dnsdomain.edit тощо) викликається
 * в `zomroPost` у `domainAutomation.js`. Панель `dnsmgr` — окремий сервіс: логін `func=auth` → `auth` (токен
 * сесії, часто `auth.$id` у JSON), далі `func=domain.edit` — додати «master»-домен у панель (name, ip, email).
 */
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

async function fetchWithRetry(url, options, { retries = 2, retryDelayMs = 1200, label = "dnsmgr" } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (e) {
      lastError = e;
      if (attempt > retries) {
        break;
      }
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }
  throw new Error(`${label}: network fetch failed (${lastError?.message || "unknown"})`);
}

/**
 * Витягує сесійний токен з відповіді `func=auth` панелі dnsmgr (різні варіанти полів).
 */
export function extractDnsmgrAuthToken(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const a = payload.auth;
  if (typeof a === "string" && a.trim()) {
    return a.trim();
  }
  if (a && typeof a === "object") {
    const id = a["$id"] ?? a.id ?? a.$;
    if (typeof id === "string" && id.trim()) {
      return id.trim();
    }
  }
  const top = pickLooseToken(payload);
  if (top) {
    return top;
  }
  return null;
}

function pickLooseToken(payload) {
  const t =
    payload.sid?.$ ?? payload.sid ?? payload.session?.$ ?? payload.session ?? payload.doc?.auth?.$ ?? payload.doc?.auth ?? null;
  if (typeof t === "string" && t.trim()) {
    return t.trim();
  }
  if (t && typeof t === "object") {
    const inner = t["$id"] ?? t.id ?? t.$;
    if (typeof inner === "string" && inner.trim()) {
      return inner.trim();
    }
  }
  return null;
}

/**
 * @param {string} dnsmgrUrl — повна URL до `/dnsmgr`, напр. https://ns.server-panel.net:1500/dnsmgr
 * @param {string} username
 * @param {string} password
 * @returns {{ token: string, payload: object }}
 */
export async function authZomroDnsmgr(dnsmgrUrl, username, password) {
  const u = String(dnsmgrUrl || "").trim().replace(/\/+$/, "");
  if (!u) {
    throw new Error("Zomro DNS panel: dnsmgr URL is required (ZOMRO_DNSMGR_URL)");
  }
  const user = String(username || "").trim();
  const pass = String(password || "").trim();
  if (!user || !pass) {
    throw new Error("Zomro DNS panel: username and password are required (ZOMRO_USERNAME, ZOMRO_PASSWORD)");
  }

  const body = new URLSearchParams({
    out: "json",
    func: "auth",
    username: user,
    password: pass,
  });

  const response = await fetchWithRetry(
    u,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
    { retries: 2, retryDelayMs: 1200, label: "Zomro dnsmgr func=auth" }
  );
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      `Zomro DNS panel: auth failed HTTP ${response.status}: ${
        payload?.message || JSON.stringify(payload).slice(0, 200)
      }`
    );
  }
  const token = extractDnsmgrAuthToken(payload);
  if (!token) {
    throw new Error("Zomro DNS panel: auth response has no session token (expected auth or auth.$id)");
  }
  return { token, payload };
}

/**
 * POST form-encoded до dnsmgr.
 */
export async function postZomroDnsmgr(dnsmgrUrl, fields) {
  const u = String(dnsmgrUrl || "").trim().replace(/\/+$/, "");
  if (!u) {
    throw new Error("Zomro DNS panel: dnsmgr URL is required");
  }
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (value === "" && !["sok", "out", "func"].includes(key)) {
      continue;
    }
    body.set(key, String(value));
  }
  const response = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      `Zomro DNS panel: request failed HTTP ${response.status} (${String(fields?.func || "")}): ${
        payload?.message || JSON.stringify(payload).slice(0, 200)
      }`
    );
  }
  return { response, payload };
}

/**
 * Додає master-домен у панель dnsmgr: спочатку `func=auth`, потім `func=domain.edit`, як у ваших curl-прикладах.
 */
export async function addMasterDomainZomroDnsmgr({
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  fullDomain,
  ip,
  email,
}) {
  const { token } = await authZomroDnsmgr(dnsmgrUrl, zomroUsername, zomroPassword);
  const { response, payload } = await postZomroDnsmgr(dnsmgrUrl, {
    out: "json",
    func: "domain.edit",
    auth: token,
    dtype: "master",
    name: String(fullDomain).trim().toLowerCase(),
    ip: String(ip).trim(),
    email: String(email).trim(),
    sok: "ok",
  });
  return { tokenLength: token.length, httpOk: response.ok, payload, authUsed: "dnsmgr_session" };
}

/**
 * Керує TXT-записом ACME в dnsmgr (для DNS-01 через панель Zomro).
 */
export async function upsertDnsmgrTxtRecord({
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  domain,
  name,
  value,
  ttl = 120,
  func = "domain.record.edit",
}) {
  const { token } = await authZomroDnsmgr(dnsmgrUrl, zomroUsername, zomroPassword);
  const { payload } = await postZomroDnsmgr(dnsmgrUrl, {
    out: "json",
    func,
    auth: token,
    plid: domain,
    name,
    rtype: "txt",
    ttl,
    value,
    sok: "ok",
  });
  const errMsg = payload?.doc?.error?.msg?.$ || null;
  if (errMsg) {
    throw new Error(`Zomro dnsmgr TXT create failed: ${errMsg}`);
  }
  return { ok: true, payload };
}

/**
 * Видаляє всі TXT-записи для імені `name` у зоні `domain` (напр. `_acme-challenge` перед новим ACME).
 * dnsmgr може тримати кілька TXT RR — LE часто не проходить при «смітті» від старих спроб.
 */
export async function deleteAllDnsmgrTxtRecordsForName({
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  domain,
  name,
  func = "domain.record.delete",
}) {
  try {
    const { token } = await authZomroDnsmgr(dnsmgrUrl, zomroUsername, zomroPassword);
    const normalizedName = `${String(name).trim().toLowerCase()}.${String(domain).trim().toLowerCase()}.`;
    let removed = 0;
    const maxRounds = 40;
    for (let round = 0; round < maxRounds; round += 1) {
      const listPayload = await postZomroDnsmgr(dnsmgrUrl, {
        out: "json",
        func: "domain.record",
        auth: token,
        elid: domain,
      });
      let elems = listPayload?.payload?.doc?.elem || [];
      if (!Array.isArray(elems)) {
        elems = elems ? [elems] : [];
      }
      const match = elems.find((e) => {
        const n = String(e?.name?.$ || "").trim().toLowerCase();
        const t = String(e?.rtype_hidden?.$ || "").trim().toUpperCase();
        return n === normalizedName && t === "TXT";
      });
      if (!match?.rkey?.$) {
        break;
      }
      await postZomroDnsmgr(dnsmgrUrl, {
        out: "json",
        func,
        auth: token,
        plid: domain,
        elid: match.rkey.$,
        sok: "ok",
      });
      removed += 1;
    }
    return { removed };
  } catch (e) {
    return { removed: 0, error: e?.message || String(e) };
  }
}

export async function deleteDnsmgrTxtRecord({
  dnsmgrUrl,
  zomroUsername,
  zomroPassword,
  domain,
  name,
  value,
  func = "domain.record.delete",
}) {
  const { token } = await authZomroDnsmgr(dnsmgrUrl, zomroUsername, zomroPassword);
  try {
    const listPayload = await postZomroDnsmgr(dnsmgrUrl, {
      out: "json",
      func: "domain.record",
      auth: token,
      elid: domain,
    });
    const elems = listPayload?.payload?.doc?.elem || [];
    const normalizedName = `${String(name).trim().toLowerCase()}.${String(domain).trim().toLowerCase()}.`;
    const target = elems.find((e) => {
      const n = String(e?.name?.$ || "").trim().toLowerCase();
      const v = String(e?.value?.$ || "").trim();
      const t = String(e?.rtype_hidden?.$ || "").trim().toUpperCase();
      return n === normalizedName && t === "TXT" && v === String(value).trim();
    });
    if (!target?.rkey?.$) {
      return { ok: false, reason: "TXT record not found for delete" };
    }
    await postZomroDnsmgr(dnsmgrUrl, {
      out: "json",
      func,
      auth: token,
      plid: domain,
      elid: target.rkey.$,
      sok: "ok",
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
