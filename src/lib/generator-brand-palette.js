/** Палітра бренду — без Node/fs, безпечно для client components. */

const DEFAULT_CORE_PALETTE = {
  accent: "#d1fe17",
  bg: "#0f1113",
  text: "#edf0f5",
};

function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * @param {string} input
 * @param {[number, number, number]} fallback
 */
function parseHexColor(input, fallback) {
  const raw = String(input || "").trim();
  const m = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return [...fallback];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * @param {[number, number, number]} rgb
 */
function rgbToHex(rgb) {
  return `#${rgb.map((c) => clampChannel(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * @param {[number, number, number]} rgb
 * @param {{ lighten?: number, darken?: number }} opts
 */
function adjustRgb(rgb, opts) {
  const { lighten = 0, darken = 0 } = opts;
  const factor = lighten ? 1 + lighten : 1 - darken;
  return rgb.map((c) => clampChannel(c * factor));
}

/**
 * @param {[number, number, number]} rgb
 */
function relativeLuminance(rgb) {
  const [rs, gs, bs] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Три кольори в адмінці: акцент, фон, текст. */
export function normalizePaletteCore(raw) {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    accent:
      String(src.accent || DEFAULT_CORE_PALETTE.accent).trim() ||
      DEFAULT_CORE_PALETTE.accent,
    bg: String(src.bg || DEFAULT_CORE_PALETTE.bg).trim() || DEFAULT_CORE_PALETTE.bg,
    text:
      String(src.text || DEFAULT_CORE_PALETTE.text).trim() || DEFAULT_CORE_PALETTE.text,
  };
}

/** Розширення для пайплайну генерації (block, card, accentOn, gradEnd). */
export function expandPalette(core) {
  const base = normalizePaletteCore(core);
  const bgRgb = parseHexColor(base.bg, [15, 17, 19]);
  const accentRgb = parseHexColor(base.accent, [209, 254, 23]);
  return {
    ...base,
    block: rgbToHex(adjustRgb(bgRgb, { lighten: 0.08 })),
    card: rgbToHex(adjustRgb(bgRgb, { lighten: 0.14 })),
    gradEnd: rgbToHex(adjustRgb(bgRgb, { darken: 0.12 })),
    accentOn: relativeLuminance(accentRgb) > 0.55 ? "#0a0f0a" : "#f8faf8",
  };
}

/** Повна палітра для збірки (з legacy JSON теж). */
export function normalizePalette(raw) {
  return expandPalette(normalizePaletteCore(raw));
}
