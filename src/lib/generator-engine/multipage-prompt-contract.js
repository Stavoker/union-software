/**
 * JSON-контракти, бюджет токенів і quality-regen для multipage Claude.
 */

import { runMultipageHtmlQa } from "@/lib/generator-engine/multipage-postprocess";

export const ARCHITECT_JSON_TEMPERATURE = 0.3;
export const PAGE_JSON_TEMPERATURE = 0.7;
const INDEX_OUTPUT_SHARE = 0.4;

/** Знімає ```json / ``` обгортки перед JSON.parse. */
export function stripModelJsonFences(raw) {
  const text = String(raw || "").trim();
  const match =
    text.match(/```json\s*([\s\S]*?)```/i) ||
    text.match(/```\s*([\s\S]*?)```/);
  return match ? String(match[1] || "").trim() : text;
}

/**
 * Скелет <main>: теги + класи, текст → […] (економія токенів промпта).
 */
export function buildEtalonMainSkeleton(etalonMainHtml, maxLen = 14000) {
  let out = String(etalonMainHtml || "");
  if (!out.trim()) return "";
  out = out
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>([^<]{4,})</g, ">[…]<")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > maxLen) {
    out = `${out.slice(0, maxLen)}\n<!-- … skeleton truncated … -->`;
  }
  return out;
}

/**
 * @param {string[]} expectedFiles
 * @param {number} totalBudget
 * @returns {{ architectMaxTokens: number, pageMaxTokensByFile: Record<string, number> }}
 */
export function computeClaudeSiteTokenBudgets(expectedFiles, totalBudget) {
  const files = (Array.isArray(expectedFiles) ? expectedFiles : [])
    .map((f) => String(f || "").trim())
    .filter(Boolean);
  const pageCount = Math.max(1, files.length);
  const total = Math.max(4096, Math.trunc(Number(totalBudget) || 16000));
  const architectMaxTokens = Math.min(
    2000,
    Math.max(512, Math.floor(total * 0.15))
  );
  const remaining = Math.max(0, total - architectMaxTokens);
  const pageMaxTokensByFile = {};

  const indexFiles = files.filter((f) => /^index\.(php|html)$/i.test(f));
  const hasIndex = indexFiles.length > 0;
  const otherCount = hasIndex ? pageCount - indexFiles.length : pageCount;

  if (!hasIndex || otherCount === 0) {
    const each = Math.max(512, Math.floor(remaining / pageCount));
    for (const f of files) pageMaxTokensByFile[f] = each;
    return { architectMaxTokens, pageMaxTokensByFile };
  }

  const indexBudget = Math.floor(remaining * INDEX_OUTPUT_SHARE);
  const otherBudget = Math.max(0, remaining - indexBudget);
  const otherEach = Math.max(512, Math.floor(otherBudget / otherCount));

  for (const f of files) {
    pageMaxTokensByFile[f] = /^index\.(php|html)$/i.test(f)
      ? Math.max(512, indexBudget)
      : otherEach;
  }
  return { architectMaxTokens, pageMaxTokensByFile };
}

export function buildArchitectJsonSystemPrompt({
  expectedPageCount = 2,
  referenceLocked = false,
  minIndexWords = 1200,
  minPageWords = 800,
  maxPageWords = 4500,
  mainWordGuide = 2000,
} = {}) {
  const tail = referenceLocked
    ? `Reference-lock: sectionOrder/layoutVariant must match reference. Fresh copy in title/description/contentAngle/tone/role. ~${mainWordGuide} words in <main>; index ≥${minIndexWords}, others ≥${minPageWords}, max ${maxPageWords}. Exactly ${expectedPageCount} pages in pages[].`
    : `Vary structure and copy between URLs. ~${mainWordGuide} words in <main>; index ≥${minIndexWords}, others ≥${minPageWords}, max ${maxPageWords}. Exactly ${expectedPageCount} pages; contrast layouts across files.`;

  return (
    "You are a site architect. Respond ONLY with valid JSON. " +
    "No markdown. No explanation. No ```json fences. No text before { or after }. " +
    'Escape " inside strings as \\". Root keys only: brandName (string), pages (array). ' +
    "Each page object: file, role, title, description, contentAngle, tone, layoutVariant, sectionOrder, mainComponents, structuralArchetypeIds. " +
    "No jsonLd, no comments, no extra root keys. role/title/description in Russian. " +
    "Internal links in plan only for files listed in the user prompt. " +
    `${tail} ` +
    "No markdown. Raw JSON only."
  );
}

/**
 * Короткий system для page JSON (~контракт).
 */
export function buildPageJsonSystemPrompt({
  minWords = 800,
  bg = "#0a0a0a",
  card = "#1a1a1a",
  block = "#141414",
  accent = "#c8e600",
  fontStack = "Arial, sans-serif",
  strictEtalonDom = false,
} = {}) {
  const domRule = strictEtalonDom
    ? "Preserve etalon <main> DOM order and section structure 1:1; change Russian copy, brand, href, alt only."
    : "Unique layout per build; no Tailwind CDN or external font/CSS/JS libraries.";

  return (
    "Generate ONE page as a single JSON object only. No markdown. No ``` fences. No text outside JSON. " +
    'Escape " in HTML/CSS/JS strings as \\". Required keys: headHtml, headerHtml, mainHtml, footerHtml, pageCss, pageJs. ' +
    `${domRule} ` +
    "No Tailwind CDN. No external libraries in pageJs. " +
    `Palette: bg ${bg}, card ${card}, block ${block}, accent ${accent}; font ${fontStack}. ` +
    `Minimum ~${minWords} words of Russian plain text inside <main>. ` +
    "pageJs: readable names (initFaqToggle), not function-12345. " +
    "No markdown. Raw JSON only."
  );
}

export function buildPageForbiddenPromptBlock({
  projectSlug = "",
  brandName = "",
  navFiles = [],
  imgList = "",
} = {}) {
  const nav = (Array.isArray(navFiles) ? navFiles : [])
    .map((f) => String(f || "").trim())
    .filter(Boolean)
    .join(", ");
  const slug = String(projectSlug || "").trim();
  const brand = String(brandName || "").trim() || "бренд из темы";

  return `FORBIDDEN (нарушение = брак страницы):
- slug/имя папки сборки «${slug}» в видимых текстах, title, alt, schema
- Lorem ipsum, «текст», placeholder, выдуманные названия казино (только «${brand}»)
- Внешние CSS/JS библиотеки, Tailwind CDN, Google Fonts CDN
- Ссылки на страницы вне списка: [${nav || "см. план"}]
- Картинки вне списка ./img/: ${imgList || "logo.png, favicon.png, ассеты бренда"}
- Дублирование больших блоков текста с других страниц пакета (см. sibling summary)`;
}

function gatewayHostNeedle(gatewayUrl) {
  try {
    const u = new URL(String(gatewayUrl || "").trim());
    return u.hostname.toLowerCase();
  } catch {
    return String(gatewayUrl || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

function htmlHasGatewayCta(html, gatewayUrl) {
  const host = gatewayHostNeedle(gatewayUrl);
  const s = String(html || "");
  if (!host || host.length < 4) return true;
  if (s.toLowerCase().includes(host)) return true;
  const gw = String(gatewayUrl || "").trim();
  if (gw && s.includes(gw)) return true;
  return /<a\b[^>]*\bhref=(["'])[^"']*\1[^>]*>\s*(регистрац|вход|играть|получить\s+бонус)/i.test(
    s
  );
}

/**
 * @returns {{ regen: boolean, reason?: string }}
 */
export function evaluatePageQualityRegen({
  html = "",
  mainText = "",
  wordCount = null,
  gatewayUrl = "",
  pages = [],
  pageFile = "",
  minWords = 800,
} = {}) {
  const words =
    Number.isFinite(Number(wordCount)) && Number(wordCount) >= 0
      ? Number(wordCount)
      : String(mainText || "")
          .replace(/<[^>]+>/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 1).length;

  if (words < Math.floor(Number(minWords) * 0.85)) {
    return { regen: true, reason: "word_count_low" };
  }
  if (!htmlHasGatewayCta(html, gatewayUrl)) {
    return { regen: true, reason: "missing_cta" };
  }
  const qa = runMultipageHtmlQa(html, { pages, currentPageFile: pageFile });
  const orphan = (qa.warnings || []).some((w) => String(w).startsWith("orphan_link"));
  if (orphan) {
    return { regen: true, reason: "broken_nav" };
  }
  return { regen: false };
}

export function buildPageRegenFailureOverlay(reason) {
  const r = String(reason || "").trim();
  if (!r) return "";
  const hints = {
    word_count_low: "увеличь объём русского текста в <main> до минимума из user",
    missing_cta: `добавь явную CTA (регистрация/вход) со ссылкой на gateway URL из user`,
    broken_nav: "исправь href: только файлы из списка INTERNAL LINKS / плана",
  };
  return `\n\nPREVIOUS ATTEMPT FAILED: ${r}. ${hints[r] || "Исправь конкретно эту ошибку."} Do not repeat the mistake.\n`;
}

export function readPromptTemperatureEnv(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
