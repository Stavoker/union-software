import crypto from "node:crypto";

const TABLE = "source_articles";

const BRAND_SCRUB_PATTERNS = [
  [/\blaki\s*world\b/gi, "{brand}"],
  [/\blakiworld\b/gi, "{brand}"],
  [/\bлаки\s*ворлд\b/gi, "{brand}"],
  [/\blaki\b/gi, "{brand}"],
  [/\bлаки\b/gi, "{brand}"],
];

function readCountEnv(name, fallback, min, max) {
  const raw = String(process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** Налаштування з /dashboard/settings (через withUserIntegrationEnv → process.env). */
export function resolveSourceArticlesSettings(env = process.env) {
  const enabledRaw = String(env.SOFTGEN_SOURCE_ARTICLES_ENABLED ?? "1").trim();
  return {
    enabled: enabledRaw !== "0",
    language: String(env.SOFTGEN_SOURCE_ARTICLES_LANGUAGE ?? "ru").trim() || "ru",
    countPerPage: readCountEnv("SOFTGEN_SOURCE_ARTICLES_COUNT", 2, 0, 4),
    poolLimit: readCountEnv("SOFTGEN_SOURCE_ARTICLES_POOL_LIMIT", 40, 5, 120),
  };
}

function scrubBrandInText(text, themeBrandHint = "") {
  const brand = String(themeBrandHint || "").trim() || "{brand}";
  let out = String(text || "");
  for (const [re, repl] of BRAND_SCRUB_PATTERNS) {
    out = out.replace(re, brand === "{brand}" ? repl : brand);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function excerpt(text, maxChars) {
  const s = scrubBrandInText(String(text || "").replace(/\s+/g, " "));
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars).trim()}…`;
}

/**
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {{ language?: string; limit?: number }} [opts]
 */
export async function fetchSourceArticlesPool(supabaseUrl, serviceKey, opts = {}) {
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(serviceKey || "").trim();
  if (!base || !key) return [];

  const settings = resolveSourceArticlesSettings(process.env);
  const language = String(opts.language ?? settings.language).trim();
  const limit = Math.max(
    5,
    Math.min(
      120,
      Number(opts.limit) ||
        (opts.poolLimit != null ? Number(opts.poolLimit) : settings.poolLimit)
    )
  );

  const url = new URL(`${base}/rest/v1/${encodeURIComponent(TABLE)}`);
  url.searchParams.set(
    "select",
    "id,title,category,subcategory,tone,content,language,brand"
  );
  if (language) {
    url.searchParams.set("language", `eq.${language}`);
  }
  url.searchParams.set("order", "id.desc");
  url.searchParams.set("limit", String(limit));

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
    throw new Error("Supabase: некорректный JSON при чтении source_articles");
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 240);
    throw new Error(`Supabase source_articles ${res.status}: ${msg}`);
  }
  return Array.isArray(data) ? data.filter((r) => String(r?.content || "").trim()) : [];
}

/**
 * @param {Record<string, unknown>[]} pool
 * @param {string} seed
 * @param {number} count
 */
export function pickSourceArticlesFromPool(pool, seed, count = 2) {
  const rows = Array.isArray(pool) ? pool : [];
  const n = Math.max(0, Math.min(5, Math.trunc(Number(count) || 0)));
  if (!rows.length || n === 0) return [];

  const h = crypto.createHash("sha256").update(String(seed || "0")).digest();
  const start = h.readUInt32BE(0) % rows.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(rows[(start + i) % rows.length]);
  }
  return out;
}

/**
 * @param {Record<string, unknown>[]} articles
 * @param {{ themeBrandHint?: string; pageFile?: string }} [opts]
 * @returns {string}
 */
export function formatSourceArticlesPromptBlock(articles, opts = {}) {
  const list = Array.isArray(articles) ? articles : [];
  if (!list.length) return "";

  const brand = String(opts.themeBrandHint || "").trim() || "из темы сборки";
  const maxChars = readCountEnv("SOFTGEN_SOURCE_ARTICLE_EXCERPT_CHARS", 1100, 300, 2500);
  const page = String(opts.pageFile || "").trim();

  const lines = [
    "=== РЕФЕРЕНС ТЕКСТОВ (source_articles, только стиль и глубина; не копировать дословно) ===",
    `Бренд текущей сборки: «${brand}». Названия брендов из примеров ниже заменены на {brand} — не восстанавливай Laki/Лаки.`,
    "Используй примеры как ориентир по тону, структуре абзацев и iGaming-лексике; факты адаптируй под тему страницы.",
  ];
  if (page) lines.push(`Страница сборки: ${page}`);

  list.forEach((row, i) => {
    const title = scrubBrandInText(row.title, brand);
    const cat = [row.category, row.subcategory].filter(Boolean).join(" / ");
    const tone = scrubBrandInText(row.tone, brand);
    const body = excerpt(row.content, maxChars);
    lines.push(
      `\n--- Пример ${i + 1}${cat ? ` (${cat})` : ""} ---`,
      title ? `Заголовок: ${title}` : "",
      tone ? `Тон: ${tone}` : "",
      body ? `Фрагмент:\n${body}` : ""
    );
  });

  return lines.filter(Boolean).join("\n").trim();
}

/**
 * @param {{
 *   theme?: string;
 *   pickSeed: string;
 *   pageFile?: string;
 *   themeBrandHint?: string;
 *   supabaseUrl?: string;
 *   serviceKey?: string;
 *   onLog?: (m: string) => void;
 * }} opts
 * @returns {Promise<{ pool: Record<string, unknown>[]; block: string; picked: Record<string, unknown>[] }>}
 */
export async function loadSourceArticlesContextForBuild(opts) {
  const empty = { pool: [], block: "", picked: [] };
  const supabaseUrl = String(
    opts.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).trim();
  const serviceKey = String(opts.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const onLog = opts.onLog;

  if (String(process.env.SOFTGEN_SOURCE_ARTICLES_ENABLED ?? "1").trim() === "0") {
    onLog?.("source_articles: выключено (SOFTGEN_SOURCE_ARTICLES_ENABLED=0)");
    return empty;
  }

  if (!supabaseUrl || !serviceKey) {
    onLog?.("source_articles: нет SUPABASE_URL / SERVICE_ROLE_KEY — без референс-текстов");
    return empty;
  }

  const count =
    opts.articleCount != null
      ? Math.max(0, Math.min(4, Math.trunc(Number(opts.articleCount))))
      : settings.countPerPage;
  if (count === 0) return empty;

  try {
    const pool = await fetchSourceArticlesPool(supabaseUrl, serviceKey, {
      language: settings.language,
      poolLimit: settings.poolLimit,
    });
    if (!pool.length) {
      onLog?.("source_articles: в БД нет статей для выбранного языка");
      return empty;
    }
    const seed = `${opts.pickSeed}|${opts.pageFile || "site"}|${opts.theme || ""}`;
    const picked = pickSourceArticlesFromPool(pool, seed, count);
    const block = formatSourceArticlesPromptBlock(picked, {
      themeBrandHint: opts.themeBrandHint,
      pageFile: opts.pageFile,
    });
    onLog?.(
      `source_articles: пул ${pool.length}, в промпт ${picked.length} (ids: ${picked.map((r) => r.id).join(", ")})`
    );
    return { pool, block, picked };
  } catch (e) {
    onLog?.(`source_articles: ${String(e?.message || e).slice(0, 220)}`);
    return empty;
  }
}
