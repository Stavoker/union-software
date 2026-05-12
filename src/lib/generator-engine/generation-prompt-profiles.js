import crypto from "node:crypto";

const TABLE = "generation_prompt_profiles";

/**
 * Груба оцінка пакета бренду з SEO-теми (для фільтра brand_scope).
 * @param {string} theme
 * @returns {"laki" | "lakiworld" | null}
 */
export function inferBrandPackScopeFromTheme(theme) {
  const t = String(theme || "").toLowerCase();
  if (!t.trim()) return null;
  if (/\blakiworld\b/.test(t)) return "lakiworld";
  if (/\blaki\s+world\b/.test(t)) return "lakiworld";
  if (t.includes("лаки") && t.includes("ворлд")) return "lakiworld";
  if (/\blaki\b/.test(t) || t.includes("лаки")) return "laki";
  return null;
}

/**
 * @param {Record<string, unknown>} row
 * @param {"laki" | "lakiworld" | null} inferred
 */
export function profileMatchesThemeScope(row, inferred) {
  const raw = row?.brand_scope;
  const s =
    raw == null || String(raw).trim() === ""
      ? ""
      : String(raw).trim().toLowerCase();
  if (!s || s === "any") return true;
  if (!inferred) return false;
  return s === inferred;
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
      "slug",
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
  url.searchParams.set("order", "slug.asc");

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
 * @returns {string}
 */
export function formatGenerationPromptProfileBlock(profile) {
  if (!profile) return "";
  const lines = [];
  lines.push(
    "=== ПРОФИЛЬ ГЕНЕРАЦИИ (дополнительный слой поверх базовых правил генератора; не нарушай жёсткие требования к формату ответа: JSON/HTML/маркеры @@PHn@@) ==="
  );
  if (profile.slug) lines.push(`Профиль (slug): ${profile.slug}`);
  if (profile.name) lines.push(`Название: ${profile.name}`);
  if (profile.brand_label) lines.push(`Бренд (таблица): ${profile.brand_label}`);
  if (profile.brand_scope) lines.push(`Скоуп (таблица): ${profile.brand_scope}`);
  const mk = String(profile.main_keyword || "").trim();
  if (mk) lines.push(`Главный ключ (фокус главной): ${mk}`);
  const c = String(profile.concept || "").trim();
  if (c) lines.push(`Концепция / угол: ${c}`);
  const ta = String(profile.target_audience || "").trim();
  if (ta) lines.push(`Целевая аудитория: ${ta}`);
  const tone = String(profile.tone || "").trim();
  if (tone) lines.push(`Тон: ${tone}`);
  const m4 = String(profile.mandatory_fourth_subpage || "").trim();
  if (m4) lines.push(`4-я подстраница (обязательная тема): ${m4}`);
  const full = String(profile.full_generation_prompt || "").trim();
  if (full) lines.push(`\nПолный доп. промпт:\n${full}`);
  return lines.join("\n").trim();
}

/**
 * @param {{ theme: string; pickSeed: string; supabaseUrl?: string; serviceKey?: string; onLog?: (m: string) => void }} opts
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

  const inferred = inferBrandPackScopeFromTheme(theme);
  const all = await fetchActiveGenerationPromptProfiles(supabaseUrl, serviceKey);
  const filtered = all.filter((r) => profileMatchesThemeScope(r, inferred));
  if (!filtered.length) {
    onLog?.(
      `Supabase: подходящих активных профилей нет (всего активных: ${all.length}; скоуп темы: ${inferred ?? "универсальный только any/null"}).`
    );
    return null;
  }
  const picked = pickWeightedGenerationProfile(filtered, `${pickSeed}|${theme}|${filtered.length}`);
  return picked || null;
}
