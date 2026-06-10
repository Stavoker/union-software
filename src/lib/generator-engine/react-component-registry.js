/**
 * Curated React component registry (21st.dev-style, vendored in repo — no live scrape).
 * Architect picks component_id per page; codegen imports from registry.
 */

/** @type {Array<{ id: string; name: string; importFrom: string; category: string; description: string; props: string[]; tags: string[] }>} */
export const REACT_COMPONENT_REGISTRY = [
  {
    id: "hero-gradient",
    name: "HeroGradient",
    importFrom: "../components/registry/HeroGradient",
    category: "hero",
    description:
      "Hero full-bleed: баннер на фоне (bg-cover), текст поверх. body — 3–4 абзаца через «||» (макс. 3 предложения каждый, ротация); subtitle/highlights — короткие фразы через «|».",
    props: ["title", "eyebrow", "body", "bodyParagraphs", "subtitle", "highlights", "backgroundImage", "images", "ctaLabel", "ctaHref", "reverse"],
    tags: ["hero", "landing", "home"],
  },
  {
    id: "prose-block",
    name: "ProseBlock",
    importFrom: "../components/registry/ProseBlock",
    category: "content",
    description:
      "Текстовий блок: title + paragraphs (4–6 абзаців по 4–6 речень). Основний SEO-обсяг сторінки.",
    props: ["title", "paragraphs"],
    tags: ["prose", "text", "seo", "article"],
  },
  {
    id: "slot-grid",
    name: "SlotGrid",
    importFrom: "../components/registry/SlotGrid",
    category: "games",
    description: "Сітка слотів 2×4: object-cover на всю карточку (класичний каталог).",
    props: ["title", "intro", "images", "gatewayHref"],
    tags: ["games", "slots", "grid"],
  },
  {
    id: "game-carousel",
    name: "GameCarousel",
    importFrom: "../components/registry/GameCarousel",
    category: "games",
    description: "Горизонтальний autoplay-слайдер ігор: object-cover (безкінечна прокрутка).",
    props: ["title", "intro", "images", "gatewayHref"],
    tags: ["games", "slots", "carousel", "slider"],
  },
  {
    id: "slot-showcase",
    name: "SlotShowcase",
    importFrom: "../components/registry/SlotShowcase",
    category: "games",
    description: "1 великий featured-слот + сітка 6 менших превʼю (object-cover).",
    props: ["title", "intro", "images", "gatewayHref"],
    tags: ["games", "slots", "showcase", "featured"],
  },
  {
    id: "slot-scroll",
    name: "SlotScrollRow",
    importFrom: "../components/registry/SlotScrollRow",
    category: "games",
    description: "Горизонтальний scroll-snap ряд слотів (10 карток) + CTA «Все игры».",
    props: ["title", "intro", "images", "gatewayHref"],
    tags: ["games", "slots", "scroll", "row"],
  },
  {
    id: "slot-featured",
    name: "SlotFeaturedRow",
    importFrom: "../components/registry/SlotFeaturedRow",
    category: "games",
    description: "3 великі вертикальні картки рекомендованих слотів (spotlight row).",
    props: ["title", "intro", "images", "gatewayHref"],
    tags: ["games", "slots", "featured", "row"],
  },
  {
    id: "poster-slider",
    name: "PosterSlider",
    importFrom: "../components/registry/PosterSlider",
    category: "content",
    description:
      "Слайдер банерів full-bleed (BANNER_IMAGE_PATHS): bg-cover на всю секцію, title+intro+CTA поверх gradient overlay; autoplay, стрілки, dots; без рамки/object-contain.",
    props: ["title", "intro", "images", "gatewayHref", "ctaLabel"],
    tags: ["banner", "poster", "slider", "promo", "carousel"],
  },
  {
    id: "feature-cards",
    name: "FeatureCards",
    importFrom: "../components/registry/FeatureCards",
    category: "content",
    description: "3–4 картки переваг з іконками (lucide-react) і коротким текстом.",
    props: ["title", "items"],
    tags: ["features", "benefits", "cards"],
  },
  {
    id: "faq-accordion",
    name: "FaqAccordion",
    importFrom: "../components/registry/FaqAccordion",
    category: "content",
    description:
      "FAQ-аккордеон (одна колонка): items={[ { q, a }, … ]} — 6–8 пунктов, q и a непустые.",
    props: ["title", "items"],
    tags: ["faq", "accordion", "support"],
  },
  {
    id: "faq-two-column",
    name: "FaqTwoColumn",
    importFrom: "../components/registry/FaqTwoColumn",
    category: "content",
    description:
      "FAQ в дві колонки (accordion): title, intro (1–2 речення), items — 6–8 пар { q, a }.",
    props: ["title", "intro", "items"],
    tags: ["faq", "accordion", "two-column", "support"],
  },
  {
    id: "faq-cards",
    name: "FaqCardGrid",
    importFrom: "../components/registry/FaqCardGrid",
    category: "content",
    description:
      "FAQ як сітка карток (всі відповіді видимі): title, intro, items — 6–8 пар { q, a } по 3–5 речень у a.",
    props: ["title", "intro", "items"],
    tags: ["faq", "cards", "grid", "support"],
  },
  {
    id: "cta-banner",
    name: "CtaBanner",
    importFrom: "../components/registry/CtaBanner",
    category: "cta",
    description:
      "CTA full-bleed: затемнений баннер на фоні (backgroundImage), title+body+CTA поверх gradient overlay.",
    props: ["title", "body", "ctaLabel", "ctaHref", "backgroundImage"],
    tags: ["cta", "conversion", "banner"],
  },
  {
    id: "stat-row",
    name: "StatRow",
    importFrom: "../components/registry/StatRow",
    category: "content",
    description: "Ряд з 3–4 метриками/цифрами для довіри.",
    props: ["stats"],
    tags: ["stats", "trust", "metrics"],
  },
  {
    id: "content-split",
    name: "ContentSplit",
    importFrom: "../components/registry/ContentSplit",
    category: "content",
    description: "Перший абзац + imageSrc в одному ряду (картинка по высоте абзаца); інші абзаци — нижче на всю ширину.",
    props: ["title", "paragraphs", "body", "imageSrc", "imageAlt", "reverse"],
    tags: ["split", "about", "reviews"],
  },
  {
    id: "section-with-bg",
    name: "SectionWithBg",
    importFrom: "../components/registry/SectionWithBg",
    category: "content",
    description: "Split: перший абзац body + backgroundImage в ряду; решта абзаців нижче (розділяй body через \\n\\n).",
    props: ["title", "body", "backgroundImage", "ctaLabel", "ctaHref", "reverse"],
    tags: ["background", "hero", "promo", "banner"],
  },
  {
    id: "payment-methods",
    name: "PaymentMethodsRow",
    importFrom: "../components/registry/PaymentMethodsRow",
    category: "content",
    description:
      "Іконки оплат у фіксованих чіпах (variant inline). Не використовуй сирі <img> для pay-*.",
    props: ["title", "intro", "images", "variant"],
    tags: ["payments", "pay", "icons"],
  },
  {
    id: "sidebar-promo",
    name: "SidebarPromo",
    importFrom: "../components/registry/SidebarPromo",
    category: "sidebar-left",
    description: "Компактний promo-блок для лівого сайдбару (опційно в layout).",
    props: ["title", "body", "ctaLabel", "ctaHref"],
    tags: ["sidebar", "promo", "vip"],
  },
];

/**
 * @param {string} seed
 * @param {number} count
 * @returns {typeof REACT_COMPONENT_REGISTRY}
 */
export function pickRegistryComponentsForArchitect(seed, count = 6) {
  const n = Math.min(REACT_COMPONENT_REGISTRY.length, Math.max(3, count));
  let state = 0;
  const s = String(seed || "registry");
  for (let i = 0; i < s.length; i++) {
    state = (state * 31 + s.charCodeAt(i)) >>> 0;
  }
  const arr = [...REACT_COMPONENT_REGISTRY];
  for (let i = arr.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

/**
 * @param {typeof REACT_COMPONENT_REGISTRY} components
 * @returns {string}
 */
export function formatComponentRegistryForArchitect(components) {
  const list = Array.isArray(components) ? components : REACT_COMPONENT_REGISTRY;
  const lines = [
    "=== COMPONENT REGISTRY (21st curated — вибирай componentIds для кожної сторінки) ===",
    "Для кожної pages[] додай componentIds: string[] (6–10 id на головній, 5–7 на внутрішніх). prose-block можна повторювати 2–3 рази для кількох текстових секцій.",
  ];
  for (const c of list) {
    lines.push(
      `- ${c.id}: ${c.name} [${c.category}] — ${c.description} props: ${c.props.join(", ")}`
    );
  }
  return lines.join("\n");
}

/**
 * @param {string[]} componentIds
 * @returns {string}
 */
export function formatComponentRegistryForCodegen(componentIds) {
  const ids = new Set(
    (Array.isArray(componentIds) ? componentIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  const picked = REACT_COMPONENT_REGISTRY.filter((c) => ids.has(c.id));
  if (!picked.length) {
    return [
      "=== COMPONENT REGISTRY ===",
      "Імпортуй 2–3 компоненти з ../components/registry/ за змістом сторінки.",
      ...REACT_COMPONENT_REGISTRY.slice(0, 5).map(
        (c) => `import { ${c.name} } from "${c.importFrom}";`
      ),
    ].join("\n");
  }
  const lines = [
    "=== COMPONENT REGISTRY (обовʼязково використай ці компоненти) ===",
    ...picked.map((c) => `import { ${c.name} } from "${c.importFrom}";`),
    "",
    "Підключи їх у JSX сторінки з осмисленими props (русские тексты). Не дублюй SiteLayout.",
  ];
  for (const c of picked) {
    lines.push(`- ${c.name}: ${c.description}`);
  }
  return lines.join("\n");
}

/**
 * @param {string} id
 * @returns {typeof REACT_COMPONENT_REGISTRY[0] | undefined}
 */
export function getRegistryComponentById(id) {
  return REACT_COMPONENT_REGISTRY.find((c) => c.id === String(id || "").trim());
}
