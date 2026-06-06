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
- SectionWithBg, HeroGradient, промо-слайдеры: только баннеры — ${bannerLines}.
- Запрещено: slot-* / game-* в hero и фоновых секциях; logo.png и favicon.png — только в chrome.
- ContentSplit: декоративное изображение в колонке (высота до ~200px), предпочтительно из баннеров.
- Максимум 2–3 секции с фоновыми/декоративными картинками на страницу.

ИКОНКИ ОПЛАТ:
- Страница «Платежи» и блок способов оплаты в footer: ${paymentLines}.
- Не используй pay-* в карусели слотов и hero.

ОБЪЁМ И КАЧЕСТВО ТЕКСТА:
- Минимум ${Number(opts.minPageWords) || 1200} слов видимого русского текста на странице (абзацы, списки, FAQ, карточки).
- Запрещены пустые секции, заглушки «текст», «описание», «Lorem ipsum», незаполненные {brand} и плейсхолдеры.
- ProseBlock: обязателен на каждой странице; на главной — минимум 2 блока; paragraphs — 3–5 абзацев по 3–5 предложений.
- Каждый блок registry (FeatureCards, ContentSplit, FaqAccordion, CtaBanner и т.д.) — с развёрнутым уникальным копирайтом (2–5 предложений в карточке, 6–8 пунктов в FAQ).
- Имя бренда «${brand}» должно встречаться в тексте естественно (не реже чем в каждой 2–3 секции).

СЛОТЫ И ВИЗУАЛ:
- На главной: slot-grid и/или game-carousel в componentIds.
- На страницах games/slots: обязательно SlotGrid или GameCarousel.
- SectionWithBg: развёрнутый body (4–6 предложений), не пустой блок.
`.trim();
}
