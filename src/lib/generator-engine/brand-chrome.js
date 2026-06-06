/**
 * Фіксована «криптовалютна» айдентика: хедер/футер з констант і розмітки в цьому модулі
 * (єдиний chrome збірки), палітра: фон #101710, блоки #232d1b, текст #fff, акцент #ffe14a.
 */

export const BRAND_BG = "#101710";
export const BRAND_BLOCK = "#232d1b";
/** Карточки слотов, внутрішні панелі — як у класичного односторінкового Laki */
export const BRAND_CARD = "#181f15";
export const BRAND_TEXT = "#fff";
export const BRAND_ACCENT = "#ffe14a";
/** Другий колір у градієнтах promo/seo (узгоджено з палітрою BRAND_*) */
export const BRAND_GRAD_END = "#2e3a22";
export const BRAND_BTN_REG = "#c8232c";
export const BRAND_BTN_REG_HOVER = "#e03a3a";

/** Базовий gateway без per-build суфіксів; для зовнішніх модулів залишається сумісним ім’ям. */
export const DEFAULT_GATEWAY_URL =
  "https://laki-gateway4.com/ru/signup?faff=117&sub=glbranpr";

/** @deprecated Використовуйте `resolveGatewayUrlForBuild` у збірці multipage; константа = DEFAULT. */
export const GATEWAY_URL = DEFAULT_GATEWAY_URL;

/** Fallback, якщо в `img/` немає жодного файлу (legacy imgGen). */
export const LAKI_LOGO_IMG_SRC = "./img/logo.png";

/** Кандидати логотипу в порядку пріоритету (перший наявний у `img/` проєкту). */
export const BRAND_LOGO_FILENAME_CANDIDATES = [
  "logo.png",
  "logo.webp",
  "logo.jpg",
  "Logo.png",
];

/**
 * Повний URL реєстрації для конкретного білда: env `AURORA_GATEWAY_URL` / `NEXT_PUBLIC_AURORA_GATEWAY_URL`
 * або DEFAULT; за замовчуванням додається стабільний query `sid` (хеш від slug+nonce), щоб URL не збігався байт-в-байт між сайтами.
 * Вимкнути диверсифікацію: `AURORA_GATEWAY_DIVERSIFY=0`.
 */
export function resolveGatewayUrlForBuild(opts = {}) {
  const raw =
    String(
      process.env.AURORA_GATEWAY_URL ||
        process.env.NEXT_PUBLIC_AURORA_GATEWAY_URL ||
        DEFAULT_GATEWAY_URL
    ).trim() || DEFAULT_GATEWAY_URL;
  const diversify = String(process.env.AURORA_GATEWAY_DIVERSIFY ?? "1").trim() !== "0";
  if (!diversify) return raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  const seed = `${String(opts.projectSlug || "")}|${String(opts.buildNonce || "")}`;
  const h = hashString(seed).toString(16).slice(0, 10);
  if (!u.searchParams.has("sid")) {
    u.searchParams.set("sid", h);
  }
  return u.toString();
}

/**
 * Шлях до логотипу для білда: перший файл з пулу, що є в `imageFiles` (імена без ./img/).
 */
export function pickLogoSrcForBuild(imageFiles, seedStr) {
  const normalized = (Array.isArray(imageFiles) ? imageFiles : []).map((f) =>
    String(f || "")
      .replace(/^\.\/img\//, "")
      .trim()
  );
  if (!normalized.length) return LAKI_LOGO_IMG_SRC;

  const isLakiAsset = (name) => /laki/i.test(String(name || ""));

  for (const candidate of BRAND_LOGO_FILENAME_CANDIDATES) {
    if (candidate && normalized.includes(candidate)) {
      return `./img/${candidate}`;
    }
  }

  const logoLike = normalized.find(
    (n) => /logo/i.test(n) && !isLakiAsset(n)
  );
  if (logoLike) return `./img/${logoLike}`;

  const safe = normalized.filter((n) => n && !isLakiAsset(n));
  const pool = safe.length ? safe : normalized;
  const idx = hashString(String(seedStr || "logo")) % pool.length;
  return `./img/${pool[idx]}`;
}

/**
 * Офіційний пул прев'ю для сітки #lw-games (клади файли в `src/img-gen/` — копіюються в `img/` проєкту).
 * Порядок зберігається; у білді беруться лише ті імена, які реально є в `imageFiles`.
 */
export const CANONICAL_SLOT_GAME_FILENAMES = [
  "gates-of-olympus-1000.webp",
  "sugar-rush-1000.webp",
  "starlight-princess-by-pragmaticplay.webp",
  "big-bass-bonanza.webp",
  "the-dog-house.webp",
  "wanted-dead-or-a-wild.webp",
  "book-of-darius.webp",
  "aviator.webp",
  "zeus-vs-hades-gods-of-war.webp",
  "hot-fruits-100.webp",
  "gemix-100.webp",
  "sakura-riches-60.webp",
  "coin-up-hot-fire.webp",
  "rocket-wins.webp",
  "clover-islands.webp",
  "buffalo-power-hold-n-win.webp",
  "majestic-coins.webp",
  "lava-coins.webp",
  "lucky-penny.webp",
  "le-bandit.webp",
  "shining-crown.webp",
  "sun_of_egypt_3.webp",
  "3-pots-of-egypt.webp",
];

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Два рядки логотипу (як LAKI / WORLD). */
export function formatLogoLines(brandName) {
  const raw = String(brandName || "CASINO")
    .trim()
    .replace(/\s+/g, " ");
  const words = raw.split(" ").filter(Boolean);
  if (words.length >= 2) {
    const a = words[0].toUpperCase().replace(/[^A-ZА-ЯЁІЇЄ0-9-]/gi, "").slice(0, 14) || "BRAND";
    const b = words[1].toUpperCase().replace(/[^A-ZА-ЯЁІЇЄ0-9-]/gi, "").slice(0, 14) || "CLUB";
    return [a, b];
  }
  const one = (words[0] || "CASINO").toUpperCase().replace(/[^A-ZА-ЯЁІЇЄ0-9-]/gi, "").slice(0, 12);
  return [one || "CASINO", "ONLINE"];
}

const NAV_LABEL_SETS = [
  ["Сайт", "Зеркало", "Регистрация", "Игры", "VIP"],
  ["Главная", "Пополнение", "Аккаунт", "Слоты", "Промо"],
  ["Обзор", "Касса", "Профиль", "Каталог", "Клуб"],
  ["Старт", "Доступ", "Открыть счет", "Линия игр", "Премиум"],
  ["Разделы", "Актуальное зеркало", "Играть", "Каталог игр", "Привилегии"],
  ["Навигация", "Резервный вход", "Создать профиль", "Слоты и live", "Акции"],
  ["О сервисе", "Стабильный доступ", "Регистрация", "Игровой зал", "VIP-статус"],
];

const CTA_PRIMARY_POOL = [
  "Регистрация",
  "Создать аккаунт",
  "Играть",
  "Открыть счёт",
  "Регистрация сейчас",
];

const CTA_SECONDARY_POOL = [
  "Вход",
  "Кабинет",
  "Войти",
  "Личный кабинет",
];

function hashString(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function safeIndex(n, size) {
  const s = Math.max(1, Number(size) || 1);
  const x = Number(n) || 0;
  return ((x % s) + s) % s;
}

/** Фіксований каркас шапки як у референс-білдах (lw-*): v7, підкреслення меню, split-кнопки, «Регистрация» / «Вход». */
const REFERENCE_LAKI_HEADER_SHELL = {
  id: "v7",
  navStyle: "underline",
  buttonStyle: "split",
  navOrder: [3, 4, 0, 1, 2],
};

export function pickBrandChromeVariant(seedInput) {
  const seed = hashString(seedInput);
  const labels =
    NAV_LABEL_SETS[safeIndex(seed >>> 3, NAV_LABEL_SETS.length)];
  return {
    ...REFERENCE_LAKI_HEADER_SHELL,
    navLabels: labels,
    ctaPrimary: CTA_PRIMARY_POOL[safeIndex(seed >>> 5, CTA_PRIMARY_POOL.length)],
    ctaSecondary: CTA_SECONDARY_POOL[safeIndex(seed >>> 7, CTA_SECONDARY_POOL.length)],
  };
}

function normalizeVariant(input) {
  const fallback = pickBrandChromeVariant("default");
  const src = input && typeof input === "object" ? input : {};
  const navOrder = Array.isArray(src.navOrder) ? src.navOrder : fallback.navOrder;
  const navLabels =
    Array.isArray(src.navLabels) && src.navLabels.length >= 1
      ? src.navLabels
      : fallback.navLabels;
  return {
    id: String(src.id || fallback.id),
    navStyle: String(src.navStyle || fallback.navStyle),
    buttonStyle: String(src.buttonStyle || fallback.buttonStyle),
    navOrder,
    navLabels,
    ctaPrimary: String(src.ctaPrimary || fallback.ctaPrimary),
    ctaSecondary: String(src.ctaSecondary || fallback.ctaSecondary),
  };
}

const DEFAULT_HEADER_LINKS = [
  { href: "/", fallback: "Главная" },
  { href: "payments.php", fallback: "Зеркало" },
  { href: "registration.php", fallback: "Регистрация" },
  { href: "reviews.php", fallback: "Отзывы" },
  { href: "bonus.php", fallback: "Бонусы" },
];

const CHROME_HEADER_SKIN_COUNT = 5;
const CHROME_FOOTER_SKIN_COUNT = 5;

function clampChromeSkin(n, max) {
  const x = Math.trunc(Number(n)) || 0;
  const m = Math.max(1, max);
  return ((x % m) + m) % m;
}

/**
 * Варіативність chrome між білдами: інколи без gateway-кнопок у шапці; інколи без логотипа у футері.
 * Логотип у шапці та внутрішні посилання в меню завжди (коли шапка увімкнена).
 */
/** Як у референс lw-*: завжди кнопки gateway у шапці та логотип у футері. */
export function pickChromeHeaderFooterOptions(_seedInput) {
  return {
    headerShowGatewayCtas: true,
    footerShowLogo: true,
  };
}

export function buildBrandHeaderHtml(
  variant,
  navLinks,
  headerSkin = 0,
  opts = null
) {
  const cfg = normalizeVariant(variant);
  const sk = clampChromeSkin(headerSkin, CHROME_HEADER_SKIN_COUNT);
  const showGatewayCtas = opts?.headerShowGatewayCtas !== false;
  const gatewayHref =
    String(opts?.gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL;
  const logoSrc =
    String(opts?.logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const logoAlt = escapeHtml(
    String(opts?.brandAlt || opts?.brandName || "Логотип").trim() || "Логотип"
  );
  const navItems = buildOrderedNavEntries(variant, navLinks).map(
    (e) =>
      `<a href="${e.href}" class="lw-nav-link">${escapeHtml(e.label)}</a>`
  );
  const innerExtra = showGatewayCtas ? "" : " lw-header-inner--no-cta";
  const actionsHtml = showGatewayCtas
    ? `<div class="lw-header-actions">
      <a href="${escapeHtml(gatewayHref)}" class="lw-btn lw-btn-reg lw-btn--${cfg.buttonStyle}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(cfg.ctaPrimary)}</a>
      <a href="${escapeHtml(gatewayHref)}" class="lw-btn lw-btn-login lw-btn--${cfg.buttonStyle}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(cfg.ctaSecondary)}</a>
    </div>`
    : "";

  return `<header class="lw-header lw-header--sk${sk}">
  <div class="lw-header-inner lw-header-inner--${cfg.id} lw-header-inner--sk${sk}${innerExtra}">
    <a href="index.php" class="lw-logo" aria-label="Главная">
      <img src="${escapeHtml(logoSrc)}" alt="${logoAlt}" class="lw-logo-img">
    </a>
    <nav class="lw-nav lw-nav--${cfg.navStyle}" aria-label="Основное меню">${navItems.join("")}</nav>
    ${actionsHtml}
  </div>
</header>`;
}

function buildHeaderNavHtml(variant, navLinks) {
  return buildOrderedNavEntries(variant, navLinks)
    .map((e) => `<a href="${e.href}" class="lw-nav-link">${escapeHtml(e.label)}</a>`)
    .join("");
}

/**
 * 10 спільних preset-шапок для обох еталонів (bet162/spot064).
 * Вибір preset робиться на рівні сайту і не змінюється між сторінками.
 */
export function buildSharedTemplateHeaderHtml({
  presetId = 1,
  templateId = "bet162",
  variant,
  navLinks,
  gatewayUrl = DEFAULT_GATEWAY_URL,
  logoSrc = LAKI_LOGO_IMG_SRC,
  brandAlt = "Логотип",
  ctaPrimary = "Регистрация",
  ctaSecondary = "Вход",
}) {
  const id = Math.max(1, Math.min(10, Number(presetId) || 1));
  const cfg = normalizeVariant(variant);
  const nav = buildHeaderNavHtml(cfg, navLinks);
  const gtw = escapeHtml(String(gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL);
  const logo = escapeHtml(String(logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC);
  const alt = escapeHtml(String(brandAlt || "Логотип").trim() || "Логотип");
  const ctaA = escapeHtml(String(ctaPrimary || cfg.ctaPrimary || "Регистрация"));
  const ctaB = escapeHtml(String(ctaSecondary || cfg.ctaSecondary || "Вход"));
  const tpl = String(templateId || "bet162").toLowerCase() === "spot064" ? "spot064" : "bet162";
  const cls = `lw-hp lw-hp-${id} lw-hp-${tpl}`;

  const ctas = `<div class="lw-header-actions">
    <a href="${gtw}" class="lw-btn lw-btn-reg" target="_blank" rel="noopener noreferrer nofollow">${ctaA}</a>
    <a href="${gtw}" class="lw-btn lw-btn-login" target="_blank" rel="noopener noreferrer nofollow">${ctaB}</a>
  </div>`;

  const logoBlock = `<a href="index.php" class="lw-logo" aria-label="Главная">
    <img src="${logo}" alt="${alt}" class="lw-logo-img">
  </a>`;

  const navBlock = `<nav class="lw-nav lw-nav--${cfg.navStyle}" aria-label="Основное меню">${nav}</nav>`;

  const betBodies = {
    1: `<div class="lw-header-inner">${logoBlock}${navBlock}${ctas}</div>`,
    2: `<div class="lw-header-inner"><div class="lw-hp-topline"><span class="lw-hp-tag">Official</span><span class="lw-hp-dot">•</span><span class="lw-hp-tag">Secure access</span></div>${logoBlock}${navBlock}${ctas}</div>`,
    3: `<div class="lw-header-inner"><div class="lw-hp-left">${logoBlock}</div><div class="lw-hp-center">${navBlock}</div><div class="lw-hp-right">${ctas}</div></div>`,
    4: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-stacked">${navBlock}${ctas}</div></div>`,
    5: `<div class="lw-header-inner"><div class="lw-hp-rail">${logoBlock}<span class="lw-hp-rail-text">Игровой портал</span></div>${navBlock}${ctas}</div>`,
    6: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-chipline"><span class="lw-hp-chip">24/7</span><span class="lw-hp-chip">VIP</span><span class="lw-hp-chip">Fast payout</span></div>${navBlock}${ctas}</div>`,
    7: `<div class="lw-header-inner">${logoBlock}${ctas}${navBlock}</div>`,
    8: `<div class="lw-header-inner"><div class="lw-hp-double">${logoBlock}${navBlock}</div>${ctas}</div>`,
    9: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-search-shell"><button type="button" class="lw-hp-search-btn" aria-label="Поиск">⌕</button></div>${navBlock}${ctas}</div>`,
    10:`<div class="lw-header-inner"><div class="lw-hp-marquee"><span>Live</span><span>Slots</span><span>Tournaments</span></div>${logoBlock}${navBlock}${ctas}</div>`,
  };
  const spotBodies = {
    1: `<div class="lw-header-inner"><div class="lw-hp-topline"><span class="lw-hp-tag">Rail mode</span></div>${logoBlock}${navBlock}${ctas}</div>`,
    2: `<div class="lw-header-inner"><div class="lw-hp-left">${logoBlock}</div><div class="lw-hp-center">${navBlock}</div><div class="lw-hp-right">${ctas}</div></div>`,
    3: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-stacked">${ctas}${navBlock}</div></div>`,
    4: `<div class="lw-header-inner"><div class="lw-hp-marquee"><span>Navigation</span><span>Quick links</span></div>${logoBlock}${navBlock}${ctas}</div>`,
    5: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-chipline"><span class="lw-hp-chip">Mirror</span><span class="lw-hp-chip">Cashout</span><span class="lw-hp-chip">VIP</span></div>${navBlock}${ctas}</div>`,
    6: `<div class="lw-header-inner">${logoBlock}${ctas}${navBlock}</div>`,
    7: `<div class="lw-header-inner"><div class="lw-hp-double">${logoBlock}${ctas}</div>${navBlock}</div>`,
    8: `<div class="lw-header-inner">${logoBlock}<div class="lw-hp-search-shell"><button type="button" class="lw-hp-search-btn" aria-label="Поиск">⌕</button></div>${ctas}${navBlock}</div>`,
    9: `<div class="lw-header-inner"><div class="lw-hp-rail">${logoBlock}<span class="lw-hp-rail-text">Rail-ready</span></div>${ctas}${navBlock}</div>`,
    10:`<div class="lw-header-inner"><div class="lw-hp-topline"><span class="lw-hp-tag">Spot</span><span class="lw-hp-dot">•</span><span class="lw-hp-tag">Template</span></div>${logoBlock}${ctas}${navBlock}</div>`,
  };
  const bodies = tpl === "spot064" ? spotBodies : betBodies;
  return `<header class="lw-header ${cls}">${bodies[id]}</header>`;
}

/**
 * Лівий rail для шаблону spot064 (u-spot064): <aside class="lw-site-rail">, не top-header.
 */
export function buildSharedTemplateSiteRailHtml({
  presetId = 1,
  variant,
  navLinks,
  gatewayUrl = DEFAULT_GATEWAY_URL,
  logoSrc = LAKI_LOGO_IMG_SRC,
  brandAlt = "Логотип",
  ctaPrimary = "Регистрация",
  activeNavKey = "index",
}) {
  const id = Math.max(1, Math.min(10, Number(presetId) || 1));
  const cfg = normalizeVariant(variant);
  const entries = buildOrderedNavEntries(cfg, navLinks);
  const gtw = escapeHtml(
    String(gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL
  );
  const logo = escapeHtml(String(logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC);
  const alt = escapeHtml(String(brandAlt || "Логотип").trim() || "Логотип");
  const cta = escapeHtml(String(ctaPrimary || cfg.ctaPrimary || "Регистрация"));
  const active = String(activeNavKey || "index").trim() || "index";
  const navItems = entries
    .map((e) => {
      const href = String(e.href || "").trim();
      const key =
        href === "/" || href === "index.php" || href === "./index.php"
          ? "index"
          : href.replace(/^\.\//, "").replace(/\.php$/i, "") || "page";
      const isActive = key === active;
      const cls = `lw-site-rail__link${isActive ? " is-active" : ""}`;
      const aria = isActive ? ' aria-current="page"' : "";
      return `<a href="${escapeHtml(href === "/" ? "./index.php" : href.startsWith("./") ? href : `./${href.replace(/^\.\//, "")}`)}" class="${cls}"${aria}><span class="lw-site-rail__link-label">${escapeHtml(e.label)}</span></a>`;
    })
    .join("\n      ");
  const secondaryHref = entries[1]
    ? escapeHtml(
        entries[1].href === "/"
          ? "./index.php"
          : entries[1].href.startsWith("./")
            ? entries[1].href
            : `./${String(entries[1].href).replace(/^\.\//, "")}`
      )
    : "./index.php";
  return `<aside class="lw-site-rail lw-rail-p${id}" id="site-rail" aria-label="Навигация сайта">
  <a class="lw-site-rail__logo" href="./index.php" aria-label="${alt} — на главную">
    <img src="${logo}" alt="${alt}" class="lw-logo-img lw-site-rail__logo-img">
  </a>
  <nav class="lw-site-rail__nav" aria-label="Основное меню">
      ${navItems}
  </nav>
  <div class="lw-site-rail__bottom">
    <a class="lw-site-rail__cta" href="${gtw}" target="_blank" rel="noopener noreferrer nofollow">${cta}</a>
    <a class="lw-site-rail__secondary" href="${secondaryHref}">Касса</a>
  </div>
</aside>`;
}

export function buildBrandFooterHtml({
  brandName,
  variant,
  footerLinks,
  footerSkin = 0,
  showFooterLogo = true,
  logoSrc = LAKI_LOGO_IMG_SRC,
}) {
  const cfg = normalizeVariant(variant);
  const sk = clampChromeSkin(footerSkin, CHROME_FOOTER_SKIN_COUNT);
  const y = new Date().getFullYear();
  const brand = escapeHtml(String(brandName || "Казино").trim());
  const logoImg = String(logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const fl =
    Array.isArray(footerLinks) && footerLinks.length >= 3
      ? footerLinks.slice(0, 3)
      : [
          { href: "index.php", label: cfg.navLabels[0] || "Главная" },
          { href: "reviews.php", label: "Отзывы игроков" },
          { href: "registration.php", label: cfg.navLabels[2] || "Условия" },
        ];
  const linkLine = fl
    .map(
      (item, i) =>
        `${i ? '<span class="lw-footer-sep">|</span>\n      ' : ""}<a href="${String(item.href)}">${escapeHtml(String(item.label || "Раздел"))}</a>`
    )
    .join("\n      ");
  const logoBlock = showFooterLogo
    ? `<div class="lw-footer-brand" aria-hidden="true">
      <img src="${escapeHtml(logoImg)}" alt="${brand}" class="lw-footer-logo">
    </div>`
    : "";
  const footerMod = showFooterLogo ? "" : " lw-footer--no-logo";
  const innerMod = showFooterLogo ? "" : " lw-footer-inner--no-logo";

  return `<footer class="lw-footer lw-footer--sk${sk}${footerMod}" id="lw-contact">
  <div class="lw-footer-inner lw-footer-inner--sk${sk}${innerMod}">
    ${logoBlock}
    <div class="lw-footer-links">
      ${linkLine}
    </div>
    <p class="lw-footer-copy">© ${y} ${brand}. Все права защищены.</p>
  </div>
</footer>
<div class="lw-quick-btns" aria-label="Быстрые действия">
  <button type="button" class="lw-quick-btn lw-quick-up" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="Вверх">
    <svg class="lw-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5l-7 7h4v7h6v-7h4z"/></svg>
    Вверх
  </button>
  <button type="button" class="lw-quick-btn lw-quick-mail" onclick="document.getElementById('lw-contact')?.scrollIntoView({behavior:'smooth'})" title="Связаться">
    <svg class="lw-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 6.5a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5v-11zm-2.5-1a1.5 1.5 0 0 1 1.5 1.5v.379l-8 5.333-8-5.333V7a1.5 1.5 0 0 1 1.5-1.5h13zm1.5 12.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V9.121l7.47 4.98a1 1 0 0 0 1.06 0L20 9.121V18.5z"/></svg>
    Связаться
  </button>
</div>`;
}

/**
 * 10 спільних preset-підвалів для обох еталонів; включає платіжні іконки і коротку ліцензію.
 */
export function buildSharedTemplateFooterHtml({
  presetId = 1,
  templateId = "bet162",
  brandName,
  variant,
  footerLinks,
  logoSrc = LAKI_LOGO_IMG_SRC,
  showFooterLogo = true,
}) {
  const id = Math.max(1, Math.min(10, Number(presetId) || 1));
  const tpl = String(templateId || "bet162").toLowerCase() === "spot064" ? "spot064" : "bet162";
  const cfg = normalizeVariant(variant);
  const y = new Date().getFullYear();
  const brand = escapeHtml(String(brandName || "Казино").trim());
  const logoImg = String(logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const fl =
    Array.isArray(footerLinks) && footerLinks.length >= 3
      ? footerLinks.slice(0, 4)
      : [
          { href: "index.php", label: cfg.navLabels[0] || "Главная" },
          { href: "reviews.php", label: "Отзывы игроков" },
          { href: "registration.php", label: cfg.navLabels[2] || "Условия" },
          { href: "payments.php", label: "Платежи" },
        ];
  const links = fl
    .map((item) => `<a href="${String(item.href)}">${escapeHtml(String(item.label || "Раздел"))}</a>`)
    .join('<span class="lw-footer-sep">|</span>');

  const pay = `<div class="lw-payments">
    <span class="lw-pay-chip">VISA</span>
    <span class="lw-pay-chip">Mastercard</span>
    <span class="lw-pay-chip">Skrill</span>
    <span class="lw-pay-chip">Neteller</span>
    <span class="lw-pay-chip">Crypto</span>
  </div>`;
  const license = `<p class="lw-license-note">18+ Licensed operator. Play responsibly.</p>`;
  const logoBlock = showFooterLogo
    ? `<div class="lw-footer-brand"><img src="${escapeHtml(logoImg)}" alt="${brand}" class="lw-footer-logo"></div>`
    : "";

  const betShells = {
    1: `${logoBlock}<div class="lw-footer-links">${links}</div>${pay}${license}`,
    2: `${pay}<div class="lw-footer-links">${links}</div>${logoBlock}${license}`,
    3: `<div class="lw-footer-grid-a">${logoBlock}<div>${pay}${license}</div><div class="lw-footer-links">${links}</div></div>`,
    4: `<div class="lw-footer-grid-b"><div class="lw-footer-links">${links}</div>${pay}</div>${logoBlock}${license}`,
    5: `${logoBlock}<div class="lw-footer-stack">${links}${pay}${license}</div>`,
    6: `<div class="lw-footer-banner">Secure Payments</div>${logoBlock}${pay}<div class="lw-footer-links">${links}</div>${license}`,
    7: `${logoBlock}<div class="lw-footer-links">${links}</div><div class="lw-footer-inline">${pay}${license}</div>`,
    8: `<div class="lw-footer-mix">${pay}<div class="lw-footer-links">${links}</div>${logoBlock}</div>${license}`,
    9: `<div class="lw-footer-compact">${logoBlock}<div class="lw-footer-links">${links}</div></div>${pay}${license}`,
    10:`<div class="lw-footer-elevated">${logoBlock}${pay}<div class="lw-footer-links">${links}</div>${license}</div>`,
  };
  const spotShells = {
    1: `${pay}<div class="lw-footer-links">${links}</div>${logoBlock}${license}`,
    2: `<div class="lw-footer-grid-b">${logoBlock}<div>${pay}</div></div><div class="lw-footer-links">${links}</div>${license}`,
    3: `${logoBlock}<div class="lw-footer-inline">${links}${pay}</div>${license}`,
    4: `<div class="lw-footer-elevated">${pay}<div class="lw-footer-links">${links}</div>${license}</div>${logoBlock}`,
    5: `<div class="lw-footer-mix"><div class="lw-footer-links">${links}</div>${pay}</div>${logoBlock}${license}`,
    6: `${logoBlock}<div class="lw-footer-banner">Trusted payouts</div>${pay}<div class="lw-footer-links">${links}</div>${license}`,
    7: `<div class="lw-footer-grid-a">${pay}<div class="lw-footer-links">${links}</div>${logoBlock}</div>${license}`,
    8: `${logoBlock}<div class="lw-footer-stack">${pay}${links}${license}</div>`,
    9: `<div class="lw-footer-compact">${logoBlock}${pay}</div><div class="lw-footer-links">${links}</div>${license}`,
    10:`<div class="lw-footer-elevated">${logoBlock}${pay}<div class="lw-footer-links">${links}</div>${license}</div>`,
  };
  const shells = tpl === "spot064" ? spotShells : betShells;

  return `<footer class="lw-footer lw-fp lw-fp-${id} lw-fp-${tpl}" id="lw-contact">
  <div class="lw-footer-inner">${shells[id]}</div>
  <p class="lw-footer-copy">© ${y} ${brand}. Все права защищены.</p>
</footer>`;
}

function buildSharedTemplateChromePresetCss() {
  return `
.lw-hp .lw-header-inner { gap: 12px; }
.lw-hp-topline { width: 100%; display: flex; gap: 8px; font-size: 11px; opacity: .78; }
.lw-hp-left, .lw-hp-center, .lw-hp-right { display: flex; align-items: center; }
.lw-hp-center { flex: 1 1 auto; justify-content: center; }
.lw-hp-stacked { flex: 1 1 auto; display: grid; gap: 10px; }
.lw-hp-rail { display: flex; align-items: center; gap: 10px; }
.lw-hp-chipline { display: flex; flex-wrap: wrap; gap: 8px; }
.lw-hp-chip { border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 4px 10px; font-size: 11px; }
.lw-hp-double { display: grid; gap: 10px; flex: 1 1 auto; }
.lw-hp-search-shell { display: flex; align-items: center; }
.lw-hp-search-btn { border: 1px solid rgba(255,255,255,.25); background: transparent; color: #fff; border-radius: 999px; width: 34px; height: 34px; cursor: pointer; }
.lw-hp-marquee { display: flex; gap: 10px; font-size: 11px; opacity: .84; }

.lw-fp .lw-footer-inner { gap: 12px; }
.lw-payments { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 8px 0; }
.lw-pay-chip { border: 1px solid rgba(255,255,255,.2); border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; color: var(--lw-accent, #ffe14a); }
.lw-license-note { font-size: 12px; opacity: .78; margin: 8px 0 0; }
.lw-footer-grid-a { display: grid; grid-template-columns: auto 1fr 1fr; gap: 12px; align-items: center; }
.lw-footer-grid-b { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
.lw-footer-stack { display: grid; gap: 10px; }
.lw-footer-inline { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: center; }
.lw-footer-mix { display: grid; gap: 10px; }
.lw-footer-compact { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: center; }
.lw-footer-elevated { border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 12px; }
@media (max-width: 900px) {
  .lw-footer-grid-a, .lw-footer-grid-b { grid-template-columns: 1fr; }
}
`;
}

/** Додаткові розкладки хедера/футера (логотип той самий файл, що й завжди). */
function buildChromeLayoutSkinCss(headerSkin, footerSkin) {
  const h = clampChromeSkin(headerSkin, CHROME_HEADER_SKIN_COUNT);
  const f = clampChromeSkin(footerSkin, CHROME_FOOTER_SKIN_COUNT);
  return `
/* Chrome layout skins — header sk${h}, footer sk${f} */
/* sk1: один ряд на широкому екрані (лого — меню — кнопки); перенос лише вузько */
.lw-header-inner--sk1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 14px;
}
.lw-header-inner--sk1 .lw-logo {
  flex: 0 0 auto;
}
.lw-header-inner--sk1 .lw-nav {
  flex: 1 1 200px;
  justify-content: center;
  min-width: 0;
}
.lw-header-inner--sk1 .lw-header-actions {
  flex: 0 0 auto;
  margin-left: auto;
}
.lw-header-inner--sk1.lw-header-inner--no-cta .lw-nav {
  justify-content: flex-end;
}
@media (max-width: 900px) {
  .lw-header-inner--sk1 .lw-nav {
    flex-basis: 100%;
    justify-content: flex-start;
  }
  .lw-header-inner--sk1.lw-header-inner--no-cta .lw-nav {
    justify-content: flex-start;
  }
}
.lw-header-inner--sk2 {
  gap: 10px;
}
.lw-header-inner--sk2 .lw-nav {
  flex: 1 1 auto;
  justify-content: flex-end;
  flex-wrap: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  gap: 6px;
}
.lw-header-inner--sk2 .lw-logo-img { height: 40px; }
.lw-header-inner--sk3 {
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.lw-header-inner--sk3 .lw-logo { order: 1; }
.lw-header-inner--sk3 .lw-header-actions { order: 2; }
.lw-header-inner--sk3 .lw-nav {
  order: 3;
  flex: 1 1 200px;
  justify-content: flex-end;
  min-width: 0;
}
.lw-header-inner--sk3.lw-header-inner--no-cta .lw-nav {
  order: 2;
  justify-content: flex-end;
}
/* sk4: один ряд лого — навігація — кнопки (як класичний Laki), без «опущеної» другої смуги */
.lw-header-inner--sk4 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 14px;
}
.lw-header-inner--sk4 .lw-logo {
  flex: 0 0 auto;
}
.lw-header-inner--sk4 .lw-nav {
  flex: 1 1 200px;
  justify-content: center;
  order: 0;
  min-width: 0;
}
.lw-header-inner--sk4 .lw-header-actions {
  flex: 0 0 auto;
  margin-left: auto;
}
@media (max-width: 900px) {
  .lw-header-inner--sk4 .lw-nav {
    order: 3;
    flex-basis: 100%;
    justify-content: flex-start;
  }
}

.lw-footer-inner--sk1 {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  gap: 16px;
}
.lw-footer-inner--sk1 .lw-footer-brand { margin: 0; flex: 0 0 auto; }
.lw-footer-inner--sk1 .lw-footer-logo { max-width: 140px; }
.lw-footer-inner--sk1 .lw-footer-links { margin: 0; flex: 1 1 220px; text-align: right; }
.lw-footer-inner--sk1 .lw-footer-copy { width: 100%; text-align: center; margin-top: 6px; }

.lw-footer-inner--sk2 {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.lw-footer-inner--sk2 .lw-footer-brand { order: 1; margin-bottom: 6px; }
.lw-footer-inner--sk2 .lw-footer-copy { order: 2; margin: 0 0 12px; }
.lw-footer-inner--sk2 .lw-footer-links { order: 3; }

.lw-footer--sk3 .lw-footer-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.lw-footer--sk3 .lw-footer-sep { display: none; }

.lw-footer--sk4 {
  border-top-width: 6px;
  border-top-style: double;
  padding-top: 32px;
}
.lw-footer-inner--sk4 .lw-footer-logo { max-width: 190px; }
.lw-footer-inner--sk4 .lw-footer-links { font-size: 0.92rem; letter-spacing: 0.03em; }
`;
}

/**
 * Базові стилі контенту: на всю ширину, оформлені таблиці, легкі анімації.
 * @param {{ fixedHeader?: boolean, mainPadExtra?: number }} [opts]
 */
export function buildSiteEnhancementCss(opts = {}) {
  const fixedHeader = Boolean(opts.fixedHeader);
  const mainPadExtra = Number(opts.mainPadExtra) || 0;
  const headerPad = fixedHeader
    ? `padding-top: calc(var(--lw-header-h, 72px) + 18px + ${mainPadExtra}px);`
    : "padding-top: clamp(20px, 3vw, 36px);";

  return `
/* site enhancement: full-width layout, tables, motion */
main {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  margin: 0;
  ${headerPad}
  padding-left: clamp(16px, 3.5vw, 48px);
  padding-right: clamp(16px, 3.5vw, 48px);
  padding-bottom: clamp(40px, 6vw, 72px);
}

main p,
main li,
main blockquote,
main .lead,
main [class*="lead"] {
  line-height: 1.68;
  margin: 0 0 1rem;
  max-width: none;
}

main h1,
main h2,
main h3,
main h4 {
  line-height: 1.22;
  margin: 0 0 0.75rem;
}

main img {
  max-width: 100%;
  height: auto;
}

main > section:not(#lw-games) img {
  max-height: min(42vh, 360px);
  width: auto;
  max-width: 100%;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  margin: 0.75rem 0;
}

main > section,
main > article {
  margin-bottom: clamp(1.25rem, 2.5vw, 2rem);
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  box-sizing: border-box;
}

main > section > div[class*="container"],
main > section > div[class*="wrapper"],
main > section > div[class*="inner"],
main > section > div[class*="content"] {
  max-width: none;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

main table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 1.25rem 0 1.75rem;
  font-size: clamp(0.82rem, 1.6vw, 0.95rem);
  background: color-mix(in srgb, var(--lw-block, #232d1b) 58%, transparent);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.38);
}

main table thead th,
main table tr:first-child th {
  background: color-mix(in srgb, var(--lw-accent, #ffe14a) 20%, var(--lw-block, #232d1b));
  color: var(--lw-text, #fff);
  font-weight: 700;
  text-align: left;
  padding: 14px 16px;
  border-bottom: 2px solid color-mix(in srgb, var(--lw-accent, #ffe14a) 42%, transparent);
}

main table td,
main table th {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  vertical-align: top;
}

main table tbody tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.035);
}

main table tbody tr:hover td {
  background: color-mix(in srgb, var(--lw-accent, #ffe14a) 10%, transparent);
  transition: background 0.22s ease;
}

main table tbody tr:last-child td {
  border-bottom: none;
}

@media (max-width: 720px) {
  main table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

@keyframes site-fade-up {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

main > section.reveal-on-scroll,
main > article.reveal-on-scroll {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.45s ease, transform 0.45s ease;
}

main > section.reveal-on-scroll.is-visible,
main > article.reveal-on-scroll.is-visible {
  opacity: 1;
  transform: translateY(0);
}

main > section:not(.reveal-on-scroll) {
  animation: site-fade-up 0.45s ease both;
}

main a:not(.lw-btn):not([class*="btn"]) {
  transition: color 0.2s ease, opacity 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  main > section,
  main > article {
    animation: none;
  }
}
`;
}

/** Сітка слотів, таби, hover — база для #lw-games (не копія референс-сайту). */
export function buildGamesBlockBaselineCss() {
  return `
/* lw-games baseline */
main > section#lw-games {
  padding: clamp(20px, 3vw, 32px);
  margin-bottom: clamp(1.5rem, 3vw, 2.5rem);
  background: color-mix(in srgb, var(--lw-block, #232d1b) 55%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-sizing: border-box;
}

#lw-games h2,
#lw-games [class*="games_heading"],
#lw-games [class*="games-title"] {
  margin: 0 0 0.75rem;
  font-size: clamp(1.25rem, 2.5vw, 1.65rem);
}

#lw-games [class*="games_intro"],
#lw-games > p {
  margin: 0 0 1rem;
  opacity: 0.92;
}

#lw-games [class*="games_tabs"],
#lw-games [role="tablist"] {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 0 0 14px;
}

#lw-games button[data-tab],
#lw-games [class*="tab"] {
  cursor: pointer;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: var(--lw-text, #fff);
  font-weight: 600;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
}

#lw-games button[data-tab].is-active,
#lw-games button[data-tab][aria-pressed="true"] {
  background: var(--lw-accent, #ffe14a);
  color: var(--lw-bg, #101710);
  border-color: var(--lw-accent, #ffe14a);
}

#lw-games [class*="games_grid"],
#lw-games [class*="games_masonry"],
#lw-games [class*="masonry"],
#lw-games [role="list"] {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 12px 14px;
  align-items: stretch;
}

#lw-games a[class*="game"],
#lw-games a.lw-cta-solid {
  display: block;
  border-radius: 12px;
  overflow: hidden;
  background: var(--lw-card, #111316);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

#lw-games a[class*="game"]:hover,
#lw-games a[class*="game"].is-hover,
#lw-games a.lw-cta-solid:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
  border-color: color-mix(in srgb, var(--lw-accent, #ffe14a) 45%, transparent);
}

#lw-games img {
  width: 100%;
  max-height: 148px;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

#lw-games a[class*="large"],
#lw-games a[class*="featured"] {
  grid-column: span 2;
  grid-row: span 1;
}

#lw-games a[class*="large"] img,
#lw-games a[class*="featured"] img {
  max-height: 200px;
  aspect-ratio: 16 / 10;
}

@media (max-width: 720px) {
  #lw-games [class*="games_grid"],
  #lw-games [class*="games_masonry"],
  #lw-games [class*="masonry"],
  #lw-games [role="list"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  #lw-games a[class*="large"],
  #lw-games a[class*="featured"] {
    grid-column: span 2;
  }
}
`;
}

/** FAQ, CTA, hero — без зайвих «коробок». */
export function buildMainInteractBaselineCss() {
  return `
main details {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 0;
}

main details summary {
  cursor: pointer;
  font-weight: 600;
  list-style: none;
  padding: 6px 0;
  transition: color 0.2s ease;
}

main details summary::-webkit-details-marker {
  display: none;
}

main details summary::after {
  content: " ▾";
  opacity: 0.7;
}

main details[open] summary::after {
  content: " ▴";
}

main details[open] summary {
  color: var(--lw-accent, #ffe14a);
}

main a[class*="cta"],
main a[class*="btn"],
main button[class*="cta"] {
  transition: transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
}

main a[class*="cta"]:hover,
main a[class*="btn"]:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}
`;
}

/** Базові стилі AI header/footer (body > header/footer), якщо модель не дописала pageCss. */
export function buildAiChromeBaselineCss() {
  return `
/* ai chrome baseline */
body > header {
  position: sticky;
  top: 0;
  z-index: 200;
  background: color-mix(in srgb, var(--lw-block, #232d1b) 94%, #000);
  border-bottom: 2px solid color-mix(in srgb, var(--lw-accent, #ffe14a) 38%, transparent);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
  padding: 0 clamp(16px, 3vw, 40px);
  box-sizing: border-box;
}

body > header > div,
body > header [class*="header"] {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px 28px;
  width: 100%;
  max-width: none;
  min-height: 68px;
  margin: 0 auto;
  box-sizing: border-box;
}

body > header a[class*="logo"],
body > header [class*="brand"] {
  grid-column: 1;
  justify-self: start;
  flex-shrink: 0;
}

body > header nav,
body > header [class*="nav"] {
  grid-column: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 10px 18px;
  overflow-x: auto;
}

body > header [class*="actions"],
body > header [class*="header_actions"] {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 900px) {
  body > header > div,
  body > header [class*="header"] {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    min-height: 0;
    padding: 10px 0;
  }
  body > header nav,
  body > header [class*="nav"] {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
    padding-top: 4px;
  }
  body > header [class*="actions"],
  body > header [class*="header_actions"] {
    grid-row: 1;
    grid-column: 2;
  }
  body > header a[class*="logo"],
  body > header [class*="brand"] {
    grid-row: 1;
    grid-column: 1;
  }
}

body > header a {
  color: var(--lw-text, #fff);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: color 0.2s ease, background 0.2s ease;
}

body > header a:hover {
  color: var(--lw-accent, #ffe14a);
}

body > header [class*="cta"],
body > header [class*="btn"],
body > header a[class*="reg"] {
  padding: 10px 18px;
  border-radius: 8px;
  background: var(--lw-reg, #c8232c);
  color: var(--lw-text, #fff) !important;
  font-weight: 700;
}

body > header [class*="cta"]:hover,
body > header [class*="btn"]:hover {
  filter: brightness(1.08);
}

body > header img.lw-logo-img {
  max-height: 52px;
  width: auto;
  display: block;
}

body > footer {
  margin-top: clamp(32px, 5vw, 56px);
  padding: 36px clamp(16px, 3vw, 40px) 32px;
  background: var(--lw-bg, #101710);
  border-top: 3px solid var(--lw-block, #232d1b);
  text-align: center;
  box-sizing: border-box;
}

body > footer a {
  color: var(--lw-accent, #ffe14a);
  text-decoration: none;
  font-weight: 600;
}

body > footer a:hover {
  opacity: 0.88;
}

body > footer [class*="footer-inner"],
body > footer > div {
  max-width: none;
  width: 100%;
  margin: 0 auto;
}

body > footer img.lw-footer-logo {
  max-height: 48px;
  margin: 0 auto 12px;
}

body > footer p,
body > footer [class*="copy"] {
  margin: 10px 0 0;
  font-size: 0.9rem;
  opacity: 0.85;
  color: var(--lw-text, #fff);
}
`;
}

/**
 * @param {object|null} opts
 * @param {{ headerSkin?: number, footerSkin?: number }|null} [opts.layoutSkins] — лише для chromeMode "full"
 * @param {"full"|"palette-only"} [opts.chromeMode] — "palette-only": без жорстких .lw-header/.lw-footer (шапка/підвал від LLM)
 * @param {string} [opts.cssDiversifyKey] — сіль білда: легкі відмінності в числах/шрифтах/коментарі, щоб `chrome.css` не збігався байт-в-байт між сайтами
 */
export function getBrandChromeCss(variant, palette, opts = null) {
  const o = opts && typeof opts === "object" ? opts : {};
  const chromeMode = o.chromeMode === "palette-only" ? "palette-only" : "full";
  const layoutSkins =
    o.layoutSkins && typeof o.layoutSkins === "object" ? o.layoutSkins : null;

  const cfg = normalizeVariant(variant);
  const pal = palette && typeof palette === "object" ? palette : null;
  const bg = pal?.bg ?? BRAND_BG;
  const block = pal?.block ?? BRAND_BLOCK;
  const card = pal?.card ?? BRAND_CARD;
  const text = pal?.text ?? BRAND_TEXT;
  const accent = pal?.accent ?? BRAND_ACCENT;
  const btnReg = pal?.btnReg ?? BRAND_BTN_REG;
  const btnRegHover = pal?.btnRegHover ?? BRAND_BTN_REG_HOVER;
  const fontStack = pal?.fontStack ?? "Arial, sans-serif";
  const logoGlow = pal?.logoGlow ?? "0 0 8px rgba(255,225,74,0.16)";
  const divKey = String(o.cssDiversifyKey ?? o.cssFingerprintKey ?? "").trim();
  const mix = divKey ? siteHash32(divKey) : siteHash32(`${cfg.id}|${bg}|${accent}|chrome`);
  const topComments = [
    "/* base layout */",
    "/* shell styles */",
    "/* root chrome */",
    "/* ui chrome */",
  ];
  const topComment = topComments[mix % topComments.length];
  const animPalette = (0.268 + (mix % 11) * 0.006).toFixed(3);

  if (chromeMode === "palette-only") {
    return `${topComment}
:root {
  --lw-bg: ${bg};
  --lw-block: ${block};
  --lw-card: ${card};
  --lw-text: ${text};
  --lw-accent: ${accent};
  --lw-reg: ${btnReg};
  --lw-reg-hover: ${btnRegHover};
  --animation-duration: ${animPalette}s;
}

html {
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
}

html, body {
  margin: 0;
  background: var(--lw-bg) !important;
  color: var(--lw-text) !important;
  font-family: ${fontStack};
  overflow-x: hidden;
}

.touch-device * {
  -webkit-tap-highlight-color: transparent;
}

.touch-device a,
.touch-device button {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

a { color: inherit; text-decoration: none; }

main {
  padding-top: 0;
}

img.lw-logo-img,
img.lw-footer-logo {
  display: block;
  max-height: 56px;
  width: auto;
  object-fit: contain;
}
${buildSiteEnhancementCss()}
${buildAiChromeBaselineCss()}
${buildSharedTemplateChromePresetCss()}
`;
  }

  const hSk =
    layoutSkins && typeof layoutSkins.headerSkin === "number"
      ? clampChromeSkin(layoutSkins.headerSkin, CHROME_HEADER_SKIN_COUNT)
      : 0;
  const fSk =
    layoutSkins && typeof layoutSkins.footerSkin === "number"
      ? clampChromeSkin(layoutSkins.footerSkin, CHROME_FOOTER_SKIN_COUNT)
      : 0;
  /** Додаток до padding-top у <main> під «високі» скіни шапки; тримати помірним — інакше здається «подвійний» відступ разом із секціями. */
  const mainPadExtra = { 0: 0, 1: 6, 2: 0, 3: 4, 4: 18 }[hSk] ?? 0;
  const skinCss = buildChromeLayoutSkinCss(hSk, fSk);
  const headerHCss = 70 + (mix % 7);
  const headerMobileCss = 54 + ((mix >>> 4) % 5);
  const headerNarrow = 62 + ((mix >>> 12) % 5);
  const animCss = (0.268 + (mix % 11) * 0.006).toFixed(3);
  const animMobileCss = (0.176 + ((mix >>> 6) % 7) * 0.006).toFixed(3);
  const shadowA = (0.168 + (mix % 5) * 0.016).toFixed(3);
  const bodyFontPool = [
    "Arial, Helvetica, sans-serif",
    'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    '"Helvetica Neue", Helvetica, Arial, sans-serif',
    "Tahoma, Geneva, Arial, sans-serif",
    "Verdana, Geneva, sans-serif",
  ];
  const bodyFont = divKey
    ? bodyFontPool[(mix >>> 8) % bodyFontPool.length]
    : fontStack;
  return `${topComment}
:root {
  --lw-bg: ${bg};
  --lw-block: ${block};
  --lw-card: ${card};
  --lw-text: ${text};
  --lw-accent: ${accent};
  --lw-reg: ${btnReg};
  --lw-reg-hover: ${btnRegHover};
  --lw-header-h: ${headerHCss}px;
  --lw-header-h-mobile: ${headerMobileCss}px;
  --lw-main-pad-extra: ${mainPadExtra}px;
  --animation-duration: ${animCss}s;
}

html {
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
}

html, body {
  margin: 0;
  background: var(--lw-bg) !important;
  color: var(--lw-text) !important;
  font-family: ${bodyFont};
  overflow-x: hidden;
}

.touch-device * {
  -webkit-tap-highlight-color: transparent;
}

.touch-device a,
.touch-device button {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

a { color: inherit; text-decoration: none; }

.lw-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
  background: var(--lw-bg);
  box-shadow: 0 2px 8px rgba(0,0,0,${shadowA});
}

.lw-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  min-height: var(--lw-header-h);
}

.lw-logo {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.lw-logo-img {
  display: block;
  height: 48px;
  width: auto;
  object-fit: contain;
}

.lw-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px 12px;
  flex: 1;
}

.lw-nav-link {
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--lw-block);
  color: var(--lw-text) !important;
  font-weight: 600;
  font-size: 0.92rem;
  transition: background 0.2s, color 0.2s;
}

.lw-nav--outline .lw-nav-link {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.2);
}

.lw-nav--underline .lw-nav-link {
  background: transparent;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}

.lw-nav--underline .lw-nav-link:hover {
  border-bottom-color: var(--lw-accent);
}

.lw-nav--soft .lw-nav-link {
  background: color-mix(in srgb, var(--lw-block) 72%, transparent);
}

.lw-nav-link:hover {
  background: color-mix(in srgb, var(--lw-accent) 22%, var(--lw-block));
  color: var(--lw-accent) !important;
}

.lw-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.lw-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.95rem;
  white-space: nowrap;
}

.lw-btn-reg {
  background: var(--lw-reg);
  color: var(--lw-text) !important;
}

.lw-btn-reg:hover {
  background: var(--lw-reg-hover);
}

.lw-btn-login {
  background: var(--lw-block);
  color: var(--lw-text) !important;
  border: 1px solid rgba(255,255,255,0.12);
}

.lw-btn-login:hover {
  background: color-mix(in srgb, var(--lw-accent) 18%, var(--lw-block));
}

.lw-btn--outline {
  border: 1px solid rgba(255,255,255,0.28);
}

.lw-btn--split {
  border-radius: 999px;
}

.lw-btn--solid {
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
}

${buildSiteEnhancementCss({ fixedHeader: true, mainPadExtra })}

.lw-footer {
  background: var(--lw-bg);
  border-top: 3px solid var(--lw-block);
  padding: 36px 16px 28px;
  margin-top: 48px;
  text-align: center;
}

.lw-footer-inner {
  max-width: 900px;
  margin: 0 auto;
}

.lw-footer-brand {
  margin-bottom: 14px;
}

.lw-footer-logo {
  display: inline-block;
  max-width: 210px;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.lw-footer-links {
  margin-bottom: 12px;
  font-size: 1rem;
}

.lw-footer-links a {
  color: var(--lw-accent) !important;
  font-weight: 600;
  margin: 0 4px;
}

.lw-footer-links a:hover {
  text-decoration: underline;
}

.lw-footer-sep {
  color: var(--lw-accent);
  margin: 0 6px;
  opacity: 0.85;
}

.lw-footer-copy {
  color: #aaa;
  font-size: 0.95rem;
  margin: 0;
}

.lw-footer-inner--no-logo .lw-footer-links {
  margin-top: 4px;
}

.lw-quick-btns {
  position: fixed;
  z-index: 3000;
  left: 20px;
  bottom: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lw-quick-mail {
  position: fixed !important;
  left: auto !important;
  right: 22px !important;
  bottom: 28px !important;
}

.lw-quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  border-radius: 999px;
  background: var(--lw-block);
  color: var(--lw-accent) !important;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  box-shadow: 0 2px 14px rgba(0,0,0,0.35);
  transition: background 0.2s, color 0.2s;
}

.lw-quick-btn:hover {
  background: var(--lw-accent);
  color: var(--lw-block) !important;
}

.lw-ico {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  :root { --lw-header-h: ${headerNarrow}px; }
  .lw-nav { display: none; }
  .lw-header-inner { padding: 0 10px; }
  .lw-logo-img { height: 40px; }
}

@media (max-width: 600px) {
  :root { --lw-header-h: var(--lw-header-h-mobile); --animation-duration: ${animMobileCss}s; }
  .lw-btn { padding: 8px 12px; font-size: 0.85rem; }
}

.lw-header-inner--${cfg.id} .lw-logo-img {
  filter: drop-shadow(${logoGlow});
}
${skinCss}
${buildSharedTemplateChromePresetCss()}
`;
}

function siteHash32(input) {
  const s = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Базовий розклад chrome як у референс `css/chrome.css` без додаткових sk-сіток. */
export function pickChromeLayoutSkins(_seedInput) {
  return { headerSkin: 0, footerSkin: 0 };
}

function makeSeededRng(seedStr) {
  let state = siteHash32(seedStr) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function shuffleWithSeed(items, seedStr) {
  const arr = [...items];
  const rand = makeSeededRng(String(seedStr || "seed"));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function slugToNavFallback(file) {
  const base = String(file || "")
    .replace(/\.(php|html)$/i, "")
    .replace(/[-_]+/g, " ");
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Раздел";
}

/** Короткі підписи пунктів меню за ім'ям файлу (кирилиця; без латинських slug у шапці). */
const NAV_SLUG_MENU_LABELS = {
  zerkalo: "Рабочее зеркало",
  mirror: "Рабочее зеркало",
  start: "Быстрый старт",
  onboarding: "Первые шаги",
  mobile: "Мобильная версия",
  reviews: "Отзывы",
  registration: "Регистрация",
  payments: "Платежи",
  bonus: "Бонусы",
  app: "Приложение",
  support: "Поддержка",
  rules: "Правила",
  contacts: "Контакты",
  about: "О площадке",
  games: "Игры",
  news: "Новости",
  guides: "Гайды",
  security: "Безопасность",
  faq: "Вопросы и ответы",
  policy: "Документы",
};

/**
 * Підпис у меню: без «варіантів через /», без довгих SEO-ролей; якщо роль латиницею — підміна з мапи/slug.
 */
function sanitizeNavMenuLabel(raw, file) {
  const low = String(file || "").toLowerCase();
  const slug = low.replace(/\.(php|html)$/i, "");
  let t = String(raw || "").trim();
  if (!t) return slugToNavFallback(file);
  t = t.split(/[—–:]/u)[0].trim();
  if (/\s*\/\s*/.test(t)) {
    const parts = t
      .split(/\s*\/\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    const cyr = parts.find((p) => /[а-яё]/i.test(p));
    t = (cyr || parts[0] || t).trim();
  }
  t = t.replace(/\s+/g, " ").replace(/\s*\/\s*$/, "").trim();
  if (t.length > 42) t = t.slice(0, 42).trim();
  const hasCyrillic = /[а-яё]/i.test(t);
  const latinOnly =
    /^[a-z0-9][a-z0-9\s._-]*$/i.test(t) && t.length >= 2 && t.length < 48;
  if (!hasCyrillic && latinOnly && NAV_SLUG_MENU_LABELS[slug]) {
    return NAV_SLUG_MENU_LABELS[slug];
  }
  if (!hasCyrillic && latinOnly) {
    return slugToNavFallback(file);
  }
  if (hasCyrillic && t.length >= 2) return t;
  return NAV_SLUG_MENU_LABELS[slug] || slugToNavFallback(file);
}

/** Єдиний текст пункту меню для хедера й футера (перший сегмент role до «—» / «:»). */
function navLinkLabelFromPage(p) {
  const file = String(p?.file || "").trim();
  const low = file.toLowerCase();
  if (low === "index.php" || low === "index.html") return "Главная";
  const slug = low.replace(/\.(php|html)$/i, "");
  if (NAV_SLUG_MENU_LABELS[slug]) {
    return NAV_SLUG_MENU_LABELS[slug];
  }
  const role = String(p?.role || "").trim();
  return sanitizeNavMenuLabel(role, file);
}

/**
 * Той самий порядок і ті самі підписи, що в `buildBrandHeaderHtml` (для зрізу у футер).
 * Повертає сирі рядки `{ href, label }` (без HTML-екранування).
 */
export function buildOrderedNavEntries(variant, navLinks) {
  const cfg = normalizeVariant(variant);
  const linkMap =
    Array.isArray(navLinks) && navLinks.length >= 1 ? navLinks : DEFAULT_HEADER_LINKS;
  const order =
    Array.isArray(cfg.navOrder) && cfg.navOrder.length === linkMap.length
      ? cfg.navOrder
      : linkMap.map((_, i) => i);
  return order.map((srcIdx, i) => {
    const cfgLink = linkMap[srcIdx] || linkMap[i] || linkMap[0];
    const label = String(
      cfgLink.label ||
        cfgLink.fallback ||
        cfg.navLabels[srcIdx] ||
        cfg.navLabels[i] ||
        "Раздел"
    ).trim();
    return { href: cfgLink.href, label };
  });
}

/**
 * Лінки меню на ВСІ згенеровані сторінки сайту (без якорів index.php/#...).
 * `pages`: [{ file, role? }, ...]
 */
export function buildNavLinkMap(pages, seed) {
  const list = Array.isArray(pages) ? pages.filter((p) => p && p.file) : [];
  const normalized = list.map((p) => {
    const file = String(p.file || "").trim();
    const isHome = file.toLowerCase() === "index.php";
    const href = isHome ? "/" : file;
    const fallback = navLinkLabelFromPage(p);
    return { href, label: fallback, fallback };
  });
  const seen = new Set();
  const out = [];
  for (const c of shuffleWithSeed(normalized, `${seed}|navorder`)) {
    if (seen.has(c.href)) continue;
    seen.add(c.href);
    out.push(c);
  }
  if (!out.length) return [{ href: "/", label: "Главная", fallback: "Главная" }];
  return out;
}

/**
 * Перші `limit` пунктів меню з тим самим текстом і порядком, що в хедері
 * (`href` для головної — `index.php`, як у футері).
 */
export function buildFooterLinksFromNav(variant, navLinks, limit = 3) {
  const ordered = buildOrderedNavEntries(variant, navLinks);
  return ordered.slice(0, Math.max(1, Number(limit) || 3)).map((e) => ({
    href: e.href === "/" ? "index.php" : String(e.href || "").trim(),
    label: e.label,
  }));
}

function hslToRgbHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  const toHex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}

/**
 * Унікальна палітра на кожен білд (не фіксований «криптовалютний» зелений).
 * Повертає hex для CSS і промптів.
 */
export function generateRandomSitePalette(seedStr) {
  const rand = makeSeededRng(String(seedStr || "pal"));
  const r = () => rand();
  const hueBg = Math.floor(r() * 360);
  const hueAccent = (hueBg + 25 + Math.floor(r() * 70)) % 360;
  const hueBlock = (hueBg + 180 + Math.floor(r() * 40)) % 360;
  const bg = hslToRgbHex(hueBg, 0.22 + r() * 0.18, 0.07 + r() * 0.06);
  const block = hslToRgbHex(hueBlock, 0.18 + r() * 0.22, 0.12 + r() * 0.08);
  const card = hslToRgbHex(hueBg, 0.16 + r() * 0.12, 0.1 + r() * 0.06);
  const gradEnd = hslToRgbHex((hueBg + 40) % 360, 0.2, 0.14 + r() * 0.06);
  const accent = hslToRgbHex(hueAccent, 0.65 + r() * 0.28, 0.48 + r() * 0.14);
  const accentRgb = /^#(.{2})(.{2})(.{2})$/.exec(accent);
  let luminance = 0.2;
  if (accentRgb) {
    const R = parseInt(accentRgb[1], 16) / 255;
    const G = parseInt(accentRgb[2], 16) / 255;
    const B = parseInt(accentRgb[3], 16) / 255;
    luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }
  const accentOn = luminance > 0.55 ? "#0a0f0a" : "#f8faf8";
  const text = "#f5f5f5";
  const btnReg = hslToRgbHex((hueAccent + 160) % 360, 0.65, 0.42);
  const btnRegHover = hslToRgbHex((hueAccent + 160) % 360, 0.72, 0.48);
  const fonts = [
    "Arial, Helvetica, sans-serif",
    "Segoe UI, Roboto, Arial, sans-serif",
    "Tahoma, Geneva, Arial, sans-serif",
    "Verdana, Arial, sans-serif",
    "Georgia, Times New Roman, serif",
  ];
  const fontStack = fonts[Math.floor(r() * fonts.length)];
  const glowA = accentRgb
    ? `${parseInt(accentRgb[1], 16)}, ${parseInt(accentRgb[2], 16)}, ${parseInt(accentRgb[3], 16)}`
    : "255, 225, 74";
  return {
    bg,
    block,
    card,
    text,
    accent,
    gradEnd,
    accentOn,
    btnReg,
    btnRegHover,
    fontStack,
    logoGlow: `0 0 10px rgba(${glowA}, 0.22)`,
  };
}

/** Виключаємо банерні CTA-файли з прев'ю слотів — вони лише для фону CTA. */
export function isBannerAsset(fileName) {
  return /(forbaner|forbanner|\bbaner\b|\bbanner\b)/i.test(String(fileName || ""));
}

/**
 * Картинки з img/ для сітки ігор (без дрібних іконок, без логотипу та банерів CTA).
 * За замовчуванням порядок змінюється від seed, щоб різні проєкти не брали одні й ті самі «перші N» файлів.
 */
export function pickGameImages(imageFiles, options = {}) {
  const max =
    typeof options === "number"
      ? options
      : Number(options?.max ?? 16);
  const seed = typeof options === "number" ? "" : String(options?.seed ?? "");
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  const notGameArt = new RegExp(
    [
      "telegram",
      "trophy",
      "download",
      "whatsapp",
      "social",
      "placeholder",
      "dummy",
      "for-heading",
      "heading-one",
      "heading-two",
      "heading-thri",
      "mirror-img",
      "\\bvk\\b",
      "bannermobil",
      "banner-mobile",
      "bonus-mobile",
      "\\bcomment\\b",
      "^bonus\\d",
      "\\bbonus\\d",
      "\\bbonus_",
      "^bonus\\.",
      "dealer",
      "croupier",
      "live[-_]?casino",
      "live[-_]?dealer",
      "live[-_]?table",
      "casino[-_]?table",
      "more-games",
      "show-more",
      "load-more",
      "ellipsis",
      "three-dots",
      "\\.thumb\\.",
      "-more\\.",
      "^more\\.",
      "^icon",
      "icon-menu",
      "menu-icon",
      "^ui[-_]",
      "\\bico\\.png",
      "advontages",
      "advantages",
      "registracija",
      "registration",
      "security-mobile",
      "security",
      "instruction",
      "how-to",
      "how_to",
      "popular-games",
      "vip-club",
    ].join("|"),
    "i"
  );
  const filtered = list
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .filter((f) => !/\.svg$/i.test(f))
    .filter(
      (f) =>
        !/^(logo|favicon|icon|pay-)/i.test(f) &&
        !/^(banner-|forbanner|forbaner)/i.test(f) &&
        !/laki_world|golden_logo/i.test(f) &&
        !/banner-5\.png$/i.test(f) &&
        !/Bonus-mobile/i.test(f) &&
        !/Advontages-mobile/i.test(f) &&
        !isBannerAsset(f) &&
        !notGameArt.test(f)
    );
  if (!filtered.length) return [];
  const canonSet = new Set(CANONICAL_SLOT_GAME_FILENAMES);
  const preferred = filtered.filter((f) => canonSet.has(f));
  const rest = filtered.filter((f) => !canonSet.has(f));
  const shuffled = [
    ...shuffleWithSeed(preferred, `${seed}|gameimg|p`),
    ...shuffleWithSeed(rest, `${seed}|gameimg|r`),
  ];
  const cap = Math.max(1, Math.min(64, Number.isFinite(max) ? max : 16));
  return shuffled.slice(0, cap);
}

/**
 * Рівно `slotCount` унікальних прев'ю для #lw-games (якщо файлів вистачає), інакше ротація по пулу.
 * Повертає шляхи `./img/...`.
 */
export function buildIndexedGameSlots(imageFiles, seed, slotCount = 8) {
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  const n = Math.max(1, Math.min(16, slotCount));
  const presentCanon = CANONICAL_SLOT_GAME_FILENAMES.filter((f) =>
    list.includes(f)
  );

  if (presentCanon.length > 0) {
    const canonShuf = shuffleWithSeed([...presentCanon], `${seed}|slots`);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(`./img/${canonShuf[i % canonShuf.length]}`);
    }
    return out;
  }

  const pool = pickGameImages(imageFiles, {
    seed: `${seed}|pool`,
    max: 64,
  });
  if (!pool.length) return [];
  const shuffled = shuffleWithSeed([...pool], `${seed}|slots`);
  if (shuffled.length >= n) {
    return shuffled.slice(0, n).map((name) => `./img/${name}`);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`./img/${shuffled[i % shuffled.length]}`);
  }
  return out;
}

/**
 * Окремі набори прев'ю для кожної вкладки #lw-games (різні зрізи пулу, без копіювання однакових 8 карток у кожну вкладку).
 * Повертає масив масивів шляхів `./img/...`.
 */
export function buildGameTabSlotBatches(
  imageFiles,
  seed,
  tabCount = 3,
  slotsPerTab = 8
) {
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  const nTabs = Math.max(1, Math.min(6, tabCount));
  const nSlots = Math.max(4, Math.min(16, slotsPerTab));
  const presentCanon = CANONICAL_SLOT_GAME_FILENAMES.filter((f) =>
    list.includes(f)
  );

  let ring = [];
  if (presentCanon.length > 0) {
    ring = shuffleWithSeed([...presentCanon], `${seed}|tabpool`);
  } else {
    ring = pickGameImages(list, { seed: `${seed}|tabpool`, max: 64 });
  }
  if (!ring.length) return [];

  const total = nTabs * nSlots;
  const extended = [];
  let round = 0;
  while (extended.length < total) {
    extended.push(
      ...shuffleWithSeed([...ring], `${seed}|tabring${round}`)
    );
    round += 1;
    if (round > 20) break;
  }
  const batches = [];
  for (let t = 0; t < nTabs; t++) {
    const batch = [];
    for (let i = 0; i < nSlots; i++) {
      const idx = t * nSlots + i;
      batch.push(`./img/${extended[idx % extended.length]}`);
    }
    batches.push(batch);
  }
  return batches;
}

/**
 * Ілюстрації для секцій (не слоти ігор): унікальний порядок для ключа seedKey (наприклад `${siteSeed}|reviews.php`).
 */
export function pickContentImagesForPage(imageFiles, seedKey, max = 6) {
  const list = Array.isArray(imageFiles) ? imageFiles : [];
  const filtered = list
    .filter((f) => /\.(webp|png|jpe?g|gif|svg)$/i.test(f))
    .filter((f) => !/^favicon\./i.test(f))
    .filter((f) => !/laki_world|golden_logo/i.test(f))
    .filter((f) => !isBannerAsset(f))
    .filter((f) => !/telegram|trophy|download|bannermobil/i.test(f));
  if (!filtered.length) return [];
  const shuffled = shuffleWithSeed(filtered, `${seedKey}|content`);
  const cap = Math.max(3, Math.min(12, max));
  return shuffled.slice(0, cap).map((name) => `./img/${name}`);
}

export function brandPalettePromptBlock() {
  return `Визуальная система (НЕ отступай — на всех страницах в <main>):
- Шрифт: Arial, sans-serif для всего контента в main (в Tailwind не используй font-serif/font-mono для основного текста; не задавай другой font-family в pageCss для body/main).
- Только эта палитра: фон холста как у бренда ${BRAND_BG}; фон карточек слотов и мелких панелей ${BRAND_CARD}; фон крупных секций и навигационных кнопок ${BRAND_BLOCK}; основной текст ${BRAND_TEXT}; акценты, заголовки, ссылки ${BRAND_ACCENT}. Кнопки регистрации/CTA внутри контента: заливка ${BRAND_ACCENT} и тёмный текст #101710, либо обводка 2px ${BRAND_ACCENT} и текст ${BRAND_TEXT} — без градиентов в фирменные «левые» цвета.
- Запрещено для фона <main> и секций: классы Tailwind вроде bg-slate-*, bg-gray-*, bg-zinc-*, bg-neutral-*, bg-stone-*, bg-blue-*, bg-indigo-*, bg-violet-*, bg-purple-*, bg-emerald-* и любые «чужие» HEX вне перечисленных (исключение — полупрозрачный чёрный/белый оверлей rgba(0,0,0,0.2–0.6) поверх изображений).
- Не перекрашивай body/html другим solid-фоном через Tailwind; полотно должно ощущаться как ${BRAND_BG}.
- В pageCss не задавай глобально body { background: ... } иными цветами; при необходимости только дополняй контент, не ломая палитру.
- Не делай все <button> в main жёлтыми через глобальный CSS: табы и аккордеон — отдельные классы (неактивное состояние тёмное/полупрозрачное, активное — жёлтая заливка + тёмный текст #101710). CTA «Играть» — жёлтая заливка + тёмный текст.
- Ссылки-<a> с жёлтой заливкой (стиль gateway/CTA): обязательно явный color #101710 (или class text с тёмным), иначе гард CSS даст жёлтый текст на жёлтом. Либо class bg-brand-accent и тёмная типографика на кнопке.
- Вторичная кнопка «контур»: background transparent (или без заливки) + border цветом ${BRAND_ACCENT}; текст и иконки только белые (#fff или text-white), не тёмно-серые.
- Если используешь Tailwind: для жёлтой заливки (bg-yellow-*, bg-amber-*, arbitrary bg-[#ffe14a]) задавай text-[#101710]; для border-yellow/ring-yellow на прозрачном фоне — text-white (иначе гард CSS попытается исправить, но лучше сразу в разметке).
- Изображения только из списка img/: пути вида ./img/имяфайла.ext.`;
}

/** Промпт під унікальну палітру білда (замість фіксованого «жовтого Laki»). */
export function uniqueSitePalettePromptBlock(palette) {
  const p = palette && typeof palette === "object" ? palette : {};
  const bg = p.bg ?? BRAND_BG;
  const block = p.block ?? BRAND_BLOCK;
  const card = p.card ?? BRAND_CARD;
  const text = p.text ?? BRAND_TEXT;
  const accent = p.accent ?? BRAND_ACCENT;
  const accentOn = p.accentOn ?? "#101710";
  const font = p.fontStack ?? "Arial, sans-serif";
  return `Палитра ЭТОГО билда в <main> (не подменяй на фиксированный «шаблонный» набор цветов с чужих сайтов и не копируй чужие HEX):
- Только эти цвета: фон полотна ${bg}; крупные блоки/панели ${block}; карточки слотов и мелкие панели ${card}; основной текст ${text}; акценты, заголовки h1–h3, ссылки ${accent}; текст на сплошной заливке акцента ${accentOn}.
- Шрифт контента в main: ${font} — не подключай внешние шрифты и не задавай другой font-family для body/main в pageCss.
- Запрещены «чужие» однотонные Tailwind-фоны секций (bg-slate-*, bg-zinc-*, bg-blue-* и т.п.); допустимы только перечисленные выше HEX + полупрозрачные rgba-оверлеи поверх фото.
- Не перекрашивай полотно <main> в цвет, который не из списка; градиенты — только из соседних оттенков этой же палитры.
- Кнопки gateway/CTA: заливка ${accent} и текст ${accentOn}; контурная кнопка — border ${accent}, текст белый (#fff).
- Изображения: только ./img/... из списка генератора.`;
}

/** Анти-шаблон: ламає «системний» однаковий каркас між сайтами. */
export function uniqueSiteStructurePromptBlock(pageFile) {
  const pf = String(pageFile || "").toLowerCase();
  const isHome = pf === "index.php" || pf === "index.html";
  return `Уникальность структуры (критично — не повторяй каркас между билдами и страницами):
- Не копируй чужие публичные лендинги как шаблон — композиция и подача целиком от тебя по теме, плану и анти-шаблонным блокам user-промпта; максимизируй креатив в рамках палитры и списков img.
- Запрещён «типовой скелет» вроде одинаковой последовательности крупных блоков на всех генерациях. Меняй ширину основной колонки (например max-width 920–1320px), сетку (разное число колонок), вертикальный ритм, форму первой секции.
- Не клонируй DOM-паттерны с других страниц этого же сайта и с прошлых папок проектов: другие имена секций, другая вложенность, другие отступы между блоками.
- Допустима визуальная «сырость» или неидеальная сетка — важнее неповторимость, чем «как в макете».
- Не делай на каждой странице одинаковый набор «hero → три карточки → длинный текст»; следуй полям layoutVariant и sectionOrder из user.
${isHome ? `- Главная: секции #lw-games и #lw-vip обязательны по смыслу, но **внешний вид #lw-games** каждый раз другой (см. user-промпт: анти-шаблон); hero с визуалом, **не** клонируя типовой split 50/50 и не цепляя под hero «ленту из четырёх равных метрик».` : `- Внутренняя страница: структура и порядок секций не должны совпадать с главной и с другими URL этого сайта; избегай повторяемого между **разными сайтами** каркаса «длинный текст + правый сайдбар из трёх одинаковых карточек»; варьируй оглавление и колонки.`}`;
}

export {
  buildPremiumIgamingPromptIntro,
  buildPremiumLayoutPromptBlock,
  buildPageTypographyBaselineCss,
  buildIgamingBlockCatalogIntro,
  buildIgamingBlockSuggestionsForPage,
  buildSiteChromeAuthoringBlock,
  buildSiteChromeReuseBlock,
  extractChromePairFromHtml,
} from "./igaming-premium.js";
