/**
 * Эталоны u-bet162 / u-spot064 из Supabase (generation_site_template_assets).
 * Fallback на файловую систему при SOFTGEN_ETALON_SOURCE=filesystem|auto.
 */

import fs from "node:fs";
import path from "node:path";

const TEMPLATES_TABLE = "generation_site_templates";
const ASSETS_TABLE = "generation_site_template_assets";

/** @type {Map<string, Map<string, { content: string; kind: string }>>} */
const bundleCache = new Map();

function resolveEtalonSourceMode() {
  const raw = String(process.env.SOFTGEN_ETALON_SOURCE || "auto")
    .trim()
    .toLowerCase();
  if (raw === "filesystem" || raw === "fs") return "filesystem";
  if (raw === "supabase" || raw === "db") return "supabase";
  return "auto";
}

function supabaseConfig(opts = {}) {
  const supabaseUrl = String(
    opts.supabaseUrl ??
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      ""
  ).trim();
  const serviceKey = String(
    opts.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  ).trim();
  return { supabaseUrl, serviceKey };
}

/**
 * @param {string} slug
 * @param {{ supabaseUrl?: string; serviceKey?: string; onLog?: (m: string) => void }} [opts]
 * @returns {Promise<Map<string, { content: string; kind: string }>>}
 */
export async function fetchSiteTemplateBundleFromSupabase(slug, opts = {}) {
  const templateSlug = String(slug || "").trim();
  if (!templateSlug) return new Map();

  const { supabaseUrl, serviceKey } = supabaseConfig(opts);
  if (!supabaseUrl || !serviceKey) {
    opts.onLog?.(
      "Supabase: нет URL/ключ — generation_site_template_assets не загружаем."
    );
    return new Map();
  }

  const base = supabaseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${encodeURIComponent(ASSETS_TABLE)}`);
  url.searchParams.set(
    "select",
    "asset_path,asset_kind,content,updated_at"
  );
  url.searchParams.set("template_slug", `eq.${templateSlug}`);
  url.searchParams.set("order", "asset_path.asc");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let rows;
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    throw new Error(
      "Supabase: некорректный JSON при чтении generation_site_template_assets"
    );
  }
  if (!res.ok) {
    const msg =
      typeof rows === "object" && rows?.message
        ? String(rows.message)
        : text.slice(0, 240);
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }

  const bundle = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const path = String(row?.asset_path || "").trim();
    if (!path) continue;
    bundle.set(path, {
      content: String(row?.content ?? ""),
      kind: String(row?.asset_kind || "other"),
    });
  }
  opts.onLog?.(
    `Supabase эталон «${templateSlug}»: ${bundle.size} asset(s) из ${ASSETS_TABLE}.`
  );
  return bundle;
}

/**
 * @param {{ supabaseUrl?: string; serviceKey?: string }} [opts]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function listActiveSiteTemplates(opts = {}) {
  const { supabaseUrl, serviceKey } = supabaseConfig(opts);
  if (!supabaseUrl || !serviceKey) return [];

  const base = supabaseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${encodeURIComponent(TEMPLATES_TABLE)}`);
  url.searchParams.set(
    "select",
    "slug,label,chrome_mode,description,source_project,version,updated_at"
  );
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("order", "slug.asc");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : [];
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 240)}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} slug
 * @param {string} assetPath
 * @param {{ supabaseUrl?: string; serviceKey?: string }} [opts]
 */
export async function fetchSiteTemplateAssetFromSupabase(slug, assetPath, opts = {}) {
  const bundle = await fetchSiteTemplateBundleFromSupabase(slug, opts);
  return bundle.get(String(assetPath || "").trim()) || null;
}

/**
 * @param {string} [slug]
 */
export function invalidateSiteTemplateCache(slug) {
  if (slug) bundleCache.delete(String(slug));
  else bundleCache.clear();
}

/**
 * @param {string} slug
 * @param {Map<string, { content: string; kind: string }>} bundle
 */
export function setSiteTemplateBundleCache(slug, bundle) {
  bundleCache.set(String(slug), bundle);
}

/**
 * @param {string} slug
 * @param {{
 *   supabaseUrl?: string;
 *   serviceKey?: string;
 *   onLog?: (m: string) => void;
 *   loadFilesystemFallback?: (slug: string) => Map<string, { content: string; kind: string }>;
 * }} [opts]
 * @returns {Promise<Map<string, { content: string; kind: string }>>}
 */
function filesystemEtalonPathForSlug(slug) {
  const key =
    String(slug || "").trim() === "spot064"
      ? "SOFTGEN_ETALON_SPOT064_PATH"
      : "SOFTGEN_ETALON_BET162_PATH";
  const fromEnv = String(process.env[key] || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const home = String(process.env.HOME || process.env.USERPROFILE || "").trim();
  if (!home) return "";
  const folder =
    String(slug || "").trim() === "spot064" ? "u-spot064" : "u-bet162";
  const desktop = path.join(home, "Desktop", folder);
  return fs.existsSync(desktop) ? desktop : "";
}

export async function resolveSiteTemplateBundle(slug, opts = {}) {
  const templateSlug = String(slug || "").trim();
  if (!templateSlug) return new Map();

  if (bundleCache.has(templateSlug)) {
    return bundleCache.get(templateSlug);
  }

  const mode = resolveEtalonSourceMode();
  let bundle = new Map();

  const fsPath = filesystemEtalonPathForSlug(templateSlug);
  if (
    fsPath &&
    mode !== "supabase" &&
    typeof opts.loadFilesystemFallback === "function"
  ) {
    opts.onLog?.(
      `Эталон «${templateSlug}»: ${fsPath} (SOFTGEN_ETALON_*_PATH).`
    );
    bundle = opts.loadFilesystemFallback(templateSlug);
    if (bundle.size > 0) {
      bundleCache.set(templateSlug, bundle);
      return bundle;
    }
  }

  if (mode !== "filesystem") {
    try {
      bundle = await fetchSiteTemplateBundleFromSupabase(templateSlug, opts);
    } catch (e) {
      opts.onLog?.(
        `Supabase эталон «${templateSlug}»: ${String(e?.message || e).slice(0, 220)}`
      );
      bundle = new Map();
    }
  }

  if (bundle.size === 0 && mode !== "supabase" && opts.loadFilesystemFallback) {
    opts.onLog?.(
      `Эталон «${templateSlug}»: fallback на файловую систему (${mode}).`
    );
    bundle = opts.loadFilesystemFallback(templateSlug);
  }

  if (bundle.size > 0) {
    bundleCache.set(templateSlug, bundle);
  }
  return bundle;
}

export { resolveEtalonSourceMode };
