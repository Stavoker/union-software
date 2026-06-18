/**
 * SEO keywords parsing and per-page distribution for generator builds.
 */

/** @param {string} raw */
export function parseSeoKeywords(raw) {
  return String(raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 48);
}

/**
 * Split keywords evenly across pages (round-robin).
 * @param {string[]} keywords
 * @param {number} pageCount
 * @returns {string[][]}
 */
export function splitSeoKeywordsAcrossPages(keywords, pageCount) {
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const n = Math.max(1, Math.trunc(Number(pageCount) || 1));
  const buckets = Array.from({ length: n }, () => /** @type {string[]} */ ([]));
  if (!list.length) return buckets;
  for (let i = 0; i < list.length; i += 1) {
    buckets[i % n].push(list[i]);
  }
  return buckets;
}

/**
 * Attach seoKeywords[] to each page object (by index).
 * @param {Array<Record<string, unknown>>} pages
 * @param {string[]} keywords
 */
export function attachSeoKeywordsToPages(pages, keywords) {
  const list = Array.isArray(pages) ? pages : [];
  const buckets = splitSeoKeywordsAcrossPages(keywords, list.length);
  return list.map((page, idx) => ({
    ...page,
    seoKeywords: buckets[idx] || [],
  }));
}

/**
 * @param {{ file?: string, route?: string, seoKeywords?: string[] }} page
 * @param {string} [geoLabel]
 */
export function buildPageSeoPromptBlock(page, geoLabel = "") {
  const kws = Array.isArray(page?.seoKeywords) ? page.seoKeywords.filter(Boolean) : [];
  if (!kws.length) return "";
  const file = String(page?.file || page?.route || "page").trim();
  const geoLine = geoLabel ? `Гео аудитории: ${geoLabel}.\n` : "";
  return `
=== SEO КЛЮЧИ ДЛЯ СТРАНИЦЫ ${file} ===
${geoLine}Назначенные ключевые слова (включи в title, description, H1 и текст естественно; можешь слегка перефразировать, если формулировка нелогична для этой страницы, но сохрани интент):
${kws.map((k) => `- ${k}`).join("\n")}
- НЕ переноси на эту страницу ключи, назначенные другим страницам сайта.
- title и description этой страницы должны отражать ИМЕННО эти ключи.
`.trim();
}

/**
 * Architect-level block: per-page keyword assignment.
 * @param {Array<{ file?: string, seoKeywords?: string[] }>} pages
 * @param {string} [geoLabel]
 */
export function buildArchitectSeoPromptBlock({ themeBrandHint, theme, pages, geoLabel = "" }) {
  const withKw = (pages || []).filter((p) => (p.seoKeywords || []).length);
  if (!withKw.length) return "";
  const geoLine = geoLabel ? `Гео: ${geoLabel}.\n` : "";
  const perPage = withKw
    .map((p) => {
      const file = String(p.file || "").trim() || "?";
      const kws = (p.seoKeywords || []).join(", ");
      return `- ${file}: ${kws}`;
    })
    .join("\n");
  return `
=== SEO (ключи распределены по страницам) ===
Бренд: ${themeBrandHint}. Тема: ${theme}.
${geoLine}Каждая страница pages[] получает СВОЙ набор ключей (title/description уникальны):
${perPage}
- title: 50–65 символов, бренд + 1–2 ключа страницы + intent.
- description: 140–165 символов, гео/интент + CTA.
- Если ключ нелогичен для страницы — перефразируй, сохранив поисковый интент.
`.trim();
}
