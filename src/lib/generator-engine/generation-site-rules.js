/**
 * Обовʼязкові правила збірки для промптів architect/page (бренд, img слотів, адаптив).
 */

/**
 * @param {{
 *   themeBrandHint?: string;
 *   gameSlotPaths?: string[];
 *   logoSrc?: string;
 *   sitePalette?: Record<string, string>;
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
- Используй эти файлы ТОЛЬКО внутри #lw-games, сеток слотов и слайдеров/вкладок с превью игр — не в hero и не как полноэкранный фон.
- Допустимые пути (пример): ${slotLines}
- В pageCss задай чёткие размеры превью, например:
  #lw-games img, [class*="games"] img { width:100%; max-width:168px; height:112px; min-height:112px; object-fit:cover; object-position:center; display:block; border-radius:10px; }
- Запрещено: растягивать slot-превью на половину экрана; подменять src на баннеры, favicon или чужие URL.
- Карточка слота: одна ссылка на gateway с одним <img>; без карусели с автопрокруткой.

КОНТЕНТНЫЕ КАРТИНКИ ВНЕ СЛОТОВ:
- Максимум 2–3 декоративных <img> в <main> вне #lw-games; компактные (высота превью до ~200px), не коллаж.
`.trim();
}
