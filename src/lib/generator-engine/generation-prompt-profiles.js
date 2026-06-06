import crypto from "node:crypto";

const TABLE = "generation_prompt_profiles";

const LEGACY_BRAND_PATTERNS = [
  [/\blaki\s*world\b/gi, "{brand}"],
  [/\blakiworld\b/gi, "{brand}"],
  [/\bлаки\s*ворлд\b/gi, "{brand}"],
  [/\bлаки\s*world\b/gi, "{brand}"],
  [/\blaki\b/gi, "{brand}"],
  [/\bлаки\b/gi, "{brand}"],
];

/**
 * Замінює плейсхолдер {brand} на імʼя бренду користувача.
 * @param {string} text
 * @param {string} [brandName]
 */
export function applyBrandPlaceholder(text, brandName = "") {
  const brand = String(brandName || "").trim();
  if (!brand) return String(text || "");
  return String(text || "").replace(/\{brand\}/gi, brand);
}

/**
 * Прибирає застарілі Laki/Лаки з текстів профілю; підстановка бренду — на етапі збірки.
 * @param {string} text
 * @param {string} [themeBrandHint]
 */
export function scrubLegacyBrandMentionsInProfileText(text, themeBrandHint = "") {
  const brand = String(themeBrandHint || "").trim() || "{brand}";
  let out = String(text || "");
  for (const [re, repl] of LEGACY_BRAND_PATTERNS) {
    out = out.replace(re, brand === "{brand}" ? repl : brand);
  }
  if (brand !== "{brand}") {
    out = applyBrandPlaceholder(out, brand);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** @deprecated Універсальні профілі — скоуп завжди any; тема не фільтрує laki/lakiworld. */
export function inferBrandPackScopeFromTheme(_theme) {
  return null;
}

/**
 * Профіль підходить, якщо active і brand_scope універсальний (any / порожньо).
 * @param {Record<string, unknown>} row
 */
export function profileMatchesThemeScope(row) {
  const s = String(row?.brand_scope ?? "")
    .trim()
    .toLowerCase();
  if (!s || s === "any") return true;
  return false;
}

/**
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function fetchActiveGenerationPromptProfiles(supabaseUrl, serviceKey) {
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(serviceKey || "").trim();
  if (!base || !key) return [];

  const url = new URL(`${base}/rest/v1/${encodeURIComponent(TABLE)}`);
  url.searchParams.set(
    "select",
    [
      "id",
      "name",
      "brand_label",
      "brand_scope",
      "main_keyword",
      "concept",
      "target_audience",
      "tone",
      "mandatory_fourth_subpage",
      "full_generation_prompt",
      "weight",
      "meta",
    ].join(",")
  );
  url.searchParams.set("active_status", "eq.true");
  url.searchParams.set("brand_scope", "eq.any");
  url.searchParams.set("order", "name.asc");

  const res = await fetch(url.toString(), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    throw new Error("Supabase: некорректный JSON при чтении generation_prompt_profiles");
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 240);
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} seed
 * @returns {Record<string, unknown> | null}
 */
export function pickWeightedGenerationProfile(rows, seed) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const weights = rows.map((r) => {
    const w = Number(r?.weight);
    if (!Number.isFinite(w)) return 1;
    return Math.max(1, Math.min(100, Math.trunc(w)));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const h = crypto.createHash("sha256").update(String(seed || "0")).digest();
  let t = (h.readUInt32BE(0) / 0xffffffff) * total;
  for (let i = 0; i < rows.length; i++) {
    t -= weights[i];
    if (t <= 0) return rows[i];
  }
  return rows[rows.length - 1];
}

/**
 * @param {Record<string, unknown> | null} profile
 * @param {{ themeBrandHint?: string; publicBrandName?: string }} [opts]
 * @returns {string}
 */
/**
 * Тільки full_generation_prompt з профілю (стратегія React Lab / без еталонів).
 * @param {Record<string, unknown> | null} profile
 * @param {{ themeBrandHint?: string }} [opts]
 * @returns {string}
 */
export function formatFullGenerationPromptOnly(profile, opts = {}) {
  if (!profile) return "";
  const themeBrand = String(opts.themeBrandHint || "").trim();
  const full = scrubLegacyBrandMentionsInProfileText(
    String(profile.full_generation_prompt || ""),
    themeBrand
  );
  return full.trim();
}

export function formatGenerationPromptProfileBlock(profile, opts = {}) {
  if (!profile) return "";
  const themeBrand = String(
    opts.themeBrandHint || opts.publicBrandName || ""
  ).trim();
  const scrub = (s) => scrubLegacyBrandMentionsInProfileText(s, themeBrand);

  const lines = [];
  lines.push(
    "=== ПРОФИЛЬ ГЕНЕРАЦИИ (универсальный слой; не нарушай JSON/HTML контракт генератора) ==="
  );
  lines.push(
    `БРЕНД В ТЕКСТАХ САЙТА: только «${themeBrand || "из темы и brandKit текущей сборки"}»; запрещены Laki, Laki World, Лаки и любые чужие ТМ из названия профиля.`
  );
  if (profile.name) lines.push(`Профиль: ${scrub(profile.name)}`);
  const packLabel = String(profile.brand_label || "").trim();
  if (packLabel && !/laki|лаки/i.test(packLabel)) {
    lines.push(`Метка набора: ${packLabel}`);
  }
  const mk = scrub(profile.main_keyword);
  if (mk) lines.push(`Главный ключ (фокус главной): ${mk}`);
  const c = scrub(profile.concept);
  if (c) lines.push(`Концепция / угол: ${c}`);
  const ta = scrub(profile.target_audience);
  if (ta) lines.push(`Целевая аудитория: ${ta}`);
  const tone = scrub(profile.tone);
  if (tone) lines.push(`Тон: ${tone}`);
  const m4 = scrub(profile.mandatory_fourth_subpage);
  if (m4) lines.push(`4-я подстраница (обязательная тема): ${m4}`);
  const full = scrub(profile.full_generation_prompt);
  if (full) lines.push(`\nПолный доп. промпт:\n${full}`);
  return lines.join("\n").trim();
}

/**
 * @param {{ theme: string; pickSeed: string; themeBrandHint?: string; supabaseUrl?: string; serviceKey?: string; onLog?: (m: string) => void }} opts
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function selectGenerationPromptProfileForBuild(opts) {
  const theme = String(opts.theme || "").trim();
  const pickSeed = String(opts.pickSeed || "");
  const supabaseUrl = String(
    opts.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).trim();
  const serviceKey = String(opts.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const onLog = opts.onLog;

  if (!supabaseUrl || !serviceKey) {
    onLog?.(
      "Supabase: нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — профиль generation_prompt_profiles не загружаем."
    );
    return null;
  }

  const all = await fetchActiveGenerationPromptProfiles(supabaseUrl, serviceKey);
  const filtered = all.filter((r) => profileMatchesThemeScope(r));
  if (!filtered.length) {
    onLog?.(
      `Supabase: нет активных универсальных профилей (brand_scope=any). Всего active в БД: ${all.length}. Запустите repair_generation_prompt_profiles_brand_scope().`
    );
    return null;
  }
  const picked = pickWeightedGenerationProfile(
    filtered,
    `${pickSeed}|${theme}|${filtered.length}`
  );
  return picked || null;
}
