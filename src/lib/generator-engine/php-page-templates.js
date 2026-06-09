/**
 * PHP multipage: conversion section orders aligned with react-page-templates.js.
 * Maps React componentIds → architect sectionOrder tokens for HTML generation.
 */

import {
  HOME_PAGE_TEMPLATES,
  pickInnerPageTemplate,
} from "@/lib/generator-engine/react-page-templates";

const REACT_TO_PHP_TOKEN = {
  "hero-gradient": "hero",
  "poster-slider": "spotlight",
  "game-carousel": "games",
  "slot-grid": "games",
  "slot-showcase": "games",
  "slot-scroll": "games",
  "slot-featured": "games",
  "feature-cards": "proof",
  "section-with-bg": "banner",
  "stat-row": "trust",
  "content-split": "split",
  "faq-accordion": "faq",
  "faq-two-column": "faq",
  "faq-cards": "faq",
  "cta-banner": "cta",
  "payment-methods": "ledger",
};

const FAQ_FROM_REACT = {
  "faq-accordion": "accordion",
  "faq-two-column": "two-column",
  "faq-cards": "cards",
};

const GAMES_FROM_REACT = {
  "slot-grid": "grid",
  "game-carousel": "carousel",
  "slot-showcase": "showcase",
  "slot-scroll": "scroll",
  "slot-featured": "featured",
};

const PHP_HOME_LAYOUTS = [
  "L02: split hero с асимметричными долями текста/медиа (не канонический 50/50)",
  "L05: masonry cards + FAQ accordion",
  "L06: timeline trust blocks + CTA ribbon",
  "L08: testimonials-first then features",
  "L11: compact hero + large category tabs",
  "L14: minimal intro + dense slot grid",
  "L03: split hero зеркально по осям, без KPI-полосы сразу под блоком",
  "L07: comparison table + proof cards",
  "L18: ключевые цифры вплетены в сюжетные секции",
  "L20: одна колонка «глав/подглавы» как у статьи",
  "L01: start-with-games (без hero: страница начинается с сетки игр)",
  "L19: полноширинный визуальный блок + «плавающие» карточки поверх",
];

function hash32(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {string[]} componentIds
 * @returns {string[]}
 */
export function convertReactOrderToPhpSectionOrder(componentIds) {
  const proseSlots = ["story", "digest", "lead"];
  let proseIdx = 0;
  const tokens = [];
  const seen = new Set();

  for (const id of Array.isArray(componentIds) ? componentIds : []) {
    if (id === "prose-block") {
      const t = proseSlots[Math.min(proseIdx, proseSlots.length - 1)];
      proseIdx += 1;
      tokens.push(t);
      continue;
    }
    if (
      id === "slot-grid" ||
      id === "game-carousel" ||
      id === "slot-showcase" ||
      id === "slot-scroll" ||
      id === "slot-featured"
    ) {
      if (!seen.has("games")) {
        tokens.push("games");
        seen.add("games");
      }
      continue;
    }
    if (id === "faq-accordion" || id === "faq-two-column" || id === "faq-cards") {
      if (!seen.has("faq")) {
        tokens.push("faq");
        seen.add("faq");
      }
      continue;
    }
    const tok = REACT_TO_PHP_TOKEN[id];
    if (!tok) continue;
    if (tok === "story" || tok === "digest" || tok === "lead") {
      tokens.push(tok);
      continue;
    }
    if (!seen.has(tok)) {
      tokens.push(tok);
      seen.add(tok);
    }
  }
  return tokens;
}

/**
 * @param {string[]} componentIds
 */
export function extractFaqPresentation(componentIds) {
  for (const id of Array.isArray(componentIds) ? componentIds : []) {
    if (FAQ_FROM_REACT[id]) return FAQ_FROM_REACT[id];
  }
  return "accordion";
}

/**
 * @param {string[]} componentIds
 */
export function extractGamesPresentation(componentIds) {
  for (const id of Array.isArray(componentIds) ? componentIds : []) {
    if (GAMES_FROM_REACT[id]) return GAMES_FROM_REACT[id];
  }
  return "grid";
}

/**
 * @param {string[]} tokens
 * @param {boolean} [isHome]
 */
export function ensurePhpSectionOrder(tokens, isHome = false) {
  const out = [...(Array.isArray(tokens) ? tokens : [])];
  if (isHome) {
    if (!out.includes("hero") && !out.includes("games")) out.unshift("hero");
    if (!out.includes("games")) {
      const hi = out.indexOf("hero");
      out.splice(hi >= 0 ? hi + 1 : 0, 0, "games");
    }
    if (!out.includes("vip")) {
      const fi = out.indexOf("faq");
      if (fi >= 0) out.splice(fi, 0, "vip");
      else out.push("vip");
    }
  }
  if (!out.includes("faq")) out.push("faq");
  if (!out.includes("cta")) out.push("cta");
  return out;
}

/**
 * @param {string} seed
 * @param {number} [batchIndex]
 */
export function pickPhpHomeTemplate(seed, batchIndex = 0) {
  const bi = Math.max(0, Math.trunc(Number(batchIndex) || 0));
  const idx = (hash32(`${seed}|home_tpl`) + bi) % HOME_PAGE_TEMPLATES.length;
  const reactTpl = HOME_PAGE_TEMPLATES[idx];
  const sectionOrder = ensurePhpSectionOrder(
    convertReactOrderToPhpSectionOrder(reactTpl.order),
    true
  );
  const layoutIdx =
    (hash32(`${seed}|php_home_lv|${reactTpl.id}`) + bi) % PHP_HOME_LAYOUTS.length;
  return {
    id: reactTpl.id,
    sectionOrder,
    layoutVariant: PHP_HOME_LAYOUTS[layoutIdx],
    faqPresentation: extractFaqPresentation(reactTpl.order),
    gamesPresentation: extractGamesPresentation(reactTpl.order),
  };
}

/**
 * @param {string} file
 * @param {string} seed
 * @param {number} [batchIndex]
 */
export function pickPhpInnerPageTemplate(file, seed, batchIndex = 0) {
  const innerTpl = pickInnerPageTemplate(file, seed, batchIndex);
  return {
    id: innerTpl.id,
    sectionOrder: ensurePhpSectionOrder(
      convertReactOrderToPhpSectionOrder(innerTpl.order),
      false
    ),
    faqPresentation: extractFaqPresentation(innerTpl.order),
    gamesPresentation: extractGamesPresentation(innerTpl.order),
  };
}

/**
 * @param {string[]} expectedFiles
 * @param {string} structureSeed
 * @param {number} [batchIndex]
 */
export function buildPhpTemplatesPlan(expectedFiles, structureSeed, batchIndex = 0) {
  const bi = Math.max(0, Math.trunc(Number(batchIndex) || 0));
  const seed = String(structureSeed || "php");
  const files = Array.isArray(expectedFiles) ? expectedFiles : [];
  const plan = [];
  if (files.some((f) => String(f).toLowerCase() === "index.php")) {
    const home = pickPhpHomeTemplate(seed, bi);
    plan.push({
      file: "index.php",
      templateId: home.id,
      sectionOrder: home.sectionOrder,
      layoutVariant: home.layoutVariant,
      faqPresentation: home.faqPresentation,
      gamesPresentation: home.gamesPresentation,
    });
  }
  for (const file of files) {
    if (String(file).toLowerCase() === "index.php") continue;
    const tpl = pickPhpInnerPageTemplate(file, seed, bi);
    plan.push({
      file,
      templateId: tpl.id,
      sectionOrder: tpl.sectionOrder,
      faqPresentation: tpl.faqPresentation,
      gamesPresentation: tpl.gamesPresentation,
    });
  }
  return plan;
}

/**
 * @param {ReturnType<typeof buildPhpTemplatesPlan>} plan
 */
export function formatPhpTemplatesPlanForArchitect(plan) {
  const lines = [
    "PHP_CONVERSION_TEMPLATES (фиксированы сборщиком — sectionOrder для каждого file не меняй):",
    "UX: hook → ценность/доверие → текст → FAQ → CTA.",
  ];
  for (const row of plan) {
    const extra = [
      row.faqPresentation ? `faq=${row.faqPresentation}` : "",
      row.gamesPresentation ? `games=${row.gamesPresentation}` : "",
      row.layoutVariant ? `layout=${String(row.layoutVariant).slice(0, 48)}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(
      `- ${row.file}: «${row.templateId}» → ${row.sectionOrder.join(" → ")}${extra ? ` (${extra})` : ""}`
    );
  }
  return lines.join("\n");
}

export function buildFaqPresentationPromptHint(presentation) {
  const p = String(presentation || "accordion").trim();
  if (p === "two-column") {
    return "FAQ: две колонки на desktop (md+), в каждой accordion details/summary или кнопки; intro 1–2 предложения перед блоком; 6–8 пар вопрос–ответ.";
  }
  if (p === "cards") {
    return "FAQ: сетка карточек 2–3 колонки — все ответы видимы (не accordion); intro 2–3 предложения; 6–8 карточек с развёрнутым a (3–5 предложений).";
  }
  return "FAQ: классический accordion (details/summary или кнопки + панели); 6–8 пунктов; ответ каждый 3–5 предложений.";
}

export function buildGamesPresentationPromptHint(presentation, { isHome = false } = {}) {
  const p = String(presentation || "grid").trim();
  const anchor = isHome ? "#lw-games на главной" : "#lw-games";
  if (p === "carousel") {
    return `${anchor}: горизонтальный autoplay-carousel (object-fit:cover на карточках), не дублируй hero.`;
  }
  if (p === "showcase") {
    return `${anchor}: 1 крупный featured-слот + сетка 6 меньших превью (object-fit:cover).`;
  }
  if (p === "scroll") {
    return `${anchor}: горизонтальный scroll-snap ряд + CTA «Все игры»; 8–10 карточек.`;
  }
  if (p === "featured") {
    return `${anchor}: 3 вертикальные spotlight-карточки равной ширины (object-fit:cover).`;
  }
  return `${anchor}: сетка слотов 2×4 или 3×4, первая карточка featured; object-fit:cover на превью.`;
}
