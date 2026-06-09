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
- Используй эти файлы ТОЛЬКО внутри #lw-games, SlotGrid, GameCarousel, SlotShowcase, SlotScrollRow, SlotFeaturedRow — не в hero, не в HeroGradient и не как полноэкранный фон.
- На главной обязательно один слот-блок (slot-grid | game-carousel | slot-showcase | slot-scroll | slot-featured) с images={GAME_IMAGE_PATHS} и gatewayHref={GATEWAY_URL}.
- Допустимые пути (пример): ${slotLines}
- Превью слотов (SlotGrid, GameCarousel): изображение на весь блок карточки, object-fit:cover; без padding и рамки внутри.
- GameCarousel: горизонтальный autoplay-слайдер с framer-motion; каждая карточка — ссылка на gateway.
- Запрещено: slot-превью в первом экране (hero); подмена src на favicon или внешние URL.

БАННЕРЫ И SPLIT-СЕКЦИИ:
- Баннеры только из: ${bannerLines}. Порядок BANNER_IMAGE_PATHS перемешивается на каждой сборке — hero берёт HERO_BANNER_INDEX или слайдер images.
- HeroGradient: split (текст + баннер сбоку) или images={BANNER_IMAGE_PATHS} для слайдера; ЗАПРЕЩЕНО bg-cover на весь hero.
- ContentSplit / SectionWithBg: один абзац рядом с картинкой, остальные ниже на всю ширину; object-cover в рамке, не full-bleed фон.
- Запрещено: slot-* / game-* в hero; logo.png и favicon.png — ТОЛЬКО в SiteLayout/SiteFooter.
- HeroGradient: title + eyebrow + subtitle (1 строка) + CTA; длинные абзацы — в ProseBlock сразу после hero.

ИКОНКИ ОПЛАТ:
- Footer и страница payments: <PaymentMethodsRow variant="inline" /> — ${paymentLines}.
- Запрещены сырые <img src="./img/pay-*"> и w-full на иконках оплат; только PaymentMethodsRow.
- Запрещены текстовые чипы «Visa», «Mastercard» вместо картинок, если pay-* есть в билде.
- Не используй pay-* в карусели слотов и hero.

LAYOUT И КНОПКИ:
- Один chrome на сайт: sidebar-left, sidebar-right, top-nav или top-nav-inline (SiteLayout). Не дублируй header и sidebar в TSX страниц.
- HOME_TEMPLATE_ID фиксирован сборщиком — порядок секций на главной не переставляй в codegen.
- Рядом с логотипом не дублируй текстовое имя бренда.
- Все CTA: className="btn-brand" без bg-* text-white на кнопках.
- ProseBlock и ContentSplit — без рамок; рамки допустимы у hero, SectionWithBg, FAQ, FeatureCards.

ОБЪЁМ И КАЧЕСТВО ТЕКСТА:
- Минимум ${Number(opts.minPageWords) || 2000} слов видимого русского текста на странице (абзацы, списки, FAQ, карточки).
- Запрещены пустые секции, заглушки «текст», «описание», «Lorem ipsum», незаполненные {brand} и плейсхолдеры.
- ProseBlock — главный носитель текста: на главной 3 блока, на внутренних 2 блока; в каждом 4–6 абзацев по 4–6 предложений.
- Каждый блок registry (FeatureCards, ContentSplit, FaqAccordion, CtaBanner и т.д.) — с развёрнутым уникальным копирайтом (3–5 предложений в карточке/абзаце).
- FAQ (faq-accordion | faq-two-column | faq-cards): items={[ { q, a }, … ]} — 6–8 пунктов; q и a строго непустые; ответ каждый 3–5 предложений; для faq-cards и faq-two-column добавь intro (1–3 предложения).
- Имя бренда «${brand}» должно встречаться в тексте естественно (не реже чем в каждой 2–3 секции).

СЛОТЫ И ВИЗУАЛ:
- На главной: один слот-блок из slot-grid | game-carousel | slot-showcase | slot-scroll | slot-featured; poster-slider для баннеров (BANNER_IMAGE_PATHS).
- Все слот-компоненты: object-cover на всю карточку. PosterSlider и ContentSplit: object-contain внутри рамки.
- games.php / slots.php: слот-блок из шаблона (один на страницу). payments.php: PaymentMethodsRow. bonus/vip/promo: визуальный hook (poster-slider / section-with-bg) в начале.
- INNER_PAGE_TEMPLATES фиксированы по file — не переставляй секции; UX: hook → ценность/доверие → prose → FAQ → CTA.
- SectionWithBg: развёрнутый body (4–6 предложений), не пустой блок.
- Анимации: framer-motion whileInView / whileHover на 4–6 секциях; чередуй poster-slider, content-split, section-with-bg между страницами.
`.trim();
}
