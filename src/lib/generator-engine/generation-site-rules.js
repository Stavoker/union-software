/**
 * Обовʼязкові правила збірки для промптів architect/page (бренд, img слотів, адаптив).
 */

/**
 * @param {{
 *   themeBrandHint?: string;
 *   gameSlotPaths?: string[];
 *   bannerImagePaths?: string[];
 *   paymentImagePaths?: string[];
 *   logoSrc?: string;
 *   sitePalette?: Record<string, string>;
 *   minPageWords?: number;
 * }} [opts]
 * @returns {string}
 */
export function buildSiteGenerationRulesBlock(opts = {}) {
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

  return `
=== ПРАВИЛА СБОРКИ САЙТА (обязательны для всех страниц) ===

БРЕНД И АЙДЕНТИКА:
- Публичное имя бренда в текстах: только «${brand}»; логотип в chrome: ${logo}.
- Палитра билда: фон ${bg}, акцент ${accent}; в pageCss согласуй кнопки, карточки и ссылки с этой палитрой.
- Не копируй чужие торговые марки из референсных статей или профиля промпта.

АДАПТИВНОСТЬ (mobile-first):
- В <head> обязательны charset и viewport width=device-width.
- Сетки: clamp(), %, minmax(); на ≤768px — одна колонка, без горизонтального скролла.
- CTA и пункты меню: зона нажатия не меньше ~44px по высоте на мобильных.
- Изображения: max-width:100%; height:auto везде, кроме блока слотов (см. ниже).

ИГРОВЫЕ ИЗОБРАЖЕНИЯ (загруженные фото = превью слотов):
- Используй эти файлы ТОЛЬКО внутри #lw-games, SlotGrid, GameCarousel и сеток слотов — не в hero, не в HeroGradient и не как полноэкранный фон.
- На главной обязательно SlotGrid или GameCarousel с images={GAME_IMAGE_PATHS} и gatewayHref={GATEWAY_URL}.
- Допустимые пути (пример): ${slotLines}
- Превью слотов: фиксированный размер ~168×112px, object-fit:cover; не растягивать на пол-экрана.
- GameCarousel: горизонтальный autoplay-слайдер с framer-motion; каждая карточка — ссылка на gateway.
- Запрещено: slot-превью в первом экране (hero); подмена src на favicon или внешние URL.

ФОНОВЫЕ ИЗОБРАЖЕНИЯ В БЛОКАХ (баннеры):
- HeroGradient, SectionWithBg: backgroundImage только из баннеров — ${bannerLines}.
- Запрещено: slot-* / game-* в hero; logo.png и favicon.png — ТОЛЬКО в SiteLayout/SiteFooter, никогда в hero/баннерах/ContentSplit.
- ContentSplit: imageSrc из BANNER_IMAGE_PATHS[n], высота до ~200px.
- HeroGradient: title + eyebrow + subtitle (1 строка) + CTA; длинные абзацы — в ProseBlock сразу после hero, не внутри hero.

ИКОНКИ ОПЛАТ:
- Footer и страница payments: <PaymentMethodsRow variant="inline" /> — ${paymentLines}.
- Запрещены сырые <img src="./img/pay-*"> и w-full на иконках оплат; только PaymentMethodsRow.
- Запрещены текстовые чипы «Visa», «Mastercard» вместо картинок, если pay-* есть в билде.
- Не используй pay-* в карусели слотов и hero.

LAYOUT И КНОПКИ:
- Навигация только в левом сайдбаре; header — только Вход/Регистрация (SiteLayout).
- Рядом с логотипом не дублируй текстовое имя бренда.
- Все CTA: className="btn-brand" без bg-* text-white на кнопках.
- ProseBlock и ContentSplit — без рамок; рамки допустимы у hero, SectionWithBg, FAQ, FeatureCards.

ОБЪЁМ И КАЧЕСТВО ТЕКСТА:
- Минимум ${Number(opts.minPageWords) || 2000} слов видимого русского текста на странице (абзацы, списки, FAQ, карточки).
- Запрещены пустые секции, заглушки «текст», «описание», «Lorem ipsum», незаполненные {brand} и плейсхолдеры.
- ProseBlock — главный носитель текста: на главной 3 блока, на внутренних 2 блока; в каждом 4–6 абзацев по 4–6 предложений.
- Каждый блок registry (FeatureCards, ContentSplit, FaqAccordion, CtaBanner и т.д.) — с развёрнутым уникальным копирайтом (3–5 предложений в карточке/абзаце).
- FaqAccordion: items={[ { q, a }, … ]} — 6–8 пунктов; q и a строго непустые; ответ каждый 3–5 предложений; пустые строки в аккордеоне недопустимы.
- Имя бренда «${brand}» должно встречаться в тексте естественно (не реже чем в каждой 2–3 секции).

СЛОТЫ И ВИЗУАЛ:
- На главной: slot-grid и/или game-carousel в componentIds.
- На страницах games/slots: обязательно SlotGrid или GameCarousel.
- SectionWithBg: развёрнутый body (4–6 предложений), не пустой блок.
`.trim();
}
