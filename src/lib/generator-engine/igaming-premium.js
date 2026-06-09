/** Каталог блоків iGaming — підказки для LLM, без замороженого CSS-клону сайту. */

function catalogHash32(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickN(arr, n, seed) {
  const copy = [...arr];
  const out = [];
  let st = catalogHash32(seed) || 1;
  for (let i = 0; i < n && copy.length; i++) {
    st = (st * 1103515245 + 12345) >>> 0;
    const idx = st % copy.length;
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

const HERO_PATTERNS = [
  {
    id: "split-copy-media",
    hint: "Hero: дві колонки — зліва копірайт (eyebrow, h1, lead, badges, 2 CTA, 3–4 stat), справа медіа (слайдер 3 слайди [data-carousel] + [data-slide] або одне зображення).",
  },
  {
    id: "cinema-slider-first",
    hint: "Hero: зверху повноширинний слайдер/банер, під ним центрований блок тексту + stats.",
  },
  {
    id: "cinema-slider-posters",
    hint: "Hero games: слайдер 3+ слайдів; на кожному — img + .ig-hero-slide__poster (eyebrow, h2, lead поверх картинки) + .ig-hero-slide__cap з CTA.",
  },
  {
    id: "centered-access",
    hint: "Hero: одна центрована колонка (h1, lead, ряд статус-пілюль/чіпів, CTA, компактна сітка stats).",
  },
  {
    id: "wallet-aside",
    hint: "Hero: зліва оффер + stats; справа aside-панель (потік кроків депозит→гра→вивід, чіпи методів, одна CTA).",
  },
  {
    id: "stacked-headline-band",
    hint: "Hero: повноширинний h1 + lead, нижче асиметрична сітка (список переваг + абзац + CTA).",
  },
  {
    id: "hero-proof-strip",
    hint: "Hero: короткий h1, під ним горизонтальна смуга 4–6 trust-метрик (RTP, ліміт, час виплати).",
  },
  {
    id: "hero-dual-cta-columns",
    hint: "Hero: дві рівні колонки — зліва оффер, справа дві картки CTA (гра / бонус).",
  },
  {
    id: "hero-tabbed-offers",
    hint: "Hero: таби (Спорт / Слоты / Live) з різним підзаголовком і одним primary CTA.",
  },
];

const CONTENT_BLOCKS = [
  {
    id: "cta-banner",
    hint: "Широкий CTA-банер: візуал + текст + одна кнопка (не дублювати hero).",
  },
  {
    id: "cta-inline-strip",
    hint: "Вузька смуга: один рядок тексту + кнопка.",
  },
  {
    id: "promo-trio",
    hint: "Три колонки промо (іконка/цифра, заголовок, 2–3 речення, посилання).",
  },
  {
    id: "lw-games-grid",
    hint: "Секція #lw-games: заголовок, фільтр-чіпи (button + is-active), сітка 12+ карток слотів; перша картка — featured.",
  },
  {
    id: "perks-grid",
    hint: "4–6 переваг у сітці (іконка, h3, короткий текст).",
  },
  {
    id: "bento-categories",
    hint: "Bento 4–6 карток категорій/провайдерів.",
  },
  {
    id: "comparison-table",
    hint: "Таблиця порівняння (thead/tbody) з конкретними цифрами.",
  },
  {
    id: "pay-ledger",
    hint: "Картки методів оплати (карта, гаманець, crypto, банк) + ліміти/терміни.",
  },
  {
    id: "timeline-steps",
    hint: "Вертикальний або горизонтальний timeline 4–6 кроків.",
  },
  {
    id: "faq-accordion",
    hint: "FAQ accordion: details/summary або кнопки + панелі; 6–8 пунктів.",
  },
  {
    id: "faq-two-column",
    hint: "FAQ дві колонки (desktop): accordion у кожній колонці + intro зверху.",
  },
  {
    id: "faq-cards",
    hint: "FAQ сітка карток: всі відповіді видимі (2–3 колонки), не accordion.",
  },
  {
    id: "lw-games-showcase",
    hint: "#lw-games showcase: 1 великий featured-слот + сітка 6 менших (object-cover).",
  },
  {
    id: "lw-games-scroll",
    hint: "#lw-games горизонтальний scroll-snap ряд + CTA «Все игры».",
  },
  {
    id: "lw-games-featured",
    hint: "#lw-games 3 вертикальні spotlight-картки в ряд.",
  },
  {
    id: "trust-signals",
    hint: "Блок довіри: ліцензія, SSL, підтримка 24/7, ліміти — з цифрами.",
  },
  {
    id: "zigzag-media",
    hint: "2–3 секції zigzag: текст ↔ зображення, чергування сторін.",
  },
  {
    id: "mirror-access-cards",
    hint: "3 картки доступу (веб / app / розсилка) для сторінки дзеркала.",
  },
  {
    id: "vip-tiers",
    hint: "Рівні VIP або статуси гравця (3–4 рівні).",
  },
  {
    id: "prose-split",
    hint: "Довгий текст у двох колонках або intro + 3 підрозділи.",
  },
  {
    id: "bonus-steps",
    hint: "3–4 кроки активації бонусу (номер, заголовок, умова).",
  },
  {
    id: "live-studio-grid",
    hint: "Сітка live-столів (рулетка, блекджек, баккара) з лімітами ставок.",
  },
  {
    id: "provider-marquee",
    hint: "Ряд логотипів/назв провайдерів (текст або плейсхолдери).",
  },
  {
    id: "responsible-gaming",
    hint: "Блок відповідальної гри: ліміти, самовиключення, 18+.",
  },
  {
    id: "stats-dashboard",
    hint: "Панель KPI: активні гравці, джекпот, середній RTP — з цифрами.",
  },
  {
    id: "testimonials-row",
    hint: "3 короткі відгуки (ім'я, місто, 1–2 речення) без кліше «миллионы за клик».",
  },
  {
    id: "app-download",
    hint: "Блок мобільного доступу: PWA / зеркало / push — 2–3 картки.",
  },
  {
    id: "tournament-banner",
    hint: "Турнір: призовий фонд, дата, CTA «Участвовать».",
  },
];

function pageKind(file) {
  const f = String(file || "").toLowerCase();
  if (f === "index.php" || f === "index.html") return "home";
  if (f === "games.php") return "games";
  if (f === "slots.php" || f === "slot.php") return "slots";
  if (/bonus\.php$/i.test(f)) return "bonus";
  if (/vip\.php$/i.test(f)) return "vip";
  if (/promo\.php$/i.test(f)) return "promo";
  if (/registration\.php$/i.test(f)) return "registration";
  if (/payments?\.php$/i.test(f)) return "payments";
  if (/zerkalo\.php$/i.test(f) || /mirror\.php$/i.test(f)) return "mirror";
  if (/faq-page\.php$/i.test(f) || /faq\.php$/i.test(f)) return "faq";
  if (/support\.php$/i.test(f)) return "support";
  if (/about\.php$/i.test(f)) return "about";
  if (/reviews\.php$/i.test(f)) return "reviews";
  return "inner";
}

function heroCandidates(kind) {
  if (kind === "payments") {
    return HERO_PATTERNS.filter((b) =>
      ["wallet-aside", "split-copy-media", "stacked-headline-band"].includes(b.id)
    );
  }
  if (kind === "mirror") {
    return HERO_PATTERNS.filter((b) =>
      ["centered-access", "stacked-headline-band", "split-copy-media"].includes(b.id)
    );
  }
  if (kind === "games") {
    return HERO_PATTERNS.filter((b) =>
      [
        "cinema-slider-posters",
        "cinema-slider-first",
        "split-copy-media",
        "stacked-headline-band",
      ].includes(b.id)
    );
  }
  return HERO_PATTERNS;
}

function contentCandidates(kind) {
  const all = CONTENT_BLOCKS;
  if (kind === "home") {
    return all.filter((b) =>
      [
        "lw-games-grid",
        "cta-banner",
        "perks-grid",
        "comparison-table",
        "faq-accordion",
        "trust-signals",
        "vip-tiers",
        "zigzag-media",
        "timeline-steps",
      ].includes(b.id)
    );
  }
  if (kind === "games") {
    return all.filter((b) =>
      [
        "lw-games-grid",
        "promo-trio",
        "bento-categories",
        "faq-accordion",
        "zigzag-media",
        "trust-signals",
      ].includes(b.id)
    );
  }
  if (kind === "payments") {
    return all.filter((b) =>
      [
        "comparison-table",
        "pay-ledger",
        "cta-inline-strip",
        "faq-accordion",
        "timeline-steps",
        "trust-signals",
      ].includes(b.id)
    );
  }
  if (kind === "mirror") {
    return all.filter((b) =>
      [
        "mirror-access-cards",
        "perks-grid",
        "prose-split",
        "faq-accordion",
        "trust-signals",
        "cta-inline-strip",
      ].includes(b.id)
    );
  }
  if (kind === "bonus" || kind === "promo") {
    return all.filter((b) =>
      [
        "cta-banner",
        "promo-trio",
        "bonus-steps",
        "stats-dashboard",
        "perks-grid",
        "faq-accordion",
        "faq-cards",
        "trust-signals",
      ].includes(b.id)
    );
  }
  if (kind === "vip") {
    return all.filter((b) =>
      [
        "vip-tiers",
        "perks-grid",
        "stats-dashboard",
        "trust-signals",
        "faq-two-column",
        "cta-banner",
      ].includes(b.id)
    );
  }
  if (kind === "slots") {
    return all.filter((b) =>
      [
        "lw-games-grid",
        "lw-games-showcase",
        "lw-games-scroll",
        "lw-games-featured",
        "bento-categories",
        "faq-accordion",
        "cta-banner",
      ].includes(b.id)
    );
  }
  if (kind === "registration") {
    return all.filter((b) =>
      [
        "timeline-steps",
        "perks-grid",
        "trust-signals",
        "bonus-steps",
        "faq-accordion",
        "cta-banner",
      ].includes(b.id)
    );
  }
  if (kind === "faq" || kind === "support") {
    return all.filter((b) =>
      [
        "faq-accordion",
        "faq-two-column",
        "faq-cards",
        "perks-grid",
        "trust-signals",
        "cta-inline-strip",
      ].includes(b.id)
    );
  }
  if (kind === "about" || kind === "reviews") {
    return all.filter((b) =>
      [
        "zigzag-media",
        "prose-split",
        "testimonials-row",
        "trust-signals",
        "stats-dashboard",
        "faq-cards",
        "cta-banner",
      ].includes(b.id)
    );
  }
  return all.filter((b) => !["lw-games-grid", "mirror-access-cards"].includes(b.id));
}

/** Мінімальні правила якості в page-N.css (без прив'язки до ig-* класів). */
export function buildPageTypographyBaselineCss() {
  return `
/* page quality baseline */
main > section:not(#lw-games) {
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}
main a.lw-cta-solid, main a.lw-cta-solid * { color: #0a0f0a !important; }
main a.lw-cta-outline, main a.lw-cta-outline * { color: #fff !important; }
main button :is(h1, h2, h3, h4),
main [role="button"] :is(h1, h2, h3, h4) { color: #fff !important; }
`;
}

export function buildIgamingBlockCatalogIntro() {
  return `
КАТАЛОГ БЛОКІВ iGaming (режим підказок, не шаблон):
- **Не** копіюй готовий CSS/класи з чужих сайтів (ig-*, u-bet162). Усі класи в <main> — з префіксом билда; **повні стилі** секцій — у **pageCss**.
- Порядок секцій, DOM і назви класів — **на твій розсуд**, у межах напряму «преміум тёмное iGaming».
- Нижче — лише **ідеї блоків**; реалізуй їх по-своєму, щоб сторінки одного сайту відрізнялися каркасом.
- Шапка і підвал: **однакові HTML на всіх URL** цього сайту (див. блок про site chrome).
- Секції в <main> — «плоскі» (без великої обгортки-коробки навколо всього контенту); акцентні картки лише всередині сіток.
- Тексти: конкретні цифри (ліміти, RTP, терміни), російська, без кліше з анти-списку.
`;
}

/**
 * Підказки блоків для сторінки (детерміновано від seed, різні між URL).
 */
export function buildIgamingBlockSuggestionsForPage(
  pageFile,
  seedKey = "",
  gatewayUrl = "",
  opts = {}
) {
  const gtw = String(gatewayUrl || "").trim() || "GATEWAY_URL";
  const kind = pageKind(pageFile);
  const seed = `${seedKey}|${pageFile}|${kind}`;
  const hero = pickN(heroCandidates(kind), 1, `${seed}|hero`)[0];
  const blockCount = 3 + (catalogHash32(`${seed}|extra`) % 2);
  let blocks = pickN(contentCandidates(kind), blockCount, `${seed}|blocks`);
  const faqPresentation = String(opts.faqPresentation || "").trim();
  if (faqPresentation === "two-column") {
    blocks = blocks.filter((b) => b.id !== "faq-accordion");
    if (!blocks.some((b) => b.id === "faq-two-column")) {
      blocks.push(CONTENT_BLOCKS.find((b) => b.id === "faq-two-column"));
    }
  } else if (faqPresentation === "cards") {
    blocks = blocks.filter((b) => b.id !== "faq-accordion");
    if (!blocks.some((b) => b.id === "faq-cards")) {
      blocks.push(CONTENT_BLOCKS.find((b) => b.id === "faq-cards"));
    }
  }
  const gamesPresentation = String(opts.gamesPresentation || "").trim();
  if (gamesPresentation === "showcase" && (kind === "home" || kind === "games")) {
    blocks.unshift(CONTENT_BLOCKS.find((b) => b.id === "lw-games-showcase"));
  } else if (gamesPresentation === "scroll" && (kind === "home" || kind === "games")) {
    blocks.unshift(CONTENT_BLOCKS.find((b) => b.id === "lw-games-scroll"));
  } else if (gamesPresentation === "featured" && (kind === "home" || kind === "games")) {
    blocks.unshift(CONTENT_BLOCKS.find((b) => b.id === "lw-games-featured"));
  }
  const mustGames =
    kind === "home"
      ? "\n- На головній обов'язково реалізуй блок ігор (#lw-games) з каталогу."
      : kind === "games"
        ? `\n- На games.php обов'язково #lw-games (сітка слотів + фільтр-чіпи).
- Hero-слайдер (ig-hero-cinema / [data-carousel]): на **кожному** [data-slide] поверх зображення блок-постер \`.ig-hero-slide__poster\` з eyebrow, заголовком h2 і lead (конкретні RTP/ліміти); знизу залиш \`.ig-hero-slide__cap\` з тегом і CTA «Играть».`
        : "";
  const lines = [
    `СТОРІНКА ${pageFile} (${kind}): обери **один** hero-патерн і **3** контент-блоки (можеш об'єднати або додати власний блок, але не копіюй hero інших URL).`,
    `Hero (реалізуй власними класами): ${hero?.hint || "унікальний hero"}`,
    ...blocks.map((b, i) => `${i + 1}. ${b.hint}`),
    `Gateway для play/слотів: ${gtw}. Внутрішні посилання — лише ./страница.php з пакета.`,
    mustGames,
  ];
  return lines.join("\n");
}

/** Промпт: перша сторінка задає chrome на весь сайт. */
export function buildSiteChromeAuthoringBlock({ isFirstPage = true } = {}) {
  if (isFirstPage) {
    return `
SITE CHROME (перша сторінка пакета):
- Спроектуй **headerHtml** і **footerHtml** як єдину пару для **всього** сайту: одна навігація, одні CTA, одна структура DOM.
- Оформи шапку/підвал у **pageCss** цієї сторінки; на наступних URL збірник підставить **той самий HTML**.
- Не дублюй повний <header>/<footer> всередині <main>.
`;
  }
  return "";
}

/** Промпт + еталон HTML для сторінок 2+. */
export function buildSiteChromeReuseBlock(canonical = {}) {
  const header = String(canonical.headerHtml || "").trim();
  const footer = String(canonical.footerHtml || "").trim();
  if (!header && !footer) return "";
  const snip = (html, max = 6000) =>
    html.length > max ? `${html.slice(0, max)}\n<!-- … truncated … -->` : html;
  const parts = [
    `SITE CHROME (обов'язково для цієї сторінки):`,
    `Поверни в JSON **байт-в-байт той самий** headerHtml і footerHtml, що на першій сторінці сайту. Не змінюй класи, порядок вузлів, href меню, логотип.`,
    `Стилі шапки/підвалу вже в page-1.css — на цій сторінці **не переписуй** їх радикально; у pageCss лише дрібні доповнення під контент <main> за потреби.`,
  ];
  if (header) parts.push(`Еталон headerHtml:\n${snip(header)}`);
  if (footer) parts.push(`Еталон footerHtml:\n${snip(footer)}`);
  return parts.join("\n");
}

export function extractChromePairFromHtml(html) {
  const raw = String(html || "");
  const headerM = raw.match(/<header\b[\s\S]*?<\/header>/i);
  const footerM = raw.match(/<footer\b[\s\S]*?<\/footer>/i);
  return {
    headerHtml: headerM ? headerM[0].trim() : "",
    footerHtml: footerM ? footerM[0].trim() : "",
  };
}

/** @deprecated використовуй buildIgamingBlockCatalogIntro */
export function buildPremiumIgamingPromptIntro() {
  return buildIgamingBlockCatalogIntro();
}

/** @deprecated використовуй buildIgamingBlockSuggestionsForPage */
export function buildPremiumLayoutPromptBlock(
  pageFile,
  gatewayUrl = "",
  seedKey = "",
  opts = {}
) {
  return buildIgamingBlockSuggestionsForPage(pageFile, seedKey, gatewayUrl, opts);
}
