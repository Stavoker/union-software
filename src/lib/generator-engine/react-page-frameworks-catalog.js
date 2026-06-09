/**
 * 100 sidebar + 100 header section-order frameworks per page_kind.
 * Seeded into Supabase generator_react_page_frameworks.
 */

import {
  HOME_PAGE_TEMPLATES,
  INNER_PAGE_TEMPLATES,
  PAGE_SPECIFIC_INNER_TEMPLATES,
  FAQ_COMPONENT_IDS,
  SLOT_COMPONENT_IDS,
} from "./react-page-templates.js";

export const PAGE_FRAMEWORK_KINDS = [
  "home",
  "bonus",
  "payments",
  "vip",
  "games",
  "slots",
  "mirror",
  "promo",
  "faq-page",
  "support",
  "about",
  "registration",
  "reviews",
  "inner",
];

const VARIANTS_PER_KIND = 100;
const LAYOUT_KINDS = ["sidebar", "header"];

const CONTENT_BLOCKS = [
  "prose-block",
  "feature-cards",
  "content-split",
  "section-with-bg",
  "stat-row",
  "poster-slider",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function pad3(n) {
  return String(n).padStart(3, "0");
}

function hash32(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleWithSeed(arr, seed) {
  const a = [...arr];
  let state = hash32(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function orderKey(order) {
  return JSON.stringify(order);
}

function replaceFamily(order, family, replacement) {
  const fam = new Set(family);
  let used = false;
  const out = [];
  for (const id of order) {
    if (fam.has(id)) {
      if (!used) {
        out.push(replacement);
        used = true;
      }
    } else {
      out.push(id);
    }
  }
  return out;
}

function splitTail(order) {
  const hero = [];
  const mid = [];
  const tail = [];
  for (const id of order) {
    if (id === "hero-gradient") hero.push(id);
    else if (id === "cta-banner") tail.push(id);
    else if (FAQ_COMPONENT_IDS.includes(id)) tail.unshift(id);
    else mid.push(id);
  }
  return { hero, mid, tail };
}

function validateHomeOrder(order) {
  if (!Array.isArray(order) || order.length < 6) return false;
  if (order[0] !== "hero-gradient") return false;
  if (order[order.length - 1] !== "cta-banner") return false;
  const slots = order.filter((id) => SLOT_COMPONENT_IDS.includes(id));
  const faqs = order.filter((id) => FAQ_COMPONENT_IDS.includes(id));
  const prose = order.filter((id) => id === "prose-block");
  return slots.length === 1 && faqs.length === 1 && prose.length >= 2;
}

function validateInnerOrder(order, pageKind) {
  if (!Array.isArray(order) || order.length < 5) return false;
  if (order.includes("hero-gradient")) return false;
  if (order[order.length - 1] !== "cta-banner") return false;
  if (!order.some((id) => FAQ_COMPONENT_IDS.includes(id))) return false;
  if (pageKind === "payments" && !order.includes("payment-methods")) return false;
  if (
    (pageKind === "games" || pageKind === "slots") &&
    !order.some((id) => SLOT_COMPONENT_IDS.includes(id))
  ) {
    return false;
  }
  if (pageKind === "faq-page") {
    const first = order[0];
    if (!FAQ_COMPONENT_IDS.includes(first)) return false;
  }
  return order.filter((id) => id === "prose-block").length >= 1;
}

function tryAddOrder(unique, seen, order, validator, pageKind) {
  if (!validator(order, pageKind)) return false;
  const key = orderKey(order);
  if (seen.has(key)) return false;
  seen.add(key);
  unique.push([...order]);
  return true;
}

function expandOrders(baseOrders, layoutKind, pageKind, validator) {
  const seen = new Set();
  const unique = [];
  const add = (order) => tryAddOrder(unique, seen, order, validator, pageKind);

  for (const order of baseOrders) {
    add(order);
  }

  for (const base of baseOrders) {
    for (const faq of FAQ_COMPONENT_IDS) {
      add(replaceFamily(base, FAQ_COMPONENT_IDS, faq));
    }
  }

  const hasSlots = baseOrders.some((o) => o.some((id) => SLOT_COMPONENT_IDS.includes(id)));
  if (hasSlots) {
    for (const base of baseOrders) {
      if (!base.some((id) => SLOT_COMPONENT_IDS.includes(id))) continue;
      for (const slot of SLOT_COMPONENT_IDS) {
        add(replaceFamily(base, SLOT_COMPONENT_IDS, slot));
      }
    }
  }

  const bases = unique.length ? unique : baseOrders.map((o) => [...o]);

  for (let i = 0; unique.length < VARIANTS_PER_KIND && i < 8000; i++) {
    const base = bases[i % bases.length];
    const { hero, mid, tail } = splitTail(base);
    const shuffled = shuffleWithSeed(mid, `${layoutKind}|${pageKind}|mid|${i}`);
    add([...hero, ...shuffled, ...tail]);
  }

  for (let i = 0; unique.length < VARIANTS_PER_KIND && i < 4000; i++) {
    const base = bases[i % bases.length];
    const content = base.filter(
      (id) =>
        id !== "hero-gradient" &&
        id !== "cta-banner" &&
        !FAQ_COMPONENT_IDS.includes(id) &&
        !SLOT_COMPONENT_IDS.includes(id) &&
        id !== "payment-methods"
    );
    if (content.length < 2) continue;
    const pick = shuffleWithSeed(content, `${layoutKind}|${pageKind}|mix|${i}`);
    const faq = base.find((id) => FAQ_COMPONENT_IDS.includes(id)) || "faq-accordion";
    const slot = base.find((id) => SLOT_COMPONENT_IDS.includes(id));
    const pay = base.includes("payment-methods") ? ["payment-methods"] : [];
    const head =
      pageKind === "home"
        ? ["hero-gradient", pick[0]]
        : pageKind === "faq-page"
          ? [faq]
          : [pick[0]];
    const mid = pick.slice(pageKind === "faq-page" ? 0 : 1, 4);
    const tail = [...pay, ...mid.filter((id) => !head.includes(id)), faq, "cta-banner"];
    add([...head, ...tail.filter((id, idx) => tail.indexOf(id) === idx)]);
  }

  for (let i = 0; unique.length < VARIANTS_PER_KIND && i < 500; i++) {
    const base = bases[i % bases.length];
    const insertAt = 1 + (i % Math.max(1, base.length - 3));
    add([...base.slice(0, insertAt), "prose-block", ...base.slice(insertAt)]);
  }

  while (unique.length < VARIANTS_PER_KIND) {
    unique.push([...bases[unique.length % bases.length]]);
  }

  return unique.slice(0, VARIANTS_PER_KIND);
}

/** Distinct home skeletons — slot early/late, poster/stat placement, FAQ variant. */
function buildProgrammaticHomeArchetypes() {
  const archetypes = [
    ["hero-gradient", "slot-grid", "prose-block", "feature-cards", "prose-block", "poster-slider", "faq-accordion", "cta-banner"],
    ["hero-gradient", "poster-slider", "stat-row", "slot-showcase", "prose-block", "content-split", "prose-block", "faq-two-column", "cta-banner"],
    ["hero-gradient", "prose-block", "stat-row", "game-carousel", "feature-cards", "prose-block", "faq-cards", "cta-banner"],
    ["hero-gradient", "feature-cards", "prose-block", "slot-scroll", "section-with-bg", "prose-block", "faq-accordion", "cta-banner"],
    ["hero-gradient", "content-split", "prose-block", "slot-featured", "poster-slider", "prose-block", "faq-two-column", "cta-banner"],
    ["hero-gradient", "stat-row", "prose-block", "prose-block", "slot-showcase", "feature-cards", "faq-cards", "cta-banner"],
    ["hero-gradient", "section-with-bg", "slot-grid", "prose-block", "content-split", "prose-block", "faq-accordion", "cta-banner"],
    ["hero-gradient", "prose-block", "poster-slider", "prose-block", "game-carousel", "stat-row", "faq-two-column", "cta-banner"],
    ["hero-gradient", "slot-showcase", "stat-row", "prose-block", "feature-cards", "prose-block", "faq-cards", "cta-banner"],
    ["hero-gradient", "prose-block", "content-split", "slot-scroll", "stat-row", "prose-block", "faq-accordion", "cta-banner"],
    ["hero-gradient", "feature-cards", "poster-slider", "prose-block", "slot-grid", "prose-block", "faq-two-column", "cta-banner"],
    ["hero-gradient", "stat-row", "slot-featured", "prose-block", "section-with-bg", "prose-block", "faq-cards", "cta-banner"],
    ["hero-gradient", "prose-block", "game-carousel", "content-split", "prose-block", "slot-grid", "faq-accordion", "cta-banner"],
    ["hero-gradient", "poster-slider", "prose-block", "feature-cards", "slot-scroll", "prose-block", "faq-two-column", "cta-banner"],
    ["hero-gradient", "content-split", "stat-row", "prose-block", "slot-showcase", "faq-cards", "cta-banner"],
    ["hero-gradient", "prose-block", "section-with-bg", "prose-block", "game-carousel", "slot-featured", "faq-accordion", "cta-banner"],
    ["hero-gradient", "slot-grid", "content-split", "prose-block", "poster-slider", "prose-block", "faq-two-column", "cta-banner"],
    ["hero-gradient", "feature-cards", "stat-row", "prose-block", "slot-showcase", "faq-cards", "cta-banner"],
    ["hero-gradient", "prose-block", "slot-scroll", "feature-cards", "prose-block", "section-with-bg", "faq-accordion", "cta-banner"],
    ["hero-gradient", "poster-slider", "prose-block", "slot-featured", "content-split", "prose-block", "faq-two-column", "cta-banner"],
  ];
  return archetypes.map((order, i) => {
    const slot = SLOT_COMPONENT_IDS[i % SLOT_COMPONENT_IDS.length];
    const faq = FAQ_COMPONENT_IDS[i % FAQ_COMPONENT_IDS.length];
    let next = replaceFamily(order, SLOT_COMPONENT_IDS, slot);
    next = replaceFamily(next, FAQ_COMPONENT_IDS, faq);
    return next;
  });
}

/** Extra inner archetypes per page_kind — more FAQ/slot/poster mixes. */
function buildProgrammaticInnerArchetypes(pageKind) {
  const faqCycle = FAQ_COMPONENT_IDS;
  const slotCycle = SLOT_COMPONENT_IDS;
  const needsSlot = pageKind === "games" || pageKind === "slots";
  const needsPay = pageKind === "payments";
  const faqFirst = pageKind === "faq-page";

  const hooks = [
    ["poster-slider", "prose-block", "feature-cards", "prose-block"],
    ["stat-row", "content-split", "prose-block", "feature-cards"],
    ["feature-cards", "prose-block", "section-with-bg", "prose-block"],
    ["content-split", "stat-row", "prose-block", "poster-slider"],
    ["prose-block", "stat-row", "feature-cards", "content-split"],
    ["section-with-bg", "prose-block", "poster-slider", "prose-block"],
    ["stat-row", "feature-cards", "content-split", "prose-block"],
    ["poster-slider", "stat-row", "prose-block", "content-split"],
    ["prose-block", "feature-cards", "stat-row", "section-with-bg"],
    ["content-split", "prose-block", "poster-slider", "stat-row"],
    ["feature-cards", "poster-slider", "prose-block", "stat-row"],
    ["stat-row", "prose-block", "content-split", "feature-cards"],
  ];

  return hooks.map((hook, i) => {
    const faq = faqCycle[i % faqCycle.length];
    const slot = slotCycle[i % slotCycle.length];
    let mid = [...hook];
    if (needsPay && !mid.includes("payment-methods")) {
      mid.splice(2, 0, "payment-methods");
    }
    if (needsSlot && !mid.some((id) => SLOT_COMPONENT_IDS.includes(id))) {
      mid.push(slot);
    }
    if (faqFirst) {
      return [faq, ...mid.filter((id) => !FAQ_COMPONENT_IDS.includes(id)), "cta-banner"];
    }
    return [...mid, faq, "cta-banner"];
  });
}

function seedOrdersForPageKind(pageKind) {
  if (pageKind === "home") {
    return [
      ...HOME_PAGE_TEMPLATES.map((t) => [...t.order]),
      ...buildProgrammaticHomeArchetypes(),
    ];
  }
  const fileKey = `${pageKind}.php`;
  const specific = PAGE_SPECIFIC_INNER_TEMPLATES[fileKey];
  const bases = specific?.length
    ? specific.map((t) => [...t.order])
    : INNER_PAGE_TEMPLATES.map((order) => [...order]);
  return [...bases, ...buildProgrammaticInnerArchetypes(pageKind)];
}

function generateVariants(layoutKind, pageKind) {
  const bases = seedOrdersForPageKind(pageKind);
  const validator = pageKind === "home" ? validateHomeOrder : validateInnerOrder;
  const orders = expandOrders(bases, layoutKind, pageKind, validator);
  return orders.map((order, i) => ({
    label: `${pageKind}-${layoutKind}-${pad3(i + 1)}`,
    section_order: order,
    meta_json: {
      archetype: bases[i % bases.length] ? orderKey(bases[i % bases.length]).slice(0, 48) : "",
      layoutKind,
      pageKind,
    },
  }));
}

/** @type {ReturnType<typeof buildPageFrameworksCatalog> | null} */
let catalogCache = null;

export function orderKeyForFramework(order) {
  return orderKey(order);
}

export function invalidatePageFrameworksCatalogCache() {
  catalogCache = null;
}

/**
 * @returns {Array<{ id: string, layout_kind: string, page_kind: string, variant_number: number, label: string, section_order: string[], meta_json: object }>}
 */
export function buildPageFrameworksCatalog() {
  if (catalogCache) return catalogCache;
  const rows = [];
  for (const layoutKind of LAYOUT_KINDS) {
    for (const pageKind of PAGE_FRAMEWORK_KINDS) {
      const variants = generateVariants(layoutKind, pageKind);
      variants.forEach((v, idx) => {
        const variant_number = idx + 1;
        rows.push({
          id: `${layoutKind}-${pageKind}-${pad3(variant_number)}`,
          layout_kind: layoutKind,
          page_kind: pageKind,
          variant_number,
          label: v.label,
          section_order: v.section_order,
          meta_json: v.meta_json,
        });
      });
    }
  }
  catalogCache = rows;
  return rows;
}

/**
 * @param {string} file
 */
export function fileToPageKind(file) {
  const lower = String(file || "").trim().toLowerCase();
  if (lower === "index.php" || lower === "index.html") return "home";
  const slug = lower.replace(/\.(php|html)$/i, "");
  if (PAGE_FRAMEWORK_KINDS.includes(slug)) return slug;
  return "inner";
}

/**
 * @param {'sidebar'|'header'} layoutKind
 * @param {string} pageKind
 * @param {string} seed
 */
export function fallbackPageFramework(layoutKind, pageKind, seed) {
  const lk = layoutKind === "header" ? "header" : "sidebar";
  const pk = PAGE_FRAMEWORK_KINDS.includes(pageKind) ? pageKind : "inner";
  const catalog = buildPageFrameworksCatalog();
  const pool = catalog.filter((r) => r.layout_kind === lk && r.page_kind === pk);
  if (!pool.length) {
    const order = seedOrdersForPageKind(pk)[0] || HOME_PAGE_TEMPLATES[0].order;
    return {
      id: `${lk}-${pk}-fallback`,
      layout_kind: lk,
      page_kind: pk,
      variant_number: 1,
      label: "fallback",
      section_order: [...order],
      meta_json: {},
    };
  }
  const idx = hash32(`${seed}|${lk}|${pk}`) % pool.length;
  return pool[idx];
}
