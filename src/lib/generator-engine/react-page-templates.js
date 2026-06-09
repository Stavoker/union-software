/**
 * HOME / inner page section order presets (UX: hero → value → discovery → depth → FAQ → CTA).
 * FAQ variants: faq-accordion | faq-two-column | faq-cards
 * Slot variants: slot-grid | game-carousel | slot-showcase | slot-scroll | slot-featured
 */

/** @type {Array<{ id: string; order: string[] }>} */
export const HOME_PAGE_TEMPLATES = [
  {
    id: "classic",
    order: [
      "hero-gradient",
      "prose-block",
      "poster-slider",
      "game-carousel",
      "slot-grid",
      "prose-block",
      "feature-cards",
      "section-with-bg",
      "prose-block",
      "faq-accordion",
      "cta-banner",
    ],
  },
  {
    id: "content-first",
    order: [
      "hero-gradient",
      "prose-block",
      "prose-block",
      "content-split",
      "slot-grid",
      "feature-cards",
      "prose-block",
      "faq-two-column",
      "cta-banner",
    ],
  },
  {
    id: "promo-slider",
    order: [
      "hero-gradient",
      "poster-slider",
      "section-with-bg",
      "prose-block",
      "game-carousel",
      "prose-block",
      "stat-row",
      "faq-cards",
      "cta-banner",
    ],
  },
  {
    id: "games-focus",
    order: [
      "hero-gradient",
      "slot-showcase",
      "prose-block",
      "game-carousel",
      "content-split",
      "prose-block",
      "feature-cards",
      "faq-accordion",
      "cta-banner",
    ],
  },
  {
    id: "trust-editorial",
    order: [
      "hero-gradient",
      "prose-block",
      "stat-row",
      "prose-block",
      "poster-slider",
      "content-split",
      "prose-block",
      "faq-two-column",
      "cta-banner",
    ],
  },
  {
    id: "split-story",
    order: [
      "hero-gradient",
      "content-split",
      "prose-block",
      "poster-slider",
      "slot-scroll",
      "prose-block",
      "section-with-bg",
      "faq-cards",
      "cta-banner",
    ],
  },
  {
    id: "conversion-focused",
    order: [
      "hero-gradient",
      "stat-row",
      "feature-cards",
      "prose-block",
      "slot-featured",
      "prose-block",
      "poster-slider",
      "faq-cards",
      "cta-banner",
    ],
  },
  {
    id: "discovery-first",
    order: [
      "hero-gradient",
      "slot-scroll",
      "prose-block",
      "game-carousel",
      "content-split",
      "prose-block",
      "feature-cards",
      "faq-two-column",
      "cta-banner",
    ],
  },
  {
    id: "trust-then-play",
    order: [
      "hero-gradient",
      "prose-block",
      "stat-row",
      "feature-cards",
      "slot-showcase",
      "poster-slider",
      "prose-block",
      "faq-accordion",
      "cta-banner",
    ],
  },
  {
    id: "editorial-promo",
    order: [
      "hero-gradient",
      "prose-block",
      "poster-slider",
      "content-split",
      "slot-grid",
      "prose-block",
      "faq-cards",
      "cta-banner",
    ],
  },
  {
    id: "minimal-games",
    order: [
      "hero-gradient",
      "feature-cards",
      "slot-showcase",
      "prose-block",
      "prose-block",
      "section-with-bg",
      "faq-two-column",
      "cta-banner",
    ],
  },
  {
    id: "vip-story",
    order: [
      "hero-gradient",
      "content-split",
      "stat-row",
      "prose-block",
      "game-carousel",
      "slot-featured",
      "prose-block",
      "faq-accordion",
      "cta-banner",
    ],
  },
];

/** @type {string[][]} */
export const INNER_PAGE_TEMPLATES = [
  ["poster-slider", "prose-block", "content-split", "prose-block", "faq-accordion", "cta-banner"],
  ["content-split", "prose-block", "poster-slider", "feature-cards", "prose-block", "faq-two-column"],
  ["prose-block", "stat-row", "poster-slider", "content-split", "prose-block", "cta-banner", "faq-cards"],
  ["section-with-bg", "prose-block", "feature-cards", "poster-slider", "prose-block", "faq-accordion", "cta-banner"],
  ["stat-row", "prose-block", "content-split", "slot-grid", "prose-block", "faq-two-column", "cta-banner"],
  ["feature-cards", "section-with-bg", "prose-block", "payment-methods", "prose-block", "cta-banner", "faq-cards"],
  ["content-split", "stat-row", "prose-block", "game-carousel", "prose-block", "faq-accordion", "cta-banner"],
  ["poster-slider", "feature-cards", "prose-block", "content-split", "prose-block", "cta-banner", "faq-two-column"],
  ["prose-block", "slot-showcase", "content-split", "prose-block", "faq-cards", "cta-banner"],
  ["slot-scroll", "prose-block", "section-with-bg", "prose-block", "faq-accordion", "cta-banner"],
  ["prose-block", "slot-featured", "poster-slider", "prose-block", "faq-two-column", "cta-banner"],
  ["stat-row", "slot-grid", "prose-block", "payment-methods", "prose-block", "faq-cards", "cta-banner"],
  ["content-split", "game-carousel", "prose-block", "feature-cards", "prose-block", "faq-accordion", "cta-banner"],
  ["section-with-bg", "slot-scroll", "prose-block", "poster-slider", "prose-block", "faq-two-column", "cta-banner"],
  ["prose-block", "slot-showcase", "stat-row", "prose-block", "faq-cards", "cta-banner"],
  ["feature-cards", "content-split", "slot-featured", "prose-block", "faq-accordion", "cta-banner"],
];

export const FAQ_COMPONENT_IDS = ["faq-accordion", "faq-two-column", "faq-cards"];

export const SLOT_COMPONENT_IDS = [
  "slot-grid",
  "game-carousel",
  "slot-showcase",
  "slot-scroll",
  "slot-featured",
];

/**
 * Conversion-oriented section order per inner page slug.
 * Pattern: hook → value/trust → depth (prose) → objections (FAQ) → CTA.
 *
 * @type {Record<string, Array<{ id: string; order: string[] }>>}
 */
export const PAGE_SPECIFIC_INNER_TEMPLATES = {
  "bonus.php": [
    {
      id: "bonus-promo-hook",
      order: [
        "poster-slider",
        "feature-cards",
        "stat-row",
        "prose-block",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "bonus-trust-offer",
      order: [
        "section-with-bg",
        "stat-row",
        "feature-cards",
        "prose-block",
        "content-split",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "bonus-story-cta",
      order: [
        "content-split",
        "poster-slider",
        "prose-block",
        "feature-cards",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "payments.php": [
    {
      id: "payments-methods-first",
      order: [
        "payment-methods",
        "prose-block",
        "feature-cards",
        "stat-row",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
    {
      id: "payments-trust-speed",
      order: [
        "stat-row",
        "payment-methods",
        "content-split",
        "prose-block",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "payments-guide",
      order: [
        "prose-block",
        "payment-methods",
        "section-with-bg",
        "prose-block",
        "feature-cards",
        "faq-two-column",
        "cta-banner",
      ],
    },
  ],
  "vip.php": [
    {
      id: "vip-premium-tier",
      order: [
        "feature-cards",
        "stat-row",
        "content-split",
        "section-with-bg",
        "prose-block",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "vip-exclusive",
      order: [
        "section-with-bg",
        "stat-row",
        "feature-cards",
        "prose-block",
        "content-split",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "vip-club-story",
      order: [
        "content-split",
        "feature-cards",
        "poster-slider",
        "prose-block",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "games.php": [
    {
      id: "games-discovery",
      order: [
        "slot-showcase",
        "prose-block",
        "game-carousel",
        "prose-block",
        "feature-cards",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "games-scroll-play",
      order: [
        "slot-scroll",
        "feature-cards",
        "prose-block",
        "slot-featured",
        "prose-block",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "games-classic-grid",
      order: [
        "slot-grid",
        "content-split",
        "prose-block",
        "game-carousel",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "slots.php": [
    {
      id: "slots-showcase",
      order: [
        "slot-showcase",
        "prose-block",
        "slot-scroll",
        "prose-block",
        "stat-row",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "slots-featured-row",
      order: [
        "slot-featured",
        "prose-block",
        "slot-grid",
        "content-split",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "slots-carousel",
      order: [
        "game-carousel",
        "prose-block",
        "slot-grid",
        "prose-block",
        "feature-cards",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "registration.php": [
    {
      id: "reg-steps-trust",
      order: [
        "feature-cards",
        "stat-row",
        "prose-block",
        "content-split",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
    {
      id: "reg-low-friction",
      order: [
        "stat-row",
        "feature-cards",
        "section-with-bg",
        "prose-block",
        "prose-block",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "reg-guide",
      order: [
        "prose-block",
        "feature-cards",
        "content-split",
        "stat-row",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
  ],
  "reviews.php": [
    {
      id: "reviews-social-proof",
      order: [
        "stat-row",
        "content-split",
        "prose-block",
        "feature-cards",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "reviews-editorial",
      order: [
        "prose-block",
        "stat-row",
        "poster-slider",
        "content-split",
        "prose-block",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "reviews-trust-cards",
      order: [
        "feature-cards",
        "stat-row",
        "prose-block",
        "content-split",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "mirror.php": [
    {
      id: "mirror-access",
      order: [
        "feature-cards",
        "prose-block",
        "stat-row",
        "content-split",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
    {
      id: "mirror-reliability",
      order: [
        "prose-block",
        "section-with-bg",
        "feature-cards",
        "stat-row",
        "prose-block",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "mirror-quick-guide",
      order: [
        "content-split",
        "feature-cards",
        "prose-block",
        "stat-row",
        "faq-cards",
        "cta-banner",
      ],
    },
  ],
  "promo.php": [
    {
      id: "promo-slider-urgency",
      order: [
        "poster-slider",
        "section-with-bg",
        "feature-cards",
        "stat-row",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
    {
      id: "promo-offer-stack",
      order: [
        "section-with-bg",
        "poster-slider",
        "stat-row",
        "prose-block",
        "feature-cards",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "promo-story",
      order: [
        "content-split",
        "poster-slider",
        "feature-cards",
        "prose-block",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
  ],
  "faq-page.php": [
    {
      id: "faq-hub-columns",
      order: [
        "faq-two-column",
        "prose-block",
        "feature-cards",
        "prose-block",
        "cta-banner",
      ],
    },
    {
      id: "faq-hub-cards",
      order: [
        "faq-cards",
        "prose-block",
        "content-split",
        "prose-block",
        "cta-banner",
      ],
    },
    {
      id: "faq-hub-accordion",
      order: [
        "prose-block",
        "faq-accordion",
        "stat-row",
        "prose-block",
        "cta-banner",
      ],
    },
  ],
  "support.php": [
    {
      id: "support-channels",
      order: [
        "feature-cards",
        "faq-two-column",
        "prose-block",
        "content-split",
        "prose-block",
        "cta-banner",
      ],
    },
    {
      id: "support-self-serve",
      order: [
        "prose-block",
        "faq-cards",
        "feature-cards",
        "stat-row",
        "prose-block",
        "cta-banner",
      ],
    },
    {
      id: "support-trust",
      order: [
        "stat-row",
        "feature-cards",
        "prose-block",
        "faq-accordion",
        "content-split",
        "cta-banner",
      ],
    },
  ],
  "about.php": [
    {
      id: "about-brand-story",
      order: [
        "content-split",
        "prose-block",
        "stat-row",
        "feature-cards",
        "prose-block",
        "faq-accordion",
        "cta-banner",
      ],
    },
    {
      id: "about-trust-editorial",
      order: [
        "prose-block",
        "content-split",
        "poster-slider",
        "prose-block",
        "stat-row",
        "faq-two-column",
        "cta-banner",
      ],
    },
    {
      id: "about-mission",
      order: [
        "section-with-bg",
        "prose-block",
        "feature-cards",
        "content-split",
        "prose-block",
        "faq-cards",
        "cta-banner",
      ],
    },
  ],
};

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
 * @param {string} file e.g. bonus.php
 * @param {string} seed
 * @param {number} [batchIndex]
 * @returns {{ id: string; order: string[] }}
 */
export function pickInnerPageTemplate(file, seed, batchIndex = 0) {
  const key = String(file || "").trim().toLowerCase();
  const bi = Math.max(0, Math.trunc(Number(batchIndex) || 0));
  const specific = PAGE_SPECIFIC_INNER_TEMPLATES[key];
  if (specific?.length) {
    const idx = (hash32(`${seed}|page|${key}`) + bi) % specific.length;
    return specific[idx];
  }
  const genericIdx =
    (hash32(`${seed}|generic|${key}`) + bi) % INNER_PAGE_TEMPLATES.length;
  return {
    id: `generic-${String(genericIdx + 1).padStart(2, "0")}`,
    order: [...INNER_PAGE_TEMPLATES[genericIdx]],
  };
}

/**
 * @param {string[]} expectedFiles
 * @param {string} structureSeed
 * @param {number} [batchIndex]
 */
export function buildInnerTemplatesPlan(expectedFiles, structureSeed, batchIndex = 0) {
  const bi = Math.max(0, Math.trunc(Number(batchIndex) || 0));
  const seed = String(structureSeed || "inner");
  return (Array.isArray(expectedFiles) ? expectedFiles : [])
    .filter((f) => String(f).toLowerCase() !== "index.php")
    .map((file) => {
      const tpl = pickInnerPageTemplate(file, seed, bi);
      return { file, templateId: tpl.id, order: tpl.order };
    });
}

/**
 * @param {ReturnType<typeof buildInnerTemplatesPlan>} plan
 * @returns {string}
 */
export function formatInnerTemplatesPlanForArchitect(plan) {
  const lines = [
    "INNER_PAGE_TEMPLATES (фиксированы сборщиком по file — порядок componentIds не меняй):",
  ];
  for (const row of plan) {
    lines.push(`- ${row.file}: «${row.templateId}» → ${row.order.join(" → ")}`);
  }
  return lines.join("\n");
}
