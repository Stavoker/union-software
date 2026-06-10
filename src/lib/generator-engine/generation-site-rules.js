/**
 * Обовʼязкові правила збірки для промптів architect/page (бренд, img слотів, адаптив).
 */

import { getSiteContentLanguageSpec } from "@/lib/generator-engine/generation-content-language";

function buildSharedSiteRules(opts = {}) {
  const brand = String(opts.themeBrandHint || "").trim() || "из темы и brandKit текущей сборки";
  const logo = String(opts.logoSrc || "./img/logo.png").trim();
  const slots = (Array.isArray(opts.gameSlotPaths) ? opts.gameSlotPaths : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const slotLines = slots.length
    ? slots.slice(0, 24).join(", ")
    : "только файлы слотов из списка билда (webp превью игр)";
  const banners = (Array.isArray(opts.bannerImagePaths) ? opts.bannerImagePaths : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const bannerLines = banners.length
    ? banners.slice(0, 12).join(", ")
    : "banner-* / forbanner-* из img/ (не слоты)";
  const payments = (Array.isArray(opts.paymentImagePaths) ? opts.paymentImagePaths : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  const paymentLines = payments.length
    ? payments.slice(0, 12).join(", ")
    : "pay-* из img/ (иконки Visa, Mastercard и т.д.)";
  const pal = opts.sitePalette || {};
  const accent = pal.accent || "#c8e600";
  const bg = pal.bg || "#0a0a0a";
  const minWords = Number(opts.minPageWords) || 2000;
  const contentLang = getSiteContentLanguageSpec(opts.contentLanguage);

  return {
    brand,
    logo,
    slotLines,
    bannerLines,
    paymentLines,
    accent,
    bg,
    minWords,
    header: `
=== ПРАВИЛА СБОРКИ САЙТА (обязательны для всех страниц) ===

БРЕНД И АЙДЕНТИКА:
- Публичное имя бренда в текстах: только «${brand}»; логотип в chrome: ${logo}.
- Палитра билда: фон ${bg}, акцент ${accent}.
- Не копируй чужие торговые марки из референсных статей или профиля промпта.

АДАПТИВНОСТЬ (mobile-first):
- В <head> обязательны charset и viewport width=device-width.
- Сетки: clamp(), %, minmax(); на ≤768px — одна колонка, без горизонтального скролла.
- CTA и пункты меню: зона нажатия не меньше ~44px по высоте на мобильных.

ОБЪЁМ И КАЧЕСТВО ТЕКСТА:
- Минимум ${minWords} слов видимого ${contentLang.visibleTextLabel} текста на странице.
- Запрещены пустые секции, заглушки «текст», «описание», «Lorem ipsum», незаполненные {brand}.
- Имя бренда «${brand}» должно встречаться в тексте естественно (не реже чем в каждой 2–3 секции).

ИГРОВЫЕ ПРЕВЬЮ (слоты):
- Допустимые пути: ${slotLines}
- Превью слотов: object-fit:cover на всю карточку; не в hero.
- Баннеры: ${bannerLines}

ИКОНКИ ОПЛАТ:
- ${paymentLines}
- На payments.php — блок методов оплаты с иконками pay-* (не текстовые чипы «Visa»).
`.trim(),
  };
}

function buildReactSiteGenerationRulesBlock(opts = {}) {
  const s = buildSharedSiteRules(opts);
  return `
${s.header}

ИГРОВЫЕ ИЗОБРАЖЕНИЯ (React registry):
- Только внутри SlotGrid, GameCarousel, SlotShowcase, SlotScrollRow, SlotFeaturedRow — не в HeroGradient.
- На главной: один слот-блок (slot-grid | game-carousel | slot-showcase | slot-scroll | slot-featured).

БАННЕРЫ И SPLIT:
- HeroGradient: full-bleed bg-cover фон + текст поверх; body — 3–4 абзаца через «||», каждый макс. 3 предложения (ротация); subtitle/highlights — короткие фразы через «|»; ЗАПРЕЩЁН один длинный абзац и split (текст + баннер сбоку).
- ContentSplit: картинка справа/слева по высоте первого абзаца (items-stretch), не фиксированный aspect-ratio.
- PosterSlider: full-bleed bg-cover слайдер без рамки; title, intro и CTA поверх gradient overlay; ЗАПРЕЩЕНЫ object-contain и текст вне слайдера.
- CtaBanner: backgroundImage + затемнённый overlay; текст и CTA поверх баннера.
- ContentSplit / SectionWithBg: один абзац рядом с картинкой, остальные ниже.

СЛОТЫ:
- На hover карточки слота: затемнение + кнопка «Играть» (btn-brand) — встроено в SlotGrid/GameCarousel и др.

ИКОНКИ ОПЛАТ:
- PaymentMethodsRow variant="inline"; запрещены сырые <img src="./img/pay-*">.

LAYOUT:
- Sidebar — часть flex-лейаута (sticky), не fixed поверх контента.
- Один chrome (SiteLayout); не дублируй header/sidebar в TSX страниц.
- HOME_TEMPLATE фиксирован сборщиком — порядок секций не переставляй.
- CTA: className="btn-brand".

ТЕКСТ:
- ProseBlock: на главной 3 блока, на внутренних 2; в каждом 4–6 абзацев по 4–6 предложений.
- FAQ (faq-accordion | faq-two-column | faq-cards): 6–8 пар { q, a }; ответ 3–5 предложений.

СЕКЦИИ:
- games.php / slots.php: один слот-блок. payments.php: PaymentMethodsRow.
- INNER_PAGE_TEMPLATES фиксированы по file — UX: hook → доверие → prose → FAQ → CTA.
- Анимации: framer-motion whileInView / whileHover на 4–6 секциях.
`.trim();
}

function buildPhpSiteGenerationRulesBlock(opts = {}) {
  const s = buildSharedSiteRules(opts);
  return `
${s.header}

HTML / PHP MULTIPAGE:
- Контент в <main>: семантические <section>, один <h1>, иерархия h2/h3.
- PHP_CONVERSION_TEMPLATES фиксированы сборщиком — **sectionOrder** для каждого file не меняй.
- UX-паттерн: hook (banner/spotlight) → ценность (proof/trust) → текст (story/digest) → FAQ → CTA.

СЛОТЫ (#lw-games):
- Превью только из списка билда; object-fit:cover; ссылка на gateway.
- Варианты: grid | carousel | showcase | scroll | featured (см. план шаблона).
- games.php / slots.php: блок #lw-games в начале или по sectionOrder.

FAQ:
- Варианты: accordion | two-column | cards (см. план шаблона).
- 6–8 вопросов; ответ каждый 3–5 предложений; не пустые details/summary.

СТРАНИЦЫ:
- payments.php: блок pay-ledger / иконки pay-* в начале.
- bonus.php / promo.php: визуальный hook (banner/spotlight) первым.
- vip.php: proof/trust перед длинным текстом.

SEO:
- Осмысленные <title> и meta description; canonical; alt у изображений.
- Внутренние ссылки только на файлы из пакета (./bonus.php и т.д.).
`.trim();
}

/**
 * @param {{
 *   stack?: 'react' | 'php';
 *   themeBrandHint?: string;
 *   gameSlotPaths?: string[];
 *   bannerImagePaths?: string[];
 *   paymentImagePaths?: string[];
 *   logoSrc?: string;
 *   sitePalette?: Record<string, string>;
 *   minPageWords?: number;
 *   contentLanguage?: string;
 * }} [opts]
 * @returns {string}
 */
export function buildSiteGenerationRulesBlock(opts = {}) {
  const stack = String(opts.stack || "react").trim().toLowerCase();
  if (stack === "php") {
    return buildPhpSiteGenerationRulesBlock(opts);
  }
  return buildReactSiteGenerationRulesBlock(opts);
}
