/**
 * Контракт збірки для Union: код перенесено в `src/lib/generator-engine`
 * (оригінал — soft-generator-new-v2).
 *
 * **Варіант B:** дефолти для `SOFTGEN_REQUIRE_REFERENCE_STRUCTURE` і
 * `SOFTGEN_REFERENCE_TEMPLATE_MODE` задаються в `src/instrumentation.ts`, якщо env порожні.
 * Старт job у API примусово передає `referenceTemplateMode: false`.
 */
export const GENERATOR_SOURCE_REPO = "soft-generator-new-v2" as const;

/** Env на воркері збірки: `0` = можна стартувати без URL референса та без mirror-каркаса. */
export const SOFTGEN_REQUIRE_REFERENCE_STRUCTURE_ENV = "SOFTGEN_REQUIRE_REFERENCE_STRUCTURE" as const;

export type GeneratorBuildVariant = "architect_seed" | "reference_mirror";

export const DEFAULT_GENERATOR_VARIANT_FOR_UNION: GeneratorBuildVariant = "architect_seed";
