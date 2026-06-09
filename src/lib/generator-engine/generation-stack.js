/** Стек збірки: PHP (legacy) або React Lab (Vite SPA). */
export const GENERATION_STACK_PHP = "php";
export const GENERATION_STACK_REACT = "react";

/** Default for UI and API when stack is omitted. PHP remains available via stack: "php". */
export const GENERATION_STACK_DEFAULT = GENERATION_STACK_REACT;

export function getDefaultGenerationStack() {
  return GENERATION_STACK_DEFAULT;
}

export function normalizeGenerationStack(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === GENERATION_STACK_REACT || v === "react-lab" || v === "react_lab") {
    return GENERATION_STACK_REACT;
  }
  return GENERATION_STACK_PHP;
}

export function isReactGenerationStack(stack) {
  return normalizeGenerationStack(stack) === GENERATION_STACK_REACT;
}

/** React build on Union (variant a). Disabled only when SOFTGEN_REACT_BUILD=0. */
export function isReactBuildEnabled() {
  const v = String(process.env.SOFTGEN_REACT_BUILD ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}
