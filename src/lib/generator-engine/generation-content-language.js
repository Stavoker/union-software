/**
 * Мова вихідного контенту сайту (ru | uk), окремо від мови референсів source_articles.
 */

/** @param {string} [raw] @returns {'ru' | 'uk'} */
export function normalizeSiteContentLanguage(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (v === "uk" || v === "ua" || v === "ukr" || v === "ukrainian" || v === "українська") {
    return "uk";
  }
  return "ru";
}

/** @param {NodeJS.ProcessEnv} [env] @returns {'ru' | 'uk'} */
export function resolveSiteContentLanguage(env = process.env) {
  return normalizeSiteContentLanguage(env.SOFTGEN_SITE_CONTENT_LANGUAGE ?? "ru");
}

/**
 * @param {'ru' | 'uk' | string} code
 * @returns {{
 *   code: 'ru' | 'uk';
 *   htmlLang: string;
 *   contentLabel: string;
 *   visibleTextLabel: string;
 *   roleLanguageHint: string;
 *   exampleRoles: string;
 *   ctaRegister: string;
 * }}
 */
export function getSiteContentLanguageSpec(code) {
  const lang = normalizeSiteContentLanguage(code);
  if (lang === "uk") {
    return {
      code: "uk",
      htmlLang: "uk",
      contentLabel: "українська",
      visibleTextLabel: "українського",
      roleLanguageHint: "українська",
      exampleRoles: "«Головна», «Бонуси», «Платежі»",
      ctaRegister: "Реєстрація",
    };
  }
  return {
    code: "ru",
    htmlLang: "ru",
    contentLabel: "русский",
    visibleTextLabel: "русского",
    roleLanguageHint: "русская",
    exampleRoles: "«Главная», «Бонусы», «Платежи»",
    ctaRegister: "Регистрация",
  };
}

/** Cyrillic word count for RU/UK validation in generated TSX. */
export function countCyrillicWordsInText(text) {
  const cyrillicText = String(text || "").replace(/[^А-Яа-яЁёІіЇїЄєҐґ\s]/g, " ");
  return cyrillicText.split(/\s+/).filter((w) => /[А-Яа-яЁёІіЇїЄєҐґ]/.test(w)).length;
}

/**
 * @param {ReturnType<typeof getSiteContentLanguageSpec>} spec
 * @returns {string}
 */
export function buildSiteContentLanguagePromptBlock(spec) {
  return [
    `=== МОВА КОНТЕНТУ САЙТУ ===`,
    `Усі видимі тексти (title, description, меню, hero, ProseBlock, FAQ, CTA, alt) — **${spec.contentLabel}**.`,
    `Заборонено змішувати мови та вставляти англійські фрази в користувацький текст.`,
    `Короткі підписи меню (role): ${spec.roleLanguageHint}, 1–4 слова, напр. ${spec.exampleRoles}.`,
  ].join("\n");
}
