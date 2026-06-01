/** Режими збірки multipage PHP. */
export const GENERATION_MODE_STANDARD = "standard";
export const GENERATION_MODE_BOT_GATE = "bot_gate";
export function normalizeGenerationMode(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === GENERATION_MODE_BOT_GATE || v === "bot-gate" || v === "seo_gate") {
    return GENERATION_MODE_BOT_GATE;
  }
  return GENERATION_MODE_STANDARD;
}

export function isBotGateGenerationMode(mode) {
  return normalizeGenerationMode(mode) === GENERATION_MODE_BOT_GATE;
}
