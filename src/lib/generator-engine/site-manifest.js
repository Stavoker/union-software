import fs from "node:fs/promises";
import path from "node:path";
import { getAppRoot } from "@/src/lib/app-paths";

const ARCHETYPES = [
  "editorial_asymmetric",
  "magazine_dense",
  "saas_dashboard_like",
  "docs_portal",
  "knowledge_base",
  "directory_grid",
  "marketplace_catalog",
  "local_business_service",
  "portfolio_story",
  "service_company",
  "comparison_first",
  "blog_first",
  "landing_first",
  "wiki_style",
  "minimal_content",
  "resource_library",
  "tool_hub",
  "faq_heavy",
  "glossary_first",
  "review_matrix",
];

const NAV_TYPES = [
  "top_nav_mega",
  "left_sidebar_sticky",
  "right_sidebar_context",
  "mixed_top_plus_local",
  "minimal_top_search",
];

const LAYOUTS = ["asymmetric_grid", "centered_longform", "split_columns", "modular_cards", "hybrid_masonry"];
const SIDEBARS = ["none", "left", "right", "dual_contextual"];
const GRIDS = ["2col", "3col", "masonry", "mixed", "single_long"];
const DENSITY = ["compact", "balanced", "airy"];
const PAGE_TYPES = [
  "home",
  "category",
  "subcategory",
  "article",
  "faq",
  "glossary",
  "comparison",
  "service",
  "contact",
  "author",
  "resource",
];

const SECTION_LIBRARY = [
  "hero_centered",
  "hero_split",
  "no_hero_intro",
  "editorial_intro",
  "metric_strip",
  "feature_grid",
  "sticky_sidebar_list",
  "timeline",
  "accordion",
  "comparison_table",
  "icon_columns",
  "quote_wall",
  "related_topics",
  "glossary_links",
  "process_steps",
  "faq_inline",
  "faq_fullpage",
  "resource_cards",
  "cta_banner",
  "cta_inline",
  "newsletter_panel",
  "author_box",
  "toc_sidebar",
];

function hashString(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(list, seed, salt = "") {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[hashString(`${seed}|${salt}`) % list.length];
}

function pickSequence(list, seed, min = 6, max = 10) {
  const len = Math.max(min, Math.min(max, list.length));
  const out = [];
  const used = new Set();
  let i = 0;
  while (out.length < len && i < list.length * 3) {
    const idx = hashString(`${seed}|seq|${i}`) % list.length;
    const item = list[idx];
    if (!used.has(item)) {
      used.add(item);
      out.push(item);
    }
    i++;
  }
  return out;
}

function toDomSignature(manifest) {
  return [
    manifest.layout_system,
    manifest.navigation_type,
    manifest.sidebar_configuration,
    manifest.grid_system,
    manifest.spacing_density,
    manifest.page_types.map((p) => p.type).join(","),
  ].join("|");
}

function jaccard(a, b) {
  const aa = new Set(Array.isArray(a) ? a : []);
  const bb = new Set(Array.isArray(b) ? b : []);
  if (!aa.size && !bb.size) return 0;
  let inter = 0;
  for (const x of aa) if (bb.has(x)) inter++;
  return inter / (aa.size + bb.size - inter || 1);
}

function overlapRatio(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (!aa.length && !bb.length) return 0;
  const n = Math.max(aa.length, bb.length);
  let same = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] === bb[i]) same++;
  }
  return same / n;
}

function manifestSimilarity(a, b) {
  const sitemapA = (a.page_types || []).map((p) => p.type);
  const sitemapB = (b.page_types || []).map((p) => p.type);
  const sectionA = (a.section_rules?.global_sequence || []);
  const sectionB = (b.section_rules?.global_sequence || []);
  const domA = toDomSignature(a);
  const domB = toDomSignature(b);
  const navMatch = a.navigation_type === b.navigation_type ? 1 : 0;
  const layoutMatch = a.layout_system === b.layout_system ? 1 : 0;
  const tokenMatch =
    a.visual_style_tokens?.card_style === b.visual_style_tokens?.card_style &&
    a.visual_style_tokens?.image_ratio_bias === b.visual_style_tokens?.image_ratio_bias
      ? 1
      : 0;
  const domSim = domA === domB ? 1 : jaccard(domA.split("|"), domB.split("|"));
  const sitemapSim = jaccard(sitemapA, sitemapB);
  const sectionSim = overlapRatio(sectionA, sectionB);
  return 0.35 * domSim + 0.25 * sitemapSim + 0.2 * sectionSim + 0.1 * navMatch + 0.1 * (layoutMatch + tokenMatch) / 2;
}

function sectionStartSignature(manifest) {
  return String((manifest?.section_rules?.global_sequence || []).slice(0, 3).join("|"));
}

function structuralFingerprint(manifest) {
  return [
    manifest?.site_archetype || "",
    manifest?.navigation_type || "",
    manifest?.layout_system || "",
    manifest?.sidebar_configuration || "",
    manifest?.grid_system || "",
    manifest?.spacing_density || "",
    sectionStartSignature(manifest),
  ].join("::");
}

function mapFileToPageType(file, seed, idx) {
  const f = String(file || "").toLowerCase();
  if (f === "index.php") return "home";
  if (f.includes("review")) return "comparison";
  if (f.includes("faq")) return "faq";
  if (f.includes("contact")) return "contact";
  if (f.includes("register")) return "service";
  if (f.includes("payment")) return "resource";
  return pick(PAGE_TYPES, seed, `ptype:${idx}:${file}`);
}

function buildManifest({ theme, projectSlug, siteSeed, expectedFiles, variant }) {
  const seed = `${siteSeed}|manifest|${variant}`;
  const pageTypes = (expectedFiles || []).map((file, idx) => ({
    file: String(file),
    type: mapFileToPageType(file, seed, idx),
    blueprint: pick(["longform", "modular", "table_first", "faq_first", "toc_heavy"], seed, `bp:${idx}`),
  }));
  return {
    site_archetype: pick(ARCHETYPES, seed, "arch"),
    navigation_type: pick(NAV_TYPES, seed, "nav"),
    layout_system: pick(LAYOUTS, seed, "layout"),
    sidebar_configuration: pick(SIDEBARS, seed, "sidebar"),
    grid_system: pick(GRIDS, seed, "grid"),
    spacing_density: pick(DENSITY, seed, "density"),
    visual_style_tokens: {
      border_radius: pick(["sharp", "soft", "mixed"], seed, "radius"),
      card_style: pick(["flat", "outlined", "elevated"], seed, "cards"),
      image_ratio_bias: pick(["portrait", "landscape", "mixed"], seed, "ratio"),
      shadow_level: pick(["none", "light", "medium"], seed, "shadow"),
    },
    content_architecture: {
      home_type: pick(["hub", "landing", "editorial", "directory"], seed, "home"),
      article_type: pick(["longform_with_toc", "modular_blocks", "qa_style"], seed, "article"),
      internal_linking: pick(["topic_clusters", "hub_spoke", "related_graph"], seed, "links"),
    },
    cta_strategy: pick(["inline_soft", "banner_sparse", "high_intent_modular"], seed, "cta"),
    page_types: pageTypes,
    section_rules: {
      global_sequence: pickSequence(SECTION_LIBRARY, `${seed}|sections`, 7, 11),
      banned_sequences: [
        ["hero_centered", "feature_grid", "faq_fullpage"],
        ["hero_split", "metric_strip", "cta_banner"],
        ["hero_split", "metric_strip", "feature_grid"],
        ["hero_centered", "metric_strip", "icon_columns"],
      ],
      forbid_repeating_first_section: true,
    },
    theme_hint: String(theme || ""),
  };
}

function getMemoryPath() {
  return path.join(getAppRoot(), "storage", "generation-memory", "site-manifests.json");
}

async function loadMemory() {
  try {
    const raw = await fs.readFile(getMemoryPath(), "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveMemory(rows) {
  const file = getMemoryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const sliced = (Array.isArray(rows) ? rows : []).slice(-120);
  await fs.writeFile(file, JSON.stringify(sliced, null, 2), "utf8");
}

function buildManifestPromptBlock(manifest, thresholds) {
  return `
STAGE 1 — SITE STRATEGY (manifest):
${JSON.stringify(manifest, null, 2)}

STAGE 2 — SITEMAP + PAGE RELATIONSHIPS:
${(manifest.page_types || []).map((p) => `- ${p.file}: ${p.type} (${p.blueprint})`).join("\n")}

STAGE 3 — DESIGN SYSTEM:
- navigation: ${manifest.navigation_type}
- layout: ${manifest.layout_system}
- sidebar: ${manifest.sidebar_configuration}
- grid: ${manifest.grid_system}
- spacing: ${manifest.spacing_density}
- visual tokens: ${JSON.stringify(manifest.visual_style_tokens)}

STAGE 4 — PAGE BLUEPRINTS:
- Use different DOM hierarchy and section composition per page type.
- Global section grammar seed: ${(manifest.section_rules?.global_sequence || []).join(" -> ")}
- Forbidden repeated sequence: hero -> features -> testimonials -> faq.

MANDATORY SIMILARITY CONSTRAINTS:
- DOM similarity <= ${thresholds.dom}
- sitemap similarity <= ${thresholds.sitemap}
- section overlap <= ${thresholds.sections}
- if above threshold: regenerate structure before final HTML.
`;
}

export async function buildSiteManifestPlan({
  theme,
  projectSlug,
  siteSeed,
  expectedFiles,
  onLog,
}) {
  const history = await loadMemory();
  const thresholds = { dom: 0.34, sitemap: 0.28, sections: 0.38 };
  const MAX_MANIFEST_VARIANTS = 72;
  let best = null;
  let strictRejectedCandidates = 0;
  for (let variant = 0; variant < MAX_MANIFEST_VARIANTS; variant++) {
    const manifest = buildManifest({
      theme,
      projectSlug,
      siteSeed,
      expectedFiles,
      variant,
    });
    const recent = history.slice(-35).map((x) => x.manifest).filter(Boolean);
    const existingFingerprints = new Set(
      history.slice(-80).map((x) => String(x?.structuralFingerprint || "")).filter(Boolean)
    );
    const currentFingerprint = structuralFingerprint(manifest);
    const repeatedFingerprint = existingFingerprints.has(currentFingerprint);
    const repeatedSectionStart = recent.some(
      (m) => sectionStartSignature(m) && sectionStartSignature(m) === sectionStartSignature(manifest)
    );
    const maxSimilarity = recent.length
      ? Math.max(...recent.map((m) => manifestSimilarity(manifest, m)))
      : 0;
    const penalizedSimilarity =
      maxSimilarity + (repeatedFingerprint ? 0.4 : 0) + (repeatedSectionStart ? 0.2 : 0);
    const strictRepeatDetected = repeatedFingerprint || repeatedSectionStart;
    if (strictRepeatDetected) {
      strictRejectedCandidates += 1;
      if (typeof onLog === "function") {
        onLog(
          `[manifest] strict reject variant=${variant}: repeatFP=${repeatedFingerprint ? "yes" : "no"}; repeatSeq=${repeatedSectionStart ? "yes" : "no"}`
        );
      }
      if (!best || penalizedSimilarity < best.maxSimilarity) {
        best = {
          manifest,
          maxSimilarity: penalizedSimilarity,
          rawSimilarity: maxSimilarity,
          variant,
          repeatedFingerprint,
          repeatedSectionStart,
          structuralFingerprint: currentFingerprint,
          strictRejected: true,
        };
      }
      continue;
    }
    if (!best || penalizedSimilarity < best.maxSimilarity) {
      best = {
        manifest,
        maxSimilarity: penalizedSimilarity,
        rawSimilarity: maxSimilarity,
        variant,
        repeatedFingerprint,
        repeatedSectionStart,
        structuralFingerprint: currentFingerprint,
        strictRejected: false,
      };
    }
    if (
      maxSimilarity <= thresholds.dom &&
      maxSimilarity <= thresholds.sections &&
      !repeatedFingerprint &&
      !repeatedSectionStart
    ) {
      break;
    }
  }
  const entry = {
    createdAt: new Date().toISOString(),
    projectSlug,
    manifest: best.manifest,
    maxSimilarity: Number(best.maxSimilarity.toFixed(3)),
    rawSimilarity: Number((best.rawSimilarity ?? best.maxSimilarity).toFixed(3)),
    repeatedFingerprint: Boolean(best.repeatedFingerprint),
    repeatedSectionStart: Boolean(best.repeatedSectionStart),
    structuralFingerprint: String(best.structuralFingerprint || structuralFingerprint(best.manifest)),
    strictRejectedCandidates,
    forcedAcceptDueToVariantLimit: Boolean(best.strictRejected),
  };
  await saveMemory([...history, entry]);
  if (typeof onLog === "function") {
    if (entry.forcedAcceptDueToVariantLimit) {
      onLog(
        `[manifest] strict mode exhausted (${MAX_MANIFEST_VARIANTS} variants), fallback to best penalized candidate`
      );
    }
    onLog(
      `[manifest] archetype=${best.manifest.site_archetype}; nav=${best.manifest.navigation_type}; similarity=${entry.maxSimilarity}; repeatFP=${entry.repeatedFingerprint ? "yes" : "no"}; strictRejected=${strictRejectedCandidates}`
    );
  }
  return {
    manifest: best.manifest,
    promptBlock: buildManifestPromptBlock(best.manifest, thresholds),
    similarity: entry.maxSimilarity,
  };
}

