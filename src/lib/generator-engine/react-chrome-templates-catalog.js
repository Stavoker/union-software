/**
 * 50 sidebar + 50 header React chrome style presets (parametric, minimal visual drift).
 * Seeded into Supabase generator_react_chrome_templates.
 */

const SIDEBAR_WIDTH_COMPACT = ["3.5rem", "4rem", "4.5rem", "5rem"];
const SIDEBAR_WIDTH_EXPANDED = ["14rem", "15.5rem", "16rem", "17.5rem"];
const NAV_RADIUS = ["rounded-lg", "rounded-xl", "rounded-2xl"];
const ICON_RADIUS = ["rounded-md", "rounded-lg", "rounded-xl"];
const ASIDE_BG = ["bg-brand-card", "bg-brand-block", "bg-brand-bg/98"];
const BORDER_ACCENT = [
  "border-brand-accent/10",
  "border-brand-accent/15",
  "border-brand-accent/25",
];

const COMPACT_W_CLASS = {
  "3.5rem": "w-14",
  "4rem": "w-16",
  "4.5rem": "w-[4.5rem]",
  "5rem": "w-20",
};

const EXPANDED_W_CLASS = {
  "14rem": "xl:w-56",
  "15.5rem": "xl:w-[15.5rem]",
  "16rem": "xl:w-64",
  "17.5rem": "xl:w-[17.5rem]",
};

const MAIN_PAD_CLASS = {
  "3.5rem": "lg:pl-14",
  "4rem": "lg:pl-16",
  "4.5rem": "lg:pl-[4.5rem]",
  "5rem": "lg:pl-20",
};

const MAIN_PAD_XL_CLASS = {
  "14rem": "xl:pl-56",
  "15.5rem": "xl:pl-[15.5rem]",
  "16rem": "xl:pl-64",
  "17.5rem": "xl:pl-[17.5rem]",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {number} n 1..50
 */
export function buildSidebarChromeStyle(n) {
  const i = Math.max(1, Math.min(50, Math.trunc(n))) - 1;
  const navRadius = NAV_RADIUS[i % NAV_RADIUS.length];
  const iconRadius = ICON_RADIUS[(i + 1) % ICON_RADIUS.length];
  const widthCompact = SIDEBAR_WIDTH_COMPACT[i % SIDEBAR_WIDTH_COMPACT.length];
  const widthExpanded = SIDEBAR_WIDTH_EXPANDED[i % SIDEBAR_WIDTH_EXPANDED.length];
  return {
    widthCompact,
    widthExpanded,
    widthCompactClass: COMPACT_W_CLASS[widthCompact] || "w-[4.5rem]",
    widthExpandedClass: EXPANDED_W_CLASS[widthExpanded] || "xl:w-[15.5rem]",
    mainPadClass: MAIN_PAD_CLASS[widthCompact] || "lg:pl-[4.5rem]",
    mainPadXlClass: MAIN_PAD_XL_CLASS[widthExpanded] || "xl:pl-[15.5rem]",
    asideBg: ASIDE_BG[i % ASIDE_BG.length],
    asideBorder: BORDER_ACCENT[i % BORDER_ACCENT.length],
    navGap: i % 3 === 0 ? "gap-0.5" : i % 3 === 1 ? "gap-1" : "gap-1.5",
    navItemRadius: navRadius,
    navItemPadding: i % 2 === 0 ? "px-2 py-2.5 xl:px-3" : "px-2.5 py-2 xl:px-3.5",
    iconBoxRadius: iconRadius,
    iconBoxSize: i % 4 === 0 ? "h-8 w-8" : "h-9 w-9",
    iconBoxBg:
      i % 3 === 0 ? "bg-brand-block" : i % 3 === 1 ? "bg-brand-accent/8" : "bg-brand-block/80",
    activeNavBg: i % 2 === 0 ? "bg-brand-accent/10" : "bg-brand-accent/12",
    logoPadding: i % 2 === 0 ? "py-4" : "py-3.5",
    ctaRadius: navRadius,
  };
}

const HEADER_HEIGHT = ["h-12", "h-14", "h-16"];
const HEADER_MAX_W = ["max-w-6xl", "max-w-7xl", "max-w-[90rem]"];
const NAV_ALIGN = ["center", "start", "start"];

/**
 * @param {number} n 1..50
 */
export function buildHeaderChromeStyle(n) {
  const i = Math.max(1, Math.min(50, Math.trunc(n))) - 1;
  const navRadius = NAV_RADIUS[i % NAV_RADIUS.length];
  return {
    height: HEADER_HEIGHT[i % HEADER_HEIGHT.length],
    maxWidth: HEADER_MAX_W[i % HEADER_MAX_W.length],
    navAlign: NAV_ALIGN[i % NAV_ALIGN.length],
    headerBg:
      i % 3 === 0
        ? "bg-brand-bg/95"
        : i % 3 === 1
          ? "bg-brand-card/95"
          : "bg-brand-block/90",
    navGap: i % 2 === 0 ? "gap-0.5" : "gap-1",
    navItemRadius: navRadius,
    navItemPadding: i % 3 === 0 ? "px-2.5 py-2" : "px-3 py-2",
    borderBottom: i % 4 !== 3,
    blur: i % 2 === 0,
    logoHeight: i % 3 === 0 ? "2rem" : i % 3 === 1 ? "1.75rem" : "2.125rem",
    ctaGap: i % 2 === 0 ? "gap-2" : "gap-2.5",
  };
}

export function buildChromeTemplatesCatalog() {
  const out = [];
  for (let n = 1; n <= 50; n += 1) {
    const style = buildSidebarChromeStyle(n);
    out.push({
      id: `sidebar-${pad2(n)}`,
      chrome_kind: "sidebar",
      variant_number: n,
      label: `Sidebar preset ${n}`,
      style_json: style,
    });
  }
  for (let n = 1; n <= 50; n += 1) {
    const style = buildHeaderChromeStyle(n);
    out.push({
      id: `header-${pad2(n)}`,
      chrome_kind: "header",
      variant_number: n,
      label: `Header preset ${n}`,
      style_json: style,
    });
  }
  return out;
}

/** @param {string} chromeKind sidebar | header */
export function fallbackChromeTemplate(chromeKind, seed) {
  let state = 0;
  const s = String(seed || "chrome");
  for (let i = 0; i < s.length; i++) {
    state = (state * 31 + s.charCodeAt(i)) >>> 0;
  }
  const n = (state % 50) + 1;
  const id = `${chromeKind}-${pad2(n)}`;
  const style_json =
    chromeKind === "header" ? buildHeaderChromeStyle(n) : buildSidebarChromeStyle(n);
  return {
    id,
    chrome_kind: chromeKind,
    variant_number: n,
    label: `Fallback ${id}`,
    style_json,
  };
}
