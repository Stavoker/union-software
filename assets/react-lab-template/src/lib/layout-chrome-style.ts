export type SidebarChromeStyle = {
  widthCompact: string;
  widthExpanded: string;
  widthCompactClass: string;
  widthExpandedClass: string;
  mainPadClass: string;
  mainPadXlClass: string;
  asideBg: string;
  asideBorder: string;
  navGap: string;
  navItemRadius: string;
  navItemPadding: string;
  iconBoxRadius: string;
  iconBoxSize: string;
  iconBoxBg: string;
  activeNavBg: string;
  logoPadding: string;
  ctaRadius: string;
};

export type HeaderChromeStyle = {
  height: string;
  maxWidth: string;
  navAlign: string;
  headerBg: string;
  navGap: string;
  navItemRadius: string;
  navItemPadding: string;
  borderBottom: boolean;
  blur: boolean;
  logoHeight: string;
  ctaGap: string;
};

export const DEFAULT_SIDEBAR_CHROME: SidebarChromeStyle = {
  widthCompact: "4.5rem",
  widthExpanded: "15.5rem",
  widthCompactClass: "w-[4.5rem]",
  widthExpandedClass: "xl:w-[15.5rem]",
  mainPadClass: "lg:pl-[4.5rem]",
  mainPadXlClass: "xl:pl-[15.5rem]",
  asideBg: "bg-brand-card",
  asideBorder: "border-brand-accent/15",
  navGap: "gap-1",
  navItemRadius: "rounded-xl",
  navItemPadding: "px-2 py-2.5 xl:px-3",
  iconBoxRadius: "rounded-lg",
  iconBoxSize: "h-9 w-9",
  iconBoxBg: "bg-brand-block",
  activeNavBg: "bg-brand-accent/10",
  logoPadding: "py-4",
  ctaRadius: "rounded-xl",
};

export const DEFAULT_HEADER_CHROME: HeaderChromeStyle = {
  height: "h-14",
  maxWidth: "max-w-6xl",
  navAlign: "center",
  headerBg: "bg-brand-bg/95",
  navGap: "gap-1",
  navItemRadius: "rounded-lg",
  navItemPadding: "px-3 py-2",
  borderBottom: true,
  blur: true,
  logoHeight: "2rem",
  ctaGap: "gap-2",
};

function pickString(obj: Record<string, unknown>, key: string, fallback: string) {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

export function parseSidebarChromeStyle(raw: unknown): SidebarChromeStyle {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SIDEBAR_CHROME;
  return {
    widthCompact: pickString(o, "widthCompact", d.widthCompact),
    widthExpanded: pickString(o, "widthExpanded", d.widthExpanded),
    widthCompactClass: pickString(o, "widthCompactClass", d.widthCompactClass),
    widthExpandedClass: pickString(o, "widthExpandedClass", d.widthExpandedClass),
    mainPadClass: pickString(o, "mainPadClass", d.mainPadClass),
    mainPadXlClass: pickString(o, "mainPadXlClass", d.mainPadXlClass),
    asideBg: pickString(o, "asideBg", d.asideBg),
    asideBorder: pickString(o, "asideBorder", d.asideBorder),
    navGap: pickString(o, "navGap", d.navGap),
    navItemRadius: pickString(o, "navItemRadius", d.navItemRadius),
    navItemPadding: pickString(o, "navItemPadding", d.navItemPadding),
    iconBoxRadius: pickString(o, "iconBoxRadius", d.iconBoxRadius),
    iconBoxSize: pickString(o, "iconBoxSize", d.iconBoxSize),
    iconBoxBg: pickString(o, "iconBoxBg", d.iconBoxBg),
    activeNavBg: pickString(o, "activeNavBg", d.activeNavBg),
    logoPadding: pickString(o, "logoPadding", d.logoPadding),
    ctaRadius: pickString(o, "ctaRadius", d.ctaRadius),
  };
}

export function parseHeaderChromeStyle(raw: unknown): HeaderChromeStyle {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_HEADER_CHROME;
  return {
    height: pickString(o, "height", d.height),
    maxWidth: pickString(o, "maxWidth", d.maxWidth),
    navAlign: pickString(o, "navAlign", d.navAlign),
    headerBg: pickString(o, "headerBg", d.headerBg),
    navGap: pickString(o, "navGap", d.navGap),
    navItemRadius: pickString(o, "navItemRadius", d.navItemRadius),
    navItemPadding: pickString(o, "navItemPadding", d.navItemPadding),
    borderBottom: o.borderBottom === false ? false : d.borderBottom,
    blur: o.blur === false ? false : d.blur,
    logoHeight: pickString(o, "logoHeight", d.logoHeight),
    ctaGap: pickString(o, "ctaGap", d.ctaGap),
  };
}
