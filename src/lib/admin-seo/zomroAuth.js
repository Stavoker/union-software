import { XMLParser } from "fast-xml-parser";

const ZOMRO_API_URL = "https://api.zomro.com/";

function pickAuthStringFromObject(obj) {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const direct =
    obj.auth?.$ ??
    obj.auth ??
    obj.sid?.$ ??
    obj.sid ??
    obj.session?.$ ??
    obj.session ??
    obj.doc?.auth?.$ ??
    obj.doc?.auth ??
    null;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  if (direct && typeof direct === "object") {
    const inner = direct.$ ?? direct["#text"] ?? direct._;
    if (typeof inner === "string" && inner.trim()) {
      return inner.trim();
    }
  }
  return null;
}

function parseBillmgrSessionXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  const parsed = parser.parse(xmlText);
  const authNode = parsed?.doc?.auth;
  if (typeof authNode === "string" && authNode.trim()) {
    return { token: authNode.trim(), level: null, id: null };
  }
  if (authNode && typeof authNode === "object") {
    const token = String(authNode["#text"] ?? authNode._ ?? authNode.$ ?? "").trim();
    const id = authNode["@_id"] ?? null;
    const level = authNode["@_level"] ?? null;
    if (token) {
      return { token, level, id };
    }
  }
  return null;
}

function normalizeBillmgrBaseUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) {
    return null;
  }
  if (s.endsWith("/billmgr")) {
    return s;
  }
  return `${s}/billmgr`;
}

function buildBillmgrAuthUrl(opts) {
  const explicit = normalizeBillmgrBaseUrl(opts.zomroBillmgrUrl);
  if (explicit) {
    const url = new URL(`${explicit}`);
    url.searchParams.set("out", "xml");
    url.searchParams.set("func", "auth");
    url.searchParams.set("username", String(opts.zomroUsername || "").trim());
    url.searchParams.set("password", String(opts.zomroPassword || "").trim());
    return url.toString();
  }

  const host = String(opts.zomroBillmgrHost || "").trim();
  if (!host) {
    return null;
  }
  const port = String(opts.zomroBillmgrPort || "1500").trim();
  const useHttps = opts.zomroBillmgrUseHttps !== false && opts.zomroBillmgrUseHttps !== "false";
  const scheme = useHttps ? "https" : "http";
  const url = new URL(`${scheme}://${host}:${port}/billmgr`);
  url.searchParams.set("out", "xml");
  url.searchParams.set("func", "auth");
  url.searchParams.set("username", String(opts.zomroUsername || "").trim());
  url.searchParams.set("password", String(opts.zomroPassword || "").trim());
  return url.toString();
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

async function zomroAuthViaAuthinfo(authinfo) {
  const body = new URLSearchParams({
    func: "auth",
    out: "json",
    checkcookie: "no",
    authinfo: String(authinfo).trim(),
  });
  const response = await fetch(ZOMRO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Zomro authinfo auth failed (${response.status})`);
  }
  const token = pickAuthStringFromObject(payload);
  if (!token) {
    throw new Error("Zomro authinfo: no session token in JSON response");
  }
  return { token, source: "authinfo", details: payload };
}

/**
 * Resolves Zomro `auth` session token.
 * Priority:
 * 1) zomroAuthThroughKey / ZOMRO_AUTH_THROUGH_KEY — сквозной ключ (передаётся как auth)
 * 2) zomroAuthToken / ZOMRO_AUTH_TOKEN — готовая сессия
 * 3) ZOMRO_AUTHINFO — func=auth через api.zomro.com
 * 4) Billmgr GET …/billmgr?out=xml&func=auth&username=&password=
 */
export async function resolveZomroAuthToken(opts = {}) {
  const throughKey = String(opts.zomroAuthThroughKey || "").trim();
  if (throughKey) {
    return { token: throughKey, source: "through_key", details: null };
  }

  const preset = String(opts.zomroAuthToken || "").trim();
  if (preset) {
    return { token: preset, source: "env_token", details: null };
  }

  const authinfo = String(opts.zomroAuthinfo || "").trim();
  if (authinfo) {
    return zomroAuthViaAuthinfo(authinfo);
  }

  const username = String(opts.zomroUsername || "").trim();
  const password = String(opts.zomroPassword || "").trim();
  const billUrl = buildBillmgrAuthUrl({ ...opts, zomroUsername: username, zomroPassword: password });
  if (billUrl && username && password) {
    const response = await fetch(billUrl, { method: "GET", cache: "no-store" });
    const xmlText = await response.text();
    if (!response.ok) {
      throw new Error(`Billmgr session auth HTTP ${response.status}: ${xmlText.slice(0, 200)}`);
    }
    const parsed = parseBillmgrSessionXml(xmlText);
    if (!parsed?.token) {
      throw new Error("Billmgr session: could not parse <doc><auth>…</auth></doc> from XML");
    }
    return {
      token: parsed.token,
      source: "billmgr_session",
      details: { level: parsed.level, id: parsed.id },
    };
  }

  throw new Error(
    "Zomro auth: set ZOMRO_AUTH_TOKEN, or ZOMRO_AUTH_THROUGH_KEY, or ZOMRO_AUTHINFO, or (ZOMRO_BILLMGR_URL or ZOMRO_BILLMGR_HOST + ZOMRO_USERNAME + ZOMRO_PASSWORD)"
  );
}
