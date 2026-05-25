/** Прапорці режиму генерації (читати під час job, після withUserIntegrationEnv). */

function envOn(key, defaultValue = "0") {
  return String(process.env[key] ?? defaultValue).trim() !== "0";
}

export function isQualityRegenEnabled() {
  return envOn("SOFTGEN_QUALITY_REGEN_ENABLED", "0");
}

export function isCrossBuildMemoryEnabled() {
  return envOn("SOFTGEN_CROSS_BUILD_MEMORY_ENABLED", "0");
}

export function isPromptRegenEnabled() {
  return envOn("SOFTGEN_PROMPT_REGEN_ENABLED", "0");
}

export function isPromptRewriteEnabled() {
  return envOn("SOFTGEN_PROMPT_REWRITE_ENABLED", "0");
}

export function isFreeGenerationMode() {
  return (
    !isQualityRegenEnabled() &&
    !isCrossBuildMemoryEnabled() &&
    !isPromptRegenEnabled() &&
    !isPromptRewriteEnabled()
  );
}

/** Фіксований lw-шаблон шапки/підвалу (buildBrandHeaderHtml). 0 = AI chrome у headerHtml/footerHtml. */
export function usesTemplateChrome() {
  return envOn("SOFTGEN_TEMPLATE_CHROME", "0");
}

/** Каталог блоків iGaming: підказки hero/секцій без замороженого css/igaming.css (1 за замовчуванням). */
export function usesPremiumIgamingLayout() {
  return envOn("SOFTGEN_PREMIUM_IGAMING_LAYOUT", "1");
}
