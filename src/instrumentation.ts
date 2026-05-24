/**
 * Запускається один раз при старті Node-сервера (до обробки запитів).
 * Дефолти для генератора Union (ported soft-generator-new-v2): варіант B —
 * без обовʼязкового референса, без режиму шаблону з референса.
 * Якщо в `.env` явно задано SOFTGEN_* — ці значення не перезаписуємо.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  if (typeof process.env.SOFTGEN_REQUIRE_REFERENCE_STRUCTURE === "undefined") {
    process.env.SOFTGEN_REQUIRE_REFERENCE_STRUCTURE = "0";
  }
  if (typeof process.env.SOFTGEN_REFERENCE_TEMPLATE_MODE === "undefined") {
    process.env.SOFTGEN_REFERENCE_TEMPLATE_MODE = "0";
  }
  if (typeof process.env.SOFTGEN_QUALITY_REGEN_ENABLED === "undefined") {
    process.env.SOFTGEN_QUALITY_REGEN_ENABLED = "0";
  }
  if (typeof process.env.SOFTGEN_CROSS_BUILD_MEMORY_ENABLED === "undefined") {
    process.env.SOFTGEN_CROSS_BUILD_MEMORY_ENABLED = "0";
  }
  if (typeof process.env.SOFTGEN_PROMPT_REGEN_ENABLED === "undefined") {
    process.env.SOFTGEN_PROMPT_REGEN_ENABLED = "0";
  }
  if (typeof process.env.SOFTGEN_PROMPT_REWRITE_ENABLED === "undefined") {
    process.env.SOFTGEN_PROMPT_REWRITE_ENABLED = "0";
  }
  if (typeof process.env.SOFTGEN_TEMPLATE_CHROME === "undefined") {
    process.env.SOFTGEN_TEMPLATE_CHROME = "0";
  }
}
