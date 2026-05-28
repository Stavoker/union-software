import crypto from "node:crypto";

const TABLE = "generation_reference_sites";
const REF_FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(20000, Number(process.env.SOFTGEN_REFERENCE_FETCH_TIMEOUT_MS) || 9000)
);

/**
 * @param {Record<string, unknown>} row
 * @returns {number}
 */
function readGenerationsCount(row) {
  const n = Number(row?.generations_count);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} seed
 * @returns {Record<string, unknown> | null}
 */
function pickByLeastUsed(rows, seed) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const counts = rows.map(readGenerationsCount);
  const minCount = Math.min(...counts);
  const leastUsedRows = rows.filter((r) => readGenerationsCount(r) === minCount);
  if (!leastUsedRows.length) return null;
  if (leastUsedRows.length === 1) return leastUsedRows[0];
  const h = crypto.createHash("sha256").update(String(seed || "0")).digest();
  const idx = h.readUInt32BE(0) % leastUsedRows.length;
  return leastUsedRows[idx];
}

/**
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function fetchActiveReferenceSites(supabaseUrl, serviceKey) {
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(serviceKey || "").trim();
  if (!base || !key) return [];

  const url = new URL(`${base}/rest/v1/${encodeURIComponent(TABLE)}`);
  url.searchParams.set("select", "id,reference_url,generations_count,active_status");
  url.searchParams.set("active_status", "eq.true");
  url.searchParams.set("order", "generations_count.asc,updated_at.asc");

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
    throw new Error("Supabase: некорректный JSON при чтении generation_reference_sites");
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 240);
    throw new Error(`Supabase ${res.status}: ${msg}`);
  }
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} supabaseUrl
 * @param {string} serviceKey
 * @param {Record<string, unknown>} row
 */
async function incrementReferenceSiteCounter(supabaseUrl, serviceKey, row) {
  const id = String(row?.id || "").trim();
  if (!id) return;
  const current = readGenerationsCount(row);
  const next = current + 1;
  const base = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const key = String(serviceKey || "").trim();
  if (!base || !key) return;

  const url = `${base}/rest/v1/${encodeURIComponent(TABLE)}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      generations_count: next,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const msg = typeof data === "object" && data?.message ? String(data.message) : text.slice(0, 240);
    throw new Error(`Supabase PATCH generation_reference_sites ${res.status}: ${msg}`);
  }
}

/**
 * @param {{ reference_url?: unknown }} row
 * @returns {string}
 */
export function formatReferenceSitePromptBlock(row) {
  const url = String(row?.reference_url || "").trim();
  if (!url) return "";
  return [
    "=== РЕФЕРЕНС (готовый черновик сайта) ===",
    `URL: ${url}`,
    "Это **уже существующий сайт** — твоя задача: переложить его под **бренд, цвета, картинки и тексты** из сборки (user), сохранив **дизайн, сетку и каркас**; визуальная близость к референсу должна быть **высокой**, без «нового сайта с нуля».",
  ].join("\n");
}

function stripHtmlForAnalysis(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textOnly(input) {
  return decodeHtmlEntities(String(input || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractMainBlock(cleanHtml) {
  const m = String(cleanHtml || "").match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (m && m[0]) return m[0];
  return String(cleanHtml || "");
}

const REFERENCE_TEMPLATE_MAIN_MAX_CHARS = Math.max(
  8000,
  Math.min(
    120000,
    Number(process.env.SOFTGEN_REFERENCE_TEMPLATE_MAIN_MAX_CHARS) || 72000
  )
);

const REFERENCE_TEMPLATE_CHROME_MAX_CHARS = Math.max(
  2000,
  Math.min(
    80000,
    Number(process.env.SOFTGEN_REFERENCE_TEMPLATE_CHROME_MAX_CHARS) || 32000
  )
);

/** Загальний бюджет символів на «документний» контекст (head + до/після main). */
const REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS = Math.max(
  2000,
  Math.min(
    48000,
    Number(process.env.SOFTGEN_REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS) || 16000
  )
);

/**
 * Прибирає небезпечне з HTML шапки/підвалу (референс або відповідь моделі).
 * @param {string} html
 * @returns {string}
 */
export function stripUnsafeChromeMarkup(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(?:object|embed)\b[^>]*>[\s\S]*?<\/(?:object|embed)>/gi, "")
    .replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on[a-z][a-z0-9_-]*\s*=\s*[^\s>]+/gi, "")
    .replace(/\bhref\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"')
    .replace(/\bsrc\s*=\s*["']\s*javascript:[^"']*["']/gi, 'src="#"')
    .trim();
}

function capChromeTemplate(html, maxLen) {
  const cap = Math.max(1500, Math.min(100000, Number(maxLen) || REFERENCE_TEMPLATE_CHROME_MAX_CHARS));
  const t = String(html || "").trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}\n<!-- REFERENCE_CHROME_TEMPLATE_TRUNCATED -->`;
}

function capDocContext(html, maxLen) {
  const cap = Math.max(400, Math.min(100000, Number(maxLen) || 8000));
  const t = String(html || "").trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}\n<!-- REFERENCE_DOCUMENT_CONTEXT_TRUNCATED -->`;
}

/**
 * Внутрішність <head> без script/style/link/noscript — орієнтир для моделі (не підставляти збірником).
 * @param {string} rawHtml
 * @param {number} [maxLen]
 */
export function buildReferenceHeadContextFromRawHtml(
  rawHtml,
  maxLen = Math.min(6000, Math.floor(REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS * 0.28))
) {
  const raw = String(rawHtml || "");
  const m = raw.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!m || !m[1]) return "";
  let inner = String(m[1] || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
  inner = inner.replace(/\s+/g, " ").trim();
  return capDocContext(inner, maxLen);
}

/**
 * Атрибути відкриваючих тегів <html> та <body> (коротко).
 * @param {string} rawHtml
 */
export function extractReferenceHtmlBodyOpenAttrs(rawHtml) {
  const raw = String(rawHtml || "");
  const htmlM = raw.match(/<html\b([^>]*)>/i);
  const bodyM = raw.match(/<body\b([^>]*)>/i);
  const clip = (s, n) => String(s || "").trim().slice(0, n);
  return {
    htmlOpenAttrs: clip(htmlM ? htmlM[1] : "", 480),
    bodyOpenAttrs: clip(bodyM ? bodyM[1] : "", 480),
  };
}

/**
 * Контент <body> до першого <main> та після </main> (без небезпечних тегів).
 * За замовчуванням прибирає з префікса/суфікса перший/останній <header>/<footer>, щоб не дублювати referenceHeader/FooterTemplate.
 * @param {string} rawHtml
 * @param {{ maxBefore?: number; maxAfter?: number; stripBookendChrome?: boolean }} [opts]
 */
export function buildReferenceBodyAroundMainSnippetsFromRawHtml(
  rawHtml,
  opts = {}
) {
  const raw = String(rawHtml || "");
  const total = REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS;
  const maxBefore =
    Number(opts.maxBefore) > 0
      ? Number(opts.maxBefore)
      : Math.floor(total * 0.38);
  const maxAfter =
    Number(opts.maxAfter) > 0
      ? Number(opts.maxAfter)
      : Math.floor(total * 0.38);
  const stripBookendChrome = opts.stripBookendChrome !== false;
  const bodyInnerMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyInnerMatch || !bodyInnerMatch[1]) {
    return { beforeMain: "", afterMain: "" };
  }
  let inner = bodyInnerMatch[1];
  const mainBlock = inner.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (!mainBlock || !mainBlock[0]) {
    const cleaned = stripUnsafeChromeMarkup(inner);
    return { beforeMain: capDocContext(cleaned, maxBefore), afterMain: "" };
  }
  const idx =
    typeof mainBlock.index === "number"
      ? mainBlock.index
      : inner.indexOf(mainBlock[0]);
  if (idx < 0) {
    const cleaned = stripUnsafeChromeMarkup(inner);
    return { beforeMain: capDocContext(cleaned, maxBefore), afterMain: "" };
  }
  const fullMain = mainBlock[0];
  let beforeMain = inner.slice(0, idx);
  let afterMain = inner.slice(idx + fullMain.length);
  if (stripBookendChrome) {
    beforeMain = beforeMain.replace(
      /^\s*<header\b[^>]*>[\s\S]*?<\/header>\s*/i,
      ""
    );
    afterMain = afterMain.replace(
      /\s*<footer\b[^>]*>[\s\S]*?<\/footer>\s*$/i,
      ""
    );
    afterMain = afterMain.replace(
      /\s*<div\b[^>]*\bid\s*=\s*["']footer["'][^>]*>[\s\S]*?<\/div>\s*$/i,
      ""
    );
  }
  beforeMain = capDocContext(stripUnsafeChromeMarkup(beforeMain), maxBefore);
  afterMain = capDocContext(stripUnsafeChromeMarkup(afterMain), maxAfter);
  return { beforeMain, afterMain };
}

/**
 * Зовнішній HTML `<header>…</header>` з сирого HTML референсу (для режиму шаблону).
 * @param {string} rawHtml
 * @param {number} [maxLen]
 * @returns {string}
 */
export function buildReferenceHeaderTemplateFromRawHtml(
  rawHtml,
  maxLen = REFERENCE_TEMPLATE_CHROME_MAX_CHARS
) {
  const raw = String(rawHtml || "");
  const m = raw.match(/<header\b[^>]*>[\s\S]*?<\/header>/i);
  if (!m || !m[0]) return "";
  return capChromeTemplate(stripUnsafeChromeMarkup(m[0]), maxLen);
}

/**
 * Зовнішній HTML підвалу з сирого HTML референсу (`<footer>` або `#footer`).
 * @param {string} rawHtml
 * @param {number} [maxLen]
 * @returns {string}
 */
export function buildReferenceFooterTemplateFromRawHtml(
  rawHtml,
  maxLen = REFERENCE_TEMPLATE_CHROME_MAX_CHARS
) {
  const raw = String(rawHtml || "");
  let block = "";
  const foot = raw.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/i);
  if (foot && foot[0]) {
    block = foot[0];
  } else {
    const divFoot = raw.match(
      /<div\b[^>]*\bid\s*=\s*["']footer["'][^>]*>[\s\S]*?<\/div>/i
    );
    if (divFoot && divFoot[0]) block = divFoot[0];
  }
  if (!block) return "";
  return capChromeTemplate(stripUnsafeChromeMarkup(block), maxLen);
}

/**
 * Внутрішній HTML <main> з сирого HTML референсу для режиму «LLM переробляє шаблон».
 * Прибирає script/style/noscript; обрізає за розміром промпта.
 * @param {string} rawHtml
 * @param {number} [maxLen]
 * @returns {string}
 */
export function buildMainInnerTemplateFromRawHtml(rawHtml, maxLen = REFERENCE_TEMPLATE_MAIN_MAX_CHARS) {
  const raw = String(rawHtml || "");
  const cap = Math.max(4000, Math.min(120000, Number(maxLen) || REFERENCE_TEMPLATE_MAIN_MAX_CHARS));
  const mainMatch = raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let inner = mainMatch ? mainMatch[1] : "";
  if (!inner.trim()) {
    const bodyMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    inner = bodyMatch ? bodyMatch[1] : raw;
  }
  inner = inner
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const t = inner.trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}\n<!-- REFERENCE_MAIN_TEMPLATE_TRUNCATED -->`;
}

function extractMainSectionSignatures(mainHtml) {
  const signatures = [];
  const re = /<section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(String(mainHtml || ""))) !== null && signatures.length < 18) {
    const attrs = String(m[1] || "");
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const cls = (attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const clsTop = cls
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(".");
    signatures.push(id ? `#${id}` : clsTop ? `.${clsTop}` : "section");
  }
  return signatures;
}

function inferSectionRole(attrs, innerHtml) {
  const attrsText = String(attrs || "").toLowerCase();
  const inner = String(innerHtml || "");
  const innerText = textOnly(inner).toLowerCase();
  if (/\bid\s*=\s*["'][^"']*lw-games[^"']*["']/i.test(attrsText)) return "games";
  if (/\bid\s*=\s*["'][^"']*lw-vip[^"']*["']/i.test(attrsText)) return "vip";
  if (/\bclass\s*=\s*["'][^"']*(?:games-wrap|games_wrap)[^"']*["']/i.test(attrsText))
    return "games";
  const hay = `${attrsText} ${innerText.slice(0, 400)}`;
  if (/(hero|banner|welcome|джекпот|bonus|бонус|promo|offer)/i.test(hay)) return "hero";
  if (/(faq|вопрос|ответ)/i.test(hay)) return "faq";
  if (/(register|signup|login|вход|регистрац|кабинет|cta)/i.test(hay)) return "cta";
  if (/(games|slots|слот|игр|providers|провайдер|catalog|каталог)/i.test(hay)) return "games";
  if (/(^|\b)vip\b|привилег|loyalt|лояльн/i.test(hay)) return "vip";
  if (/(tabs?|data-tab|категор|menu|меню|nav)/i.test(hay)) return "menu_or_tabs";
  if (/(tournament|турнир|leaderboard|рейтинг)/i.test(hay)) return "tournaments";
  if (/(review|отзыв|обзор|guides?|гайд)/i.test(hay)) return "content";
  if (/<table\b/i.test(inner) || /таблиц/i.test(hay)) return "table";
  if (/(sidebar|aside|filter|фильтр)/i.test(hay)) return "sidebar";
  return "section";
}

/**
 * Порядок ролей верхнього рівня в <main> (коректно при вкладених <section>).
 * @param {string} mainHtml
 * @param {(attrs: string, inner: string) => string} [inferFn]
 * @returns {string[]}
 */
export function extractSectionRoleSequenceForSimilarity(
  mainHtml,
  inferFn = inferSectionRole
) {
  const src = String(mainHtml || "");
  const roles = [];
  const stack = [];
  const re = /<(\/?)section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(src)) !== null && roles.length < 32) {
    const isClose = m[1] === "/";
    if (!isClose) {
      stack.push({ attrs: String(m[2] || ""), contentStart: m.index + m[0].length });
    } else {
      const open = stack.pop();
      if (open && stack.length === 0) {
        const inner = src.slice(open.contentStart, m.index);
        roles.push(inferFn(open.attrs, inner));
      }
    }
  }
  if (!roles.length) {
    const fallback = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(src)?.[1] || src;
    if (/\bid\s*=\s*["'][^"']*lw-games[^"']*["']/i.test(fallback)) roles.push("games");
    if (/\bid\s*=\s*["'][^"']*lw-vip[^"']*["']/i.test(fallback)) roles.push("vip");
    if (/<table\b/i.test(fallback)) roles.push("table");
    if (/<aside\b/i.test(fallback)) roles.push("sidebar");
    if (/<nav\b/i.test(fallback)) roles.push("menu_or_tabs");
  }
  return roles;
}

function extractHeadingOutline(mainHtml) {
  const out = [];
  const re = /<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(String(mainHtml || ""))) !== null && out.length < 24) {
    const tag = String(m[1] || "").toLowerCase();
    const title = textOnly(m[2]).slice(0, 110);
    if (!title) continue;
    out.push(`${tag.toUpperCase()}: ${title}`);
  }
  return out;
}

function extractNavLabels(cleanHtml) {
  const out = [];
  const navMatch = String(cleanHtml || "").match(/<nav\b[^>]*>[\s\S]*?<\/nav>/i);
  if (!navMatch?.[0]) return out;
  const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(navMatch[0])) !== null && out.length < 12) {
    const label = textOnly(m[1]).slice(0, 80);
    if (label) out.push(label);
  }
  return out;
}

function extractStyleTokens(html) {
  const src = String(html || "");
  const classTokens = [];
  const classRe = /\bclass\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = classRe.exec(src)) !== null && classTokens.length < 240) {
    const classes = String(m[1] || "")
      .split(/\s+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    for (const cls of classes) {
      if (
        /(?:^|[-_])(layout|wrap|container|grid|row|col|sidebar|menu|footer|header|hero|card|btn|button|tabs?|accordion|faq|content|section|nav)(?:$|[-_])/.test(
          cls
        )
      ) {
        classTokens.push(cls);
      }
    }
  }
  const colorTokens = [];
  const colorRe = /(?:#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
  while ((m = colorRe.exec(src)) !== null && colorTokens.length < 64) {
    colorTokens.push(String(m[0]).toLowerCase());
  }
  const uniq = (arr, max) => [...new Set(arr)].slice(0, max);
  return {
    classTokens: uniq(classTokens, 80),
    colorTokens: uniq(colorTokens, 20),
  };
}

function extractSemanticStyleFeatures(html) {
  const src = String(html || "").toLowerCase();
  const out = [];
  const imgCount = (src.match(/<img\b/g) || []).length;
  if (/<table\b/.test(src)) out.push("table");
  if (/<form\b/.test(src)) out.push("form");
  if (/data-tab=|role=["']tab/i.test(src)) out.push("tabs");
  if (/<input\b[^>]*(search|поиск)/i.test(src)) out.push("search");
  if (/(overflow-x|scroll-snap|carousel|slider)/i.test(src)) out.push("horizontal-scroll");
  if (/(grid|masonry|cards|tile)/i.test(src)) out.push("grid-cards");
  if (/(hero|banner|background-image)/i.test(src)) out.push("hero-visual");
  if (
    /<footer\b[\s\S]*?<nav\b/.test(src) ||
    /\b(lw-footer-links|footer-links)\b/.test(src)
  )
    out.push("footer-menu");
  if (/<aside\b|sidebar/.test(src)) out.push("sidebar");
  if (imgCount >= 10) out.push("media-heavy");
  else if (imgCount > 0) out.push("media-light");
  return [...new Set(out)].slice(0, 20);
}

/**
 * Чи схожий HTML на лівий вертикальний рейл (Dragon Money / 7K: nav + іконки до `<main>`).
 * @param {string} rawHtml
 * @param {string} [beforeMainSnippet] — фрагмент «до main» зі снімка (після strip header)
 */
/**
 * Хвіст `<body>` після `</main>` (нижні dock / віджети до футера).
 * @param {string} lowerHtml — HTML у нижньому регістрі
 */
function extractBodyInnerAfterMainClose(lowerHtml) {
  const s = String(lowerHtml || "");
  const bodyM = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyM || !bodyM[1]) return "";
  const inner = bodyM[1];
  const mainM = inner.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (!mainM || !mainM[0]) return "";
  const idx =
    typeof mainM.index === "number" ? mainM.index : inner.indexOf(mainM[0]);
  if (idx < 0) return "";
  return inner.slice(idx + mainM[0].length);
}

/**
 * Нижній фіксований dock / tab-bar (7K тощо): fixed+bottom:0, класи, nav+іконки після main.
 * @param {string} fragmentLower
 */
function scoreReferenceBottomDockInFragment(fragmentLower) {
  const t = String(fragmentLower || "");
  if (t.length < 72) return false;
  const fixedBottom =
    /position\s*:\s*(fixed|sticky)/.test(t) &&
    /\bbottom\s*:\s*0(px)?\b/.test(t);
  const classBottomDock =
    /(bottom-nav|bottom_nav|tab-bar|tabbar|bottomdock|dock-bottom|dock_bottom|mobile-bottom|navbar-bottom|fixed-bottom|bottom-bar|bottombar|navigation-bottom|nav-bottom|bottom-menu|bottom_menu|app-bar|appbar|bottom-sheet)/.test(
      t
    );
  const aCount = (t.match(/<a\b/g) || []).length;
  const navDense =
    /<nav\b/i.test(t) &&
    aCount >= 4 &&
    ((t.match(/<svg\b/g) || []).length >= 1 || (t.match(/<path\b/g) || []).length >= 3);
  const roleNavDense = /role\s*=\s*["']navigation["']/i.test(t) && aCount >= 4;
  const dockWords = [
    "сундуки",
    "игровой зал",
    "турниры",
    "лотереи",
    "магазин",
    "календарь",
    "бонусы",
  ];
  const dockWordHits = dockWords.filter((w) => t.includes(w)).length;
  const casinoDockByLabels =
    dockWordHits >= 3 &&
    aCount >= 5 &&
    t.length < 28000 &&
    (fixedBottom || classBottomDock || /<nav\b/i.test(t));

  return Boolean(
    fixedBottom || classBottomDock || navDense || roleNavDense || casinoDockByLabels
  );
}

/**
 * Чи є на референсі нижній фіксований таб-бар (після `</main>` або у фрагменті після main).
 * @param {string} rawHtml
 * @param {string} [afterMainSnippet] — `referenceBodyAfterMainSnippet`
 */
export function inferReferenceBottomDockLayoutHint(rawHtml, afterMainSnippet = "") {
  const rawLow = String(rawHtml || "").toLowerCase();
  const tailFromRaw = extractBodyInnerAfterMainClose(rawLow);
  const sn = String(afterMainSnippet || "").toLowerCase();
  if (scoreReferenceBottomDockInFragment(sn)) return true;
  if (scoreReferenceBottomDockInFragment(tailFromRaw)) return true;
  return false;
}

export function inferReferenceLeftRailLayoutHint(rawHtml, beforeMainSnippet = "") {
  const sLow = String(rawHtml || "").toLowerCase();
  const mainIdx = sLow.indexOf("<main");
  const headArea =
    mainIdx > 0 ? sLow.slice(0, mainIdx) : sLow.slice(0, Math.min(120000, sLow.length));
  const sn = String(beforeMainSnippet || "").toLowerCase();
  const area = sn.length >= 200 ? sn : headArea;
  if (area.length < 120) return false;

  const hasNav = /<nav\b/i.test(area);
  const linkCount = (area.match(/<a\b/g) || []).length;
  const btnCount = (area.match(/<button\b/g) || []).length;
  const svgCount = (area.match(/<svg\b/g) || []).length;
  const pathCount = (area.match(/<path\b/g) || []).length;

  const classRail =
    /(sidebar|rail|sidenav|side-nav|vertical-nav|navbar-side|layout__side|nav-icon|icon-nav|dock-left|menu-left|left-nav|l-nav)/.test(
      headArea
    );
  const narrowFixedLeft =
    /position\s*:\s*(fixed|sticky)/.test(headArea) &&
    /\bleft\s*:\s*0\b/.test(headArea) &&
    (/<nav\b/i.test(headArea) || /<ul\b/i.test(headArea));

  const verticalIconRail =
    (hasNav || /<aside\b/i.test(area)) &&
    (svgCount >= 2 || pathCount >= 6 || linkCount + btnCount >= 5);

  const denseMiniNav = linkCount >= 6 && (svgCount >= 1 || pathCount >= 4);

  return (
    classRail ||
    narrowFixedLeft ||
    verticalIconRail ||
    denseMiniNav ||
    (area.length > 400 && hasNav && linkCount >= 4)
  );
}

/**
 * Один алгоритм для знімка референсу та для згенерованої сторінки (ref-similarity).
 * @param {string} cleanHtml
 */
export function detectLayoutFeaturesForSimilarity(cleanHtml) {
  const s = String(cleanHtml || "").toLowerCase();
  const mainIdx = s.indexOf("<main");
  const headArea = mainIdx > 0 ? s.slice(0, mainIdx) : s;
  const asideInHead = /<aside\b/.test(headArea);
  const navInHead = /<nav\b/.test(headArea);
  const svgInHead = (headArea.match(/<svg\b/g) || []).length;
  const pathInHead = (headArea.match(/<path\b/g) || []).length;
  const aInHead = (headArea.match(/<a\b/g) || []).length;
  const btnInHead = (headArea.match(/<button\b/g) || []).length;
  const classRailHint = /(sidebar|rail|sidenav|side-nav|vertical-nav|navbar-side|layout__side|nav-icon|icon-nav|dock-left|menu-left|left-nav|l-nav)/.test(
    headArea
  );
  const narrowFixedLeft =
    /position\s*:\s*(fixed|sticky)/.test(headArea) &&
    /\bleft\s*:\s*0\b/.test(headArea) &&
    (navInHead || /<ul\b/.test(headArea));
  const verticalIconRail =
    (navInHead || asideInHead) &&
    (svgInHead >= 2 || pathInHead >= 6 || aInHead + btnInHead >= 5);

  const hasLeftSidebarLegacy =
    /<aside\b/.test(s) &&
    /(left[-_ ]sidebar|sidebar[-_ ]left|\bcol[-_ ]left\b|\bleft[-_ ]col\b|sidenav[-_ ]?left)/.test(
      s
    );
  const hasRightSidebar =
    /<aside\b/.test(s) &&
    /(right[-_ ]sidebar|sidebar[-_ ]right|\bcol[-_ ]right\b|\bright[-_ ]col\b|sidenav[-_ ]?right)/.test(
      s
    );
  const hasLeftSidebar =
    hasLeftSidebarLegacy ||
    verticalIconRail ||
    narrowFixedLeft ||
    (asideInHead && mainIdx > 0);
  const hasAnySidebar =
    /<aside\b/.test(s) ||
    /\b(sidebar|sidenav|side-nav|lw-aside|col-aside|aside-)\b/.test(s) ||
    classRailHint ||
    asideInHead ||
    verticalIconRail ||
    narrowFixedLeft ||
    (aInHead >= 6 && navInHead && (svgInHead >= 1 || pathInHead >= 3));
  const footerChunk = (() => {
    const fm = s.match(/<footer\b[\s\S]*?<\/footer>/i);
    return fm ? fm[0] : "";
  })();
  const hasFooterMenu =
    /<footer\b[\s\S]*?<nav\b/.test(s) ||
    /<footer\b[\s\S]*?\bmenu\b/i.test(s) ||
    /\b(lw-footer-links|footer-links|footer__nav|footer-nav)\b/.test(footerChunk) ||
    ((footerChunk.match(/<a\b/g) || []).length >= 2);
  const hasTopMenu =
    /<header\b[\s\S]*?<nav\b/.test(s) || /<nav\b/.test(s);
  const tailAfterMain = extractBodyInnerAfterMainClose(s);
  const hasBottomDockNav = scoreReferenceBottomDockInFragment(tailAfterMain);
  return {
    hasLeftSidebar,
    hasRightSidebar,
    hasAnySidebar,
    hasFooterMenu,
    hasTopMenu,
    hasBottomDockNav,
  };
}

export { resolveMainHtmlTemplateForPage } from "./site-templates.js";

async function fetchReferenceSiteHtml(referenceUrl) {
  const url = String(referenceUrl || "").trim();
  if (!url) return "";
  const attempts = [
    {
      label: "browser",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    {
      label: "yandex-bot",
      userAgent:
        "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    },
    {
      label: "google-bot",
      userAgent:
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    },
  ];
  const errors = [];
  for (const attempt of attempts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REF_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": attempt.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru,en;q=0.9",
        },
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        errors.push(`${attempt.label}: HTTP ${res.status}`);
        continue;
      }
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("text/html")) {
        errors.push(`${attempt.label}: unexpected content-type: ${contentType}`);
        continue;
      }
      return await res.text();
    } catch (e) {
      errors.push(`${attempt.label}: ${String(e?.message || e)}`);
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(`reference fetch failed after UA attempts (${errors.join("; ")})`);
}

/**
 * @param {string} referenceUrl
 * @param {{
 *   includeMainTemplate?: boolean;
 *   includeChromeTemplates?: boolean;
 * }} [opts] includeChromeTemplates defaults to true: header/footer эталона извлекаются даже без полного inner-main шаблона.
 * @returns {Promise<{ overlay: string; signals: Record<string, unknown> } | null>}
 */
export async function buildReferenceStructureOverlay(referenceUrl, opts = {}) {
  const includeMainTemplate = Boolean(opts?.includeMainTemplate);
  const includeChromeTemplates = opts?.includeChromeTemplates !== false;
  const raw = await fetchReferenceSiteHtml(referenceUrl);
  const clean = stripHtmlForAnalysis(raw);
  const main = extractMainBlock(clean);
  const sectionSignatures = extractMainSectionSignatures(main);
  const sectionRoleSequence = extractSectionRoleSequenceForSimilarity(main);
  const headings = extractHeadingOutline(main);
  const navLabels = extractNavLabels(clean);
  const style = extractStyleTokens(raw);
  const layout = detectLayoutFeaturesForSimilarity(raw);
  let semanticStyleFeatures = extractSemanticStyleFeatures(raw);
  if (layout.hasBottomDockNav) {
    semanticStyleFeatures = [...new Set([...semanticStyleFeatures, "bottom-dock"])].slice(0, 20);
  }

  const mainTextLen = textOnly(main).replace(/\s+/g, " ").trim().length;
  const mainOpenTags = (String(main).match(/<\w+/g) || []).length;
  const layoutAny =
    Boolean(layout?.hasLeftSidebar) ||
    Boolean(layout?.hasRightSidebar) ||
    Boolean(layout?.hasAnySidebar) ||
    Boolean(layout?.hasFooterMenu) ||
    Boolean(layout?.hasTopMenu) ||
    Boolean(layout?.hasBottomDockNav);

  const hasRichStructureSignals =
    sectionSignatures.length > 0 ||
    sectionRoleSequence.length > 0 ||
    headings.length > 0 ||
    navLabels.length > 0 ||
    style.classTokens.length > 0;

  const hasWeakStructureSignals =
    style.colorTokens.length > 0 ||
    semanticStyleFeatures.length > 0 ||
    layoutAny ||
    mainTextLen >= 140 ||
    mainOpenTags >= 28;

  if (!hasRichStructureSignals && !hasWeakStructureSignals) {
    return null;
  }

  const weakStructureSnapshot = Boolean(!hasRichStructureSignals && hasWeakStructureSignals);

  const mainHtmlTemplate = includeMainTemplate
    ? buildMainInnerTemplateFromRawHtml(raw)
    : "";
  const referenceHeaderTemplate = includeChromeTemplates
    ? buildReferenceHeaderTemplateFromRawHtml(raw)
    : "";
  const referenceFooterTemplate = includeChromeTemplates
    ? buildReferenceFooterTemplateFromRawHtml(raw)
    : "";
  const { htmlOpenAttrs, bodyOpenAttrs } = includeMainTemplate
    ? extractReferenceHtmlBodyOpenAttrs(raw)
    : { htmlOpenAttrs: "", bodyOpenAttrs: "" };
  const referenceHeadContextSnippet = includeMainTemplate
    ? buildReferenceHeadContextFromRawHtml(raw)
    : "";
  const { beforeMain: referenceBodyBeforeMainSnippet, afterMain: referenceBodyAfterMainSnippet } =
    includeMainTemplate
      ? buildReferenceBodyAroundMainSnippetsFromRawHtml(raw)
      : { beforeMain: "", afterMain: "" };
  const referenceLayoutLeftRailHint = includeMainTemplate
    ? inferReferenceLeftRailLayoutHint(raw, referenceBodyBeforeMainSnippet)
    : false;
  const referenceLayoutBottomDockHint = includeMainTemplate
    ? inferReferenceBottomDockLayoutHint(raw, referenceBodyAfterMainSnippet)
    : false;

  const lines = [
    "=== СТРУКТУРНЫЙ СНИМОК РЕФЕРЕНСА (высокая похожесть по каркасу) ===",
    "Итоговый <main> должен **сильно напоминать** референс: те же крупные секции, сайдбары, сетка, типы блоков и ритм — см. флаги и списки ниже.",
    "Меняй: тексты, бренд, внутренние URL, `./img/…`, префиксы классов, палитру через **pageCss** билда. Не ломай тип макета (например убрать сайдбар, если он в снимке).",
    weakStructureSnapshot
      ? `Примечание: в HTML референса мало явной семантики (<section>, h1–h3 в <main>, «layout»-классы из эвристики) — ориентируйся на общий DOM: ≈${mainOpenTags} открывающих тегов в main, ≈${mainTextLen} симв. текста, сетку/карточки/медиа по разметке и layout flags ниже.`
      : "",
    sectionSignatures.length
      ? `Каркас <main> (порядок секций): ${sectionSignatures.join(" -> ")}`
      : "",
    sectionRoleSequence.length
      ? `Семантический порядок секций: ${sectionRoleSequence.join(" -> ")}`
      : "",
    headings.length
      ? `Иерархия заголовков (опорный outline):\n${headings.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
      : "",
    navLabels.length
      ? `Навигационные подписи (ориентир): ${navLabels.join(" | ")}`
      : "",
    `Layout flags: leftSidebar=${layout.hasLeftSidebar ? "yes" : "no"}, rightSidebar=${layout.hasRightSidebar ? "yes" : "no"}, anySidebar=${layout.hasAnySidebar ? "yes" : "no"}, topMenu=${layout.hasTopMenu ? "yes" : "no"}, footerMenu=${layout.hasFooterMenu ? "yes" : "no"}, bottomDockNav=${layout.hasBottomDockNav ? "yes" : "no"}`,
    style.classTokens.length
      ? `Style tokens (section-level classes): ${style.classTokens.join(" | ")}`
      : "",
    style.colorTokens.length
      ? `Style palette hints (из референса): ${style.colorTokens.join(" | ")}`
      : "",
    semanticStyleFeatures.length
      ? `Semantic style features: ${semanticStyleFeatures.join(" | ")}`
      : "",
    includeMainTemplate && mainHtmlTemplate
      ? `Режим шаблона: один inner <main> с URL референса — эталон дизайна для всех страниц пакета (${mainHtmlTemplate.length} символов).`
      : "",
    includeChromeTemplates && referenceHeaderTemplate
      ? `Эталон внешней шапки <header> (${referenceHeaderTemplate.length} символов) — модель адаптирует разметку под бренд и внутренние URL.`
      : "",
    includeChromeTemplates && referenceFooterTemplate
      ? `Эталон подвала (${referenceFooterTemplate.length} символов) — модель адаптирует разметку под бренд и внутренние URL.`
      : "",
    includeMainTemplate && (htmlOpenAttrs || bodyOpenAttrs)
      ? `Корень документа (атрибуты с референса): <html ${htmlOpenAttrs || "…"}>, <body ${bodyOpenAttrs || "…"}>.`
      : "",
    includeMainTemplate && referenceHeadContextSnippet
      ? `Сжатый контекст <head> референса (${referenceHeadContextSnippet.length} симв., без link/script/style) — ориентир по lang/theme-color; итоговый headHtml всё равно собирай по правилам JSON билда.`
      : "",
    includeMainTemplate && referenceBodyBeforeMainSnippet
      ? `HTML между <body> и <main> (без первого <header>, если он был): ${referenceBodyBeforeMainSnippet.length} симв. — баннеры/тикеры/обёртки вне inner main.`
      : "",
    includeMainTemplate && referenceBodyAfterMainSnippet
      ? `HTML после </main> до конца <body> (без хвостового <footer>, если был): ${referenceBodyAfterMainSnippet.length} симв.`
      : "",
    includeMainTemplate && referenceLayoutLeftRailHint
      ? "Эвристика: **левый вертикальный рейл / икон-меню** до <main> — включи колонку внутрь <main> (см. промпт «Макет-оболочка»)."
      : "",
    includeMainTemplate && referenceLayoutBottomDockHint
      ? "Эвристика: **нижний фиксированный dock / таб-бар** после <main> — повтори в mainHtml (см. «Макет-оболочка»)."
      : "",
  ].filter(Boolean);

  return {
    overlay: lines.join("\n"),
    signals: {
      referenceUrl: String(referenceUrl || "").trim(),
      weakStructureSnapshot,
      referenceMainTextLen: mainTextLen,
      referenceMainOpenTags: mainOpenTags,
      sectionCount: sectionSignatures.length,
      headingCount: headings.length,
      navCount: navLabels.length,
      sectionSignatures,
      sectionRoleSequence,
      headingOutline: headings,
      navLabels,
      styleClassTokens: style.classTokens,
      styleColorTokens: style.colorTokens,
      semanticStyleFeatures,
      layoutFeatures: layout,
      ...(mainHtmlTemplate
        ? { mainHtmlTemplate: mainHtmlTemplate, mainHtmlTemplateChars: mainHtmlTemplate.length }
        : {}),
      ...(referenceHeaderTemplate
        ? {
            referenceHeaderTemplate,
            referenceHeaderTemplateChars: referenceHeaderTemplate.length,
          }
        : {}),
      ...(referenceFooterTemplate
        ? {
            referenceFooterTemplate,
            referenceFooterTemplateChars: referenceFooterTemplate.length,
          }
        : {}),
      ...(includeMainTemplate && (htmlOpenAttrs || bodyOpenAttrs)
        ? {
            referenceHtmlOpenAttrs: htmlOpenAttrs,
            referenceBodyOpenAttrs: bodyOpenAttrs,
          }
        : {}),
      ...(referenceHeadContextSnippet
        ? {
            referenceHeadContextSnippet,
            referenceHeadContextChars: referenceHeadContextSnippet.length,
          }
        : {}),
      ...(referenceBodyBeforeMainSnippet
        ? {
            referenceBodyBeforeMainSnippet,
            referenceBodyBeforeMainChars: referenceBodyBeforeMainSnippet.length,
          }
        : {}),
      ...(referenceBodyAfterMainSnippet
        ? {
            referenceBodyAfterMainSnippet,
            referenceBodyAfterMainChars: referenceBodyAfterMainSnippet.length,
          }
        : {}),
      ...(referenceLayoutLeftRailHint ? { referenceLayoutLeftRailHint: true } : {}),
      ...(referenceLayoutBottomDockHint ? { referenceLayoutBottomDockHint: true } : {}),
    },
  };
}

/**
 * @param {{ pickSeed: string; supabaseUrl?: string; serviceKey?: string; incrementCounter?: boolean; onLog?: (m: string) => void }} opts
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function selectReferenceSiteForBuild(opts) {
  const pickSeed = String(opts.pickSeed || "");
  const supabaseUrl = String(
    opts.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  ).trim();
  const serviceKey = String(opts.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const incrementCounter = Boolean(opts.incrementCounter);
  const onLog = opts.onLog;

  if (!supabaseUrl || !serviceKey) {
    onLog?.(
      "Supabase: нет SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — generation_reference_sites не загружаем."
    );
    return null;
  }

  const all = await fetchActiveReferenceSites(supabaseUrl, serviceKey);
  if (!all.length) {
    onLog?.("Supabase: нет активных референсов в generation_reference_sites.");
    return null;
  }
  const picked = pickByLeastUsed(all, `${pickSeed}|${all.length}`);
  if (!picked) return null;
  if (incrementCounter) {
    await incrementReferenceSiteCounter(supabaseUrl, serviceKey, picked);
  }
  return picked;
}
