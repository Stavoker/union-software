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
    description: "Hero з градієнтом, h1, лід і primary CTA (без slot-превью).",
    props: ["title", "subtitle", "ctaLabel", "ctaHref"],
    tags: ["hero", "landing", "home"],
  },
  {
    id: "slot-grid",
    name: "SlotGrid",
    importFrom: "../components/registry/SlotGrid",
    category: "games",
    description: "Компактна сітка ігрових превью з ./img/ (тільки webp слотів).",
    props: ["title", "images", "gatewayHref"],
    tags: ["games", "slots", "grid"],
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
    description: "FAQ з розкривними пунктами (framer-motion height).",
    props: ["title", "items"],
    tags: ["faq", "accordion", "support"],
  },
  {
    id: "cta-banner",
    name: "CtaBanner",
    importFrom: "../components/registry/CtaBanner",
    category: "cta",
    description: "Повноширинний CTA-блок з gateway-посиланням.",
    props: ["title", "body", "ctaLabel", "ctaHref"],
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
    description: "Дві колонки: текст + декоративне зображення з ./img/.",
    props: ["title", "body", "imageSrc", "imageAlt", "reverse"],
    tags: ["split", "about", "reviews"],
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
    "Для кожної pages[] додай componentIds: string[] (2–4 id зі списку, унікальні в межах сторінки).",
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
