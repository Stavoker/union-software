/**
 * ui-ux-pro-max design intelligence (vendored excerpt for Claude system layer).
 * Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
 * Adapted for Union React Lab (web + Tailwind + framer-motion).
 */

const UI_UX_PRO_MAX_WEB_RULES = `
=== UI/UX PRO MAX (design intelligence для React + Tailwind) ===

ПРІОРИТЕТИ (1→10):
1. Accessibility: контраст ≥4.5:1, focus-visible кільця, aria-labels на icon-only, keyboard nav
2. Touch: мін. зона натискання 44×44px, gap ≥8px між CTA, не покладатися лише на hover
3. Performance: WebP/AVIF, width/height або aspect-ratio на img, lazy нижче fold, CLS < 0.1
4. Style: єдиний візуальний стиль на весь сайт, SVG/vector іконки — не emoji як іконки
5. Responsive: mobile-first, viewport meta, без горизонтального скролу, clamp() для типографіки
6. Typography: base 16px, line-height 1.5–1.6, семантичні color tokens (не raw hex у кожному class)
7. Animation: 150–300ms micro-interactions, framer-motion spring/ease, prefers-reduced-motion
8. Forms: видимі labels, помилки біля поля, disabled + loading стани на кнопках
9. Navigation: передбачувана ієрархія, лівий сайдбар на desktop, компактне меню на mobile
10. iGaming: gateway CTA помітний але не агресивний; слоти компактні; hero без slot-превью

АНТИ-ПАТЕРНИ:
- Emoji як навігаційні/системні іконки
- Декоративна анімація без сенсу; анімація width/height (layout thrash)
- Placeholder-only labels у формах
- Сірий текст на сірому фоні
- Один і той самий hero/slot блок на всіх сторінках пакету

REACT + TAILWIND:
- Використовуй design tokens через Tailwind (bg-zinc-950, text-zinc-100, accent lime/emerald)
- motion.section / motion.div з initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
- @media (prefers-reduced-motion: reduce) — скороти або вимкни motion
- Секції: max-w-6xl mx-auto px-4, py-8 md:py-12, gap-6 md:gap-10
- Кнопки primary: rounded-full px-5 py-2.5 font-semibold, min-h-[44px]

ПЕРЕД ЗДАЧЕЮ (self-check):
- Контраст тексту на темному фоні достатній
- Усі інтерактивні елементи мають hover/focus/active
- Немає overflow-x на 375px viewport
- Унікальний contentAngle кожної сторінки відображений у layout секцій
`.trim();

/**
 * @param {{ theme?: string; brandName?: string; productType?: string }} [opts]
 * @returns {string}
 */
export function buildUiUxProMaxSystemBlock(opts = {}) {
  const theme = String(opts.theme || "").trim();
  const brand = String(opts.brandName || "").trim();
  const product = String(opts.productType || "iGaming entertainment").trim();
  const context = [
    theme ? `Тема/ніша: ${theme}` : "",
    brand ? `Бренд: ${brand}` : "",
    `Тип продукту: ${product}`,
  ]
    .filter(Boolean)
    .join(". ");
  return `${UI_UX_PRO_MAX_WEB_RULES}\n\nКонтекст збірки: ${context || "iGaming SPA"}`;
}

/**
 * Короткий блок для user-промпта (architect/page).
 * @param {{ pageRole?: string }} [opts]
 * @returns {string}
 */
export function buildUiUxProMaxUserHint(opts = {}) {
  const role = String(opts.pageRole || "page").trim();
  return [
    "=== DESIGN SKILL HINT ===",
    `Сторінка (${role}): застосуй ui-ux-pro-max — унікальна композиція, не шаблон-клон.`,
    "Перевір: mobile-first, contrast, touch targets, reduced-motion, без emoji-іконок.",
  ].join("\n");
}
