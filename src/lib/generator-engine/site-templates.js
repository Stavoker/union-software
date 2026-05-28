import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  stripUnsafeChromeMarkup,
  extractSectionRoleSequenceForSimilarity,
  detectLayoutFeaturesForSimilarity,
} from "@/src/lib/generation-reference-sites";
import {
  resolveSiteTemplateBundle,
  invalidateSiteTemplateCache,
} from "@/src/lib/generation-site-templates";

const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const SITE_TEMPLATE_BET162 = "bet162";
export const SITE_TEMPLATE_SPOT064 = "spot064";

const TEMPLATE_LABEL = {
  [SITE_TEMPLATE_BET162]: "1",
  [SITE_TEMPLATE_SPOT064]: "2",
};

const DEFAULT_PAGE_ORDER = ["index.php", "games.php", "payments.php", "zerkalo.php"];

/** @type {Map<string, Map<string, { content: string; kind: string }>>} */
const runtimeBundles = new Map();

function tplHash32(input) {
  let h = 2166136261;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bundledEtalonRoot(templateId) {
  return path.join(
    ENGINE_DIR,
    "assets",
    templateId === SITE_TEMPLATE_SPOT064 ? "etalon-u-spot064" : "etalon-u-bet162"
  );
}

export function resolveEtalonRoot(templateId) {
  const envKey =
    templateId === SITE_TEMPLATE_SPOT064
      ? "SOFTGEN_ETALON_SPOT064_PATH"
      : "SOFTGEN_ETALON_BET162_PATH";
  const override = String(process.env[envKey] || "").trim();
  return override || bundledEtalonRoot(templateId);
}

function classifyAssetPath(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/");
  if (p.startsWith("partials/") && p.endsWith(".php")) return "partial";
  if (p.startsWith("css/") && p.endsWith(".css")) return "css";
  if (p.startsWith("js/") && p.endsWith(".js")) return "js";
  if (/^[^/]+\.php$/i.test(p)) {
    if (p === "config.php" || p === "warmup_text_cache.php") return "other";
    return "page";
  }
  return "other";
}

function walkEtalonFiles(rootDir, base = "") {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const name of fs.readdirSync(rootDir)) {
    const full = path.join(rootDir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkEtalonFiles(full, rel));
      continue;
    }
    if (!/\.(php|css|js)$/i.test(name)) continue;
    out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

/**
 * @param {string} templateId
 * @returns {Map<string, { content: string; kind: string }>}
 */
export function loadSiteTemplateBundleFromFilesystem(templateId) {
  const root = resolveEtalonRoot(templateId);
  const bundle = new Map();
  for (const rel of walkEtalonFiles(root)) {
    const full = path.join(root, rel);
    try {
      bundle.set(rel, {
        content: fs.readFileSync(full, "utf8"),
        kind: classifyAssetPath(rel),
      });
    } catch {
      /* skip */
    }
  }
  if (
    templateId === SITE_TEMPLATE_SPOT064 &&
    !bundle.has("css/site-shell.css")
  ) {
    const shellPath = path.join(bundledEtalonRoot(templateId), "css", "site-shell.css");
    if (fs.existsSync(shellPath)) {
      bundle.set("css/site-shell.css", {
        content: fs.readFileSync(shellPath, "utf8"),
        kind: "css",
      });
    }
  }
  return bundle;
}

/**
 * @param {string} templateId
 * @param {{ supabaseUrl?: string; serviceKey?: string; onLog?: (m: string) => void }} [opts]
 */
export async function getSiteTemplateBundle(templateId, opts = {}) {
  const slug = String(templateId || "").trim();
  if (runtimeBundles.has(slug)) {
    return runtimeBundles.get(slug);
  }
  const bundle = await resolveSiteTemplateBundle(slug, {
    ...opts,
    loadFilesystemFallback: loadSiteTemplateBundleFromFilesystem,
  });
  if (bundle.size > 0) {
    runtimeBundles.set(slug, bundle);
  }
  return bundle;
}

export function clearSiteTemplateRuntimeCache() {
  runtimeBundles.clear();
  invalidateSiteTemplateCache();
}

/** Один BEM-префікс на весь сайт (без _index_ / хешів). */
export function buildSiteClassNamespace(brandName, seedKey = "") {
  const slug = String(brandName || "site")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/[а-яё]/g, (ch) => {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
        с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
        щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[ch] || "";
    })
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  const base = slug || "site";
  const variants = [base, `${base}-club`, `${base}-play`, `${base}-hub`];
  const pick = variants[tplHash32(`${seedKey}|ns|${base}`) % variants.length];
  return {
    block: pick,
    bemPrefix: `${pick}-`,
    promptExamples: `${pick}-hero, ${pick}-hero__title, ${pick}-pay-console, ${pick}-pay-console__chip`,
  };
}

function orderedPageFiles(pageFiles) {
  const files = [...new Set((pageFiles || []).map((f) => String(f || "").trim()).filter(Boolean))];
  const rank = new Map(DEFAULT_PAGE_ORDER.map((f, i) => [f, i]));
  return files.sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a) : 99;
    const rb = rank.has(b) ? rank.get(b) : 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function allTemplatePatterns(n) {
  const out = [];
  const total = 2 ** Math.max(0, Math.min(n, 8));
  for (let mask = 0; mask < total; mask++) {
    const row = [];
    for (let i = 0; i < n; i++) {
      row.push(mask & (1 << i) ? SITE_TEMPLATE_SPOT064 : SITE_TEMPLATE_BET162);
    }
    out.push(row);
  }
  return out;
}

export function pickPageTemplatePlan(seed, pageFiles) {
  const files = orderedPageFiles(pageFiles);
  if (!files.length) return {};
  const patterns = allTemplatePatterns(files.length);
  const idx = tplHash32(`${seed}|dual-site-tpl|${files.join("|")}`) % patterns.length;
  const seq = patterns[idx] || [];
  const plan = {};
  files.forEach((f, i) => {
    plan[f] = seq[i] || SITE_TEMPLATE_BET162;
  });
  return plan;
}

export function formatTemplatePlanLog(plan) {
  return DEFAULT_PAGE_ORDER.filter((f) => plan[f])
    .map((f) => TEMPLATE_LABEL[plan[f]] || "?")
    .join(",");
}

export function resolvePageSiteTemplate(signals, pageFile) {
  const byFile = signals?.pageTemplateByFile;
  if (byFile && pageFile) {
    const id = String(byFile[pageFile] || byFile[String(pageFile).toLowerCase()] || "").trim();
    if (id === SITE_TEMPLATE_BET162 || id === SITE_TEMPLATE_SPOT064) return id;
  }
  return SITE_TEMPLATE_BET162;
}

/** Сторінка білда → найближчий файл еталона (index/games/payments/zerkalo). */
export function resolveEtalonSourcePageFile(pageFile) {
  const base = String(pageFile || "").trim().toLowerCase();
  if (!base) return "index.php";
  const stem = base.replace(/\.(php|html)$/i, "");
  if (stem === "index" || stem === "home") return "index.php";
  if (/^(games|game|slots|slot|catalog)/.test(stem)) return "games.php";
  if (/^(payments|payment|loyalty|bonus|bonuses|cashier|deposit|vip|promo)/.test(stem)) {
    return "payments.php";
  }
  if (/^(zerkalo|mirror|mobile|app|android|ios|download)/.test(stem)) {
    return "zerkalo.php";
  }
  if (/^(faq|help|support|about|review)/.test(stem)) return "payments.php";
  return "index.php";
}

function listBundlePageFiles(bundle) {
  if (!bundle || typeof bundle.entries !== "function") return [];
  const files = [];
  for (const [rel, meta] of bundle.entries()) {
    if (meta?.kind === "page" && /\.php$/i.test(rel)) {
      files.push(rel);
    }
  }
  return orderedPageFiles(files);
}

function collectMainTemplatesFromBundle(bundle) {
  const out = {};
  for (const file of listBundlePageFiles(bundle)) {
    const html = readEtalonPageHtmlFromBundle(bundle, file);
    const main = capMainTemplate(extractMainFromHtml(html));
    if (main) out[file] = main;
  }
  return out;
}

function pickMainTemplateForBuildPage(library, pageFile, templateId) {
  const tpl = templateId === SITE_TEMPLATE_SPOT064 ? SITE_TEMPLATE_SPOT064 : SITE_TEMPLATE_BET162;
  const bucket = library?.[tpl] || {};
  const exact = String(pageFile || "").trim();
  if (bucket[exact]) return { main: bucket[exact], source: exact };
  const alias = resolveEtalonSourcePageFile(exact);
  if (bucket[alias]) return { main: bucket[alias], source: alias };
  if (bucket["index.php"]) return { main: bucket["index.php"], source: "index.php" };
  const firstKey = Object.keys(bucket)[0];
  if (firstKey) return { main: bucket[firstKey], source: firstKey };
  return { main: "", source: "" };
}

/**
 * Inner <main> для сторінки білда: прямий збіг → alias на еталон → index fallback.
 * @param {Record<string, unknown> | null | undefined} signals
 * @param {string} pageFile
 */
export function resolveMainHtmlTemplateForPage(signals, pageFile) {
  const file = String(pageFile || "").trim();
  const byFile = signals?.mainHtmlTemplatesByFile;
  if (byFile && file) {
    const perPage = String(byFile[file] || byFile[file.toLowerCase()] || "").trim();
    if (perPage) return perPage;
  }
  const lib = signals?.mainHtmlTemplateLibrary;
  if (lib && file) {
    const tpl = resolvePageSiteTemplate(signals, file);
    return pickMainTemplateForBuildPage(lib, file, tpl).main;
  }
  return String(signals?.mainHtmlTemplate || "").trim();
}

function extractMainFromHtml(html) {
  const raw = String(html || "");
  const m = raw.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  return m ? m[0].trim() : "";
}

function extractHeaderFooterFromHtml(html) {
  const raw = String(html || "");
  const headerM = raw.match(/<header\b[\s\S]*?<\/header>/i);
  const footerM = raw.match(/<footer\b[\s\S]*?<\/footer>/i);
  const asideM = raw.match(/<aside\b[^>]*class="[^"]*lw-site-rail[^"]*"[\s\S]*?<\/aside>/i);
  return {
    headerHtml: headerM ? headerM[0].trim() : "",
    footerHtml: footerM ? footerM[0].trim() : "",
    railHtml: asideM ? asideM[0].trim() : "",
  };
}

function getBundleAsset(bundle, assetPath) {
  return bundle?.get(String(assetPath || "").trim())?.content || "";
}

function inlinePhpIncludesFromBundle(bundle, content) {
  let out = String(content || "");
  out = out.replace(/<\?php(?![\s\S]*?include)[\s\S]*?\?>/gi, "");
  const incRe = /<\?php\s+include\s+__DIR__\s*\.\s*'\/([^']+)'\s*;\s*\?>/gi;
  for (let guard = 0; guard < 24; guard++) {
    const m = incRe.exec(out);
    if (!m) break;
    incRe.lastIndex = 0;
    out = out.replace(incRe, (_, rel) => {
      const partial = getBundleAsset(bundle, rel);
      if (!partial) return "";
      return inlinePhpIncludesFromBundle(bundle, partial);
    });
  }
  return out.replace(/<\?php[\s\S]*?\?>/gi, "").trim();
}

function readEtalonPageHtmlFromBundle(bundle, pageFile) {
  const raw = getBundleAsset(bundle, pageFile);
  if (!raw) return "";
  return inlinePhpIncludesFromBundle(bundle, raw);
}

function capMainTemplate(html, maxLen = 72000) {
  const t = String(html || "").trim();
  const cap = Math.max(8000, Math.min(120000, Number(maxLen) || 72000));
  if (t.length <= cap) return t;
  return `${t.slice(0, cap)}\n<!-- ETALON_MAIN_TRUNCATED -->`;
}

function loadTemplateChromeSignals(templateId, bundle) {
  const indexHtml = readEtalonPageHtmlFromBundle(bundle, "index.php");
  const parts = extractHeaderFooterFromHtml(indexHtml);
  if (templateId === SITE_TEMPLATE_SPOT064) {
    let rail = stripUnsafeChromeMarkup(
      inlinePhpIncludesFromBundle(bundle, getBundleAsset(bundle, "partials/site-rail.php"))
    );
    if (!rail && parts.railHtml) rail = parts.railHtml;
    let footer = parts.footerHtml;
    const richFooter = getBundleAsset(bundle, "partials/site-footer-rich.php");
    if (richFooter) {
      footer = stripUnsafeChromeMarkup(
        inlinePhpIncludesFromBundle(bundle, richFooter)
      );
    }
    return {
      headerHtml: rail,
      footerHtml: footer,
      referenceLayoutLeftRailHint: true,
      chromeMode: "rail-rich-footer",
    };
  }
  return {
    headerHtml: stripUnsafeChromeMarkup(parts.headerHtml),
    footerHtml: stripUnsafeChromeMarkup(parts.footerHtml),
    referenceLayoutLeftRailHint: false,
    chromeMode: "top-header",
  };
}

/**
 * @param {{
 *   pickSeed: string;
 *   plan: Record<string, string>;
 *   pageFiles: string[];
 *   onLog?: (m: string) => void;
 *   supabaseUrl?: string;
 *   serviceKey?: string;
 * }} opts
 */
export async function loadDualEtalonReferencePack(opts) {
  const plan = opts.plan || {};
  const pageFiles = orderedPageFiles(opts.pageFiles || Object.keys(plan));
  const onLog = opts.onLog;
  const fetchOpts = {
    supabaseUrl: opts.supabaseUrl,
    serviceKey: opts.serviceKey,
    onLog,
  };

  const bundles = {
    [SITE_TEMPLATE_BET162]: await getSiteTemplateBundle(SITE_TEMPLATE_BET162, fetchOpts),
    [SITE_TEMPLATE_SPOT064]: await getSiteTemplateBundle(SITE_TEMPLATE_SPOT064, fetchOpts),
  };

  const mainHtmlTemplatesByFile = {};
  const mainHtmlTemplateSourceByFile = {};
  const pageTemplateByFile = { ...plan };
  const chromeByTemplate = {};
  const mainHtmlTemplateLibrary = {
    [SITE_TEMPLATE_BET162]: collectMainTemplatesFromBundle(bundles[SITE_TEMPLATE_BET162]),
    [SITE_TEMPLATE_SPOT064]: collectMainTemplatesFromBundle(bundles[SITE_TEMPLATE_SPOT064]),
  };

  for (const tpl of [SITE_TEMPLATE_BET162, SITE_TEMPLATE_SPOT064]) {
    chromeByTemplate[tpl] = loadTemplateChromeSignals(tpl, bundles[tpl]);
  }

  for (const file of pageFiles) {
    const tpl = plan[file] || SITE_TEMPLATE_BET162;
    pageTemplateByFile[file] = tpl;
    const picked = pickMainTemplateForBuildPage(mainHtmlTemplateLibrary, file, tpl);
    if (picked.main) {
      mainHtmlTemplatesByFile[file] = picked.main;
      mainHtmlTemplateSourceByFile[file] = picked.source;
    }
  }

  const libBet = Object.keys(mainHtmlTemplateLibrary[SITE_TEMPLATE_BET162]).length;
  const libSpot = Object.keys(mainHtmlTemplateLibrary[SITE_TEMPLATE_SPOT064]).length;
  const assigned = Object.keys(mainHtmlTemplatesByFile).length;

  const firstMain = mainHtmlTemplatesByFile[pageFiles[0]] || "";
  const indexMain = mainHtmlTemplatesByFile["index.php"] || firstMain;
  const sectionRoleSequence = extractSectionRoleSequenceForSimilarity(indexMain);
  const layoutFeatures = detectLayoutFeaturesForSimilarity(
    readEtalonPageHtmlFromBundle(bundles[SITE_TEMPLATE_SPOT064], "index.php")
  );

  const signals = {
    dualSiteTemplates: true,
    etalonSource: "supabase",
    pageTemplateByFile,
    mainHtmlTemplatesByFile,
    mainHtmlTemplateSourceByFile,
    mainHtmlTemplateLibrary,
    mainHtmlTemplateLibraryCounts: {
      bet162: libBet,
      spot064: libSpot,
    },
    chromeByTemplate,
    mainHtmlTemplate: indexMain,
    mainHtmlTemplateChars: indexMain.length,
    sectionRoleSequence,
    layoutFeatures,
    referenceLayoutLeftRailHint: Object.values(plan).includes(SITE_TEMPLATE_SPOT064),
    referenceHeaderTemplate: chromeByTemplate[SITE_TEMPLATE_BET162]?.headerHtml || "",
    referenceFooterTemplate: chromeByTemplate[SITE_TEMPLATE_BET162]?.footerHtml || "",
    referenceRailTemplate: chromeByTemplate[SITE_TEMPLATE_SPOT064]?.headerHtml || "",
    referenceRichFooterTemplate: chromeByTemplate[SITE_TEMPLATE_SPOT064]?.footerHtml || "",
  };

  const planLog = formatTemplatePlanLog(plan);
  onLog?.(
    `Эталоны bet162/spot064 (Supabase API): план ${planLog}; main-шаблонов: библиотека bet162=${libBet}, spot064=${libSpot}; назначено билду ${assigned}/${pageFiles.length}; assets bet162=${bundles[SITE_TEMPLATE_BET162].size}, spot064=${bundles[SITE_TEMPLATE_SPOT064].size}.`
  );

  const overlay = `
ДВА ШАБЛОНА САЙТА (ротация по URL этого билда: ${planLog}):
- **1 (bet162)**: классическая шапка <header> сверху, контент с опорой на css/igaming.css (секции в духе ig-* или свой BEM с префиксом билда).
- **2 (spot064)**: body.has-lw-rail; навигация в <aside class="lw-site-rail"> (headerHtml); контент в .lw-site-col; подвал lw-footer-rich (footerHtml); css/site-shell.css.
- На каждой странице — **свой** inner <main> с эталона **того же номера шаблона** (index/games/payments/zerkalo; для loyalty/slots/faq — ближайший файл из библиотеки).
- Классы в <main>: единый логичный BEM-префикс билда; не union_index_*, не p1_e5b60fe2, не случайные хеши.
`.trim();

  const siteOverlay = `Референс-сайт: эталоны bet162 + spot064 из Supabase (план ${planLog}).`;

  return {
    signals,
    overlay,
    siteOverlay,
    templateCss: {
      igaming: getBundleAsset(bundles[SITE_TEMPLATE_BET162], "css/igaming.css"),
      siteShell: getBundleAsset(bundles[SITE_TEMPLATE_SPOT064], "css/site-shell.css"),
    },
  };
}

export async function readBundledIgamingCss(opts = {}) {
  const bundle = await getSiteTemplateBundle(SITE_TEMPLATE_BET162, opts);
  return getBundleAsset(bundle, "css/igaming.css");
}

export async function readBundledSiteShellCss(opts = {}) {
  const bundle = await getSiteTemplateBundle(SITE_TEMPLATE_SPOT064, opts);
  return getBundleAsset(bundle, "css/site-shell.css");
}

export function buildSiteTemplatePagePromptBlock({
  pageFile,
  templateId,
  classNamespace,
  isFirstPage = false,
  canonicalChromeForTemplate = null,
}) {
  const ns = classNamespace?.bemPrefix || "site-";
  const examples = classNamespace?.promptExamples || `${ns}hero`;
  const tplNum = TEMPLATE_LABEL[templateId] || "1";
  const lines = [
    `ШАБЛОН СТРАНИЦЫ ${pageFile}: вариант **${tplNum}** (${templateId === SITE_TEMPLATE_SPOT064 ? "левый rail + rich footer" : "шапка сверху + igaming"}).`,
    `CSS-классы в <main>: BEM с префиксом «${ns}» (примеры: ${examples}). Запрещены: union_index_*, ig_* (кроме утилит lw-games/#lw-games), хеши p1_e5b60f, page slug в имени класса.`,
  ];
  if (templateId === SITE_TEMPLATE_SPOT064) {
    lines.push(
      "- **headerHtml**: полный <aside class=\"lw-site-rail\">…</aside> (навигация, лого, CTA); верхний <header> на body не используй (пустая строка или не дублируй).",
      "- **footerHtml**: полный <footer class=\"lw-footer-rich\">…</footer> с блоком оплат и кратким legal.",
      "- Сборщик обернёт main в <div class=\"lw-site-col\"> и задаст body class has-lw-rail.",
      "- Подключи css/site-shell.css в head (сборщик добавит, если нет)."
    );
  } else {
    lines.push(
      "- **headerHtml**: полный <header> с горизонтальным меню и CTA (как премиум iGaming).",
      "- **footerHtml**: компактный <footer> с ссылками и копирайтом.",
      "- Опирайся на структуру секций эталона; стили секций — в pageCss + css/igaming.css."
    );
  }
  if (!isFirstPage && canonicalChromeForTemplate) {
    const h = String(canonicalChromeForTemplate.headerHtml || "").trim();
    const f = String(canonicalChromeForTemplate.footerHtml || "").trim();
    if (h || f) {
      lines.push(
        "SITE CHROME (тот же шаблон, что на первой странице этого типа): верни **тот же** headerHtml/footerHtml.",
        h ? `Эталон header/rail:\n${h.slice(0, 6000)}` : "",
        f ? `Эталон footer:\n${f.slice(0, 6000)}` : ""
      );
    }
  } else if (isFirstPage) {
    lines.push(
      "SITE CHROME: эта страница — **первая** с шаблоном " +
        tplNum +
        "; задай headerHtml/footerHtml для всех URL с тем же номером шаблона."
    );
  }
  return `\n${lines.filter(Boolean).join("\n")}\n`;
}

export function siteNeedsIgamingCss(plan) {
  return Object.values(plan || {}).some((t) => t === SITE_TEMPLATE_BET162);
}

export function siteNeedsSiteShellCss(plan) {
  return Object.values(plan || {}).some((t) => t === SITE_TEMPLATE_SPOT064);
}
