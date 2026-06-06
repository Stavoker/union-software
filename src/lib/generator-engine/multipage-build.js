import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getAppRoot, getProjectsDir, getImgGenDir } from "@/src/lib/app-paths";
import { rewriteAssetPaths } from "@/src/lib/html-adapter";
import { buildSiteManifestPlan } from "@/src/lib/site-manifest";
import { buildPageBlueprintPlan } from "@/src/lib/page-blueprints";
import {
  selectGenerationPromptProfileForBuild,
  formatGenerationPromptProfileBlock,
} from "@/src/lib/generation-prompt-profiles";
import {
  buildImagePools,
  formatBrandPromptOverlay,
  formatImagePoolsLogLine,
  resolveBannerImageFiles,
  resolveGameImageFiles,
  resolvePaymentImageFiles,
} from "@/lib/brand-image-pools";
import { buildSiteGenerationRulesBlock } from "@/lib/generator-engine/generation-site-rules";
import {
  formatSourceArticlesPromptBlock,
  loadSourceArticlesContextForBuild,
  pickSourceArticlesFromPool,
  resolveSourceArticlesSettings,
} from "@/lib/generator-engine/source-articles-for-generation";
import {
  selectReferenceSiteForBuild,
  formatReferenceSitePromptBlock,
  buildReferenceStructureOverlay,
  extractSectionRoleSequenceForSimilarity,
  detectLayoutFeaturesForSimilarity,
  resolveMainHtmlTemplateForPage,
  stripUnsafeChromeMarkup,
} from "@/src/lib/generation-reference-sites";
import {
  BRAND_BG,
  BRAND_BLOCK,
  BRAND_CARD,
  BRAND_TEXT,
  BRAND_ACCENT,
  DEFAULT_GATEWAY_URL,
  resolveGatewayUrlForBuild,
  pickLogoSrcForBuild,
  getBrandChromeCss,
  LAKI_LOGO_IMG_SRC,
  pickGameImages,
  buildIndexedGameSlots,
  buildGameTabSlotBatches,
  pickContentImagesForPage,
  CANONICAL_SLOT_GAME_FILENAMES,
  pickBrandChromeVariant,
  isBannerAsset,
  buildNavLinkMap,
  buildOrderedNavEntries,
  buildBrandHeaderHtml,
  buildBrandFooterHtml,
  buildSharedTemplateHeaderHtml,
  buildSharedTemplateFooterHtml,
  buildSharedTemplateSiteRailHtml,
  pickChromeLayoutSkins,
  pickChromeHeaderFooterOptions,
  uniqueSitePalettePromptBlock,
  uniqueSiteStructurePromptBlock,
  buildAiChromeBaselineCss,
  buildGamesBlockBaselineCss,
  buildMainInteractBaselineCss,
  buildPremiumLayoutPromptBlock,
  buildPremiumIgamingPromptIntro,
  buildPageTypographyBaselineCss,
  buildSiteChromeAuthoringBlock,
  buildSiteChromeReuseBlock,
  extractChromePairFromHtml,
} from "@/src/lib/brand-chrome";
import {
  buildAnthropicRequestHeaders,
  describeClaudeKeyForBuildLog,
  formatAnthropicHttpError,
  anthropicBaseUrlOverrideNote,
  getAnthropicMessagesUrl,
  isAcceptableClaudeApiKey,
  isLoopbackAnthropicNetError,
} from "@/lib/generator-llm-endpoint";
import {
  applyMultipageHtmlPostprocess,
  isBrokenLwSiteRailFragment,
  repairUnbalancedAnchorTags,
  rewriteInternalLinksInMainToPlan,
  runGeneratedSiteQualityGate,
  runMultipageHtmlQa,
} from "@/lib/generator-engine/multipage-postprocess";
import {
  ARCHITECT_JSON_TEMPERATURE,
  PAGE_JSON_TEMPERATURE,
  buildArchitectJsonSystemPrompt,
  buildEtalonMainSkeleton,
  buildPageForbiddenPromptBlock,
  buildPageJsonSystemPrompt,
  buildPageRegenFailureOverlay,
  computeClaudeSiteTokenBudgets,
  evaluatePageQualityRegen,
  readPromptTemperatureEnv,
  stripModelJsonFences,
} from "@/lib/generator-engine/multipage-prompt-contract";
import {
  isCrossBuildMemoryEnabled,
  isFreeGenerationMode,
  isPromptRegenEnabled,
  isPromptRewriteEnabled,
  isQualityRegenEnabled,
  usesTemplateChrome,
  usesPremiumIgamingLayout,
  usesDualSiteTemplates,
} from "@/lib/generator-engine/softgen-flags";
import {
  applyEtalonCloneTransforms,
  buildCloneModePromptBlock,
  buildSiteClassNamespace,
  buildSiteTemplatePagePromptBlock,
  formatTemplatePlanLog,
  loadDualEtalonReferencePack,
  loadSingleEtalonReferencePack,
  pickPageTemplatePlan,
  pickUniformPageTemplatePlan,
  readBundledIgamingCss,
  readBundledSiteShellCss,
  resolvePageSiteTemplate,
  mergeEtalonPageCss,
  mergeEtalonPageJs,
  markupUsesIgamingComponents,
  siteNeedsIgamingCss,
  siteNeedsSiteShellCss,
  SITE_TEMPLATE_SPOT064,
} from "@/lib/generator-engine/site-templates";
import {
  isBotGateGenerationMode,
  normalizeGenerationMode,
} from "@/lib/generator-engine/generation-modes";
import {
  etalonLabelForTemplateId,
  resolveEtalonTemplateForAlternatingIndex,
} from "@/lib/generator-engine/etalon-alternation";

const PROJECTS_DIR = getProjectsDir();

function navHrefForAiPrompt(href) {
  const h = String(href || "").trim();
  if (h === "/" || h === "") return "./index.php";
  if (/^https?:\/\//i.test(h)) return h;
  return h.startsWith("./") ? h : `./${h.replace(/^\.\//, "")}`;
}

function buildFallbackAiChromeHeader(classPrefix, chromeVariant, navLinks, opts = {}) {
  const entries = buildOrderedNavEntries(chromeVariant, navLinks || []);
  const navItems = entries
    .map(
      (e) =>
        `<a class="${classPrefix}nav-link" href="${navHrefForAiPrompt(e.href)}">${escapeHtmlLite(
          e.label
        )}</a>`
    )
    .join("");
  const logo = String(opts.logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const brand = escapeHtmlLite(String(opts.brandName || "Бренд").trim() || "Бренд");
  const gtw = String(opts.gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL;
  const showGw = opts.headerShowGatewayCtas !== false;
  const gwBtns = showGw
    ? `<a class="${classPrefix}btn ${classPrefix}btn-reg" href="${gtw}" target="_blank" rel="noopener noreferrer nofollow">Регистрация</a><a class="${classPrefix}btn ${classPrefix}btn-login" href="${gtw}" target="_blank" rel="noopener noreferrer nofollow">Вход</a>`
    : "";
  return `<header class="${classPrefix}site-header"><div class="${classPrefix}header-inner"><a class="${classPrefix}brand" href="./index.php"><img class="${classPrefix}logo lw-logo-img" src="${logo}" alt="${brand}"></a><nav class="${classPrefix}nav" aria-label="Основное меню">${navItems}</nav><div class="${classPrefix}header-actions">${gwBtns}</div></div></header>`;
}

function isWellFormedChromeFragment(html, tagName) {
  const s = String(html || "").trim();
  if (!s) return false;
  const tag = String(tagName || "").toLowerCase();
  const openRe = new RegExp(`<${tag}\\b`, "i");
  const closeRe = new RegExp(`</${tag}\\s*>`, "i");
  if (!openRe.test(s) || !closeRe.test(s)) return false;
  const opens = (s.match(openRe) || []).length;
  const closes = (s.match(closeRe) || []).length;
  return opens >= 1 && opens === closes;
}

/** Прибирає header/footer з main (збирач додає їх окремо в body). */
function stripChromeFromMain(mainHtml) {
  let out = String(mainHtml || "");
  out = out.replace(/<header\b[\s\S]*?<\/header>/gi, "");
  out = out.replace(/<footer\b[\s\S]*?<\/footer>/gi, "");
  out = out.replace(/<header\b[\s\S]*$/i, "");
  out = out.replace(/<footer\b[\s\S]*$/i, "");
  return out.trim();
}

function ensureMainClosedBeforeChrome(mainHtml) {
  let out = stripChromeFromMain(mainHtml);
  const lo = out.toLowerCase();
  if (!lo.includes("<main")) return out;
  if (lo.includes("</main>")) return out;
  return `${out}\n</main>`;
}

const WRAPPER_DIV_CLASS_RE = /\b(container|wrapper|inner|content)\b/i;

function divAttrsHaveWrapperClass(attrs) {
  const m = String(attrs || "").match(/\bclass\s*=\s*["']([^"']*)["']/i);
  return Boolean(m && WRAPPER_DIV_CLASS_RE.test(m[1]));
}

function isProseOnlyMarkup(fragment) {
  const stripped = String(fragment || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!stripped) return false;
  const tags = stripped.match(/<\/?([a-z0-9]+)\b/gi) || [];
  const allowed = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "span",
    "a",
  ]);
  for (const raw of tags) {
    const tag = raw.replace(/<\/?/i, "").toLowerCase();
    if (!allowed.has(tag)) return false;
  }
  return /<(p|h[1-6]|ul|ol)\b/i.test(stripped);
}

function flattenSectionInner(sectionInner) {
  let body = String(sectionInner || "");
  const singleDiv = body.trim().match(/^<div\b([^>]*)>([\s\S]*)<\/div\s*>$/i);
  if (singleDiv && divAttrsHaveWrapperClass(singleDiv[1])) {
    body = singleDiv[2];
  }
  body = body.replace(
    /<div\b[^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div\s*>\s*<\/div\s*>/gi,
    (full, innerContent) => (isProseOnlyMarkup(innerContent) ? innerContent : full)
  );
  return body;
}

/** Розгортання зайвих обгорток container/wrapper та div>div навколо prose. */
function flattenShallowWrapperDivsInMain(mainHtml) {
  let out = String(mainHtml || "");
  if (!/<main\b/i.test(out)) return out;
  for (let pass = 0; pass < 3; pass += 1) {
    const before = out;
    out = out.replace(
      /(<section\b[^>]*>)([\s\S]*?)(<\/section\s*>)/gi,
      (_, open, inner, close) => `${open}${flattenSectionInner(inner)}${close}`
    );
    if (out === before) break;
  }
  return out;
}

function buildMinimalLwGamesSectionHtml(classPrefix, gameSlotPaths, gatewayUrl) {
  const prefix = String(classPrefix || "");
  const gw =
    String(gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL;
  const paths = (Array.isArray(gameSlotPaths) ? gameSlotPaths : [])
    .filter(Boolean)
    .slice(0, 12);
  const cards = paths
    .map((p, i) => {
      const src = String(p || "").trim();
      if (!src) return "";
      return `<a class="${prefix}game-card" href="${escapeHtmlLite(gw)}" target="_blank" rel="noopener noreferrer nofollow"><img src="${escapeHtmlLite(src)}" alt="Слот ${i + 1}" loading="lazy"></a>`;
    })
    .filter(Boolean)
    .join("\n");
  return `<section id="lw-games" class="${prefix}games-wrap">
<h2 class="${prefix}games_heading">Игровые автоматы</h2>
<div class="${prefix}games_grid" role="list">
${cards}
</div>
</section>`;
}

function ensureLwGamesSectionOnIndex(mainHtml, opts = {}) {
  const html = String(mainHtml || "");
  const isIndex =
    opts.isIndex === true || isIndexPageFile(opts.pageFile || opts.file);
  if (!isIndex) return html;
  const paths = Array.isArray(opts.gameSlotPaths)
    ? opts.gameSlotPaths.filter(Boolean)
    : [];
  if (!paths.length) return html;
  if (/\bid\s*=\s*["']lw-games["']/i.test(html)) return html;
  const section = buildMinimalLwGamesSectionHtml(
    opts.classPrefix || "",
    paths,
    opts.gatewayUrl || DEFAULT_GATEWAY_URL
  );
  const mainRe = /(<main\b[^>]*>)([\s\S]*?)(<\/main\s*>)/i;
  const m = html.match(mainRe);
  if (!m) return html;
  const [, mainOpen, mainInner, mainClose] = m;
  const closeIdx = mainInner.search(/<\/section\s*>/i);
  let newInner;
  if (closeIdx >= 0) {
    const closeTag = mainInner.match(/<\/section\s*>/i)[0];
    const insertAt = closeIdx + closeTag.length;
    newInner = `${mainInner.slice(0, insertAt)}\n${section}${mainInner.slice(insertAt)}`;
  } else {
    newInner = `\n${section}${mainInner}`;
  }
  return html.replace(mainRe, `${mainOpen}${newInner}${mainClose}`);
}

/** Обрізаний pageCss ламає весь файл — відсікаємо незакриті правила перед guard-блоком. */
function repairUnbalancedPageCss(css) {
  let s = String(css || "");
  if (!s.trim()) return s;
  const guardIdx = s.search(/\/\*\s*[a-f0-9]{6,12}\s*\*\//i);
  const scanEnd = guardIdx >= 0 ? guardIdx : s.length;
  const head = s.slice(0, scanEnd);
  let depth = 0;
  let lastBalanced = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        lastBalanced = i + 1;
      }
    }
  }
  if (depth > 0) {
    if (lastBalanced > 0) {
      s = s.slice(0, lastBalanced) + (guardIdx >= 0 ? s.slice(guardIdx) : "");
    } else if (guardIdx >= 0) {
      s = s.slice(guardIdx);
    } else {
      s = "";
    }
  }
  return s.trim();
}

/** Відповідь моделі обірвалась посередині main / тега. */
function isMainHtmlLikelyTruncated(html) {
  const src = String(html || "").trim();
  if (!src) return true;
  if (/<main\b/i.test(src) && !/<\/main>/i.test(src)) return true;
  if (/[<][^>]*$/.test(src)) return true;
  const mainInner = (() => {
    const m = src.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (m) return m[1];
    const open = src.match(/<main\b[^>]*>([\s\S]*)$/i);
    return open ? open[1] : src;
  })();
  const tail = mainInner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (tail.length < 40) return false;
  const lastBit = tail.slice(-100);
  if (/[.!?…»")\]]\s*$/.test(lastBit)) return false;
  const openTags =
    (mainInner.match(/<(section|div|article|details|ul|ol|table|p)\b/gi) || [])
      .length;
  const closeTags =
    (mainInner.match(/<\/(section|div|article|details|ul|ol|table|p)>/gi) || [])
      .length;
  if (openTags > closeTags) return true;
  const lastWord = (lastBit.split(" ").pop() || "").trim();
  if (lastWord.length > 0 && lastWord.length < 14 && /[а-яёa-z]/i.test(lastWord)) {
    return true;
  }
  return false;
}

function repairCorruptedHtmlMarkup(html) {
  let out = String(html || "");
  out = out.replace(
    /(class=["'][^"']*)["']?\s*smooth['"]?\}\)["']?>/gi,
    '$1">'
  );
  out = out.replace(/<button\b([^>]*?)smooth['"]?\}\)["']?>/gi, "<button$1>");
  out = out.replace(/\bon\w+\s*=\s*["'][^"']*smooth[^"']*["']/gi, "");
  out = repairUnbalancedAnchorTags(out);
  return out;
}

function normalizeGatewayUrlsInHtml(html, gatewayUrl, brandName = "") {
  const gw = String(gatewayUrl || DEFAULT_GATEWAY_URL).trim();
  if (!gw || !html) return html;
  let canonical;
  try {
    canonical = new URL(gw);
  } catch {
    return html;
  }
  const brandSlug = String(brandName || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
  const gwHost = canonical.host.toLowerCase();
  return String(html).replace(
    /\bhref=(["'])([^"']+)\1/gi,
    (full, q, href) => {
      const raw = String(href || "").trim();
      if (!raw || raw.startsWith("./") || raw.startsWith("/") && !raw.startsWith("//")) {
        return full;
      }
      let u;
      try {
        u = new URL(raw.includes("://") ? raw : `https://${raw.replace(/^\/\//, "")}`);
      } catch {
        return full;
      }
      const host = u.host.toLowerCase();
      const brandGateway =
        brandSlug && host.includes(`${brandSlug}-gateway`);
      const wrongGateway =
        /gateway/i.test(host) && host !== gwHost;
      if (!wrongGateway && !brandGateway) return full;
      return `href=${q}${gw}${q}`;
    }
  );
}

function enforceRegistrationCtasToGateway(html, gatewayUrl) {
  const gw = String(gatewayUrl || DEFAULT_GATEWAY_URL).trim();
  if (!gw || !html) return html;
  const regText =
    /регистра|зарегистр|signup|получить\s+бонус|начать\s+играть|создать\s+аккаунт|войти\s+в\s+аккаунт/i;
  return String(html).replace(
    /<a\b([^>]*)\bhref=(["'])([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, pre, q, href, post, inner) => {
      const blob = `${pre} ${post} ${inner}`.replace(/<[^>]+>/g, " ");
      const isGatewayCta =
        /\b(lw-cta-solid|lw-cta-outline|lw-btn|lw-cta)\b/i.test(`${pre}${post}`) ||
        /\b(cta-btn|cta-button|btn-reg|hero-cta|game-card|cta_banner|cta-button)\b/i.test(
          `${pre}${post}`
        );
      const isReg = regText.test(blob);
      if (!isGatewayCta && !isReg) return full;
      if (/\.php(\?|#|$)/i.test(href) && !/gateway/i.test(href)) {
        const cleanPost = String(post || "")
          .replace(/\s*target\s*=\s*(["'])[^"']*\1/gi, "")
          .replace(/\s*rel\s*=\s*(["'])[^"']*\1/gi, "");
        return `<a${pre}href=${q}${gw}${q} target="_blank" rel="noopener noreferrer nofollow"${cleanPost}>${inner}</a>`;
      }
      if (/gateway/i.test(href) && href !== gw) {
        const cleanPost = String(post || "");
        return `<a${pre}href=${q}${gw}${q}${cleanPost.includes("target=") ? cleanPost : ` target="_blank" rel="noopener noreferrer nofollow"${cleanPost}`}>${inner}</a>`;
      }
      return full;
    }
  );
}

async function ensureProjectFaviconIco(imgDir, onLog) {
  const dir = String(imgDir || "").trim();
  if (!dir) return;
  const icoPath = path.join(dir, "favicon.ico");
  try {
    await fs.access(icoPath);
    return;
  } catch {
    /* create below */
  }
  for (const name of ["favicon.png", "favicon.webp", "Favicon.png", "logo.png"]) {
    const src = path.join(dir, name);
    try {
      await fs.copyFile(src, icoPath);
      emitLog(onLog, `img/: favicon.ico ← ${name}`);
      return;
    } catch {
      /* try next */
    }
  }
}

function buildFallbackAiChromeFooter(classPrefix, chromeVariant, navLinks, opts = {}) {
  const entries = buildOrderedNavEntries(chromeVariant, navLinks || []);
  const year = new Date().getFullYear();
  const brand = escapeHtmlLite(String(opts.brandName || "Бренд").trim() || "Бренд");
  const linkItems = entries
    .slice(0, 5)
    .map(
      (e, i) =>
        `${i > 0 ? '<span class="' + classPrefix + 'footer-sep"> · </span>' : ""}<a href="${navHrefForAiPrompt(e.href)}">${escapeHtmlLite(e.label)}</a>`
    )
    .join("");
  const logo = String(opts.logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const showLogo = opts.footerShowLogo !== false;
  const logoBlock = showLogo
    ? `<div class="${classPrefix}footer-brand"><img class="${classPrefix}footer-logo lw-footer-logo" src="${logo}" alt="${brand}"></div>`
    : "";
  return `<footer class="${classPrefix}site-footer" id="footer"><div class="${classPrefix}footer-inner">${logoBlock}<div class="${classPrefix}footer-links">${linkItems}</div><p class="${classPrefix}footer-copy">© ${year} ${brand}</p></div></footer>`;
}

function formatNavLayoutForAiPagePrompt(chromeVariant, navLinks) {
  try {
    const rows = buildOrderedNavEntries(chromeVariant, navLinks);
    if (!rows.length) {
      return "  (меню: главная ./index.php и внутренние .php из плана сайта)";
    }
    return rows
      .map(
        (e) =>
          `  • «${String(e.label || "")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/"/g, "'")}» → href="${navHrefForAiPrompt(e.href)}"`
      )
      .join("\n");
  } catch {
    return "";
  }
}

/** Санітизація header/footer з відповіді моделі (режим референс-chrome). */
function sanitizeModelChromeFragment(html) {
  return stripUnsafeChromeMarkup(String(html || ""));
}

/** У шапці/підвалі з класами lw-logo-img / lw-footer-logo примусово канонічний src. */
function enforceCanonicalLogoInChromeHtml(html, logoSrc = LAKI_LOGO_IMG_SRC) {
  const src = String(logoSrc || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  return String(html || "").replace(
    /<img\b(?=[^>]*\bclass=["'][^"']*(?:\blw-logo-img\b|\blw-footer-logo\b))([^>]*)>/gi,
    (_full, rest) => {
      const body = String(rest || "")
        .replace(/\bsrc\s*=\s*["'][^"']*["']/i, "")
        .trim();
      const gap = body ? (body.startsWith(" ") ? "" : " ") : "";
      return `<img src="${src}"${gap}${body}>`;
    }
  );
}

function applyChromeAliasClasses(html, opts = {}) {
  const src = String(html || "").trim();
  if (!src) return "";
  const seed = String(opts.seed || "chrome");
  const kind = String(opts.kind || "h");
  const variantNo = Math.max(1, Math.min(5, Number(opts.variantNo) || 1));
  const suffix = siteHash32(`${seed}|${kind}|v${variantNo}`)
    .toString(36)
    .slice(0, 5);
  const rootMarker = `ch-${kind}v${variantNo}-${suffix}`;
  let classAttrIdx = 0;
  let out = src.replace(
    /\bclass=(["'])([^"']+)\1/gi,
    (_full, quote, clsRaw) => {
      const base = String(clsRaw || "")
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!base.length) return _full;
      classAttrIdx += 1;
      const alias = [];
      for (const token of base) {
        if (!/^[a-z0-9_-]+$/i.test(token)) continue;
        alias.push(`${token}-${suffix}`);
      }
      if (classAttrIdx === 1) alias.push(rootMarker);
      const merged = [...new Set([...base, ...alias])];
      return `class=${quote}${merged.join(" ")}${quote}`;
    }
  );
  if (!/\bclass\s*=/i.test(out)) {
    out = out.replace(/<(header|footer|aside)\b/i, `<$1 class="${rootMarker}"`);
  }
  return out;
}

const AURORA_BUILD_PROGRESS = ".aurora_build_progress.json";

async function writeBuildProgress(outputDir, pagesTotal, pagesDone) {
  const payload = {
    pagesTotal,
    pagesDone,
    status:
      pagesTotal > 0 && pagesDone >= pagesTotal ? "complete" : "building",
  };
  await fs.writeFile(
    path.join(outputDir, AURORA_BUILD_PROGRESS),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

function canonicalMultipageFile(file) {
  const s = String(file || "").trim();
  const lower = s.toLowerCase();
  const legacy = {
    "index.html": "index.php",
    "reviews.html": "reviews.php",
    "registration.html": "registration.php",
    "payments.html": "payments.php",
  };
  return legacy[lower] || s;
}

function isIndexPageFile(file) {
  const l = String(file || "").trim().toLowerCase();
  return l === "index.php" || l === "index.html";
}

/** Multipage PHP wrapper: standard = HTML as-is; bot_gate = gate in config.php before output. */
function wrapMultipagePhpDocument(html, opts = {}) {
  const body = String(html || "");
  if (!isBotGateGenerationMode(opts.generationMode)) {
    return body;
  }
  return `<?php
require_once __DIR__ . '/config.php';
if (function_exists('aurora_maybe_redirect_human_visitor')) {
    aurora_maybe_redirect_human_visitor();
}
?>
${body}`;
}

function spot064ActiveNavKey(pageFile) {
  const f = String(pageFile || "").trim().toLowerCase();
  if (f === "index.php" || f === "index.html") return "index";
  return f.replace(/\.php$/i, "").replace(/[^a-z0-9_-]/gi, "") || "index";
}

function phpSingleQuoted(str) {
  return `'${String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")}'`;
}

/** partials/site-rail.php — як у u-spot064, навігація з фактичного плану сторінок. */
async function writeSpot064RailPartial(outputDir, opts = {}) {
  const entries = buildOrderedNavEntries(opts.chromeVariant, opts.navLinks || []);
  const navLines = entries
    .map((e) => {
      const hrefRaw = String(e.href || "").trim();
      const href =
        hrefRaw === "/" ? "./index.php" : hrefRaw.startsWith("./") ? hrefRaw : `./${hrefRaw.replace(/^\.\//, "")}`;
      const key = spot064ActiveNavKey(href.replace(/^\.\//, ""));
      return `  ${phpSingleQuoted(key)} => ['href' => ${phpSingleQuoted(href)}, 'label' => ${phpSingleQuoted(e.label)}],`;
    })
    .join("\n");
  const payEntry =
    entries.find((e) => /payments/i.test(String(e.href || ""))) ||
    entries.find((e) => !/index/i.test(String(e.href || "")));
  const secondaryHref = payEntry
    ? payEntry.href === "/"
      ? "./index.php"
      : String(payEntry.href || "").startsWith("./")
        ? payEntry.href
        : `./${String(payEntry.href || "").replace(/^\.\//, "")}`
    : "./index.php";
  const gateway = phpSingleQuoted(opts.gatewayUrl || DEFAULT_GATEWAY_URL);
  const secondaryPhp = phpSingleQuoted(secondaryHref);
  const content = `<?php
$lwActiveNav = $lwActiveNav ?? 'index';
$lwGateway = ${gateway};
$lwSecondaryHref = ${secondaryPhp};
$lwNav = [
${navLines}
];
?>
<aside class="lw-site-rail" id="site-rail" aria-label="Навигация сайта">
  <a class="lw-site-rail__logo" href="./index.php" aria-label="${String(opts.brandAlt || "Главная").replace(/"/g, "&quot;")}">
    <img src="./img/logo.png" alt="${String(opts.brandAlt || "Логотип").replace(/"/g, "&quot;")}" class="lw-logo-img lw-site-rail__logo-img">
  </a>
  <nav class="lw-site-rail__nav" aria-label="Основное меню">
    <?php foreach ($lwNav as $key => $item): ?>
      <?php
      $active = $lwActiveNav === $key;
      $cls = 'lw-site-rail__link' . ($active ? ' is-active' : '');
      ?>
      <a
        href="<?php echo htmlspecialchars($item['href'], ENT_QUOTES, 'UTF-8'); ?>"
        class="<?php echo $cls; ?>"
        <?php echo $active ? ' aria-current="page"' : ''; ?>
      >
        <span class="lw-site-rail__link-label"><?php echo htmlspecialchars($item['label'], ENT_QUOTES, 'UTF-8'); ?></span>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="lw-site-rail__bottom">
    <a
      class="lw-site-rail__cta"
      href="<?php echo htmlspecialchars($lwGateway, ENT_QUOTES, 'UTF-8'); ?>"
      target="_blank"
      rel="noopener noreferrer nofollow"
    >Регистрация</a>
    <a class="lw-site-rail__secondary" href="<?php echo htmlspecialchars($lwSecondaryHref, ENT_QUOTES, 'UTF-8'); ?>">Касса</a>
  </div>
</aside>
`;
  const partialDir = path.join(outputDir, "partials");
  await fs.mkdir(partialDir, { recursive: true });
  await fs.writeFile(path.join(partialDir, "site-rail.php"), content, "utf8");
}

function buildSpot064RailInclude(pageFile) {
  const key = spot064ActiveNavKey(pageFile);
  return `<?php $lwActiveNav = ${phpSingleQuoted(key)}; include __DIR__ . '/partials/site-rail.php'; ?>`;
}

function isSpot064RailBlock(html) {
  const s = String(html || "");
  return /<aside\b/i.test(s) || /partials\/site-rail\.php/i.test(s);
}

function spot064OrCompactHeaderFallback(
  pageSiteTemplateAsm,
  ctx,
  pageMeta,
  headerChromeOpts,
  classPrefix,
  presetId = 1
) {
  if (pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064) {
    return resolveSpot064RailHtml(ctx, pageMeta, headerChromeOpts, presetId);
  }
  return buildFallbackAiChromeHeader(
    classPrefix,
    ctx.chromeVariant,
    ctx.navLinks || [],
    headerChromeOpts
  );
}

function resolveSpot064RailHtml(ctx, pageMeta, headerChromeOpts, presetId) {
  if (ctx.spot064RailPartialReady) {
    return buildSpot064RailInclude(pageMeta.file);
  }
  return applyChromeAliasClasses(
    enforceCanonicalLogoInChromeHtml(
      buildSharedTemplateSiteRailHtml({
        presetId,
        variant: ctx.chromeVariant,
        navLinks: ctx.navLinks || [],
        gatewayUrl: headerChromeOpts.gatewayUrl,
        logoSrc: headerChromeOpts.logoSrc,
        brandAlt: headerChromeOpts.brandAlt,
        ctaPrimary: ctx.chromeVariant?.ctaPrimary,
        activeNavKey: spot064ActiveNavKey(pageMeta.file),
      }),
      ctx.logoSrc || LAKI_LOGO_IMG_SRC
    ),
    {
      seed: `${ctx.structureSeed || ""}|${ctx.buildNonce || ""}|spot064`,
      kind: "h",
      variantNo: Number(presetId) || 1,
    }
  );
}

/** У зовнішніх css/page-N.css шлях url(./img/...) має бути ../img/ (база — папка css/). */
function rewriteImgUrlsForExternalPageCss(cssText) {
  return String(cssText || "").replace(
    /url\(\s*(['"]?)\.\/img\//gi,
    "url($1../img/"
  );
}
/** Візуальна мова білду: палітра та `./img/` лише з контексту поточної генерації (без копіювання верстки сторонніх сайтів як зразка). */
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
/** Оновлюється в syncGeneratorLimitsFromEnv() після withUserIntegrationEnv. */
let GENERATION_TEMPERATURE = 0.88;
/** Ліміти виводу Claude; оновлюються в syncGeneratorLimitsFromEnv() перед збіркою. */
let PAGE_MAX_TOKENS = 28672;
let ARCHITECT_MAX_TOKENS = 12288;
let JS_FIX_MAX_TOKENS = PAGE_MAX_TOKENS;
const PROMPT_REGEN_MAX_TOKENS = Math.max(
  512,
  Math.min(4096, Number(process.env.SOFTGEN_PROMPT_REGEN_MAX_TOKENS) || 1200)
);
/** Якщо 0 — при перегенерації сторінки (quality retry) не викликати Claude rewrite промпта, лише base prompt + entropy/urgency. 1 — як раніше, rewrite на кожній спробі. */
const PROMPT_REWRITE_PAGE_ON_RETRY = String(
  process.env.SOFTGEN_PROMPT_REWRITE_PAGE_ON_RETRY ?? "0"
).trim() !== "0";
/** Якщо 1 — збірка обов'язково вимагає валідний reference_url + структурний snapshot; інакше кидаємо помилку, щоб не генерувати випадковий каркас. */
const REQUIRE_REFERENCE_STRUCTURE = String(
  process.env.SOFTGEN_REQUIRE_REFERENCE_STRUCTURE ?? "0"
).trim() !== "0";
/** Поріг ref-structure (каркас vs знімок); за замовчуванням ~92% — вища схожість з референсом. Env SOFTGEN_REFERENCE_SIMILARITY_THRESHOLD перебиває. */
const REFERENCE_STRUCTURE_SIMILARITY_THRESHOLD = Math.max(
  0.6,
  Math.min(0.98, Number(process.env.SOFTGEN_REFERENCE_SIMILARITY_THRESHOLD) || 0.92)
);
/** Мінімальна схожість порядку ролей секцій (LCS); за замовчуванням трохи жорсткіше під «як у референса». */
const REFERENCE_SECTION_ORDER_MIN = Math.max(
  0.3,
  Math.min(0.98, Number(process.env.SOFTGEN_REFERENCE_SECTION_ORDER_MIN) || 0.75)
);
const REFERENCE_SIMILARITY_CHECK_INDEX_ONLY = String(
  process.env.SOFTGEN_REFERENCE_SIMILARITY_CHECK_INDEX_ONLY ?? "1"
).trim() !== "0";
/**
 * Режим шаблону: один `reference_url` → один знятий inner `<main>` як **еталон дизайну** для **усіх** сторінок пакета.
 * LLM підставляє бренд, кольори, `./img/`, тексти й обсяг; каркас той самий, без пошуку окремих URL на референсі під кожен файл.
 * Увімкнення: `SOFTGEN_REFERENCE_TEMPLATE_MODE=1` і/або `referenceTemplateMode` у job.
 */
const REFERENCE_TEMPLATE_MODE_DEFAULT = String(
  process.env.SOFTGEN_REFERENCE_TEMPLATE_MODE ?? "0"
).trim() === "1";
/** Спроби Claude text-fill для @@PHn@@; після вичерпання — за замовчуванням збірка **не** падає (див. SOFTGEN_STRICT_PLACEHOLDER_FILL). */
const TEXT_FILL_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(6, Number(process.env.SOFTGEN_TEXT_FILL_MAX_ATTEMPTS) || 3)
);

/**
 * Ціле з env: trim, лише скінченні > 0, інакше defaultValue.
 * @param {string} name
 * @param {number} defaultValue
 * @param {number} min
 * @param {number} max
 */
function readPositiveIntEnv(name, defaultValue, min, max) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/**
 * Сумарний орієнтир **output**-токенів Claude на один сайт.
 * Env: `AURORA_CLAUDE_SITE_OUTPUT_BUDGET` (ціле, 4096…500000, за замовчуванням 400000).
 */
let SITE_CLAUDE_OUTPUT_BUDGET = 400000;

/** Читає ліміти з process.env (після withUserIntegrationEnv — з Settings користувача). */
function syncGeneratorLimitsFromEnv() {
  PAGE_MAX_TOKENS = Math.max(
    1,
    Number(process.env.ANTHROPIC_MAX_TOKENS_PAGE) || 28672
  );
  ARCHITECT_MAX_TOKENS = Math.max(
    1,
    Number(process.env.ANTHROPIC_MAX_TOKENS_ARCHITECT) || 12288
  );
  JS_FIX_MAX_TOKENS = Math.max(
    1,
    Number(process.env.ANTHROPIC_MAX_TOKENS_JSFIX) || PAGE_MAX_TOKENS
  );
  SITE_CLAUDE_OUTPUT_BUDGET = readPositiveIntEnv(
    "AURORA_CLAUDE_SITE_OUTPUT_BUDGET",
    400000,
    4096,
    500000
  );
  MIN_PAGE_WORDS = readPositiveIntEnv("SOFTGEN_MIN_PAGE_WORDS", 950, 200, 5000);
  MIN_INDEX_PAGE_WORDS = readPositiveIntEnv(
    "SOFTGEN_MIN_INDEX_PAGE_WORDS",
    MIN_PAGE_WORDS,
    200,
    5000
  );
  MAX_PAGE_WORDS = readPositiveIntEnv("SOFTGEN_MAX_PAGE_WORDS", 2000, 500, 8000);
  MAIN_WORD_VOLUME_GUIDE = `${MIN_PAGE_WORDS}–${MAX_PAGE_WORDS}`;
  const tempRaw = Number(process.env.AURORA_GENERATION_TEMPERATURE);
  GENERATION_TEMPERATURE = Math.max(
    0.75,
    Math.min(1, Number.isFinite(tempRaw) ? tempRaw : 0.88)
  );
}

function emitLog(onLog, message) {
  if (typeof onLog !== "function") return;
  const line = `[${new Date().toISOString()}] ${String(message || "").trim()}`;
  try {
    onLog(line);
  } catch {
    /* ignore */
  }
}

function maskApiKey(key) {
  const s = String(key || "").trim();
  if (!s) return "(нет)";
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
}

/** Сигнал для fetch: таймаут + періодична перевірка shouldStop (скасування job). */
function buildLlmAbortSignal(shouldStop, timeoutMs) {
  const ctrl = new AbortController();
  const iv = setInterval(() => {
    if (typeof shouldStop === "function" && shouldStop()) {
      try {
        ctrl.abort(
          typeof DOMException !== "undefined"
            ? new DOMException("Генерация остановлена пользователем.", "AbortError")
            : new Error("Генерация остановлена пользователем.")
        );
      } catch {
        try {
          ctrl.abort();
        } catch {
          /* ignore */
        }
      }
    }
  }, 1500);
  const dispose = () => {
    clearInterval(iv);
  };
  let signal = ctrl.signal;
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      const t = AbortSignal.timeout(timeoutMs);
      if (typeof AbortSignal.any === "function") {
        signal = AbortSignal.any([ctrl.signal, t]);
      }
    }
  } catch {
    signal = ctrl.signal;
  }
  try {
    signal.addEventListener("abort", dispose, { once: true });
  } catch {
    dispose();
  }
  return { signal, dispose };
}

function sanitizeProjectName(name) {
  const value = String(name || "").trim();
  if (!value) {
    throw new Error("Укажи название проекта.");
  }
  const safe = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!safe) {
    throw new Error("Некорректное название проекта.");
  }
  return safe;
}

const THEME_BRAND_NICHE_BREAK_RE =
  /\b(игровые|автоматы|слоты|казино|букмекер|ставки|беттинг|покер|онлайн|официальный|сайт|зеркало|бонусы|слот|аппараты|рулетк|карт|лотере|турнир|vip|бет|bet|casino|slots|poker|betting|sportsbook|jackpot)\b/i;

function deriveBrandHintFromTheme(theme) {
  const raw = String(theme || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  let segment = raw.split(/[,;(]/)[0]?.trim() || raw;
  const m = segment.match(THEME_BRAND_NICHE_BREAK_RE);
  if (m && m.index != null && m.index > 0) {
    segment = segment.slice(0, m.index).trim();
  }
  if (!segment) segment = raw.split(/\s+/).slice(0, 4).join(" ");
  return segment.slice(0, 100).trim();
}

/** Публічна назва з вибору в UI (app: brandKey laki | lakiworld). */
function publicBrandLabelFromBrandKey(brandKey) {
  const k = String(brandKey || "").trim().toLowerCase();
  if (k === "lakiworld") return "Лаки Ворлд";
  if (k === "laki") return "Лаки";
  return "";
}

/** Підказка бренду для промптів: спочатку явний вибір користувача, інакше — зріз теми. */
function resolveThemeBrandHint(themeNorm, brandKeyNorm) {
  const fromKey = publicBrandLabelFromBrandKey(brandKeyNorm);
  if (fromKey) return fromKey;
  return deriveBrandHintFromTheme(themeNorm);
}

function scrubTechnicalProjectSlugFromHtml(html, slug, replacement) {
  const s = String(slug || "").trim();
  const rep = String(replacement || "").trim();
  if (!s || !rep || s.toLowerCase() === rep.toLowerCase()) {
    return String(html || "");
  }
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html || "").replace(new RegExp(esc, "gi"), rep);
}

function normalizeSiteUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    // origin у Node/браузері для IDN уже в punycode (ASCII)
    return url.origin;
  } catch {
    return "";
  }
}

function buildCanonicalHrefForPage(baseUrl, pageFile) {
  const origin = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!origin) return "";
  if (isIndexPageFile(pageFile)) {
    return `${origin}/`;
  }
  const name = String(pageFile || "").replace(/^\//, "").trim();
  if (!name) return `${origin}/`;
  return `${origin}/${name}`;
}

/**
 * Прибирає сміття з <head>: keywords, ld+json; canonical лише з baseUrl (ASCII).
 */
function sanitizeMultipageHeadHtml(headHtml, baseUrl, pageFile) {
  let head = String(headHtml || "");
  head = head.replace(/<meta\b[^>]*\bname=["']keywords["'][^>]*>/gi, "");
  head = head.replace(
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
  const canonHref = buildCanonicalHrefForPage(baseUrl, pageFile);
  if (canonHref) {
    const canonTag = `<link rel="canonical" href="${escapeHtmlText(canonHref)}">`;
    if (/<link\b[^>]*\brel=["']canonical["'][^>]*>/i.test(head)) {
      head = head.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, canonTag);
    } else {
      head = head.replace(/<\/head>/i, `\n${canonTag}\n</head>`);
    }
  }
  return head;
}

function resolveWindowApiKey(windowId, override) {
  const fromBody = String(override || "").trim();
  if (fromBody) return fromBody;
  const envKeys = [
    process.env[`ANTHROPIC_API_KEY_W${windowId}`]?.trim(),
    process.env[`CLAUDE_API_KEY_${windowId}`]?.trim(),
    process.env[`ANTHROPIC_WINDOW_${windowId}`]?.trim(),
  ].filter(Boolean);
  if (envKeys.length) return envKeys[0];
  throw new Error(
    `Нет API-ключа для окна ${windowId}: задайте ключ в UI или env ANTHROPIC_API_KEY_W${windowId}.`
  );
}

/**
 * Витягує перший кореневий `{…}` з урахуванням рядків і escape — надійніше за `lastIndexOf("}")`
 * (останній `}` може бути всередині рядка або в хвості сміття після валідного JSON).
 */
function extractBalancedJsonObject(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

/** Прибирає зайві коми перед `}` та `]` (типова помилка LLM). */
function stripJsonTrailingCommas(jsonStr) {
  return String(jsonStr || "").replace(/,(\s*[\]}])/g, "$1");
}

/** Знімає зовнішні ``` / ```json … ``` навіть якщо немає закриваючого паркану (Claude інколи обриває). */
function stripOuterMarkdownCodeFence(text) {
  let s = String(text || "").trim();
  if (!/^```(?:json)?/i.test(s)) return s;
  s = s.replace(/^```(?:json)?\s*/i, "");
  const last = s.lastIndexOf("```");
  if (last !== -1) s = s.slice(0, last);
  return s.trim();
}

/**
 * Видаляє верхньорівневу властивість "jsonLd": { … } (зі скануванням рядків).
 * Архітектор часто вставляє schema.org з лапками в description і ламає JSON; збірник використовує лише brandName + pages.
 */
function stripTopLevelJsonLdProperty(jsonish) {
  const s = String(jsonish || "");
  const needle = '"jsonLd"';
  const keyPos = s.indexOf(needle);
  /* Тільки на початку відповіді архітектора; у великому JSON сторінки теоретично може зустрітись підрядник "jsonLd" у HTML. */
  if (keyPos === -1 || keyPos > 12000) return s;

  let cutStart = keyPos;
  while (cutStart > 0 && /\s/.test(s[cutStart - 1])) cutStart -= 1;
  if (cutStart > 0 && s[cutStart - 1] === ",") cutStart -= 1;

  let pos = keyPos + needle.length;
  while (pos < s.length && /\s/.test(s[pos])) pos += 1;
  if (pos >= s.length || s[pos] !== ":") return s;
  pos += 1;
  while (pos < s.length && /\s/.test(s[pos])) pos += 1;
  if (pos >= s.length || s[pos] !== "{") return s;

  const braceStart = pos;
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = braceStart; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        const end = i + 1;
        const before = s.slice(0, cutStart);
        let after = s.slice(end).replace(/^\s*,\s*/, "");
        return `${before}${after}`.trim();
      }
    }
  }
  return s;
}

function collectJsonParseVariants(candidateIn) {
  const candidate = String(candidateIn || "").trim();
  const variants = [];
  const push = (v) => {
    const t = String(v || "").trim();
    if (t && !variants.includes(t)) variants.push(t);
  };
  push(candidate);
  const balanced = extractBalancedJsonObject(candidate);
  if (balanced) {
    push(balanced);
    push(stripJsonTrailingCommas(balanced));
  }
  push(stripJsonTrailingCommas(candidate));
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = candidate.slice(start, end + 1);
    push(slice);
    push(stripJsonTrailingCommas(slice));
  }
  return variants;
}

function extractJsonObject(text) {
  const raw0 = String(text || "").trim();
  const roots = [];
  const pushRoot = (r) => {
    const t = String(r || "").trim();
    if (t && !roots.includes(t)) roots.push(t);
  };
  pushRoot(stripModelJsonFences(raw0));
  pushRoot(raw0);
  const fenced = raw0.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) pushRoot(String(fenced[1] || "").trim());
  pushRoot(stripOuterMarkdownCodeFence(raw0));
  for (const r of [...roots]) {
    pushRoot(stripTopLevelJsonLdProperty(r));
  }

  let lastErr = "Модель не вернула JSON.";
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      return null;
    }
  };

  for (const root of roots) {
    for (const v of collectJsonParseVariants(root)) {
      const parsed = tryParse(v);
      if (parsed) return parsed;
    }
  }
  throw new Error(lastErr);
}

/**
 * Витягує значення JSON-рядка для ключа "key" з сирого тексту навіть якщо весь об'єкт битий
 * (наприклад, незакрита лапка або обрізана відповідь).
 */
function extractJsonStringField(rawText, key) {
  const raw = String(rawText || "");
  const keyNeedle = `"${key}"`;
  let pos = raw.indexOf(keyNeedle);
  if (pos === -1) return null;
  pos = raw.indexOf(":", pos + keyNeedle.length);
  if (pos === -1) return null;
  pos += 1;
  while (pos < raw.length && /\s/.test(raw[pos])) pos++;
  if (raw[pos] !== '"') return null;
  pos += 1;
  let out = "";
  let esc = false;
  for (; pos < raw.length; pos++) {
    const ch = raw[pos];
    if (esc) {
      if (ch === "n") out += "\n";
      else if (ch === "r") out += "\r";
      else if (ch === "t") out += "\t";
      else if (ch === "u" && /^[0-9a-fA-F]{4}/.test(raw.slice(pos + 1, pos + 5))) {
        out += String.fromCharCode(parseInt(raw.slice(pos + 1, pos + 5), 16));
        pos += 4;
      } else out += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
  }
  return out.length ? out : null;
}

function extractHeadFromRaw(rawText) {
  const raw = String(rawText || "");
  const m = raw.match(/<head\b[^>]*>[\s\S]*?<\/head>/i);
  return m ? m[0].trim() : null;
}

/** Відповідь моделі без mainHtml (типово output≈6 через проксі / обрізання). */
function isTrivialLayoutModelText(text) {
  const s = String(text || "").trim();
  if (s.length < 120) return true;
  if (!/"mainHtml"\s*:/i.test(s) && !/<main\b/i.test(s)) return true;
  return false;
}

/**
 * Парсинг відповіді сторінки: спочатку валідний JSON, інакше евристики + часткові поля.
 */
function parsePageBundleFromModelText(text, pageFile, classPrefix) {
  const prefix =
    String(classPrefix || "p_rec_").replace(/[^a-zA-Z0-9_-]/g, "") || "p_rec_";

  try {
    const data = extractJsonObject(text);
    if (data && data.mainHtml) {
      data.headHtml = repairHeadHtmlFromModelOutput(data.headHtml, text);
      data.headerHtml = String(data.headerHtml ?? "").trim();
      data.footerHtml = String(data.footerHtml ?? "").trim();
      return data;
    }
  } catch {
    /* fallback нижче */
  }

  const mainFromKey = extractJsonStringField(text, "mainHtml");
  const headFromKey = extractJsonStringField(text, "headHtml");
  const cssFromKey = extractJsonStringField(text, "pageCss");
  const jsFromKey = extractJsonStringField(text, "pageJs");

  let mainFromTags =
    pickMainFromBrokenJson(text, pageFile) ||
    (mainFromKey && mainFromKey.trim().toLowerCase().includes("<main")
      ? mainFromKey.trim()
      : null);

  if (!mainFromTags && mainFromKey && mainFromKey.trim().length > 80) {
    mainFromTags = mainFromKey.trim();
  }

  const headFromTags = extractHeadFromRaw(text) || headFromKey;

  if (!mainFromTags) {
    throw new Error("Не удалось извлечь mainHtml из ответа модели.");
  }

  if (!/<main\b/i.test(mainFromTags)) {
    mainFromTags = `<main class="${prefix}recovered-wrap">${mainFromTags}</main>`;
  }

  const headHtml =
    headFromTags && /^<head\b/i.test(String(headFromTags).trim())
      ? String(headFromTags).trim()
      : null;

  const mergedHead = repairHeadHtmlFromModelOutput(
    headHtml ||
      (headFromKey ? normalizeEscapedHtmlFragment(headFromKey) : ""),
    text
  );

  const headerFromKey = extractJsonStringField(text, "headerHtml");
  const footerFromKey = extractJsonStringField(text, "footerHtml");

  return {
    headHtml: mergedHead,
    headerHtml: headerFromKey != null ? String(headerFromKey).trim() : "",
    mainHtml: mainFromTags,
    footerHtml: footerFromKey != null ? String(footerFromKey).trim() : "",
    pageCss: cssFromKey != null ? cssFromKey : "",
    pageJs: jsFromKey != null ? jsFromKey : "",
  };
}

async function callClaudeOnly({
  apiKey,
  system,
  user,
  maxTokens = 8192,
  temperature = GENERATION_TEMPERATURE,
  onLog,
  shouldStop,
  budgetTracker,
}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Пустой Claude API key.");
  if (!isAcceptableClaudeApiKey(key)) {
    throw new Error(
      "Недопустимый Claude API key. Для Anthropic — sk-ant-…; для локального прокси задайте ANTHROPIC_BASE_URL (напр. http://localhost:3001) и ключ прокси sk-…"
    );
  }
  if (budgetTracker && Number(budgetTracker.used || 0) >= Number(budgetTracker.budget || 0)) {
    throw new Error(
      `Claude budget exceeded: used=${Number(budgetTracker.used || 0)}, budget=${Number(budgetTracker.budget || 0)}`
    );
  }
  emitLog(onLog, "LLM: Claude (тексты)");
  const messagesUrl = getAnthropicMessagesUrl(key);
  const baseOverrideNote = anthropicBaseUrlOverrideNote(key);
  if (baseOverrideNote) {
    emitLog(onLog, baseOverrideNote);
  }
  emitLog(onLog, `LLM endpoint: ${messagesUrl}`);

  const payload = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: String(system || "").slice(0, 200000),
    messages: [{ role: "user", content: user }],
  });

  let lastErr = null;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutMs = Math.max(
      120000,
      Number(process.env.ANTHROPIC_FETCH_TIMEOUT_MS) || 480000
    );
    const { signal, dispose } = buildLlmAbortSignal(shouldStop, timeoutMs);
    try {
      let res;
      let rawText = "";
      try {
        res = await fetch(messagesUrl, {
          method: "POST",
          headers: buildAnthropicRequestHeaders(key),
          body: payload,
          signal,
        });
        rawText = await res.text();
      } catch (e) {
        const aborted = /abort|aborted|stopped/i.test(String(e?.message || e?.name || ""));
        if (aborted) {
          throw new Error("Генерация остановлена пользователем.");
        }
        const code = e?.cause?.code || e?.code || "";
        const netHint = isLoopbackAnthropicNetError(messagesUrl, code, e)
          ? " — перевірте, що проксі запущений локально, або очистіть ANTHROPIC_BASE_URL у Settings для прямого sk-ant-"
          : "";
        lastErr = new Error(
          `Anthropic network error (${messagesUrl}): ${e?.message || "unknown"}${code ? ` [${code}]` : ""}${netHint}`
        );
        if (attempt < maxAttempts) {
          emitLog(
            onLog,
            `Anthropic retry ${attempt}/${maxAttempts - 1}: network error → ${messagesUrl}${code ? ` (${code})` : ""}`
          );
          await sleepMs(getRetryDelayMs(attempt));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const msg = formatAnthropicHttpError(res.status, rawText, key);
        const transient =
          res.status === 429 ||
          res.status === 529 ||
          (res.status >= 500 && res.status < 600);
        lastErr = new Error(msg);
        if (transient && attempt < maxAttempts) {
          emitLog(
            onLog,
            `Anthropic retry ${attempt}/${maxAttempts - 1}: HTTP ${res.status}, ждём перед повтором`
          );
          await sleepMs(getRetryDelayMs(attempt));
          continue;
        }
        throw lastErr;
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        lastErr = new Error("Anthropic: невалидный JSON ответа.");
        if (attempt < maxAttempts) {
          await sleepMs(getRetryDelayMs(attempt));
          continue;
        }
        break;
      }
      const blocks = data?.content;
      if (!Array.isArray(blocks)) {
        lastErr = new Error("Anthropic: пустой content.");
        if (attempt < maxAttempts) {
          await sleepMs(getRetryDelayMs(attempt));
          continue;
        }
        break;
      }
      const u = data?.usage;
      if (u && typeof onLog === "function") {
        const inp = u.input_tokens;
        const out = u.output_tokens;
        if (budgetTracker) {
          const outN = Number.isFinite(Number(out)) ? Number(out) : 0;
          budgetTracker.used = Number(budgetTracker.used || 0) + outN;
          emitLog(
            onLog,
            `Claude budget: used=${budgetTracker.used}/${budgetTracker.budget} output-токенов`
          );
        }
        emitLog(
          onLog,
          `TOKENS Claude (запрос): input≈${inp ?? "?"}, output≈${out ?? "?"}`
        );
      }
      return blocks
        .filter((b) => b?.type === "text")
        .map((b) => b.text)
        .join("\n");
    } finally {
      dispose();
    }
  }

  throw lastErr || new Error("Anthropic: не удалось получить ответ.");
}

async function callDeepseekChat({
  apiKey,
  system,
  user,
  maxTokens = PAGE_MAX_TOKENS,
  temperature = GENERATION_TEMPERATURE,
  onLog,
  shouldStop,
  budgetTracker,
}) {
  emitLog(onLog, "LLM: Claude (вёрстка / JSON-страница)");
  return callClaudeOnly({
    apiKey,
    system,
    user,
    maxTokens,
    temperature,
    onLog,
    shouldStop,
    budgetTracker,
  });
}

const LAYOUT_PLACEHOLDER_BLOCK = `
---
РЕЖИМ ВЁРСТКИ (Claude-only): сгенерируй полноценный финальный HTML/CSS/JS и сразу финальный русский текст для людей (без промежуточных плейсхолдеров @@PHn@@).
В <main> — лонгрид с полноценными абзацами и списками; не делай «коллаж» из картинок и не делай стену таблиц.
Где нужен русский: <title>, meta description, видимый текст и длинные строки в <main>, подписи к изображениям, aria-label/title — сразу финальный русский текст.
Исключения без плейсхолдера: короткие латинские аббревиатуры (VIP, FAQ, RTP, JS, CSS), числа, символы %, пути ./img/..., URL шлюза регистрации (домен из билда).
Не используй маркеры @@PHn@@. Сохрани требования к JSON и экранированию из system/user выше.`;

function collectPhPlaceholders(...parts) {
  const re = /@@PH(\d+)@@/g;
  const seen = new Set();
  for (const part of parts) {
    const s = String(part || "");
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(s)) !== null) {
      seen.add(`@@PH${m[1]}@@`);
    }
  }
  return [...seen].sort((a, b) => {
    const na = Number(String(a).match(/\d+/)?.[0]) || 0;
    const nb = Number(String(b).match(/\d+/)?.[0]) || 0;
    return na - nb;
  });
}

function applyPlaceholderReplacements(html, replacements) {
  let out = String(html || "");
  const map = replacements && typeof replacements === "object" ? replacements : {};
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = map[k];
    if (v == null) continue;
    out = out.split(k).join(String(v));
  }
  return out;
}

function buildPageTextFillUser({
  theme,
  pageMeta,
  avoidPhrases,
  brandTerms,
  minPageWords,
  headHtml,
  mainHtml,
  placeholders,
}) {
  const headSnippet = String(headHtml || "").slice(0, 12000);
  const mainSnippet = String(mainHtml || "").slice(0, 140000);
  const avoid = Array.isArray(avoidPhrases) ? avoidPhrases.filter(Boolean).slice(0, 30) : [];
  return `Ты копирайтер для статического сайта казино/беттинга (русский язык).

Тема: ${theme}
Файл страницы: ${pageMeta.file}
Роль: ${pageMeta.role}
Плановый title: ${pageMeta.title}
Плановый description: ${pageMeta.description}
Ракурс: ${String(pageMeta.contentAngle || "")}
Тон: ${String(pageMeta.tone || "")}
Брендовые термины (естественно в тексте): ${(brandTerms || []).join(", ") || "—"}
Минимум слов в <main> после подстановки: ${minPageWords} (ориентир до ${MAX_PAGE_WORDS}; суммарно по всем значениям replacements для маркеров внутри <main> — не меньше ${minPageWords} слов русского текста, ориентир ${minPageWords}–${MAX_PAGE_WORDS}; каждый маркер — несколько предложений где уместно).
Не повторяй дословно фразы: ${avoid.length ? avoid.join(" | ") : "—"}

Заголовки в <h1>–<h3> (текст в значениях replacements): короткий справочный тон, без метафор. ${isIndexPageFile(pageMeta.file) ? `На главной: h1 в формате «Официальный сайт {бренд} — …»; затем по смыслу h2 в порядке: официальный сайт {бренд}; рабочее зеркало {бренд} на сегодня (с h3); регистрация на официальном сайте; скачать {бренд}; пополнение и вывод средств; бонусы и акции; FAQ. Бренд из списка выше.` : `Один h1 по теме страницы + бренд; h2/h3 — нейтральные секции как в блоке «ФОРМАТ ЗАГОЛОВКОВ» промпта вёрстки.`}

Плейсхолдеры (каждый ключ в replacements должен совпадать символ-в-символ):
${placeholders.join(", ")}

Фрагменты вёрстки для контекста (структуру не меняй — в ответе только JSON):
--- headHtml (фрагмент) ---
${headSnippet}
--- mainHtml (фрагмент) ---
${mainSnippet}

Верни ТОЛЬКО один JSON-объект вида:
{"replacements":{"@@PH0@@":"…","@@PH1@@":"…"}}
Значения — готовый русский текст/HTML-фрагменты для подстановки вместо маркеров (без обёртки markdown).`;
}

function getRetryDelayMs(attempt) {
  const base = Math.min(12000, 1200 * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 800);
  return base + jitter;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyImgGenToProject(projectImgDir) {
  const srcDir = getImgGenDir();
  await fs.mkdir(projectImgDir, { recursive: true });
  let names;
  try {
    names = await fs.readdir(srcDir);
  } catch {
    return [];
  }
  const copied = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const sp = path.join(srcDir, name);
    const dp = path.join(projectImgDir, name);
    try {
      const st = await fs.stat(sp);
      if (st.isFile()) {
        await fs.copyFile(sp, dp);
        copied.push(name);
      }
    } catch {}
  }
  return copied.sort();
}

function randomHex(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

async function writeStaticWarmupScript(outputDir, pageCount = 4) {
  const n = Math.max(1, Number(pageCount) || 4);
  const php = `<?php
// Aurora static multipage: HTML уже сгенерирован в Node, прогрев не вызывает Claude.
$force = in_array('--force', $argv ?? [], true) ? '1' : '0';
echo date('c') . " static_multipage pages=${n} OK\\n";
echo date('c') . " warmup_text_done total=0ms force={$force}\\n";
`;
  await fs.writeFile(path.join(outputDir, "warmup_text_cache.php"), php, "utf8");
}

async function writeRobotsSitemap(outputDir, baseUrl, paths) {
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
  ].join("\n");

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ];
  for (const p of paths) {
    const loc = p === "/" ? `${baseUrl}/` : `${baseUrl}/${p.replace(/^\//, "")}`;
    lines.push(`  <url><loc>${escapeXml(loc)}</loc><priority>0.85</priority></url>`);
  }
  lines.push(`</urlset>`, "");

  await fs.writeFile(path.join(outputDir, "robots.txt"), robots, "utf8");
  await fs.writeFile(path.join(outputDir, "sitemap.xml"), lines.join("\n"), "utf8");
}

async function writeMultipageSiteConfig(outputDir, gatewayUrl) {
  const tplPath = path.join(
    getAppRoot(),
    "src/lib/generator-engine/multipage-site-config.php"
  );
  let tpl = await fs.readFile(tplPath, "utf8");
  if (!tpl.includes("__AURORA_GATEWAY_URL__")) {
    throw new Error("multipage-site-config.php: missing __AURORA_GATEWAY_URL__ placeholder");
  }
  const gw =
    String(gatewayUrl || "").trim() ||
    resolveGatewayUrlForBuild({ projectSlug: "", buildNonce: "" });
  const escaped = String(gw).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  tpl = tpl.replace(/__AURORA_GATEWAY_URL__/g, escaped);
  await fs.writeFile(path.join(outputDir, "config.php"), tpl, "utf8");
}

async function writeMultipageHtaccess(outputDir) {
  const content = `<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    RewriteRule ^config\\.php$ - [F,L]

    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [L]

    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    RewriteRule ^ index.php [L,QSA]
</IfModule>

Options -Indexes
`;
  await fs.writeFile(path.join(outputDir, ".htaccess"), content, "utf8");
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Один раз на білд: зовнішній chrome з brand-chrome.
 * Шапка й підвал завжди увімкнені (умова продукту).
 */
function pickChromeShell(_structureSeed) {
  return { includeHeader: true, includeFooter: true };
}

/** Латинські імена внутрішніх сторінок (.php) — випадковий піднабір на білд. */
const INNER_PAGE_SLUG_POOL = [
  "reviews",
  "registration",
  "payments",
  "bonus",
  "zerkalo",
  "vip",
  "slots",
  "mirror",
  "cash",
  "app",
  "mobile",
  "support",
  "rules",
  "tournaments",
  "live",
  "promo",
  "club",
  "loyalty",
  "jackpot",
  "news",
  "guides",
  "security",
  "contacts",
  "about",
  "games",
  "start",
  "faq-page",
  "policy",
];

/** Загальна кількість PHP-сторінок (головна + внутрішні), мін 1, макс 4. Сторінки з пулу — за темою, без обовʼязкового zerkalo. */
function pickExpectedMultipageFiles(seed, totalPagesExplicit) {
  let n;
  if (totalPagesExplicit != null && Number.isFinite(Number(totalPagesExplicit))) {
    n = Math.min(4, Math.max(1, Math.trunc(Number(totalPagesExplicit))));
  } else {
    n = 1 + (siteHash32(`${seed}|pc`) % 4);
  }
  const innerCount = Math.max(0, n - 1);
  const shuffled = shuffleWithSeed([...INNER_PAGE_SLUG_POOL], `${seed}|slugs`);
  const inner = shuffled.slice(0, innerCount).map((s) => `${s}.php`);
  const ordered = shuffleWithSeed([...inner], `${seed}|innerorder`);
  return ["index.php", ...ordered];
}

function pickNShuffled(pool, n, seedStr) {
  return shuffleWithSeed(pool, seedStr).slice(0, Math.max(0, n));
}

/** Додатковий шар промпта: креатив і варіативність у межах теми/плану (палітра/img з контексту білду), без орієнтиру на чужі сайти як на шаблон. */
const AI_CREATIVE_MAX_VARIETY_POOL = [
  "КРЕАТИВ: придумай унікальну композицію першого екрана й ритм секцій під тему; не підганяй під універсальний казино-лендинг.",
  "КРЕАТИВ: змінюй max-width контейнера, щільність відступів і спосіб групування блоків відносно типових SEO-сторінок.",
  "КРЕАТИВ: чергуй тип носія інформації (проза, списки, врізки, короткі нотатки) — не один шаблон на всю сторінку.",
  "КРЕАТИВ: експериментуй з вирівнюванням і ієрархією типографіки в межах палітри билда (не клонуй однакові відступи між секціями).",
  "КРЕАТИВ: CTA і gateway-Посилання розкидай по контексту, а не збирай у «канонічному» одному місці.",
  "КРЕАТИВ: для внутрішніх сторінок обирай інший «характер» верстки, ніж на головній (інший DOM-ритм).",
  "КРЕАТИВ: додай хоча б одну неочевидну секцію або прийом подачі (наприклад хронологія, зіставлення, міні-сценарій) — без копіювання попередніх білдів.",
  "КРЕАТИВ: варіюй співвідношення текст/медіа між секціями; уникай однакового патерну в кожній другій секції.",
  "КРЕАТИВ: імена класів і id секцій роби унікальними під цей билд — не generic «section-1, block-2».",
  "КРЕАТИВ: якщо тема дозволяє — зсувай акцент з «вітрини» на пояснення, довідник або сценарій користувача.",
  "КРЕАТИВ: мобільний і десктопний каркас можуть відрізнятися не лише стисненням колонок — подумай про інший порядок блоків на вузькому екрані.",
  "КРЕАТИВ: не шукай «як у конкурента» — опирайся на поля плану сторінки та diversity-блок user.",
  "КРЕАТИВ: на внутрішніх сторінках уникай «текст + три коробки в правому сайдбарі»; зміст той самий можна подати колонкою, сіткою або без сайдбару взагалі.",
];

function buildAiCreativeMaxVarietyBlock(seedStr) {
  const picked = pickNShuffled(
    AI_CREATIVE_MAX_VARIETY_POOL,
    5,
    `${String(seedStr || "")}|aiCreativeMaxV1`
  );
  if (!picked.length) return "";
  return [
    "=== КРЕАТИВ ТА МАКСИМАЛЬНА ВАРІАТИВНІСТЬ (композиція з теми й плану, не з копії стороннього сайту) ===",
    ...picked.map((line, i) => `${i + 1}) ${line}`),
    "Жорсткі обмеження лише такі: палітра билда, списки ./img/…, семантика HTML, правила #lw-games/#lw-vip та gateway з user.",
  ].join("\n");
}

/** Референс-lock: креатив лише в текстах/класах; каркас DOM — як у знімка. */
function buildAiCreativeReferenceBlendBlock(seedStr) {
  const picked = pickNShuffled(
    [
      "Копіюй патерн секцій і типи UI з REFERENCE LOCK; змінюй лише формулювання, підзаголовки й дрібні відступи всередині блоків.",
      "Унікальні class/id у межах теми — так; інший порядок великих секцій чи інший layout (sidebar / full-width) — ні.",
      "Варіюй щільність абзаців і списків, не змінюючи ролі секцій і наявність aside відносно референса.",
    ],
    2,
    `${String(seedStr || "")}|aiCreativeRefBlend`
  );
  if (!picked.length) return "";
  return [
    "=== КРЕАТИВ: РЕЖИМ РЕФЕРЕНСА (текст і бренд; DOM як у референса) ===",
    ...picked.map((line, i) => `${i + 1}) ${line}`),
    "Жёсткие ограничения: палитра билда, ./img/, семантика HTML, #lw-games/#lw-vip, gateway и REFERENCE LOCK.",
  ].join("\n");
}

/** Додаткові рядки промпта: відтворити сайдбар референса в <main>. */
function layoutSidebarDomMirrorLines(layout) {
  const L = layout && typeof layout === "object" ? layout : {};
  const lines = [];
  if (L.hasLeftSidebar) {
    lines.push(
      "**Левый сайдбар:** в `<main>` — две колонки: основная широкая **справа**, `<aside>` или навигация **слева** (например grid с aside первой колонкой). Не заменяй на одну full-width колонку."
    );
  }
  if (L.hasRightSidebar) {
    lines.push(
      "**Правый сайдбар:** основная колонка **слева**, `<aside>` / виджеты **справа** — как в референсе; не убирай боковую колонку."
    );
  }
  if (L.hasAnySidebar && !L.hasLeftSidebar && !L.hasRightSidebar) {
    lines.push(
      "**Боковая колонка / aside:** в референсе есть боковой блок — сохрани двухколоночный или aside-врезку, не своди всё к одной колонке без причины из снимка."
    );
  }
  if (L.hasBottomDockNav) {
    lines.push(
      "**Нижний фиксированный dock:** полоса у нижнего края экрана (иконки + подписи, иногда бейдж) — `position:fixed; bottom:0`, отступ контента снизу; не заменяй только верхним меню, если во флаге снимка bottomDockNav=yes."
    );
  }
  return lines;
}

/** Індекс з хеша — стабільно різний між projectSlug/buildNonce і краще «розмазує» варіанти, ніж [0] після shuffle. */
function pickDeterministicFromPool(pool, seed, salt) {
  const arr = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!arr.length) return undefined;
  const idx = siteHash32(`${String(seed || "")}|${String(salt || "salt")}`) % arr.length;
  return arr[idx];
}

/** Режими #lw-games; «tabs» рідше за інші — зменшує кліше «3 чіпи + сітка 4×2» між білдами. */
const HOME_GAMES_MODE_WEIGHTED = [
  "single-grid",
  "single-grid",
  "masonry-free",
  "masonry-free",
  "carousel-snap",
  "rail-editorial",
  "tabs",
];

function resolveHomeGamesMode(siteSeed) {
  const arr = HOME_GAMES_MODE_WEIGHTED;
  const i =
    siteHash32(`${String(siteSeed || "")}|homeGamesModeV3`) % arr.length;
  return arr[i] || "single-grid";
}

/**
 * Чіткий порядок <main> для головної: токени плану + архетипи (порядок archIds — уже перетасований).
 */
function buildHomeDomOrderDescription(sectionOrder, archIdsOrdered) {
  const queue = Array.isArray(archIdsOrdered) ? [...archIdsOrdered] : [];
  const lines = [];
  let step = 1;
  for (const t of Array.isArray(sectionOrder) ? sectionOrder : []) {
    if (t === "hero") {
      lines.push(
        `${step++}. Секция hero (h1 + визуал; избегай шаблонов 50/50 split, центральной «ленты» поверх фото и KPI-полосы сразу под hero — см. анти-шаблон в user).`
      );
    } else if (t === "games") {
      lines.push(`${step++}. Блок #lw-games — игры (режим сетки/вкладок задан отдельно).`);
    } else if (t === "vip") {
      lines.push(`${step++}. Блок #lw-vip — VIP.`);
    } else if (t === "faq") {
      lines.push(`${step++}. Секция FAQ (#faq / faq-section).`);
    } else if (t === "cta") {
      lines.push(`${step++}. Финальный CTA-блок.`);
    } else {
      const id = queue.shift();
      if (id) {
        lines.push(
          `${step++}. Отдельная <section> с архетипом «${id}» (слот плана «${t}»).`
        );
      } else {
        lines.push(
          `${step++}. Смысловая секция «${t}» — заполни содержанием без дублирования соседних страниц.`
        );
      }
    }
  }
  while (queue.length) {
    const id = queue.shift();
    lines.push(
      `${step++}. Отдельная <section> с архетипом «${id}» (добавь между играми и VIP, если #lw-vip ещё не был; иначе — перед FAQ).`
    );
  }
  return lines.join("\n");
}

/**
 * Один унікальний елемент пулу на кожен ключ (наприклад reviews/registration/payments),
 * щоб внутрішні сторінки не ділили один і той самий layout/components/order.
 */
function pickDistinctFromPool(pool, seed, keys) {
  const raw = [...new Set(Array.isArray(pool) ? pool : [])];
  const ks = Array.isArray(keys) ? keys : [];
  const out = new Map();
  if (!raw.length || !ks.length) return out;
  const shuf = shuffleWithSeed(raw, `${seed}|pickDistinct`);
  const rot = raw.length ? siteHash32(`${seed}|pickRotV1`) % raw.length : 0;
  const rotated =
    shuf.length > 0 ? [...shuf.slice(rot), ...shuf.slice(0, rot)] : shuf;
  if (rotated.length >= ks.length) {
    for (let i = 0; i < ks.length; i++) {
      out.set(ks[i], rotated[i]);
    }
    return out;
  }
  const used = new Set();
  for (const key of ks) {
    const next = shuf.find((x) => !used.has(x));
    const pick = next || shuf[siteHash32(`${seed}|${key}`) % shuf.length];
    used.add(pick);
    out.set(key, pick);
  }
  return out;
}

function formatSiblingPlanSummary(allPages, currentFile) {
  const list = Array.isArray(allPages) ? allPages : [];
  const cf = String(currentFile || "");
  const rows = list
    .filter((p) => p && String(p.file) !== cf)
    .map((p) => {
      const lv = String(p.layoutVariant || "").slice(0, 160);
      const so = Array.isArray(p.sectionOrder) ? p.sectionOrder.join(" → ") : "";
      const mc = Array.isArray(p.mainComponents) ? p.mainComponents.join(", ") : "";
      const arch = Array.isArray(p.structuralArchetypeIds)
        ? p.structuralArchetypeIds.join(", ")
        : "";
      return `• ${p.file}: layoutVariant «${lv}» | секции: ${so} | интерактив: ${mc}${arch ? ` | архетипы: ${arch}` : ""}`;
    });
  if (!rows.length) return "";
  return [
    "КАРКАСЫ ДРУГИХ СТРАНИЦ ЭТОГО САЙТА (из плана архитектора) — твоя страница НЕ должна повторять их структурный паттерн, порядок секций и тот же «скелет», что ниже:",
    ...rows,
  ].join("\n");
}

/**
 * Унікальні «ролі» додаткових секцій: на одному сайті кожен id зайнятий лише однією сторінкою.
 * Порядок expectedFiles: головна може бути першою або не першою — inner без index.
 */
const STRUCTURAL_ARCHETYPE_DEFS = [
  { id: "cmp-table", hint: "сравнение в оформленной <table> (thead/tbody) с классами префикса билда; стили таблицы в pageCss + база в chrome.css" },
  { id: "timeline-v", hint: "вертикальный timeline 4–6 пунктов" },
  { id: "myth-fact", hint: "пары «миф / факт»" },
  { id: "glossary", hint: "глоссарий 5–8 терминов" },
  { id: "playbook", hint: "нумерованный playbook 4–7 шагов" },
  { id: "trust-strip", hint: "факты доверия без «конвейера»: не ровный ряд одинаковых «цифра+подпись»; лучше врезка, две несимметричные плитки или факты внутри абзацев" },
  { id: "pull-quote", hint: "врезка-цитата + поясняющий абзац" },
  { id: "narrative", hint: "мини-нарратив «сценарий» без имён" },
  { id: "qna-pairs", hint: "пары вопрос–краткий ответ (не дублировать основной FAQ-аккордеон)" },
  { id: "zigzag", hint: "2–3 ряда zig-zag текст/медиа" },
  { id: "two-col-thesis", hint: "тезисы + развёрнутый текст в двух колонках с **разной** шириной (не канонический 50/50 как на типовых лендингах)" },
  { id: "checklist-audit", hint: "чек-лист «что проверить»" },
  { id: "scenario-ab", hint: "сценарий A vs B в двух колонках" },
  { id: "ribbon-notes", hint: "3–5 коротких карточек-заметок в ряд" },
  { id: "deep-dive-one", hint: "одна колонка углублённого текста с подзаголовками" },
  { id: "side-aside", hint: "основной текст + боковой aside с примечаниями" },
  { id: "photo-strip", hint: "горизонтальная полоса мини-блоков с подписями" },
  { id: "split-stats", hint: "слева крупная цифра/факт, справа пояснение (не сетка KPI 2×2)" },
  { id: "step-rail", hint: "горизонтальный «поезд» шагов 3–6 с разными ширинами" },
  { id: "quote-grid", hint: "2–4 цитаты-карточки разного размера" },
  { id: "data-dense", hint: "плотный блок мелкого текста с подзаголовками-якорями" },
  { id: "sidebar-faux", hint: "имитация боковой колонки без настоящего сайдбара (визуальный сдвиг)" },
  { id: "ribbon-compare", hint: "две узкие полосы «до/после» или «вариант A/B»" },
  { id: "stacked-cards", hint: "смещённый стопкой блок карточек (лёгкий offset)" },
  { id: "micro-chapters", hint: "мини-оглавление + короткие главы без TOC на всю ширину" },
];

const STRUCTURAL_ARCHETYPE_ID_SET = new Set(
  STRUCTURAL_ARCHETYPE_DEFS.map((d) => d.id)
);

function assignDisjointStructuralArchetypes(seed, expectedFiles) {
  const ids = STRUCTURAL_ARCHETYPE_DEFS.map((d) => d.id);
  const inner = expectedFiles.filter((f) => !isIndexPageFile(f));
  const home = expectedFiles.find((f) => isIndexPageFile(f));
  const need = inner.length * 2 + (home ? 3 : 0);
  let pool = shuffleWithSeed([...ids], `${seed}|structArch`);
  let round = 0;
  while (pool.length < need && round < 40) {
    pool = pool.concat(shuffleWithSeed([...ids], `${seed}|structArchX${round}`));
    round += 1;
  }
  const map = new Map();
  let pos = 0;
  for (const f of inner) {
    map.set(f, pool.slice(pos, pos + 2));
    pos += 2;
  }
  if (home) {
    map.set(home, pool.slice(pos, pos + 3));
  }
  return map;
}

function formatStructuralArchetypesForPrompt(archetypeIds) {
  const list = Array.isArray(archetypeIds) ? archetypeIds.filter(Boolean) : [];
  if (!list.length) return "";
  const lines = list.map((id) => {
    const def = STRUCTURAL_ARCHETYPE_DEFS.find((d) => d.id === id);
    return def ? `— ${id}: ${def.hint}` : `— ${id}`;
  });
  const orderLine = `Порядок реализации в DOM (не меняй порядок id): ${list.join(" → ")}.`;
  return [
    "ПОДСКАЗКИ ДЛЯ УНИКАЛЬНЫХ ДОПОЛНИТЕЛЬНЫХ СЕКЦИЙ (рекомендуемые id для разнообразия; можно менять порядок и глубину реализации):",
    orderLine,
    ...lines,
    "Можно комбинировать или пропускать id, если это делает страницу более оригинальной. Палитра и картинки — по блоку палитры билда в user.",
  ].join("\n");
}

/**
 * Поріг Jaccard по токенах (перетин / об'єднання множин слів ≥4 символів).
 * Ціль: схожість тексту <main> з уже згенерованими сторінками < 20%.
 */
const MAIN_TEXT_SIMILARITY_REGEN_THRESHOLD = 0.17;
const DOM_STRUCTURE_SIMILARITY_REGEN_THRESHOLD = 0.34;
const CLASS_RHYTHM_SIMILARITY_REGEN_THRESHOLD = 0.48;
const DOM_DEPTH_HIST_SIMILARITY_REGEN_THRESHOLD = 0.58;
/** Мінімум/максимум слів у <main>; оновлюється в syncGeneratorLimitsFromEnv(). */
let MIN_PAGE_WORDS = 950;
let MIN_INDEX_PAGE_WORDS = 950;
let MAX_PAGE_WORDS = 2000;
let MAIN_WORD_VOLUME_GUIDE = "950–2000";
/** Мінімум маркерів @@PHn@@ у <main> на кожній сторінці (legacy fallback для text-fill). */
const PH_MAIN_PLACEHOLDERS_MIN = 50;
/** Верх орієнтиру кількості маркерів у <main> (у промптах). */
const PH_MAIN_PLACEHOLDERS_TARGET = 60;
function getTextRegenStages() {
  if (!isQualityRegenEnabled()) return 0;
  return Math.max(
    0,
    Math.min(4, Number(process.env.SOFTGEN_TEXT_REGEN_STAGES) || 2)
  );
}
/** Спроби LLM+parse для вёрстки сторінки (1-й запит + повтори при помилці). */
function getPageLayoutLlmAttempts() {
  const envAttempts = Number(process.env.SOFTGEN_PAGE_LAYOUT_LLM_ATTEMPTS);
  if (Number.isFinite(envAttempts) && envAttempts >= 2) {
    return Math.min(6, Math.max(2, Math.trunc(envAttempts)));
  }
  const maxRetries = Math.max(
    0,
    Math.min(4, Number(process.env.SOFTGEN_PAGE_LAYOUT_MAX_RETRIES ?? 2) || 2)
  );
  return maxRetries + 1;
}
const CROSS_BUILD_HISTORY_PAGES = 220;
const CROSS_BUILD_DOM_SIM_THRESHOLD = 0.43;
const CROSS_BUILD_CLASS_SIM_THRESHOLD = 0.5;
/** Мінімум згадок бренду (підрядки) у всьому тексті h1–h3 разом; ретрай якщо менше. */
const MIN_BRAND_MENTIONS_IN_HEADINGS = 1;
/** Мінімум згадок бренду в `<p>` по сторінці (сума по всіх абзацах). */
const MIN_BRAND_MENTIONS_IN_PARAGRAPHS = 3;
/** После сборки обрезаем слишком длинные заголовки; лимиты под SEO-шаблон «официальный сайт … — …». */
const HEADLINE_H1_MAX_WORDS = 14;
const HEADLINE_H23_MAX_WORDS = 10;

/** Пріоритет якості та SEO над швидкістю відповіді (промпти архітектора / сторінки / system). */
function buildQualityAndSeoPriorityBlock(kind = "page") {
  const shared = `
ПРИОРИТЕТ КАЧЕСТВА (не спеши с ответом):
- Скорость не важна: лучше полный, выверенный результат, чем урезанный JSON «на скорую руку».
- Текст для людей и поиска: информативные абзацы <p>, естественные ключевые фразы из блока SEO, без воды и без «заглушек».
- SEO: осмысленные <title> и meta description (как в плане), один логичный <h1>, иерархия h2/h3, внутренние ссылки, alt у изображений, canonical в head.
- Вёрстка: аккуратный семантический HTML, читаемый CSS (сетки, отступы, hover), доступные подписи у CTA; не ломай каркас ради краткости.
`.trim();
  if (kind === "architect") {
    return `${shared}
- В плане: title/description — готовые для выдачи (не черновик); contentAngle и role раскрывают поисковый интент страницы.`;
  }
  if (kind === "system") {
    return `${shared}
- Не сокращай mainHtml и тексты только чтобы уложиться в лимит токенов; при нехватке места — уплотни CSS/JS, а не выкидывай SEO-абзацы.`;
  }
  return `${shared}
- Заполняй объём в <main> полноценным копирайтом (${MIN_PAGE_WORDS}–${MAX_PAGE_WORDS} слов), а не списком однострочников.`;
}

function minWordsTargetForPageFile(file) {
  return isIndexPageFile(canonicalMultipageFile(file))
    ? MIN_INDEX_PAGE_WORDS
    : MIN_PAGE_WORDS;
}

/** Резерв, якщо structuralArchetypeIds порожній (legacy / односторінковий режим). */
const CONTENT_BLOCKS_CATALOG = `КАТАЛОГ ДОПОЛНИТЕЛЬНЫХ ТИПОВ СЕКЦИЙ (если выше задан блок «ОБЯЗАТЕЛЬНЫЕ УНИКАЛЬНЫЕ ТИПЫ» — используй ТОЛЬКО его, этот список не добавляй):
- по возможности **без HTML-таблиц**: сравнение «условие / что это значит» — двумя колонками текста или списком; <table> только если совсем необходимо и одна компактная;
- вертикальный timeline (3–6 пунктов, без тяжёлой графики);
- блок «миф vs факт» (парные строки или две колонки);
- пошаговый playbook с нумерацией;
- компактный глоссарий (4–7 терминов с короткими определениями);
- две колонки с разной шириной: тезисы/список и развёрнутый текст (избегай симметричного 50/50 «как у всех»);
- блок доверия/фактов: без шаблона «одинаковые ячейки в ряд под hero»; врезки, timeline, одна сильная метрика + текст, несимметричные карточки (не KPI 2×2 и не полоса 1fr×4);
- врезка-pull-quote (цитата/вывод) с поясняющим абзацем;
- нарратив «типичный сценарий» (мини-история без выдуманных имён);
- блок «вопрос → короткий ответ» без дублирования полноценного FAQ-аккордеона там, где уже есть faq-section.
Верстка остаётся простой (секции, брендовая палитра).`;

function getLayoutVariantPool() {
  return [
    "L01: start-with-games (без hero: страница начинается с сетки игр)",
    "L02: split hero с асимметричными долями текста/медиа (не канонический 50/50)",
    "L03: split hero зеркально по осям, но снова без «учебника» 50/50 и без KPI-полосы сразу под блоком",
    "L04: sticky-toc + longform sections",
    "L05: masonry cards + FAQ accordion",
    "L06: timeline trust blocks + CTA ribbon",
    "L07: comparison table + proof cards",
    "L08: testimonials-first then features",
    "L09: registration-steps as vertical process",
    "L10: payments-focused dashboard layout",
    "L11: compact hero + large category tabs",
    "L12: alternating zig-zag feature sections",
    "L13: two-column editorial + side widgets",
    "L14: minimal intro + dense slot grid",
    "L15: bento grid (асимметричные ячейки разной ширины/высоты)",
    "L16: magazine: узкая колонка + широкий «разворот» и врезки",
    "L17: split sticky-боковая колонка + длинная прокрутка контента",
    "L18: ключевые цифры вплетены в сюжетные секции (не отдельная полоса из 4 одинаковых ячеек сверху)",
    "L19: полноширинный визуальный блок + «плавающие» карточки поверх",
    "L20: одна колонка «глав/подглавы» как у статьи + горизонтальные разделители",
    "L21: двухколоночный FAQ слева крупный тезис справа список деталей",
    "L22: шахматный zig-zag с чередованием текста/медиа без повторения ритма",
  ];
}

const MAIN_COMPONENT_PRESETS = [
  ["tabs", "carousel"],
  ["accordion", "modal"],
  ["carousel", "accordion"],
  ["modal", "tabs"],
  ["tabs", "modal"],
  ["accordion", "carousel"],
  ["carousel", "modal"],
  ["accordion", "tabs"],
  ["tabs", "accordion"],
  ["modal", "accordion"],
  ["accordion", "carousel", "modal"],
  ["tabs", "accordion", "carousel"],
  ["carousel", "tabs", "modal"],
  ["accordion", "modal", "tabs"],
];

const SECTION_ORDER_PRESETS = [
  ["hero", "proof", "scenario", "faq", "cta"],
  ["hook", "matrix", "deep-dive", "faq", "ribbon"],
  ["opener", "timeline", "compare", "faq", "cta"],
  ["lead", "bento", "notes", "faq", "strip"],
  ["banner", "chapters", "cases", "faq", "cta"],
  ["topline", "table", "story", "faq", "cta"],
  ["front", "ledger", "insights", "faq", "cta"],
  ["intro", "aside-flow", "risks", "faq", "cta"],
  ["glossary", "story", "compare", "faq", "cta"],
  ["playbook", "proof", "scenario", "faq", "ribbon"],
  ["myth-fact", "timeline", "deep-dive", "faq", "cta"],
  ["lead", "table", "narrative", "faq", "strip"],
  ["spotlight", "digest", "split", "faq", "cta"],
  ["ingress", "ribbon", "deep-dive", "faq", "strip"],
  ["anchor", "ledger", "scenario", "faq", "ribbon"],
  ["pulse", "matrix", "notes", "faq", "cta"],
  ["framing", "cases", "compare", "faq", "cta"],
  ["cold-open", "story", "proof", "faq", "strip"],
];

const EDITORIAL_ANGLES = [
  "объяснение «как все устроено» простыми шагами",
  "сравнение двух типичных сценариев игрока",
  "разбор рисков и способов их снизить",
  "акцент на скорости действий и прозрачности правил",
  "фокус на удобстве повторных визитов и привычках",
  "материал «от вопроса к ответу» без воды",
  "практические заметки для экономии времени",
  "спокойный экспертный тон без пустых обещаний",
  "разбор частых ошибок newcomers",
  "как выбрать сценарий под свой стиль игры",
];

const EDITORIAL_TONES = [
  "сдержанно-деловой",
  "дружелюбно-ироничный",
  "экспертно-сухой",
  "динамичный но без крика",
  "спокойный наставник",
  "разговорный без сленга",
  "инженерный (структура, чек-листы)",
];

const DIVERSITY_BAN_POOL = [
  "один и тот же паттерн «hero + три одинаковые карточки преимуществ» на всех страницах пакета",
  "повтор одной и той же сетки 4 колонок с иконками как основной каркас",
  "шаблон #lw-games: заголовок «Популярные игры/слоты…» + подзаголовок + три «чипа»-вкладки (Хиты/Новинки/Джекпоты или с эмодзи) + симметричная сетка одинаковых карточек 4×N — как на однотипных слот-лендингах",
  "hero: две колонки ~50/50 «текст слева — картинка справа» как единственный и повторяемый каркас первого экрана",
  "сразу под hero (или под шапкой): горизонтальная полоса из 3–4 равных колонок «крупное число + подпись caps» (KPI/trust-strip)",
  "hero на фото: узкая/широкая тёмная «лента» или прямоугольник по центру поверх изображения со стопкой h1+lead+CTA (как на типовых казино-лендингах)",
  "дублировать в <main> полноценный <header>/<footer> с тем же логотипом и меню, что даёт сборщик chrome",
  "копипаст формулировок «начните сейчас / за минуту / без сложностей» на каждой странице",
  "зеркальное повторение порядка секций как на типовом лендинге конкурентов",
  "одинаковые подзаголовки-штампы «почему мы / наши преимущества» без смены формулировок",
  "клон структуры DOM и ритма секций с прошлой генерацией или с другой страницы этого же сайта",
  "сложные многоуровневые обёртки и «витринная» вёрстка ради эффекта — при том же контенте",
  "одинаковый набор типов блоков на всех страницах сайта без вариаций",
  "повтор любого id архетипа дополнительной секции, назначенного другой странице этого же сайта (см. блок про соседей)",
  "копирование цепочки секций и порядка блоков с уже сгенерированного ранее сайта (другой папки проекта) — каркас должен отличаться от предыдущих билдов",
];

const DIVERSITY_MUST_POOL = [
  "разная последовательность блоков на разных страницах (не копируй порядок секций)",
  "на одной внутренней странице — акцент на списке или шагах, на другой — на лонгриде или FAQ (таблицы минимизируй)",
  "на внутренних страницах — разные формулировки h2 между URL; на главной (index) допускается единый SEO-каркас заголовков из блока «ФОРМАТ ЗАГОЛОВКОВ» в промпте страницы",
  "где уместно — один компактный блок с цифрами/фактами, без перегруза «дашбордом»",
  "главная: следуй полю layoutVariant и sectionOrder из плана — не повторяй один скелет hero→игры→VIP на каждом сайте",
  "на главной: не ставь подряд «типовой hero» и «типовую полосу метрик»; если нужны цифры — встрой иначе (см. архетипы и анти-KPI)",
  "блок #lw-games на главной: каждый билд — другая композиция (не обязательно вкладки и не обязательно ровная сетка); избегай визуального клише «3 фильтра над сеткой одинаковых плиток»",
  "простая вёрстка: плоские секции, мало вложенных div-обёрток; уникальные имена секций и классов с префиксом билда",
  "каждый новый билд и каждая страница визуально и структурно не должны напоминать предыдущую генерацию — меняй порядок, тип носителя (текст/список; таблицы по минимуму), длину абзацев",
  `цель до ~${MAX_PAGE_WORDS} слов в <main> и ровно те нестандартные типы секций, которые назначены генератором для этой страницы (id архетипов) — набор не должен пересекаться с другими URL этого сайта`,
];

/** Каркас главной ближе к laki-15: без KPI-панели и журнального 3-колоночника */
const SIMPLE_HOME_LAYOUTS = [
  "L02: split hero с асимметричными долями текста/медиа (не канонический 50/50)",
  "L03: split hero зеркально по осям, без 50/50 и без KPI-полосы сразу под блоком",
  "L05: masonry cards + FAQ accordion",
  "L06: timeline trust blocks + CTA ribbon",
  "L07: comparison table + proof cards",
  "L08: testimonials-first then features",
  "L11: compact hero + large category tabs",
  "L14: minimal intro + dense slot grid",
  "L01: start-with-games (без hero: страница начинается с сетки игр)",
];

const SIMPLE_HOME_SECTION_ORDERS = [
  ["hero", "games", "vip", "faq", "cta"],
  ["hero", "games", "trust", "vip", "faq"],
  ["hero", "lead", "games", "vip", "cta"],
  ["games", "hero", "vip", "faq", "cta"],
  ["hero", "vip", "games", "faq", "cta"],
  ["hero", "trust", "games", "vip", "faq", "cta"],
  ["hero", "games", "story", "vip", "faq"],
  ["hero", "games", "digest", "vip", "faq", "cta"],
  ["games", "trust", "hero", "vip", "faq"],
  ["hero", "spotlight", "games", "vip", "faq"],
  ["hero", "games", "vip", "story", "faq"],
  ["games", "hero", "story", "vip", "faq", "cta"],
  ["hero", "lead", "story", "games", "vip", "faq"],
  ["games", "hero", "digest", "vip", "faq"],
  ["hero", "trust", "story", "games", "vip", "faq"],
];

const SIMPLE_HOME_COMPONENTS = [
  ["tabs", "accordion"],
  ["accordion", "modal"],
  ["tabs", "carousel"],
];

const ARCHITECT_MAIN_COMPONENT_WHITELIST = new Set([
  "tabs",
  "carousel",
  "accordion",
  "modal",
]);

const ARCHITECT_SECTION_ORDER_TOKEN_SET = (() => {
  const s = new Set();
  for (const row of SECTION_ORDER_PRESETS) {
    for (const t of row) s.add(String(t).trim());
  }
  for (const row of SIMPLE_HOME_SECTION_ORDERS) {
    for (const t of row) s.add(String(t).trim());
  }
  return s;
})();

/** Ролі з inferSectionRole (референс) → токени sectionOrder архітектора (лише з ARCHITECT_SECTION_ORDER_TOKEN_SET). */
const REFERENCE_ROLE_TO_SECTION_ORDER_TOKEN = {
  menu_or_tabs: "spotlight",
  tournaments: "trust",
  content: "story",
  table: "table",
  sidebar: "aside-flow",
  section: "digest",
};

function mapReferenceRoleToArchitectSectionToken(role) {
  const key = String(role || "").trim().toLowerCase();
  if (!key) return null;
  if (ARCHITECT_SECTION_ORDER_TOKEN_SET.has(key)) return key;
  const mapped = REFERENCE_ROLE_TO_SECTION_ORDER_TOKEN[key];
  if (mapped && ARCHITECT_SECTION_ORDER_TOKEN_SET.has(mapped)) return mapped;
  return null;
}

/** Головна: sectionOrder = знімок ролей з референса (план збігається з тим, що перевіряємо). */
function snapIndexSectionOrderFromReferenceStructure(
  pages,
  referenceStructureSignals,
  seed,
  onLog
) {
  const refSeq = referenceStructureSignals?.sectionRoleSequence;
  if (!Array.isArray(pages) || pages.length === 0) return pages;
  if (!Array.isArray(refSeq) || refSeq.length < 2) return pages;
  const idx = pages.findIndex((p) => p && isIndexPageFile(String(p.file || "")));
  if (idx < 0) return pages;

  const mapped = [];
  for (const r of refSeq) {
    const tok = mapReferenceRoleToArchitectSectionToken(r);
    if (tok && mapped[mapped.length - 1] !== tok) mapped.push(tok);
  }
  if (!mapped.length) return pages;

  if (!mapped.includes("games")) {
    const heroAt = mapped.indexOf("hero");
    const insertAt = heroAt === -1 ? 0 : heroAt + 1;
    mapped.splice(insertAt, 0, "games");
  }
  if (!mapped.includes("vip")) {
    const gAt = mapped.indexOf("games");
    const insertAt = gAt === -1 ? mapped.length : gAt + 1;
    mapped.splice(insertAt, 0, "vip");
  }

  const fallbackRow =
    pickDeterministicFromPool(SIMPLE_HOME_SECTION_ORDERS, seed, "refSnapSoV1") ||
    SIMPLE_HOME_SECTION_ORDERS[0];
  const padded = padArchitectSectionOrderTokens(mapped, fallbackRow, 4, 8);
  const indexFile = String(pages[idx]?.file || "index.php");
  const sanitized = sanitizeArchitectSectionOrderForPlan(indexFile, padded, true);

  const out = pages.slice();
  out[idx] = { ...out[idx], sectionOrder: sanitized };
  emitLog(
    onLog,
    `Референс: sectionOrder главной по снимку ролей — ${sanitized.join(" → ")}.`
  );
  return out;
}

function buildArchitectSkeletonCatalogBlock() {
  const layouts = getLayoutVariantPool();
  const layoutLines = layouts.map((L) => `  - ${L}`).join("\n");
  const tokens = [...ARCHITECT_SECTION_ORDER_TOKEN_SET].sort().join(", ");
  const archIds = STRUCTURAL_ARCHETYPE_DEFS.map((d) => d.id).join(", ");
  const mains = [...ARCHITECT_MAIN_COMPONENT_WHITELIST].join(", ");
  return `
КАРКАС КАЖДОЙ СТРАНИЦЫ (обязательно в JSON для **каждого** объекта в pages; **ты** задаёшь уникальный скелет сайта — сборщик лишь валидирует токены/id и **дополняет** пропуски минимально из seed, не перетасовывая твой порядок секций и архетипов, если JSON валиден):

1) **layoutVariant** (string): одна строка из каталога **целиком** или код **L01…L22** в начале (по префиксу).
${layoutLines}

2) **sectionOrder** (array строк): **4–8** токенов; для **index.php** обязательно включи **games** и **vip** (секции #lw-games и #lw-vip).
Допустимые токены: ${tokens}.

3) **mainComponents** (array строк): **1–3** значения из: ${mains}.

4) **structuralArchetypeIds** (array строк): для **index.php** ровно **3** id, для остальных файлов ровно **2** id из списка: ${archIds}.
На разных URL одного сайта **не повторяй** один и тот же id архетипа.`;
}

function normalizeArchitectLayoutVariant(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const pool = getLayoutVariantPool();
  if (pool.includes(t)) return t;
  const m = t.match(/^L\d{2}/i);
  if (m) {
    const prefix = m[0].toUpperCase();
    const hit = pool.find((p) => p.trim().toUpperCase().startsWith(prefix));
    if (hit) return hit;
  }
  const low = t.toLowerCase();
  const fuzzy = pool.find((p) => p.toLowerCase().includes(low.slice(0, 40)));
  return fuzzy || "";
}

function sanitizeArchitectSectionOrderForPlan(file, rawList, isHome) {
  const arr = Array.isArray(rawList) ? rawList : [];
  const tokens = [];
  const seen = new Set();
  for (const x of arr) {
    const tok = String(x || "").trim().toLowerCase();
    if (!tok || seen.has(tok)) continue;
    if (!ARCHITECT_SECTION_ORDER_TOKEN_SET.has(tok)) continue;
    seen.add(tok);
    tokens.push(tok);
  }
  if (isHome) {
    for (const need of ["games", "vip"]) {
      if (!seen.has(need) && ARCHITECT_SECTION_ORDER_TOKEN_SET.has(need)) {
        tokens.push(need);
        seen.add(need);
      }
    }
  }
  return tokens;
}

function sanitizeArchitectMainComponentsForPlan(rawList) {
  const arr = Array.isArray(rawList) ? rawList : [];
  const out = [];
  for (const x of arr) {
    const t = String(x || "").trim().toLowerCase();
    if (!ARCHITECT_MAIN_COMPONENT_WHITELIST.has(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 4);
}

function pickStructuralArchetypeIdsMerged(architectIds, fbIds, wantN) {
  const out = [];
  const seen = new Set();
  const push = (id) => {
    if (!id || out.length >= wantN) return;
    if (!STRUCTURAL_ARCHETYPE_ID_SET.has(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of architectIds || []) push(String(id || "").trim());
  for (const id of fbIds || []) push(String(id || "").trim());
  if (out.length < wantN) {
    for (const d of STRUCTURAL_ARCHETYPE_DEFS) {
      push(d.id);
      if (out.length >= wantN) break;
    }
  }
  return out.slice(0, wantN);
}

/** Валидные id архетипа в порядке архитектора, без дублей. */
function filterStructuralArchetypeIdsOrdered(architectIds) {
  const out = [];
  const seen = new Set();
  for (const id of Array.isArray(architectIds) ? architectIds : []) {
    const clean = String(id || "").trim();
    if (!STRUCTURAL_ARCHETYPE_ID_SET.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Если архитектор дал мало токенов sectionOrder — дополняем из fallback (seed),
 * **сохраняя** его токены и порядок в начале.
 */
function padArchitectSectionOrderTokens(tokens, fallbackTokens, minLen, maxLen = 8) {
  const out = [...(Array.isArray(tokens) ? tokens : [])];
  const seen = new Set(out);
  for (const t of Array.isArray(fallbackTokens) ? fallbackTokens : []) {
    if (out.length >= maxLen) break;
    const tok = String(t || "").trim().toLowerCase();
    if (!tok || seen.has(tok)) continue;
    if (!ARCHITECT_SECTION_ORDER_TOKEN_SET.has(tok)) continue;
    out.push(tok);
    seen.add(tok);
  }
  if (out.length < minLen) {
    const rest = [...ARCHITECT_SECTION_ORDER_TOKEN_SET].sort();
    for (const tok of rest) {
      if (out.length >= maxLen || out.length >= minLen) break;
      if (seen.has(tok)) continue;
      out.push(tok);
      seen.add(tok);
    }
  }
  return out.slice(0, maxLen);
}

function buildArchitectPageSkeletonPromptBlock(pageMeta, opts = {}) {
  if (!pageMeta || typeof pageMeta !== "object") return "";
  const referenceTemplateMode = Boolean(opts?.referenceTemplateMode);
  const lv = String(pageMeta.layoutVariant || "").trim();
  const so = Array.isArray(pageMeta.sectionOrder) ? pageMeta.sectionOrder : [];
  const mc = Array.isArray(pageMeta.mainComponents) ? pageMeta.mainComponents : [];
  const arch =
    Array.isArray(pageMeta.structuralArchetypeIdsOrdered) &&
    pageMeta.structuralArchetypeIdsOrdered.length
      ? pageMeta.structuralArchetypeIdsOrdered
      : Array.isArray(pageMeta.structuralArchetypeIds)
        ? pageMeta.structuralArchetypeIds
        : [];
  if (!lv && !so.length && !mc.length && !arch.length) return "";
  const homeNote = isIndexPageFile(String(pageMeta.file || ""))
    ? referenceTemplateMode
      ? "\n- Режим шаблона главной: токены **games**/**vip** и порядок в sectionOrder — **не** повод вставлять #lw-games / #lw-vip или переставлять секции, если этого **нет** во вставленном HTML шаблона референса."
      : "\n- На главной: токены **games** и **vip** в sectionOrder = блоки **#lw-games** и **#lw-vip** в <main> в указанном порядке относительно остальных секций; не переноси их в конец без причины из плана."
    : "";
  if (referenceTemplateMode) {
    return `
ПЛАН АРХИТЕКТОРА (**справка по смыслу, title/роли**; для index в режиме шаблона **приоритет у HTML шаблона референса** — не ломай и не перестраивай <main> под этот план):
- **layoutVariant:** ${lv || "—"}
- **sectionOrder** (из плана; **не** как обязательный порядок DOM на главной): ${so.length ? so.join(" → ") : "—"}
- **mainComponents:** ${mc.length ? mc.join(", ") : "—"}
- **structuralArchetypeIds** (идеи формулировок, **не** чеклист вёрстки): ${arch.length ? arch.join(" → ") : "—"}${homeNote}
`.trim();
  }
  return `
ПЛАН АРХИТЕКТОРА (каркас этой страницы — **обязателен**; блок PAGE BLUEPRINT ниже задаёт дополнительные нюансы DOM, но **не отменяет** порядок секций и слотов ниже):
- **layoutVariant:** ${lv || "—"}
- **sectionOrder** (сверху вниз в <main>): ${so.length ? so.join(" → ") : "—"}
- **mainComponents:** ${mc.length ? mc.join(", ") : "—"}
- **structuralArchetypeIds** (в заданном порядке): ${arch.length ? arch.join(" → ") : "—"}${homeNote}
`.trim();
}

function buildDiversityPack(seedStr) {
  const banN = Math.min(6, DIVERSITY_BAN_POOL.length);
  const mustN = Math.min(6, DIVERSITY_MUST_POOL.length);
  const bans = pickNShuffled(DIVERSITY_BAN_POOL, banN, `${seedStr}|ban`);
  const must = pickNShuffled(DIVERSITY_MUST_POOL, mustN, `${seedStr}|must`);
  const sigN = siteHash32(`${seedStr}|sig`) % 9000;
  return { bans, must, signature: `build-sig-${sigN}` };
}

function formatDiversityPackForPrompt(
  pack,
  { internalTag, themeBrandHint, pageCount, referenceBlend = false }
) {
  const n = Math.max(1, Math.min(4, Number(pageCount) || 4));
  const hintLine = themeBrandHint
    ? `Публичный бренд (ориентир из темы, не техническое имя папки): «${themeBrandHint}».`
    : "";
  if (referenceBlend) {
    return [
      `РЕЖИМ РЕФЕРЕНСА (зеркало каркаса): сигнатура билда ${pack.signature}; служебная метка (не для текстов сайта): ${internalTag}.`,
      hintLine,
      "Каркас, порядок крупных секций, сайдбары и типы UI — **как у референса и ref-structure**; отличия от других сайтов — только **тексты**, бренд, ссылки, `./img/`, префиксы классов и микро-копирайт **внутри** блоков. **Не** меняй layout ради «вариативности».",
      `Объёмы: **index.php** — не короче ${MIN_INDEX_PAGE_WORDS} слов в <main>; остальные URL пакета — не короче ${MIN_PAGE_WORDS} слов.`,
      "КРИТИЧНО: не используй в копирайте латинские имена папок сборки (например my-project-08), служебную метку билда и build id — только человекочитаемое имя бренда.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `Сигнатура вариативности: ${pack.signature}. Внутренняя служебная метка билда (не для текстов сайта): ${internalTag}.`,
    hintLine,
    `Запреты (для всего сайта): ${pack.bans.join("; ")}.`,
    `Требования к отличиям: ${pack.must.join("; ")}.`,
    `Шапка и подвал задаются генератором. Контент внутри <main> на каждой из ${n} страниц должен быть максимально разным по структуре, DOM, блокам и ритму — как ${n} разных макетов, а не копии одного шаблона; **главная (index.php)** — не короче ${MIN_INDEX_PAGE_WORDS} слов в итоговом <main>; остальные страницы пакета — не короче ${MIN_PAGE_WORDS} слов (после заполнения плейсхолдеров).`,
    "Сначала качество текста и SEO, затем вариативность: уникальные макеты допустимы, но не ценой пустых секций, битой вёрстки или шаблонных заголовков.",
    "Каждый новый билд — другой порядок секций и другой каркас главной; не воспроизводи типовую цепочку блоков с прошлых генераций.",
    `Каждая новая генерация получает уникальный структурный отпечаток — порядок блоков и DOM не должен повторять предыдущие сайты.`,
    "КРИТИЧНО: не используй в копирайте латинские имена папок сборки (например my-project-08), служебную метку билда и build id — только человекочитаемое имя бренда.",
  ]
    .filter(Boolean)
    .join("\n");
}

const PROMPT_ENTROPY_INSTRUCTIONS = [
  "Начни каркас страницы не с hero, а с другого смыслового блока, если это уместно.",
  "Не ставь сразу под hero ровную полосу из 3–4 метрик в одинаковых колонках — вынеси цифры иначе.",
  "Меняй глубину DOM: чередуй плотные и разреженные секции.",
  "Избегай повторения одинаковых class-ритмов между страницами.",
  "Сделай разную длину секций: короткие/средние/длинные в одном документе.",
  "Не повторяй один и тот же шаблон списка в соседних секциях.",
  "На одной странице используй акцент на guide-формат, на другой — на analysis-формат.",
  "Сдвигай порядок смысловых блоков относительно типового SEO-лендинга.",
  "Чередуй grid/flex и single-column в разных частях main.",
  "Минимизируй симметричные трехколоночные паттерны.",
  "Разводи CTA по структуре: inline / banner / contextual anchor.",
  "Используй разные паттерны FAQ: accordion или grouped answers.",
  "Меняй плотность подзаголовков: где-то компактно, где-то детально.",
  "Не клонируй типовую структуру публичных промо-сайтов — выбери оригинальную подачу под тему.",
  "Меняй визуальный вес секций: где-то доминирует типографика, где-то — один акцентный визуал, где-то — плотный текст.",
  "Варьируй способ введения читателя: тезис, вопрос, короткий кейс или список — не одинаковый заход на каждой странице пакета.",
  "Смести фокус с «витрины преимуществ» на объяснение, сравнение или практические шаги, если это логично по role страницы.",
];

const FIXED_SITE_PALETTE = Object.freeze({
  accent: "#2ecc71",
  bg: "#0b1f12",
  card: "#05140a",
  block: "#05140a",
  text: "#ffffff",
  paragraph: "#ffffff",
  heading: "#ffe14a",
  accentOn: "#0b1f12",
  gradEnd: "#05140a",
});

function buildPromptEntropyOverlay(seed, label = "site") {
  const picked = pickNShuffled(
    PROMPT_ENTROPY_INSTRUCTIONS,
    8,
    `${seed}|entropy|${label}`
  );
  const salt = randomHex(6);
  return [
    "=== ENTROPY OVERLAY (anti-duplicate) ===",
    `entropy_label: ${label}`,
    `entropy_salt: ${salt}`,
    ...picked.map((x, i) => `${i + 1}) ${x}`),
    "Служебные entropy-поля не выводить в итоговом HTML/JSON для пользователя.",
  ].join("\n");
}

const PROMPT_FAMILY_PROFILES = [
  {
    id: "editorial_longform",
    architect:
      "РЕЖИМ ПОДХОДА: editorial longform. Планируй страницы как разные редакционные форматы: лонгрид, справочник, разбор, чек-лист. Избегай одинаковой блочной витрины.",
    page:
      "СЕМЬЯ ПРОМПТА: editorial longform. Делай структурно разные narrative-потоки: длинные абзацы, врезки, faq, контекстные списки. Не строй страницу как каталог одинаковых карточек.",
  },
  {
    id: "docs_knowledge",
    architect:
      "РЕЖИМ ПОДХОДА: docs/knowledge base. Проектируй URL как документацию с разной глубиной секций, навигацией по темам и разной плотностью контента.",
    page:
      "СЕМЬЯ ПРОМПТА: docs/knowledge. Акцент на объяснение, терминологию, пошаговые разделы и FAQ, но с уникальной DOM-структурой на каждом URL.",
  },
  {
    id: "comparison_matrix",
    architect:
      "РЕЖИМ ПОДХОДА: comparison-first. Разводи страницы по сценариям сравнения, рисков, выбора и практических решений; не используй единый шаблон hero/features.",
    page:
      "СЕМЬЯ ПРОМПТА: comparison-first. Строй логику через сопоставления и практические выводы, но не своди контент к одной таблице и не повторяй ритм блоков.",
  },
  {
    id: "guide_playbook",
    architect:
      "РЕЖИМ ПОДХОДА: guide/playbook. Пусть страницы выглядят как разные форматы гайдов: быстрый старт, troubleshooting, best practices, anti-patterns.",
    page:
      "СЕМЬЯ ПРОМПТА: guide/playbook. Используй сценарии, шаги и разбор ошибок, при этом сохраняй отличающиеся DOM-деревья и секционные паттерны.",
  },
  {
    id: "story_journal",
    architect:
      "РЕЖИМ ПОДХОДА: story/journal hybrid. Планируй страницы как разные форматы повествования: кейс, хроника, аналитическая заметка, практический отчёт.",
    page:
      "СЕМЬЯ ПРОМПТА: story/journal hybrid. Добавляй вариативный ритм секций и длину блоков, не повторяй одну и ту же композицию по всем URL.",
  },
];

function pickPromptFamilyBySeed(seed, retryStep = 0) {
  const list = PROMPT_FAMILY_PROFILES;
  if (!Array.isArray(list) || !list.length) return null;
  const base = siteHash32(`${seed}|prompt-family`);
  const idx = ((base + Math.max(0, Math.trunc(Number(retryStep) || 0))) % list.length + list.length) % list.length;
  return list[idx] || null;
}

function buildPromptFamilyOverlay({ family, retryStep = 0, kind = "page" }) {
  if (!family) return "";
  const roleLine =
    kind === "architect"
      ? family.architect
      : family.page;
  return [
    "=== PROMPT FAMILY (dynamic) ===",
    `family_id: ${family.id}`,
    `retry_step: ${Math.max(0, Math.trunc(Number(retryStep) || 0))}`,
    roleLine,
    "При повторной генерации меняй не только формулировки, но и сам каркас подачи: порядок секций, длину блоков, типы контейнеров, DOM-ритм.",
  ].join("\n");
}

function sanitizePromptOverlayText(text, maxLen = 6500) {
  const t = String(text || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
  return t.slice(0, maxLen);
}

/** Разбор ответа rewrite: предпочитаем prompt_b64 (UTF-8 base64), иначе legacy prompt (строка). */
function parsePromptRewriteModelResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = extractJsonObject(text);
  } catch {
    return null;
  }
  const b64 = parsed?.prompt_b64;
  if (typeof b64 === "string" && b64.trim()) {
    const cleaned = b64.replace(/\s+/g, "");
    try {
      const dec = Buffer.from(cleaned, "base64").toString("utf8");
      if (String(dec || "").trim()) return dec;
    } catch {
      /* ignore */
    }
  }
  const plain = parsed?.prompt;
  if (typeof plain === "string" && String(plain).trim()) return plain;
  return null;
}

const PROMPT_REWRITE_MAX_TOKENS = Math.max(
  2048,
  Math.min(16384, Number(process.env.SOFTGEN_PROMPT_REWRITE_MAX_TOKENS) || 8192)
);

async function rewritePromptByClaude({
  claudeApiKey,
  promptType,
  seed,
  basePrompt,
  onLog,
  shouldStop,
  budgetTracker,
}) {
  const src = String(basePrompt || "").trim();
  if (!src) return "";
  if (!isPromptRewriteEnabled()) return src;
  const systemB64 =
    "Ты переписываешь промпт для другой LLM-модели. " +
    "Сохраняй ключевые требования и форматные ограничения, но радикально меняй структуру и формулировки. " +
    "Верни ТОЛЬКО один JSON-объект без markdown и без текста до/после. " +
    "Корень: {\"prompt_b64\":\"<одна строка base64>\"} — prompt_b64 это base64 от UTF-8 переписанного промпта целиком; " +
    "внутри base64 не должно быть пробелов и переносов строк. Не используй поле prompt с сырым текстом — только prompt_b64.";
  const userBase =
    `Тип: ${promptType}\n` +
    `Seed: ${seed}\n` +
    "Нужно сохранить требования и контракт формата, но сделать новый оригинальный вариант промпта. " +
    "Не удаляй критичные правила JSON/языка/обязательных страниц.\n\n" +
    `Исходный промпт:\n${src}`;

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const user =
      attempt === 1
        ? userBase
        : `${userBase}\n\nПредыдущий ответ не распарсился (невалидный JSON или битый base64). ` +
          "Повтори: только JSON {\"prompt_b64\":\"...\"}, одна непрерывная строка base64 без пробелов внутри, без ```.";
    try {
      const raw = await callClaudeOnly({
        apiKey: claudeApiKey,
        system: systemB64,
        user,
        maxTokens: PROMPT_REWRITE_MAX_TOKENS,
        temperature: attempt === 1 ? 1 : 0.25,
        onLog,
        shouldStop,
        budgetTracker,
      });
      const out = parsePromptRewriteModelResponse(raw);
      const sanitized = sanitizePromptOverlayText(out || "", 120000);
      if (sanitized) return sanitized;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr && onLog) {
    emitLog(
      onLog,
      `Prompt rewrite parse failed after retries: ${String(lastErr?.message || lastErr).slice(0, 200)}`
    );
  }
  return src;
}

async function buildRegeneratedPromptOverlay({
  claudeApiKey,
  theme,
  projectSlug,
  buildNonce,
  expectedFiles,
  diversityPackText,
  baseOverlay,
  onLog,
  shouldStop,
  budgetTracker,
}) {
  const files = (Array.isArray(expectedFiles) ? expectedFiles : [])
    .map((f) => String(f || "").trim())
    .filter(Boolean);
  const overlaySeed = `${projectSlug}|${buildNonce}|prompt-remix|${files.join(",")}`;
  const system =
    "Ты переписываешь только слой инструкций для LLM-генерации сайта. " +
    "Верни строго JSON: {\"overlay\":\"...\"}. Поле overlay — русский текст (8-14 строк), " +
    "без markdown, без обратных кавычек, без комментариев, без технических имен папок. " +
    "Задача overlay: изменить формулировки и порядок инструкций так, чтобы следующий вызов генератора " +
    "не повторял шаблон прошлых запусков (анти-fingerprint), при этом сохранить совместимость с существующим пайплайном.";
  const user =
    `SEED: ${overlaySeed}\n` +
    `ТЕМА: ${theme}\n` +
    `ФАЙЛЫ: ${files.join(", ") || "index.php, reviews.php, registration.php, payments.php"}\n` +
    `СЛУЖЕБНЫЙ BUILD NONCE: ${buildNonce}\n\n` +
    "Требования к overlay:\n" +
    "- никаких требований ломать JSON-формат ответов;\n" +
    "- упор на вариативность DOM, ритма секций, порядка блоков, типа подачи;\n" +
    "- запрет копировать каркас между страницами одного сайта и между разными билдами;\n" +
    "- не подгонять каркас под один условный публичный лендинг «как у всех»;\n" +
    "- минимум 2 прямых anti-pattern запрета;\n" +
    "- минимум 2 прямых must-do требования для отличия структуры.\n\n" +
    `Базовый diversity-блок:\n${diversityPackText}\n\n` +
    (baseOverlay
      ? `Текущий профиль overlay (перефразируй и усили, не копируй дословно):\n${baseOverlay}\n`
      : "");

  const raw = await callClaudeOnly({
    apiKey: claudeApiKey,
    system,
    user,
    maxTokens: PROMPT_REGEN_MAX_TOKENS,
    temperature: 1,
    onLog,
    shouldStop,
    budgetTracker,
  });
  const parsed = extractJsonObject(raw);
  const overlay = sanitizePromptOverlayText(parsed?.overlay || "");
  if (!overlay) {
    throw new Error("Prompt regen: пустой overlay.");
  }
  return overlay;
}

const SLUG_ROLE_HINTS = {
  reviews: "Отзывы и репутация",
  registration: "Регистрация и верификация",
  payments: "Платежи, зеркало, вывод средств",
  bonus: "Бонусы и акции",
  zerkalo: "Зеркало и доступ",
  vip: "VIP и привилегии",
  slots: "Слоты и каталог игр",
  mirror: "Рабочее зеркало",
  cash: "Касса и лимиты",
  app: "Приложение и мобильный доступ",
  mobile: "Мобильная версия",
  support: "Поддержка и помощь",
  rules: "Правила и условия",
  tournaments: "Турниры",
  live: "Live-игры",
  promo: "Промо и предложения",
  club: "Клуб и статусы",
  loyalty: "Программа лояльности",
  jackpot: "Джекпоты",
  news: "Новости и обновления",
  guides: "Гайды и советы",
  security: "Безопасность",
  contacts: "Контакты",
  about: "О площадке",
  games: "Игры и жанры",
  start: "Быстрый старт",
  "faq-page": "Вопросы и ответы",
  policy: "Политика и документы",
};

function mirrorPageRoleForBrand(brandName) {
  const bn = String(brandName || "").trim() || "бренда";
  return `Официальное зеркало ${bn} — рабочий адрес, доступ при блокировке провайдера, безопасный вход и защита от подделок`;
}

function defaultRoleForFile(file, brandName = "") {
  const lower = String(file || "").toLowerCase();
  if (lower === "index.php" || lower === "index.html") {
    return "Главная — обзор темы, игры, VIP";
  }
  const slug = lower.replace(/\.(php|html)$/i, "");
  if (slug === "zerkalo" || slug === "mirror") {
    return mirrorPageRoleForBrand(brandName);
  }
  if (SLUG_ROLE_HINTS[slug]) return SLUG_ROLE_HINTS[slug];
  return `Тематическая страница: ${slug.replace(/[-_]+/g, " ")}`;
}

function roleHasAnyCyrillic(s) {
  return /[\u0400-\u04FF]/.test(String(s || ""));
}

/** Подмена role из ответа архитектора: без кириллицы, пары через «/». */
function shouldReplaceArchitectRole(role) {
  const t = String(role || "").trim();
  if (!t) return true;
  if (/\s*\/\s*/.test(t)) return true;
  if (!roleHasAnyCyrillic(t)) return true;
  return false;
}

function enforceZerkaloPageFocus(page, brandName, brandKey = "") {
  const file = String(page?.file || "").toLowerCase();
  if (file !== "zerkalo.php" && file !== "mirror.php") return page;
  const bn = String(brandName || "").trim() || "Бренд";
  const mirrorRole = mirrorPageRoleForBrand(bn);
  return {
    ...page,
    role: mirrorRole,
    title:
      String(page?.title || "").trim() ||
      `Рабочее зеркало ${bn} — официальный доступ`,
    description:
      String(page?.description || "").trim() ||
      `Официальное зеркало ${bn}: рабочие адреса, безопасный вход и доступ при блокировке.`,
  };
}

function regexEscapeForTitle(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** «Laki — index», «Бренд — zerkalo» тощо — не повноцінний <title>. */
function isSlugStyleSeoTitle(title, file, brandName) {
  const t = String(title || "").trim();
  if (!t) return true;
  const slug = String(file || "")
    .replace(/\.(html|php)$/i, "")
    .toLowerCase();
  const bn = String(brandName || "").trim();
  if (bn) {
    const re = new RegExp(
      `^\\s*${regexEscapeForTitle(bn)}\\s*[-–—:]?\\s*${regexEscapeForTitle(slug)}\\s*$`,
      "i"
    );
    if (re.test(t)) return true;
  }
  if (
    t.length <= 48 &&
    /[-–—]\s*(index|promo|guides|zerkalo|policy|reviews|payments|registration|loyalty|mirror|faq)\s*$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Заголовок для <title> з теми/ролі сторінки (без імені файлу). */
function deriveDefaultPageTitle({ brandName, themeNorm, file, roleLine }) {
  const bn = String(brandName || "").trim() || "бренд";
  const theme = String(themeNorm || "").trim();
  const role = String(roleLine || "").trim();
  if (isIndexPageFile(file)) {
    if (theme.length > 10) {
      return `${theme.slice(0, 92)} — ${bn}`.slice(0, 118);
    }
    return `Официальный сайт ${bn}: игры, бонусы и рабочее зеркало`.slice(0, 118);
  }
  if (role.length >= 14 && role.length <= 118) return role.slice(0, 118);
  const slug = String(file || "").replace(/\.(html|php)$/i, "");
  const human = slug.replace(/[-_]+/g, " ");
  return `${human.charAt(0).toUpperCase()}${human.slice(1)} — ${bn}`.slice(0, 118);
}

/**
 * Объединяет ответ архитектора с планом страниц: раскладка, компоненты, порядок секций и архетипы
 * в первую очередь из полей JSON архитектора; при пустых/невалидных значениях — минимальное дополнение из seed
 * (порядок валидных токенов и id архитектора **сохраняется**, без перетасовки «ради отпечатка»).
 */
function normalizePagesPlan(rawPages, expectedFiles, opts) {
  const { brandName, themeNorm, seed, brandKey = "" } = opts;
  const map = new Map(
    (Array.isArray(rawPages) ? rawPages : [])
      .map((p) => (p ? { ...p, file: canonicalMultipageFile(p.file) } : p))
      .filter((p) => p && expectedFiles.includes(String(p.file)))
      .map((p) => [String(p.file), p])
  );
  const pool = getLayoutVariantPool();
  const heavy =
    /bento|magazine|KPI|sticky-боков|плавающ|двухколоночный FAQ|шахматный|editorial|longform|dashboard|zig-zag/i;
  const lightPool = pool.filter((x) => !heavy.test(x));
  const layoutPool = lightPool.length >= 3 ? lightPool : pool;
  const innerFiles = expectedFiles.filter((f) => !isIndexPageFile(f));
  const layoutMap = pickDistinctFromPool(layoutPool, `${seed}|lv`, innerFiles);
  const compsMap = pickDistinctFromPool(MAIN_COMPONENT_PRESETS, `${seed}|mc`, innerFiles);
  const sectionsMap = pickDistinctFromPool(SECTION_ORDER_PRESETS, `${seed}|so`, innerFiles);
  const homeLayout =
    pickDeterministicFromPool(SIMPLE_HOME_LAYOUTS, seed, "homeLvV1") ||
    SIMPLE_HOME_LAYOUTS[0];
  const homeSectionsPick =
    pickDeterministicFromPool(SIMPLE_HOME_SECTION_ORDERS, seed, "homeSoV1") ||
    SIMPLE_HOME_SECTION_ORDERS[0];
  const homeSectionsShuffled = shuffleWithSeed(
    [...(Array.isArray(homeSectionsPick) ? homeSectionsPick : [homeSectionsPick])],
    `${seed}|homeSoShuffleV2`
  );
  const maxHomeSo = homeSectionsShuffled.length;
  const span = Math.max(1, maxHomeSo - 3);
  const wantHomeLen = 4 + (siteHash32(`${seed}|homeSoLen`) % span);
  const homeSoLen = Math.min(maxHomeSo, Math.max(4, Math.min(wantHomeLen, 8)));
  const homeSections = homeSectionsShuffled.slice(0, homeSoLen);
  const homeCompsPick =
    pickDeterministicFromPool(SIMPLE_HOME_COMPONENTS, seed, "homeMcV1") ||
    SIMPLE_HOME_COMPONENTS[0];
  const homeComps = shuffleWithSeed(
    [...(Array.isArray(homeCompsPick) ? homeCompsPick : [homeCompsPick])],
    `${seed}|homeMcShuffleV1`
  );
  const structuralArchMap = assignDisjointStructuralArchetypes(seed, expectedFiles);

  return expectedFiles.map((file, i) => {
    const p = map.get(file) || {};
    const h = siteHash32(`${seed}|${file}|${i}`);
    let role =
      String(p.role || "").trim() || defaultRoleForFile(file, brandName);
    if (shouldReplaceArchitectRole(role)) {
      role = defaultRoleForFile(file, brandName);
    }
    let title = String(p.title || "").trim();
    if (!title || isSlugStyleSeoTitle(title, file, brandName)) {
      title = deriveDefaultPageTitle({
        brandName,
        themeNorm,
        file,
        roleLine: role,
      });
    }
    const descRaw = String(p.description || "").trim();
    const description = (descRaw || themeNorm).slice(0, 155);
    const isHome = isIndexPageFile(file);
    const fbArch = structuralArchMap.get(file) || [];
    const wantArchN = isHome ? 3 : 2;
    const archFromArchitectRaw = Array.isArray(p.structuralArchetypeIds)
      ? p.structuralArchetypeIds.map((x) => String(x || "").trim())
      : [];
    const archValidOrdered =
      filterStructuralArchetypeIdsOrdered(archFromArchitectRaw);
    const archRaw =
      archValidOrdered.length >= wantArchN
        ? archValidOrdered.slice(0, wantArchN)
        : pickStructuralArchetypeIdsMerged(
            archFromArchitectRaw,
            fbArch,
            wantArchN
          );
    const structuralArchetypeIdsOrdered = [...archRaw];
    const innerBaseOrder =
      sectionsMap.get(file) || SECTION_ORDER_PRESETS[0];
    /** Повне перемішування порядку секцій на внутрішніх URL — мінімізує повтори між білдами (fingerprints). */
    const innerSectionOrder = shuffleWithSeed(
      [...innerBaseOrder],
      `${seed}|innerSoFp|${file}`
    );
    const innerCompsRaw = compsMap.get(file) || MAIN_COMPONENT_PRESETS[0];
    const innerMainComponents = shuffleWithSeed(
      [...innerCompsRaw],
      `${seed}|innerMcFp|${file}`
    );
    const layoutFromArchitect = normalizeArchitectLayoutVariant(
      p.layoutVariant
    );
    const pOrderSan = sanitizeArchitectSectionOrderForPlan(
      file,
      p.sectionOrder,
      isHome
    );
    const pComponentsSan = sanitizeArchitectMainComponentsForPlan(
      p.mainComponents
    );
    const minSectionTokens = isHome ? 4 : 3;
    const finalLayout = isHome
      ? layoutFromArchitect || homeLayout
      : layoutFromArchitect || layoutMap.get(file) || layoutPool[0];
    const finalMainComponents = isHome
      ? pComponentsSan.length
        ? pComponentsSan
        : homeComps
      : pComponentsSan.length
        ? pComponentsSan
        : innerMainComponents;
    const homePadded = padArchitectSectionOrderTokens(
      pOrderSan,
      homeSections,
      minSectionTokens,
      8
    );
    const innerPadded = padArchitectSectionOrderTokens(
      pOrderSan,
      innerSectionOrder,
      minSectionTokens,
      8
    );
    const finalSectionOrder = isHome
      ? homePadded.length >= minSectionTokens
        ? homePadded
        : homeSections
      : innerPadded.length >= minSectionTokens
        ? innerPadded
        : innerSectionOrder;
    const homeFlowDescription = "";
    return {
      file,
      role,
      title,
      description,
      layoutVariant: finalLayout,
      contentAngle: String(p.contentAngle || "").trim() || EDITORIAL_ANGLES[h % EDITORIAL_ANGLES.length],
      tone: String(p.tone || "").trim() || EDITORIAL_TONES[h % EDITORIAL_TONES.length],
      mainComponents: finalMainComponents,
      sectionOrder: finalSectionOrder,
      structuralArchetypeIds: archRaw,
      structuralArchetypeIdsOrdered,
      homeFlowDescription,
    };
  }).map((p) => enforceZerkaloPageFocus(p, brandName, brandKey));
}

/**
 * Единый «справочный» формат h1–h3 (как у типовых SEO-лендингов казино): короткие фразы, фиксированный порядок тем на главной.
 * Текст в вёрстке — сразу финальный русский; здесь задаём смысл и иерархию.
 */
function buildHeadingFormatPromptBlock(pageMeta, brandTerms) {
  const brand =
    (Array.isArray(brandTerms) && brandTerms[0] && String(brandTerms[0]).trim()) ||
    "бренд";
  const low = String(pageMeta.file || "").toLowerCase();

  if (isIndexPageFile(pageMeta.file)) {
    return `
ФОРМАТ ЗАГОЛОВКОВ НА ГЛАВНОЙ (index): русский в тегах — финальный (без @@PH), но без жёсткого шаблона:
- **Один** <h1> в основном потоке <main> (если hero без h1 — первый смысловой блок после hero): с естественным упоминанием ${brand}.
- Используй 5-8 <h2> и при необходимости 1-3 <h3> под частью разделов.
- Темы h2 можно брать из кластера: официальный сайт, зеркало, регистрация, приложение, платежи, бонусы, FAQ — но **свободно** меняй порядок и формулировки.
- Иерархия только **h1 → h2 → h3**, без <h4> вместо <h3> и без пропуска уровней.
- Длина текста внутри заголовка: h1 до ~${HEADLINE_H1_MAX_WORDS} слов, h2/h3 до ~${HEADLINE_H23_MAX_WORDS} слов.
- Не повторяй один и тот же набор h2 и их последовательность между билдами.
`;
  }

  if (/zerkalo\.php$/i.test(low) || /mirror\.php$/i.test(low)) {
    return `
ФОРМАТ ЗАГОЛОВКОВ (страница зеркала):
- Один <h1>: **«Рабочее зеркало ${brand}»** или **«Официальное зеркало ${brand} на сегодня»** (один стиль на страницу).
- **4–7** <h2> в справочном стиле: доступ сегодня, почему не открывается, как проверить подлинность, вход и кабинет, безопасность и фишинг, мобильный доступ.
- Под важными <h2> — по **2–4** узких <h3>; h1 до ~${HEADLINE_H1_MAX_WORDS} слов, h2/h3 до ~${HEADLINE_H23_MAX_WORDS} слов.
`;
  }

  if (/registration/i.test(low)) {
    return `
ФОРМАТ ЗАГОЛОВКОВ (регистрация):
- Один <h1>: **«Регистрация ${brand}»** или **«Регистрация на официальном сайте ${brand}»**.
- <h2> — короткие шаги и правила (данные, верификация, ограничения); <h3> только под соответствующими <h2>; до ~${HEADLINE_H23_MAX_WORDS} слов в h2/h3.
`;
  }

  if (/payments?|deposit|payout|вывод|касс/i.test(low)) {
    return `
ФОРМАТ ЗАГОЛОВКОВ (платежи / касса):
- Один <h1> про **пополнение и вывод** с упоминанием ${brand}.
- <h2> — способы, сроки, лимиты, комиссии, верификация; короткие формулировки, по **1–3** <h3> где нужны подпункты; h2/h3 до ~${HEADLINE_H23_MAX_WORDS} слов.
`;
  }

  if (/review|отзыв/i.test(low)) {
    return `
ФОРМАТ ЗАГОЛОВКОВ (отзывы):
- Один <h1>: **«Отзывы о ${brand}»** / **«Отзывы игроков о ${brand}»**.
- <h2> — репутация, поддержка, выплаты, как отличить настоящий сайт; без длинных «продающих» заголовков; h2/h3 до ~${HEADLINE_H23_MAX_WORDS} слов.
`;
  }

  return `
ФОРМАТ ЗАГОЛОВКОВ НА ВНУТРЕННЕЙ СТРАНИЦЕ:
- Один <h1>: **прямая тема страницы** и ${brand} в естественной короткой формулировке (справочный стиль).
- **4–8** <h2> нейтральными секциями; под ними **1–3** <h3> только при логичном делении; без «воды» и без превосходных степеней в заголовках.
- h1 до ~${HEADLINE_H1_MAX_WORDS} слов, h2/h3 до ~${HEADLINE_H23_MAX_WORDS} слов; иерархия h1→h2→h3 без пропусков.
`;
}

function buildArchitectPrompt({
  theme,
  buildNonce,
  imageFiles,
  yandexVerification,
  baseUrl,
  projectSlug,
  themeBrandHint = "",
  diversityPackText,
  structureSalt = "",
  expectedFiles = ["index.php", "reviews.php", "registration.php", "payments.php"],
  promptProfileOverlay = "",
  promptFamilyOverlay = "",
  referenceBlend = false,
  siteGenerationRulesBlock = "",
  sourceArticlesOverlay = "",
}) {
  const layoutCatalog = shuffleWithSeed(
    getLayoutVariantPool(),
    `${projectSlug}|${buildNonce}|${structureSalt}|catalog`
  );
  const pageCount = Math.max(
    1,
    Math.min(4, Array.isArray(expectedFiles) ? expectedFiles.length : 4)
  );
  const fileList = (Array.isArray(expectedFiles) ? expectedFiles : [])
    .map((f) => String(f).trim())
    .filter(Boolean)
    .join(", ");
  const innerExamples = (Array.isArray(expectedFiles) ? expectedFiles : [])
    .filter((f) => String(f).toLowerCase() !== "index.php")
    .slice(0, 4)
    .join(", ");
  const internalTag = String(buildNonce || "").slice(0, 12);
  const hk = String(themeBrandHint || "").trim();
  const brandFromTheme = hk || "сформируй из темы читаемое русское имя бренда";
  const lockBrandNameToHint = Boolean(hk) && !isLegacyLakiBrandLabel(hk);
  const filesArr = Array.isArray(expectedFiles) ? expectedFiles : [];
  const needsMirrorPage = filesArr.some((f) =>
    /(^|\/)(zerkalo|mirror)\.php$/i.test(String(f))
  );
  const mirrorArchitectBlock = needsMirrorPage
    ? `3.4) Если в списке есть zerkalo.php или mirror.php — role/title/description только про зеркало/доступ/безопасный вход (русский текст бренда из «Бренд из темы»).
`
    : "";
  const architectSkeletonCatalog = buildArchitectSkeletonCatalogBlock();
  const referenceBlendPreamble = referenceBlend
    ? `
ПРИОРИТЕТ (режим референса — зеркало каркаса): если в overlay ниже есть «РЕФЕРЕНС САЙТА» и/или структурный снимок ref-structure — **sectionOrder**, **layoutVariant** и набор секций в JSON должны **максимально совпадать с референсом** (включая сценарий с сайдбаром). Свежесть — в title/description/contentAngle/tone/role и текстах; **не** подменяй тип макета и порядок крупных секций ради «уникальности между сайтами».
`
    : "";
  const randomPolicy = referenceBlend
    ? "Согласуй план с референсом и overlay: цепочки секций и UI-паттерны как у референса; формулировки полей JSON делай свежими, избегай SEO-штампов между URL без смены типового каркаса страниц."
    : shuffleWithSeed(
        [
          "Сделай лаконичный план, без повторяющихся формулировок.",
          "Сделай план максимально вариативным по подаче страниц.",
          "Избегай шаблонных SEO-клише и повторов между URL.",
          "Разведи страницы по разным интентам пользователя.",
        ],
        `${projectSlug}|${buildNonce}|archPolicy`
      )
        .slice(0, 2)
        .join(" ");
  return `JSON CONTRACT: верни ТОЛЬКО валидный JSON. Без markdown. Без \`\`\`json. Без комментариев до/после.
Схема корня: { "brandName": string, "pages": Page[] }
Каждая страница: file, role (ru), title, description, contentAngle, tone, layoutVariant, sectionOrder, mainComponents, structuralArchetypeIds

Ты формируешь краткий план сайта.

${buildQualityAndSeoPriorityBlock("architect")}

${siteGenerationRulesBlock ? `\n${siteGenerationRulesBlock}\n` : ""}
${sourceArticlesOverlay ? `\n${sourceArticlesOverlay}\n` : ""}

Тема: ${theme}
Бренд из темы: «${brandFromTheme}».
Служебная метка: ${internalTag} (не выводить в тексты сайта).
URL: ${baseUrl}
Файлы страниц (строго): ${fileList}
Обязательная страница: index.php. Остальные URL — внутренние разделы под тему «${theme}» (смысл role/title/description должен раскрывать тему, а не шаблон «зеркало»).

${architectSkeletonCatalog}
${randomPolicy}
${diversityPackText}
${promptProfileOverlay ? `\n${promptProfileOverlay}\n` : ""}
${promptFamilyOverlay ? `\n${promptFamilyOverlay}\n` : ""}
${referenceBlendPreamble}

Требования:
- Язык текстов: русский.
- Корень JSON: только brandName и pages.
- Для каждой страницы: file, role, title, description, contentAngle, tone, **layoutVariant**, **sectionOrder**, **mainComponents**, **structuralArchetypeIds** (см. блок «КАРКАС КАЖДОЙ СТРАНИЦЫ» выше).
- Поле **role** (короткая строка для меню и плана): только **русский** язык, 2–7 слов; **запрещены** латинские слуги вроде onboarding/reviews/payments как единственный текст; **запрещены** варианты названий через «/» (например «X / Y»). Для зеркала — смысл «рабочее зеркало», «доступ», без дублирования бренда латиницей и кириллицей через слэш.
- **Меню и внутренние ссылки:** только файлы из списка «Файлы страниц» (${fileList}). Не планируй и не упоминай games.php, payments.php, zerkalo.php и другие URL, если их **нет** в этом списке. role/title каждой страницы должны соответствовать её file (для vip.php — VIP, не «платежи»).
- Без jsonLd, без комментариев, без лишних полей.
- Если среди файлов есть zerkalo.php/mirror.php — только про зеркало/доступ; иначе каждая страница раскрывает свой аспект темы.
- title/description не дублировать между страницами.
- Поле title: полноценный русский заголовок страницы по теме и role (ориентир 28–90 символов), осмысленный для <title>; ЗАПРЕЩЕНО: «brandName — index», «бренд — имя_файла», латинские slug-и вместо заголовка.
- Контентные тексты позже должны укладываться в объём: index не меньше ${MIN_INDEX_PAGE_WORDS} слов, остальные не меньше ${MIN_PAGE_WORDS}.
- Тематика **iGaming / онлайн-казино**: на разных URL раскрывай разные аспекты — приветственные и reload-бонусы, фриспины, кэшбэк, турниры, слоты и live-столы, промокоды, вейджер, RTP, лимиты, VIP-уровни; contentAngle и role должны звучать как реальный игровой портал, а не абстрактная «история компании».
${lockBrandNameToHint ? `- Поле **brandName** в корне JSON — строго «${hk}» (бренд задан сборщиком из UI); не подставляй обобщения вроде «Онлайн казино», «Казино онлайн», выдуманные торговые имена.` : ""}

Формат:
{
  "brandName": "...",
  "pages": [
    {
      "file": "index.php",
      "role": "...",
      "title": "...",
      "description": "...",
      "contentAngle": "...",
      "tone": "...",
      "layoutVariant": "L02: split hero ...",
      "sectionOrder": ["hero", "games", "vip", "faq", "cta"],
      "mainComponents": ["tabs", "accordion"],
      "structuralArchetypeIds": ["timeline-v", "myth-fact", "pull-quote"]
    }
  ]
}`;
}

/** Перший екран index: жорстко чергуємо каркас між білдами (менше «жовтий h1 + текст + зелена кнопка + картинка справа»). */
const INDEX_HERO_OPENING_MODES = [
  {
    id: "single-column",
    body: `Первая <section> в <main> — **одна центрированная колонка** (max-width ~720–900px): сверху h1, лид, абзацы, CTA внизу. **Без** двухколоночного hero «текст | крупная картинка». Допустимо маленькое превью под текстом или узкая полоса 160–220px высотой.`,
  },
  {
    id: "media-left",
    body: `Первая <section> — **медиа слева** (~35–42% ширины), текст и CTA **справа** (~58–65%). Не повторяй шаблон «картинка справа»; картинка только из ./img/ по правилам билда.`,
  },
  {
    id: "stacked-headline",
    body: `Первая <section>: сверху **полноширинный** h1 + короткий лид; ниже **две асимметричные** колонки (например 38% / 62%): слева компактный список 3–5 пунктов, справа основной текст + CTA. Без одной большой обложки на половину экрана.`,
  },
  {
    id: "bg-cover-aside",
    body: `Первая <section> с **background-image** (cover), min-height 360–520px; текст и CTA в **компактном** блоке (max-width ~520px) **слева или внизу** на тёмной подложке — **не** горизонтальная «лента» по центру всего фото.`,
  },
  {
    id: "teaser-row",
    body: `Под полноширинным h1 — **ряд из трёх узких тизеров** (разная ширина колонок 1fr / 1.15fr / 0.85fr), затем лид, абзацы и CTA. Без одного крупного slot-превью на пол-экрана.`,
  },
  {
    id: "narrow-metrics-wide-copy",
    body: `Первая <section>: split примерно **32/68** — узкая колонка с мини-метриками/иконками или коротким списком (без KPI-полосы 4×1), широкая — h1, текст, CTA. В узкой колонке **не** полноразмерная обложка слота.`,
  },
  {
    id: "top-strip-then-split",
    body: `Первая <section>: сверху **узкая полоса** (высота 120–200px) — декоратив или маленькое превью из ./img/; **под ней** две колонки **55/45** (текст слева шире, справа второстепенный блок: цитата, короткий список или мини-карточка без крупного слота). Один h1 — в нижней части секции над колонками или в левой колонке.`,
  },
  {
    id: "inverted-pyramid",
    body: `Первая <section>: сначала **короткий лид** и мелкая подпись-тема (не h1), затем **h1** крупнее; под h1 — два абзаца разной длины и CTA; визуал — **маленький** thumb справа от второго абзаца (inline или float), не колонка на 50% ширины.`,
  },
  {
    id: "rail-chapters",
    body: `Первая <section>: сетка **78/22** — основная колонка: h1, лид, абзац, CTA; узкая «рельса» справа — **вертикальный** список из 4–6 коротких пунктов-якорей (не настоящий sticky). Без большого изображения; иконки или маркеры только текстом/unicode.`,
  },
  {
    id: "bento-hero",
    body: `Первая <section> — **bento**: 4 ячейки разного span (CSS grid), одна ячейка под h1+лид, другая под абзац, третья под CTA, четвёртая под **маленькое** изображение или градиент; ни одна ячейка не занимает половину экрана целиком как «слот-обложка».`,
  },
  {
    id: "overlap-cards",
    body: `Первая <section>: h1 и лид на **сплошном** фоне var(--lw-block) или палитры; ниже **две перекрывающиеся** карточки (лёгкий translate/rotate, без position:fixed): на одной — тезисы, на другой — абзац + CTA; без полноэкранного фото слота.`,
  },
  {
    id: "split-bottom-visual",
    body: `Первая <section>: **верх** — полноширинный текстовый блок (h1, лид, 2 абзаца, CTA); **низ** секции — **низкая** галерея 3–5 миниатюр в ряд (высота превью 100–140px), только ./img/. Не делай одну картинку на 45% ширины рядом с текстом.`,
  },
  {
    id: "faq-hook-hero",
    body: `Первая <section>: **один h1** (можно сформулировать как вопрос к читателю), сразу под ним короткий ответ одним абзацем, затем развёрнутый текст и CTA; без правой колонки-картинки; опционально 2–3 мини-«чипа»-темы под h1.`,
  },
  {
    id: "zigzag-micro",
    body: `Первая <section>: после h1 — **три узких горизонтальных ряда** «1 строка текста + крошечный визуал» (визуал ≤120px), чередуй слева/справа текст; финально CTA на полную ширину. Не используй одну большую картинку.`,
  },
  {
    id: "magazine-dropcap",
    body: `Первая <section>: **журнальный** вход — h1, затем абзац с **буквицей** (drop-cap) и боковой узкой колонкой-примечанием (aside ~24–28% ширины) с 2–3 фактами; CTA под основным текстом; без hero-картинки на половину макета.`,
  },
  {
    id: "staggered-intro",
    body: `Первая <section>: h1 **смещён** визуально (padding/margin разный слева и справа), лид в **узкой** колонке 65%, основной абзац на 92% ширины с отступом; CTA выровнен не по центру (например слева); одно небольшое изображение только после абзаца, ширина ≤40%.`,
  },
  {
    id: "panel-stack",
    body: `Первая <section>: **стопка** из 2–3 горизонтальных «панелей» разной высоты (первая — h1+лид, вторая — список, третья — абзац+CTA), между панелями разделители; без колонки «картинка на половину».`,
  },
  {
    id: "split-top-image-band",
    body: `Первая <section>: **очень узкая** горизонтальная картинка-лента (max-height 140px, object-fit cover) на всю ширину; под ней **две колонки 48/52** только текст и CTA (без второго крупного изображения).`,
  },
];

function pickIndexHeroOpeningModeBlock(
  structureFingerprint,
  buildNonce,
  pageFile,
  referenceBlendMode = false
) {
  if (referenceBlendMode || !isIndexPageFile(pageFile)) return "";
  const modes = INDEX_HERO_OPENING_MODES;
  const n = modes.length;
  const idx =
    siteHash32(
      `${String(structureFingerprint || "")}|${String(buildNonce || "")}|indexHeroOpenV2`
    ) % n;
  const m = modes[idx] || modes[0];
  const text = `ОБЯЗАТЕЛЬНЫЙ РЕЖИМ ПЕРВОГО БЛОКА (index, **вариант ${idx + 1}/${n}**):\n${m.body}`;
  return `\n${text}\n`;
}

function buildPagePrompt({
  theme,
  pageMeta,
  buildNonce,
  navLayoutPromptBlock = "",
  imageFiles,
  gameImages = [],
  gameSlotPaths = [],
  gameTabSlotBatches = [],
  homeGamesMode = "single-grid",
  chromeContentOptions = null,
  structureFingerprint = "",
  sectionImagePaths = [],
  heroExtraPaths = [],
  avoidPhrases = [],
  yandexVerification,
  baseUrl,
  pageIndex,
  themeBrandHint = "",
  diversityPackText,
  promptProfileOverlay = "",
  promptFamilyOverlay = "",
  siblingPlanSummary = "",
  uniquenessUrgencyLevel = 0,
  minPageWords = MIN_PAGE_WORDS,
  wordCountUrgencyLevel = 0,
  wordCountOverMaxUrgencyLevel = 0,
  brandTerms = [],
  sitePalette: sitePaletteIn,
  totalPageCount = 4,
  blueprintDirectives = null,
  chromeShell = { includeHeader: true, includeFooter: true },
  referenceStructureSignals = null,
  referenceBlendMode = false,
  referenceTemplateMode = false,
  referenceTemplateMainHtml = "",
  chromeVariant = null,
  navLinks = [],
  gatewayUrl = DEFAULT_GATEWAY_URL,
  logoSrcForPrompt = LAKI_LOGO_IMG_SRC,
  useTemplateChrome: useTemplateChromeIn = usesTemplateChrome(),
  siteCanonicalChrome = null,
  siteCanonicalChromeForTemplate = null,
  isFirstSitePage = false,
  isFirstPageForTemplate = false,
  catalogSeedKey = "",
  pageSiteTemplate = "",
  siteClassNamespace = null,
  strictEtalonLayout = false,
  allPages = [],
  projectSlug = "",
  siteGenerationRulesBlock = "",
  sourceArticlesOverlay = "",
}) {
  const gtw = String(gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL;
  const allowedPageFiles = (Array.isArray(allPages) ? allPages : [])
    .map((p) => String(p?.file || "").trim())
    .filter(Boolean)
    .join(", ");
  const logoPrompt =
    String(logoSrcForPrompt || LAKI_LOGO_IMG_SRC).trim() || LAKI_LOGO_IMG_SRC;
  const refBlend = Boolean(referenceBlendMode);
  const refTpl =
    Boolean(referenceTemplateMode) &&
    String(referenceTemplateMainHtml || "").trim().length > 0;
  const strictTpl = Boolean(strictEtalonLayout) && refTpl;
  const refHeaderTpl = String(
    referenceStructureSignals?.referenceHeaderTemplate || ""
  ).trim();
  const refFooterTpl = String(
    referenceStructureSignals?.referenceFooterTemplate || ""
  ).trim();
  const REF_CHROME_PROMPT_SNIP = 10000;
  const refHeaderTplSnip =
    refHeaderTpl.length > REF_CHROME_PROMPT_SNIP
      ? `${refHeaderTpl.slice(0, REF_CHROME_PROMPT_SNIP)}\n<!-- … truncated … -->`
      : refHeaderTpl;
  const refFooterTplSnip =
    refFooterTpl.length > REF_CHROME_PROMPT_SNIP
      ? `${refFooterTpl.slice(0, REF_CHROME_PROMPT_SNIP)}\n<!-- … truncated … -->`
      : refFooterTpl;
  const classNs =
    siteClassNamespace ||
    buildSiteClassNamespace(
      themeBrandHint || (brandTerms && brandTerms[0]) || "",
      catalogSeedKey || `${structureFingerprint}|${buildNonce}`
    );
  const classPrefix = classNs.bemPrefix;
  const allowedImgList = (Array.isArray(imageFiles) ? imageFiles : [])
    .map((f) => String(f || "").replace(/^\.\/img\//, ""))
    .filter(Boolean)
    .join(", ");
  const brandAssetRules = strictTpl
    ? `
БРЕНД И АССЕТЫ (режим «клон»):
- Публичный бренд только: «${String(themeBrandHint || "").trim() || "из темы"}». ЗАПРЕЩЕНО: Laki, Лаки, Laki World, ЛАКИ ВОРЛД, laki_world и любые чужие торговые имена.
- Логотип в chrome: ${logoPrompt}. В <main> не подставляй ./img/laki* и файлы, которых нет в проекте.
- Допустимые файлы в ./img/ (только они): ${allowedImgList || "logo.png, favicon.png и ассеты бренда"}.
- **Классы в <main>:** сохраняй **как в эталоне** (ig-*, lw-*, union_*, union-*); **не** переименовывай в «${classPrefix}».
- pageCss: пусто или мелкие дополнения; **не** новая палитра.
- pageJs: только если нужен интерактив эталона.
`
    : `
БРЕНД И АССЕТЫ:
- Публичный бренд только: «${String(themeBrandHint || "").trim() || "из темы"}». ЗАПРЕЩЕНО: Laki, Лаки, Laki World, ЛАКИ ВОРЛД, laki_world и любые чужие торговые имена.
- Логотип в chrome: ${logoPrompt}. В <main> не подставляй ./img/laki* и файлы, которых нет в проекте.
- Допустимые файлы в ./img/ (только они): ${allowedImgList || "logo.png, favicon.png и ассеты бренда"}.
- alt у изображений — на русском, с названием бренда где уместно.
- CSS-классы в <main>: BEM с префиксом «${classPrefix}» (${classNs.promptExamples}); НЕ union_index_*, НЕ хеши p1_e5b60fe2, НЕ slug страницы в имени класса.
- pageJs: осмысленные имена (gamesTabs, faqAccordion); ЗАПРЕТ function-1223131, var p_e5b60f, однобуквеннных обработчиков.
- Контейнеры: max-width и ровные боковые отступы; текст в <p> с нормальным line-height; img { max-width:100%; height:auto }.
`;
  const P = {
    bg: sitePaletteIn?.bg ?? BRAND_BG,
    block: sitePaletteIn?.block ?? BRAND_BLOCK,
    card: sitePaletteIn?.card ?? BRAND_CARD,
    text: sitePaletteIn?.text ?? BRAND_TEXT,
    accent: sitePaletteIn?.accent ?? BRAND_ACCENT,
    accentOn: sitePaletteIn?.accentOn ?? "#101710",
    gradEnd: sitePaletteIn?.gradEnd ?? BRAND_BLOCK,
  };
  const keywordHint = buildSeoKeywordHint(theme, pageMeta.file, pageMeta.role);
  const antiClicheRuBlock = `
АНТИ-КЛИШЕ (текст <main>): не используй буквально и не копируй «шаблонные» формулировки, часто повторяемые между лендингами: «без рекламного тумана», «читайте по диагонали», «миллионы за клик», «редакция проверила», «всё по делу / без воды» как рефрен, «честная игра на реальные деньги» как заголовок секции. Вместо этого — конкретные шаги, нейтральный справочный тон, разные метафоры под тему страницы.
`;
  const uiPolishRuBlock = `
UI-АККУРАТНОСТЬ: у каждого CTA (<button> или <a>, оформленного как кнопка) в <main> должен быть **видимый русский текст не короче 3 символов** внутри тега (не только SVG/иконка); при необходимости дублируй смысл в aria-label. Не добавляй большой margin-top / padding-top у **первого** крупного блока сразу под <main> — отступ под шапку задаёт **css/chrome.css**; лишний «воздух» сверху выглядит как баг.
СТИЛИ И АНИМАЦИЯ: в **pageCss** обязательно оформи **headerHtml и footerHtml** (flex, фон, hover, CTA) с префиксом «${classPrefix}»; плюс карточки, promo и **все <table>**. Базовые стили header/footer/секций уже в chrome.css — **дополни** их в pageCss под палитру. Контент на всю ширину; сетки на clamp/grid.
ТАБЛИЦЫ: если есть сравнение форматов/бонусов — полноценная <table> с <thead>/<tbody>, классы с префиксом «${classPrefix}»; базовые стили таблиц уже в chrome.css, **дополни** их в pageCss под палитру билда.
`;
  const dualTplBlock = strictTpl
    ? buildCloneModePromptBlock({
        pageFile: pageMeta.file,
        templateId: pageSiteTemplate,
        referenceTemplateMainHtml,
        brandName: brandTerms?.[0] || themeBrandHint,
        themeBrandHint,
        gatewayUrl: gtw,
        isFirstPage: isFirstPageForTemplate,
        canonicalChromeForTemplate: siteCanonicalChromeForTemplate,
      })
    : pageSiteTemplate && usesDualSiteTemplates()
      ? buildSiteTemplatePagePromptBlock({
          pageFile: pageMeta.file,
          templateId: pageSiteTemplate,
          classNamespace: classNs,
          isFirstPage: isFirstPageForTemplate,
          canonicalChromeForTemplate: siteCanonicalChromeForTemplate,
        })
      : "";
  const premiumCatalogBlock =
    usesPremiumIgamingLayout() && !refTpl
      ? `\n${buildPremiumIgamingPromptIntro()}\n${buildPremiumLayoutPromptBlock(
          pageMeta.file,
          gtw,
          catalogSeedKey ||
            `${structureFingerprint}|${buildNonce}|${pageMeta.file}`
        )}\n${dualTplBlock || ""}${buildSiteChromeAuthoringBlock({ isFirstPage: isFirstSitePage && !pageSiteTemplate })}\n${buildSiteChromeReuseBlock(
          siteCanonicalChromeForTemplate || siteCanonicalChrome || {}
        )}\n`
      : dualTplBlock
        ? `\n${dualTplBlock}\n`
        : "";
  const igamingContentBlock = `
КОНТЕНТ iGAMING (обязательно в <main>, русский язык):
- Пиши про **бонусы** (приветственный пакет, reload, кэшбэк, фриспины), **промоакции** и турниры, **слоты** и **live-казино**, лимиты ставок, вейджер, RTP/волатильность — конкретно, с цифрами-ориентирами (диапазоны допустимы).
- На главной: hero с оффером, блок преимуществ, сравнение форматов игр или бонусов (таблица или карточки), FAQ по выплатам/верификации, CTA на регистрацию.
- На внутренних страницах — свой угол (платежи, отзывы, правила бонуса, VIP и т.д.), без «сухой хроники бренда» без игрового контекста.
- Тон: уверенный маркетинг площадки, но без юридических гарантий выигрыша; не копируй один и тот же абзац на все URL.
- SEO: раскрой интент страницы (${keywordHint}) в первых абзацах и подзаголовках; не жертвуй глубиной ради «быстрого» короткого ответа.
`;
  const preferredHero = [
    "./img/banner-1-mob.webp",
    "./img/baner-image.webp",
    "./img/banner-1.webp",
    "./img/forBaner.webp",
  ];
  const slotLines =
    gameSlotPaths.length > 0
      ? gameSlotPaths
          .map((p, i) => `${i + 1}. ${p}`)
          .join("\n")
      : "";
  const useGameTabs =
    isIndexPageFile(pageMeta.file) &&
    homeGamesMode === "tabs" &&
    Array.isArray(gameTabSlotBatches) &&
    gameTabSlotBatches.length >= 2;
  const tabListsBlock = useGameTabs
    ? (() => {
        const batchLists = gameTabSlotBatches
          .map(
            (batch, ti) =>
              `СПИСОК ${ti + 1} (${batch.length} карточек):\n${batch
                .map((p, i) => `  ${i + 1}. ${p}`)
                .join("\n")}`
          )
          .join("\n\n");
        const tabDomRules =
          "РЕЖИМ ИГР НА ЭТОМ ПРОЕКТЕ: ВКЛАДКИ (техника DOM). У каждой кнопки <button type=\"button\" data-tab=\"КЛЮЧ\"> и у панели с превью <div data-panel=\"КЛЮЧ\"> — один и тот же КЛЮЧ; панели без id=\"games-*\" обязаны иметь data-panel. Первая панель в DOM = список 1, вторая = список 2 и т.д. НЕ копируй одинаковые src на разные вкладки — у каждой вкладки свой набор превью ниже.";
        if (refBlend) {
          return `
${tabDomRules}
Подписи вкладок и визуальный стиль — **как у референса** (схема вкладок/сетки и DOM); меняй только формулировки и мелкие отступы **внутри** того же паттерна, не ломай REFERENCE LOCK.
${batchLists}
`;
        }
        return `
${tabDomRules}
Подписи вкладок и визуальный стиль панелей придумывай **с нуля под тему** (не обязательно «Хиты / Новинки / Джекпоты» и не обязательно эмодзи); допускается 2 или 4–5 вкладок, вертикальный ряд табов, подписи-«сегменты» в одной линии другой формы, а не три одинаковых rounded chip в ряд.
ЗАПРЕТ на «типовой слот-лендинг»: три outline-кнопки одной ширины + одна активная с заливкой + строго под ними симметричная сетка 4×2 одинаковых плиток — сломай шаблон (другие колонки 3×3 / 5+3, крупное featured превью, табы сбоку или под сеткой, разные размеры карточек).
${batchLists}
`;
      })()
    : "";
  const gamesModeExtra =
    homeGamesMode === "single-grid"
      ? `
РЕЖИМ ИГР: ОДНА ПОДБОРКА БЕЗ ВКЛАДОК. Не используй data-tab/data-panel внутри #lw-games. Собери **ровно** ${gameSlotPaths.length} карточек из списка ниже, но композицию придумай свободно: не обязательно ровная сетка 4×N — допустимы 2–6 колонок с разным ритмом, masonry, «bento» с разными span, крупный featured + мелкая сетка, две асимметричные группы. ЗАПРЕТ: карусель/slider с автопрокруткой.
`
      : homeGamesMode === "carousel-snap"
        ? `
РЕЖИМ ИГР: ГОРИЗОНТАЛЬНАЯ ЛЕНТА. ЗАПРЕТ: вкладки data-tab для игр. Одна горизонтальная прокрутка: overflow-x:auto; flex-nowrap + scroll-snap; все превью из списка в одной ленте по порядку.
`
        : homeGamesMode === "masonry-free"
          ? `
РЕЖИМ ИГР: СВОБОДНАЯ КОМПОЗИЦИЯ. Без вкладок data-tab в #lw-games. Ровно ${gameSlotPaths.length} превью из списка; укладка — masonry, разноразмерные карточки, «журнальный» зигзаг или двухъярусная схема (крупное + мелкое). Не делай одинаковых прямоугольников в идеальной сетке.
`
          : homeGamesMode === "rail-editorial"
            ? `
РЕЖИМ ИГР: РЕДАКЦИОННЫЙ. Без вкладок data-tab в #lw-games. Ровно ${gameSlotPaths.length} превью: например одна крупная hero-карточка слота + горизонтальный ряд миниатюр, или «ленточный» блок с текстом между рядами превью — не клонируй классический 4×2.
`
            : "";
  const gamesAntiTemplateBlock = refBlend
    ? `
РЕФЕРЕНС-РЕЖИМ #lw-games: композиция и тип блока (вкладки / одна сетка / лента) — **как у референса и REFERENCE LOCK**. Меняй подписи, отступы и размеры карточек **только внутри** того же паттерна; не меняй механику DOM против референса.
`
    : `
АНТИ-ШАБЛОН #lw-games (обязательно): не копируй «типовой лендинг»: заголовок в духе «Популярные игры / слоты…» + два предложения описания + три одинаковые вкладки-«чипа» + симметричная сетка одинаковых карточек. Заголовок секции, подводка и способ группировки (вкладки, фильтр, текстовые якоря, коллаж) — **уникальны под эту тему и этот билд**. Если режим выше допускает вкладки — это технический механизм, а не повод повторять одни и те же три слова на каждом сайте.
На **каждом новом сайте** меняй визуальный язык блока игр (отступы, скругления, плотность сетки, порядок табов), чтобы скриншоты разных билдов не совпадали по композиции.
`;
  const games =
    isIndexPageFile(pageMeta.file) && gameSlotPaths.length > 0
      ? refTpl
        ? `
РЕЖИМ ШАБЛОНА — **игры**: **не** вставляй <section id="lw-games"> только потому, что в плане есть токен **games**. Если во **вставленном HTML шаблона** уже есть игровая сетка / вкладки / лента — **адаптируй её**: **ровно ${gameSlotPaths.length}** превью, по одному <img> на карточку, пути только из списка слотов; внутри карточки слота ссылка на ${gtw}: <a href="${gtw}" target="_blank" rel="noopener noreferrer nofollow"> с <img …>. Вне #lw-games в <main> НЕ используй ${gtw} в href.
Если в шаблоне **нет** игрового блока — **не создавай** новый #lw-games ради плана.
СЛОТЫ (если заполняешь блок из шаблона):
${slotLines}
${tabListsBlock}
Дополнительный пул: ${gameImages.join(", ")}.
`
        : `
ОБЯЗАТЕЛЬНО на главной: <section id="lw-games" class="${classPrefix}games-wrap"> — **без этого id страница невалидна**. Сетка **12–24** превью слотов (ссылки с <img>, пути только из списка слотов ниже); допустимы вкладки <button type="button" data-tab="КЛЮЧ"> с панелями data-panel или id games-* / lw-games-*.
${gamesAntiTemplateBlock}
${gamesModeExtra}
Количество карточек превью: **12–24**, не меньше ${Math.min(gameSlotPaths.length, 12)} из списка (можно использовать все ${gameSlotPaths.length}). ${
            refBlend
              ? "Внешний вид сетки/ленты — **как у референса**; мелкие отличия в колонках, отступах и размерах карточек — **только внутри** того же паттерна."
              : "Внешний вид сетки/ленты **не фиксирован**: варьируй число колонок, отступы, размеры карточек, наличие крупного «ведущего» превью; на мобильном допустим 1–2 столбца или горизонтальный скролл. Каждая карточка — одно превью слота: внутри ссылки одна <img>. Скругление и тень — на твой вкус, но не клонируй один и тот же «пластиковый» блок от билда к билду."
          }
ДОМ внутри секций: **максимум одна** обёрточная <div> (container/wrapper/inner/content) на <section>; основной текст — в <p>, <h2>, <h3>, **не** во вложенных «коробках» div>div>div. Контентные <img> вне hero/banner/slots: **не** на всю высоту viewport (ориентир max-height ~360px / 42vh).
ВИЗУАЛЬНЫЙ ОРИЕНТИР: lakiworld44 — **только** для сетки игр и выравнивания шапки; **не** копируй брендинг Laki и DOM 1:1.
КРИТИЧНО: в <img src="..."> только пути из списка слотов ниже — превью игр (webp/png), без SVG и баннеров. Только внутри #lw-games у карточки слота: ссылка на ${gtw}: <a href="${gtw}" target="_blank" rel="noopener noreferrer nofollow"> с <img …>. Вне #lw-games в <main> НЕ используй ${gtw} в href — только относительные ./страница.php.
СЛОТЫ (порядок фиксирован): по одному <img> на карточку:
${slotLines}
${tabListsBlock}
Дополнительный пул: ${gameImages.join(", ")}.
ВАЖНО: превью в карточке — overflow:hidden, у img object-fit: cover; aspect-ratio можно варьировать (не обязательно 16/10 на всех карточках одновременно).
`
      : isIndexPageFile(pageMeta.file) && gameImages.length > 0
        ? `
ОБЯЗАТЕЛЬНО на главной: <section id="lw-games" class="${classPrefix}games-wrap"> с сеткой 12–24 превью; для <img> можно брать файлы из: ${gameImages.join(", ")}.
ДОМ: максимум одна обёрточная <div> внутри каждой <section>; текст в <p>/<h2>/<h3>, не во вложенных div-коробках. Контентные картинки — не на всю высоту экрана.
ВАЖНО: превью игры в карточке должно заполнять медиа-область без полей: родитель с overflow:hidden и скруглением, у img width:100%, object-fit: cover (не contain); aspect-ratio варьируй, не фиксируй один на всех карточках.
`
        : "";
  const sectionImages =
    sectionImagePaths.length > 0
      ? `
Иллюстрации вне блока #lw-games: максимум 2–3 контентных <img> на всю страницу (не считая hero/баннер по правилам ниже и слотов игр). По возможности бери только из этого короткого списка, не дублируй один src: ${sectionImagePaths.join(", ")}.`
      : "";
  const heroExtras =
    isIndexPageFile(pageMeta.file) && heroExtraPaths.length > 0
      ? `
Главная — для hero/VIP/decorative <img> (не слоты игр): минимум картинок, приоритет тексту; при необходимости один акцентный визуал из: ${heroExtraPaths.join(", ")} плюс баннерные banner/baner по правилам ниже.`
      : "";
  const vip =
    isIndexPageFile(pageMeta.file)
      ? refTpl
        ? `
ОПЦИОНАЛЬНО VIP: блок **#lw-vip** — **только** если он уже есть во **вставленном HTML шаблона**; адаптируй текст и стили под бренд. **Не** добавляй <section id="lw-vip"> ради плана архитектора или токена **vip** в sectionOrder.
`
        : `
ОПЦИОНАЛЬНО блок VIP: <section id="lw-vip" class="${classPrefix}vip"> — если уместно для темы страницы.
`
      : "";
  const homeFlowBlock = isIndexPageFile(pageMeta.file)
    ? refTpl
      ? `
ГЛАВНАЯ (режим шаблона): **единственный приоритет** — порядок, сетка и типы блоков из **HTML шаблона референса** выше. План архитектора, sectionOrder, токены games/vip и каталог секций — **не** повод ломать или переставлять каркас; используй план только для смысла, title/description и формулировок **внутри** существующих блоков, где это не противоречит шаблону.
Ориентир объёма ~${MAIN_WORD_VOLUME_GUIDE} слов, минимум ${minPageWords}, максимум ${MAX_PAGE_WORDS}.
`
      : refBlend
        ? `
ГЛАВНАЯ: **порядок крупных секций** в <main> — по **sectionOrder** в «ПЛАН АРХИТЕКТОРА» и **REFERENCE LOCK**, максимально как у референса. Микрокомпозиция и формулировки **внутри** секций и ширины колонок — в рамках того же паттерна; **не** меняй тип hero и не убирай сайдбар, если он есть у референса.
Ориентир объёма ~${MAIN_WORD_VOLUME_GUIDE} слов, минимум ${minPageWords}, максимум ${MAX_PAGE_WORDS}.
`
        : `
ГЛАВНАЯ: **порядок крупных секций** в <main> — по полю **sectionOrder** в блоке «ПЛАН АРХИТЕКТОРА» ниже (включая позиции **games** → #lw-games и **vip** → #lw-vip относительно hero/FAQ/CTA и др.). Внутри каждой секции — свобода композиции и DOM.
**#lw-games обязателен** на index: <section id="lw-games"> с сеткой 12–24 превью слотов (пути из списка слотов); вкладки data-tab — по желанию. В каждой <section> — **не больше одной** обёрточной <div>; текст в <p>/<h2>/<h3>, не в nested div-boxes. Контентные изображения — не full-viewport height.
lakiworld44 — только визуальный ориентир для **сетки игр** и **выравнивания шапки**; не копируй брендинг Laki и DOM 1:1.
Не повторяй визуальный шаблон предыдущих билдов: меняй DOM-ритм, ширины колонок (где-то полноширинно, где-то асимметричный split, не канонический 50/50 в каждой секции).
ЗАПРЕТ на «типовой лендинг» подряд: (1) hero как ровный 50/50 «текст|картинка» + сразу под ним (2) полоса из 3–4 одинаковых ячеек «число + подпись». Если блок trust/метрики в плане — отодвинь его, смени форму или встрой факты в текст.
Без KPI 2×2 и без журнального сайдбара; ориентир объёма ~${MAIN_WORD_VOLUME_GUIDE} слов, минимум ${minPageWords}, максимум ${MAX_PAGE_WORDS}.
`
    : "";
  const heroVisualPool = [...new Set([...preferredHero, ...heroExtraPaths])];
  const indexHeroVisualRule =
    isIndexPageFile(pageMeta.file)
      ? refTpl
        ? `
HERO НА ГЛАВНОЙ: как в **HTML шаблона** выше (первый крупный блок / первый экран). **Не** подменяй тип первого экрана ради плана архитектора, sectionOrder или «уникальности билда». Файлы baner/banner — только background-image, не <img>, если в шаблоне так задано. Ориентир путей: ${heroVisualPool.join(", ")}.
`
        : refBlend
          ? `
HERO НА ГЛАВНОЙ: следуй **REFERENCE LOCK** и визуальной логике референса (тот же тип первого экрана). Пропорции колонок, микроотступы и подзаголовки — **внутри** этого типа; **не** выбирай другой тип hero ради «уникальности билда». Файлы baner/banner — только background-image, не <img>. Ориентир путей: ${heroVisualPool.join(", ")}.
`
          : `
HERO НА ГЛАВНОЙ (палитра и img/bg — по правилам билда): **сначала** выполни блок «ОБЯЗАТЕЛЬНЫЙ РЕЖИМ ПЕРВОГО БЛОКА» выше — он задаёт каркас первой <section> для **этой** генерации и отличает сайт от предыдущих билдов.
ЗАПРЕЩЕНО как «дефолтный единственный» вид: (A) классический split ~50/50 «слева h1+lead+CTA, справа одна картинка» на каждом билде; (B) полноширинное фото + **горизонтальная тёмная полоса/плашка по центру** со стопкой заголовок+текст+кнопка (шаблон «оверлей-лента»); (C) сразу следующая секция — ров grid/flex из 3–4 одинаковых колонок «крупная цифра + мелкая подпись».
Вместо этого чередуй от билда к билду, например: асимметричный split (40/60, 1fr / 1.4fr), h1 крупно в одной колонке с узким медиа-стрипом, текст частично на сплошном фоне без «ленты» на всю ширину фото, вертикальный стек с маленьким превью, одна колонка + декоративный background без центрального бокса.
Если используешь background-image на hero: cover, min-height ~280–420px (десктоп); читаемость текста — точечным градиентом/подложкой **не обязательно** в форме широкой горизонтальной полосы по центру кадра.
Двухколоночный вариант допустим, но **ломай симметрию** (разные gap, разная ширина колонок, медиа не только справа). Файлы baner/banner — только background-image, не <img>. Ориентир путей: ${heroVisualPool.join(", ")}.
`
      : "";
  const innerPageLayoutAntiBlock =
    refBlend || isIndexPageFile(pageMeta.file)
      ? ""
      : `
ВНУТРЕННЯЯ СТРАНИЦА — анти-шаблон между разными сайтами (обязательно):
- Не оформляй по умолчанию «узкий правый сайдбар + широкая колонка текста» с тремя одинаковыми карточками-виджетами и заголовками в духе «НА ЭТОЙ СТРАНИЦЕ / ДРУГИЕ РАЗДЕЛЫ / СОВЕТ» (три блока капсом подряд) — это повторяемый клише между билдами.
- Оглавление и перекрёстные ссылки оформляй по-разному: горизонтальный ряд под h1, компактный список в начале <main>, врезка внутри первого section, раскрывающийся блок — без фиксированной тройки одинаковых коробок в колонке.
- Не повторяй на нескольких секциях подряд один паттерн «жёлтый h2 + два абзаца + изображение в отдельной rounded-карточке справа»; чередуй полноширинный текст, сетки с разной долей колонок (не 50/50 в каждой секции), медиа сверху секции или полноширинное ниже абзацев.
- Если две колонки — меняй порядок (медиа слева), долю ширины и вертикальное выравнивание между секциями.
`;
  const lowFile = String(pageMeta.file).toLowerCase();
  const registrationPageHint =
    lowFile.includes("registration") || /регистрац/i.test(String(pageMeta.role || ""))
      ? `
СТРАНИЦА ПРО РЕГИСТРАЦИЮ (${pageMeta.file}): (1) Вкладки шагов — в одной <section> кнопки <button type="button" data-tab="step1|step2|step3"> и панели <div data-panel="тот же ключ">; не используй position:absolute на overlay так, что секция теряет высоту. (2) Финальный CTA-блок с background-image: секция min-height ~320–480px, внутренний блок с текстом — с padding и тёмной полупрозрачной подложкой (rgba), кнопка «Зарегистрироваться» — обычный inline-block, не на всю ширину экрана. (3) Не помещай крупный баннерный коллаж под мелкий текст без отступов.
`
      : "";
  const zerkaloPageHint =
    usesPremiumIgamingLayout() && !refTpl
      ? ""
      : /zerkalo\.php$/i.test(lowFile) || /mirror\.php$/i.test(lowFile)
        ? `
СТРАНИЦА-ЗЕРКАЛО (${pageMeta.file}): только про официальное зеркало и доступ для бренда «${String(themeBrandHint || "").trim() || "из плана"}»: рабочие адреса, блокировки провайдера, безопасный вход, фишинг. Минимум ${minPageWords} слов в <main>.
`
        : "";
  const archForPrompt =
    Array.isArray(pageMeta.structuralArchetypeIdsOrdered) &&
    pageMeta.structuralArchetypeIdsOrdered.length
      ? pageMeta.structuralArchetypeIdsOrdered
      : pageMeta.structuralArchetypeIds;
  const structuralSectionBlock =
    Array.isArray(archForPrompt) && archForPrompt.length
      ? formatStructuralArchetypesForPrompt(archForPrompt)
      : CONTENT_BLOCKS_CATALOG;
  const referenceRoleSequence =
    Array.isArray(referenceStructureSignals?.sectionRoleSequence) &&
    referenceStructureSignals.sectionRoleSequence.length
      ? referenceStructureSignals.sectionRoleSequence
      : [];
  const referenceSemanticFeatures =
    Array.isArray(referenceStructureSignals?.semanticStyleFeatures) &&
    referenceStructureSignals.semanticStyleFeatures.length
      ? referenceStructureSignals.semanticStyleFeatures
      : [];
  const referenceLayoutFeatures = referenceStructureSignals?.layoutFeatures || null;
  const refLayoutForPrompt =
    referenceLayoutFeatures && typeof referenceLayoutFeatures === "object"
      ? referenceLayoutFeatures
      : null;
  const refLeftRailHint = Boolean(
    referenceStructureSignals?.referenceLayoutLeftRailHint
  );
  const refBottomDockHint = Boolean(
    referenceStructureSignals?.referenceLayoutBottomDockHint ||
      refLayoutForPrompt?.hasBottomDockNav
  );
  const sidebarDomMirrorBullets = refBlend
    ? layoutSidebarDomMirrorLines(refLayoutForPrompt)
    : [];
  const referenceStrictBlock =
    refBlend && referenceStructureSignals && !refTpl
      ? `
REFERENCE LOCK — **ЗЕРКАЛО КАРКАСА РЕФЕРЕНСА** (основная задача билда):
- Воссоздай в <main> **ту же схему**, что в структурном снимке: число и порядок **верхнеуровневых <section>**, те же крупные UI-паттерны (hero, сетка, вкладки, таблица, лента), **те же боковые колонки**, что во флагах снимка.
- **Можно менять:** русские тексты, бренд из плана, внутренние ссылки на \`./\*.php\`, пути \`./img/…\`, префиксы CSS-классов; **нельзя** подменять тип страницы (например убрать сайдбар, если в снимке он есть).

Порядок ролей секций (держись максимально близко): ${referenceRoleSequence.join(" -> ") || "см. overlay ref-structure выше"}.
Флаги макета референса: leftSidebar=${refLayoutForPrompt?.hasLeftSidebar ? "yes" : "no"}, rightSidebar=${refLayoutForPrompt?.hasRightSidebar ? "yes" : "no"}, anySidebar=${refLayoutForPrompt?.hasAnySidebar ? "yes" : "no"}, footerMenu=${refLayoutForPrompt?.hasFooterMenu ? "yes" : "no"}, topMenu=${refLayoutForPrompt?.hasTopMenu ? "yes" : "no"}, bottomDockNav=${refLayoutForPrompt?.hasBottomDockNav ? "yes" : "no"}.
${sidebarDomMirrorBullets.length ? `${sidebarDomMirrorBullets.map((line) => `- ${line}`).join("\n")}\n` : ""}- Семантические UI-паттерны как у референса: ${referenceSemanticFeatures.join(" | ") || "см. overlay"}.
`
      : "";

  const sectionOrderNorm = Array.isArray(pageMeta?.sectionOrder)
    ? pageMeta.sectionOrder.map((t) => String(t || "").trim().toLowerCase())
    : [];
  const needGamesSection = sectionOrderNorm.includes("games");
  const needVipSection = sectionOrderNorm.includes("vip");
  const referenceMainSectionContract = refTpl
    ? [
        "",
        `КАРКАС <main> (режим шаблона): опирайся на **HTML шаблона** ниже. Сохраняй обёртки, порядок и сетку референса; где уместно — приведи к \`<section>\`. Если выше описан **sidebar / fixed** — размести эту оболочку **внутри** этого же \`<main>\` (см. блок «Макет-оболочка»), не ожидай отдельного слоя от сборщика. **Не** вставляй #lw-games / #lw-vip и другие «служебные» секции только из плана — только если они уже есть в шаблоне или отдельно сказано в блоке «игры/VIP» выше.`,
        "",
      ].join("\n")
    : refBlend
      ? [
          "",
          "КАРКАС <main> (REFERENCE LOCK — требование для ref-structure / secOrder):",
          "- На **первом уровне** внутри **<main>** используй **цепочку тегов <section>...</section>** (ориентир **4–8** секций, согласуй с блоком «ПЛАН АРХИТЕКТОРА» и референсом). Внутри каждой <section> допустимы <div>, <article>, списки и т.п.",
          "- **ЗАПРЕЩЕНО** делать основной каркас <main> одними **<div> без набора <section>** на верхнем уровне — проверка ref-structure опирается на порядок **<section>**. Не заменяй секции одним «обёрточным» <div>.",
          ...(isIndexPageFile(pageMeta.file) && needGamesSection
            ? [
                `- Слот игр: ровно одна секция **<section id="lw-games" class="${classPrefix}games-wrap"** …> … </section> (в плане есть токен **games**).`,
              ]
            : []),
          ...(isIndexPageFile(pageMeta.file) && needVipSection
            ? [
                `- Слот VIP: ровно одна секция **<section id="lw-vip" class="${classPrefix}vip"** …> … </section> (в плане есть токен **vip**).`,
              ]
            : []),
          "",
        ].join("\n")
      : "";

  const fpBlock = structureFingerprint
    ? refBlend
      ? `
БИЛД-МЕТКА (служебно): ${structureFingerprint}. В референс-режиме **не** ломай каркас референса из-за отпечатка; допустимы только мелкие отличия внутри секций (текст, отступы).
`
      : `
СТРУКТУРНЫЙ ОТПЕЧАТОК БИЛДА (уникален для этой генерации; каркас не должен совпадать с предыдущими сайтами): ${structureFingerprint}
Не воспроизводи типовой скелет прошлых билдов; вариативность каркаса максимальная.
`
    : "";
  const brandPrimary =
    (Array.isArray(brandTerms) && brandTerms[0] && String(brandTerms[0]).trim()) ||
    String(themeBrandHint || "").trim() ||
    "бренд";
  const templatePageLabel = String(pageMeta.file || "страница").trim();
  const refHtmlAttrs = String(
    referenceStructureSignals?.referenceHtmlOpenAttrs || ""
  ).trim();
  const refBodyAttrs = String(
    referenceStructureSignals?.referenceBodyOpenAttrs || ""
  ).trim();
  const refHeadCtxSnippet = String(
    referenceStructureSignals?.referenceHeadContextSnippet || ""
  ).trim();
  const refBodyBeforeMainSnippet = String(
    referenceStructureSignals?.referenceBodyBeforeMainSnippet || ""
  ).trim();
  const refBodyAfterMainSnippet = String(
    referenceStructureSignals?.referenceBodyAfterMainSnippet || ""
  ).trim();
  const refDocContextBlock =
    refHtmlAttrs ||
    refBodyAttrs ||
    refHeadCtxSnippet ||
    refBodyBeforeMainSnippet ||
    refBodyAfterMainSnippet
      ? `
=== Документный контекст референса (оболочка вне inner <main>) ===
Используй как **ориентир по слоям страницы** (классы корня, что висит между шапкой и main, что после main). **Не** вставляй этот HTML целиком в headHtml как копипасту чужого head: итоговый <head> строго по правилам JSON ниже (charset, viewport, title, canonical, локальные css/js).
${refHtmlAttrs || refBodyAttrs ? `- Открывающие атрибуты с референса: \`<html ${refHtmlAttrs ? refHtmlAttrs.replace(/`/g, "'") : "…"}>\`, \`<body ${refBodyAttrs ? refBodyAttrs.replace(/`/g, "'") : "…"}>\` — переноси смысл (lang, class, data-theme) в свой headHtml/pageCss при необходимости.` : ""}
${refHeadCtxSnippet ? `- Сжатый **внутренний** контекст <head> референса (link/script/style вырезаны):\n---\n${refHeadCtxSnippet.replace(/`/g, "'")}\n---` : ""}
${refBodyBeforeMainSnippet ? `- HTML **между** \`<body>\` и первым \`<main>\` (первый \`<header>\` при наличии уже вынесен в отдельный эталон шапки; здесь — баннеры, тикеры, обёртки):\n---\n${refBodyBeforeMainSnippet.replace(/`/g, "'")}\n---` : ""}
${refBodyAfterMainSnippet ? `- HTML **после** \`</main>\` до конца \`<body>\` (футер при наличии — в отдельном эталоне подвала):\n---\n${refBodyAfterMainSnippet.replace(/`/g, "'")}\n---` : ""}
`
      : "";
  const referenceTemplateShellLayoutBlock = refTpl
    ? `

=== Макет-оболочка (sidebar / fixed) ===
**Приоритет:** эталон референса (шаблон + фрагменты контекста) **важнее** свободной импровизации. Дополнительные идеи допустимы, если они **не** ломают явный каркас и ритм референса.
${refLeftRailHint || refLayoutForPrompt?.hasAnySidebar || refLayoutForPrompt?.hasLeftSidebar ? `
**Левый сайдбар / икон-рейл (как Dragon Money и др.):** по снимку референса обнаружена **вертикальная колонка до \`<main>\`** (флаг anySidebar/leftSidebar или эвристика rail). **Обязательно** воссоздай её **внутри** корневого \`<main>\`: обёртка \`display:flex\` (или grid с колонкой фикс. ширины) + **<aside class="${classPrefix}…rail">** с логотипом вверху (\`<img src="${logoPrompt}" class="… lw-logo-img …">\`) и вертикальным меню/иконками; основная колонка — inner-шаблон из блока ниже. **Не** опускай этот слой: без него страница не будет похожа на референс.` : ""}
${refBottomDockHint ? `
**Нижний фиксированный dock / таб-бар (как 7K и др.):** по снимку есть **горизонтальная панель у нижнего края** (иконка + подпись, иногда бейдж). **Обязательно** воссоздай в **mainHtml**: \`<nav class="${classPrefix}…bottom-dock">\` или \`<div role="navigation">\` с \`position:fixed; left:0; right:0; bottom:0\` (и \`z-index\`), полупрозрачный/стеклянный фон — в **pageCss**; у корневого контейнера контента задай \`padding-bottom\` под высоту dock, чтобы ничего не перекрывалось. Сохрани **логику пунктов** (зал, турниры, бонусы и т.п.) как на референсе, с внутренними \`./\*.php\` ссылками.` : ""}

Сборщик вставляет в \`<body>\` **три** слоя подряд: **headerHtml → mainHtml → footerHtml**. Фикс-панели слева/справа/снизу и «навигация вместо классической шапки» — размещай в **mainHtml** или **headerHtml**/**footerHtml**; четвёртого корневого слоя сборщик не добавляет.

- **Фикс снизу / слева / справа** (\`position:fixed\` / \`sticky\`): **можешь** — рандом и эксперимент **не запрещены**; координаты, отступы под контент, \`z-index\` — в **pageCss** с префиксом «${classPrefix}». Если такой блок **есть** в эталоне или во фрагментах до/после \`<main>\` — **сначала** повтори его смысл и положение, потом при желании дополняй.
- **Сайдбара на референсе нет, а ты хочешь добавить:** **можно**, но **не обязательно** и **не на каждой** странице пакета и **не в каждом** ответе подряд — чаще держись ближе к референсу; изредка допустимо осмысленное усиление (разнообразие между URL нормально). Не превращай это в обязательный «шаблон казино с рейлом» для всех файлов.
- **Примеры нижних / боковых панелей** (ориентир по UI, как на типичных площадках): (1) **нижняя горизонтальная лента выигрышей** — тёмная полоса, ряд карточек «юзер только что выиграл сумму в игре», иконки в шестиугольниках/превью, акцентным цветом название игры; (2) **нижний dock** — фиксированная полоса снизу с иконкой+подписью пунктов (зал, турниры, магазин, бонусы), допускается бейдж на иконке; (3) **узкий вертикальный рейл слева/справа** — колонка иконок навигации, активный пункт выделен. Для **боковых** вертикальных рейлов вверху колонки **обязательно логотип бренда**: \`<img src="${logoPrompt}" … class="… lw-logo-img …" alt="…">\` (тот же путь, что в правилах chrome), дальше иконки/ссылки, внизу при желании поддержка/чат.
- **Сайдбар вместо верхней шапки:** допустимо перенести навигацию в боковой или нижний фикс-блок, если так лучше для билда и это согласуется с референсом или с редкой импровизацией выше.
- **Двухколоночный макет как в эталоне:** корень **<main>** → при необходимости \`<div class="${classPrefix}layout">\` + **<aside>…</aside>** + колонка с inner-шаблоном; стили в **pageCss**.
- **Ориентиры снимка:** anySidebar=${refLayoutForPrompt?.hasAnySidebar ? "yes" : "no"}, leftSidebar=${refLayoutForPrompt?.hasLeftSidebar ? "yes" : "no"}, rightSidebar=${refLayoutForPrompt?.hasRightSidebar ? "yes" : "no"}, bottomDockNav=${refLayoutForPrompt?.hasBottomDockNav ? "yes" : "no"}. Если anySidebar=yes или в HTML видна боковая навигация — **не** упрощай до одной колонки без причины.
- **Паттерны из снимка:** ${referenceSemanticFeatures.length ? referenceSemanticFeatures.join(" | ") : "см. overlay ref-structure"}. Фрагмент **до** inner \`<main>\`: ${refBodyBeforeMainSnippet ? "**есть** — используй для колонок/тикеров вне inner-шаблона" : "нет"}. **После** \`</main>\`: ${refBodyAfterMainSnippet ? "**есть** — виджеты при необходимости в main или footer" : "нет"}.
`
    : "";
  const referenceTemplateBlock =
    strictTpl
      ? ""
      : refTpl
    ? `
=== РЕЖИМ ШАБЛОНА (${templatePageLabel}) — черновик с референса → твой бренд ===
Ниже — **один и тот же** inner <main> со страницы **reference_url** (эталон дизайна для **всех** URL пакета; script/style/noscript убраны; возможен маркер REFERENCE_MAIN_TEMPLATE_TRUNCATED).
На референсе **не нужны** отдельные URL под каждый файл пакета (index, zerkalo и т.д.) — один скачанный адрес задаёт **общий** DOM-шаблон; для **каждого** файла пакета ты всё равно **генерируешь и вставляешь** свой русский текст, title/description и смысл под роль этой страницы (**${templatePageLabel}**) и объём из user, сохраняя каркас.
По смыслу страница — **${templatePageLabel}**: title/description, роль и объём текста из user; **каркас, порядок секций и визуальный ритм** — как в шаблоне, без выдумывания нового layout.

**Цель:** максимально **высокая визуальная близость** к шаблону; меняются бренд, русские тексты, палитра через **pageCss**, \`./img/…\`, внутренние ссылки, префикс классов «${classPrefix}».
${refDocContextBlock}${referenceTemplateShellLayoutBlock}
**Задача в JSON:** **mainHtml** = адаптированный этот шаблон под билд:
- Язык и смысл: **русский**; публичный бренд «${brandPrimary}» и имя из темы «${String(themeBrandHint || "").trim() || "см. выше"}»; убери из видимого текста чужие бренды и «хвосты» домена референса.
- **Классы:** новые и заменяемые в <main> — с префиксом «${classPrefix}»; стили — в **pageCss** (не подключай внешние CSS референса).
- **Картинки:** только \`./img/...\` из пула билда; внешние \`src\`/\`srcset\` — убери или замени заглушкой/релевантным файлом из списков в user.
- **Ссылки:** внутренние — только \`./\` + файлы этого сайта (${allowedPageFiles || "см. план"}). **Запрещены** games.php, payments.php, zerkalo.php и любые URL, которых **нет** в этом списке. **Не** ставь **${gtw}** на чипы каталога (Слоты / Live / …), вкладки разделов и карточки **вне** #lw-games. Шлюз **${gtw}** — только внутри **#lw-games** у превью слота и для явных CTA «Регистрация/Вход» в шапке по правилам chrome.
- **Согласованность:** смысл и классы <main> должны соответствовать file «${pageMeta.file}» и role «${String(pageMeta.role || "").trim()}» (не подставляй чужой тип страницы, например payments_* на vip.php).
- Сохрани **порядок и вложенность** блоков шаблона (включая сайдбары). План архитектора и sectionOrder **не** важнее шаблона — **не** перестраивай DOM под «фиксированные» слоты. **#lw-games** / **#lw-vip** — см. отдельные блоки выше: по умолчанию **не** добавляй ради плана.

--- СКЕЛЕТ inner <main> (порядок секций и классы; текст в эталоне заменён на […]) ---
${etalonMainForPrompt || buildEtalonMainSkeleton(referenceTemplateMainHtml) || "(пусто)"}
--- конец скелета ---

**mainHtml** в ответе: один корневой \`<main class="…">\` на основе шаблона (не пустой и не вся страница целиком).
`
    : "";
  const blueprintBlock = blueprintDirectives
    ? refTpl
      ? `
PAGE BLUEPRINT (**режим шаблона страницы ${templatePageLabel}**): поля ниже — **справка** (тон, смысл, title). **Не** перестраивай порядок секций и DOM под **sectionOrder** или dom_hint; каркас — только из HTML шаблона референса выше.
- dom_hint (справка): ${blueprintDirectives.domHint}
- sectionOrder из плана (**не** как обязательный порядок в <main>): ${(blueprintDirectives.sectionSequence || []).join(" -> ")}
`
      : `
PAGE BLUEPRINT (только мягкий dom_hint; **нет** layout/sidebar/density из кода — сетку и колонки выбери сам по **layoutVariant** и содержанию; порядок секций — только из «ПЛАН АРХИТЕКТОРА»):
- dom_hint: ${blueprintDirectives.domHint}
- sectionOrder (дубль для согласования со STAGE 4): ${(blueprintDirectives.sectionSequence || []).join(" -> ")}
`
    : "";

  const forbiddenBlock = buildPageForbiddenPromptBlock({
    projectSlug: projectSlug || buildNonce,
    brandName: themeBrandHint || brandTerms?.[0] || "",
    navFiles: (Array.isArray(allPages) ? allPages : []).map((p) => p?.file),
    imgList: allowedImgList,
  });
  const etalonMainForPrompt = refTpl
    ? buildEtalonMainSkeleton(referenceTemplateMainHtml)
    : "";
  const pagePolicy = strictTpl
    ? `Генерация (${templatePageLabel}): **DOM 1:1** с эталоном; меняй только русские тексты, бренд, href и SEO в head; **запрещено** менять структуру секций и переименовывать классы ig-* / lw-* / union_*.`
    : refTpl
    ? [
        `Режим шаблона (${templatePageLabel}): **каркас, порядок и типы блоков** — только из HTML шаблона референса выше; «ПЛАН АРХИТЕКТОРА», sectionOrder и служебные слоты — **не** причина ломать схему.`,
        "Не добавляй новые крупные секции (#lw-games, #lw-vip и т.п.) только из плана, если их нет в шаблоне и вставка портит сетку референса.",
      ].join(" ")
    : shuffleWithSeed(
        [
          "Порядок **крупных** секций и слотов (#lw-games, #lw-vip на главной) — строго из блока «ПЛАН АРХИТЕКТОРА»; внутри секций композиция свободная.",
          "Не используй один и тот же DOM-шаблон на всех страницах сайта.",
          "Опирайся на тему и план архитектора; dom_hint из blueprint — лишь мягкая подсказка.",
          "Главный приоритет — уникальный текст и естественная структура в рамках плана.",
        ],
        `${buildNonce}|${pageMeta.file}|pagePolicy`
      )
        .slice(0, 2)
        .join(" ");
  const incH = chromeShell?.includeHeader !== false;
  const incF = chromeShell?.includeFooter !== false;
  const hdrGateway =
    chromeContentOptions?.headerShowGatewayCtas !== false;
  const ftrLogo = chromeContentOptions?.footerShowLogo !== false;
  const chromeVariantHintParts = [];
  if (incH) {
    chromeVariantHintParts.push(
      hdrGateway
        ? "шапка: логотип, внутренние ссылки меню по страницам проекта и пара кнопок на gateway (подписи из варианта бренда)"
        : "шапка: **только** логотип и внутренние ссылки меню по страницам проекта (**без** верхних кнопок «Регистрация/Кабинет» на gateway — добавь в <main> хотя бы одну уместную CTA на gateway, если логично)"
    );
  }
  if (incF) {
    chromeVariantHintParts.push(
      ftrLogo
        ? "подвал: логотип, ссылки, копирайт и блок .lw-quick-btns «Вверх» / «Связаться»"
        : "подвал: **без** отдельного логотипа — ссылки, копирайт и .lw-quick-btns «Вверх» / «Связаться»"
    );
  }
  const chromeVariantHint =
    chromeVariantHintParts.length > 0
      ? `В этом билде: ${chromeVariantHintParts.join("; ")}.`
      : "";
  const refChromePromptEnabled =
    refBlend &&
    ((incH && refHeaderTpl.length > 0) ||
      (incF && refFooterTpl.length > 0));
  const templateChromeMode =
    useTemplateChromeIn !== false &&
    usesTemplateChrome() &&
    !refChromePromptEnabled;
  const chromeNavHrefContract = (() => {
    try {
      const v =
        chromeVariant && typeof chromeVariant === "object"
          ? chromeVariant
          : pickBrandChromeVariant(`${buildNonce}|${pageMeta.file}|chromeNav`);
      const entries = buildOrderedNavEntries(
        v,
        Array.isArray(navLinks) ? navLinks : []
      );
      if (!entries.length) return "";
      return entries
        .map(
          (e) =>
            `  • «${String(e.label || "")
              .replace(/\s+/g, " ")
              .trim()
              .replace(/"/g, "'")}» → только href="${e.href}"`
        )
        .join("\n");
    } catch {
      return "";
    }
  })();
  let aiChromeBlock = "";
  if (!incH && !incF) {
    aiChromeBlock = `ШАПКА И ПОДВАЛ: внешние <header>/<footer> для этого билда **отключены**. В JSON верни "headerHtml": "" и "footerHtml": "". Навигацию и завершение страницы делай только внутри <main> (можно <nav> в начале <main>); не используй <header> на уровне <body>.`;
  } else if (refChromePromptEnabled) {
    const refChromePieces = [
      `ШАПКА И ПОДВАЛ (режим **референс-chrome**): верни в JSON **полные** headerHtml/footerHtml из разметки ниже (сборщик **не** подставит lw-шаблон). Сохраняй **структуру и классы** эталона; замени тексты на бренд «${String(themeBrandHint || "").trim() || "из темы"}», внутренние href — строго по контракту; картинки — только ./img/… при необходимости.`,
      `Логотип: в шапке один <img> с **обязательным** подклассом lw-logo-img (например class="${classPrefix}logo lw-logo-img") и src="${logoPrompt}"; если в подвале есть логотип — добавь lw-footer-logo и тот же src.`,
      hdrGateway
        ? `Кнопки регистрации/входа (или эквивалент из эталона): href **только** ${gtw}, target="_blank" rel="noopener noreferrer nofollow".`
        : `По настройке билда без gateway-кнопок в шапке — не выводи «Регистрация/Вход» в <header>; добавь уместную CTA на ${gtw} в <main>.`,
      `Внутренние пункты меню (и любые ссылки на страницы сайта) — **только** из списка:\n${chromeNavHrefContract || navLayoutPromptBlock || "  (см. план страниц)"}`,
      `Не дублируй полный <header>/<footer> внутри <main>. Запрещено: <script>, <iframe>, on*-атрибуты, javascript: в href.`,
      `Оформление **твоей** шапки и подвала — в **pageCss** с префиксом «${classPrefix}» (можно селекторы по классам из эталона). При необходимости добавь небольшой padding-top у body или обёртки под высоту фиксированной шапки.`,
    ];
    if (incH && refHeaderTpl) {
      refChromePieces.push(
        `ЭТАЛОН <header> (адаптируй копирайт и href; DOM и стиль — максимально близко):\n${refHeaderTplSnip || refHeaderTpl}`
      );
    } else if (incH) {
      refChromePieces.push(
        "Эталон <header> с референса не извлечён — всё равно верни один полноценный <header> в **том же визуальном ключе**, что и шаблон <main> (двухрядная тёмная шапка, меню, CTA)."
      );
    }
    if (incF && refFooterTpl) {
      refChromePieces.push(
        `ЭТАЛОН подвала (адаптируй копирайт и href; DOM и стиль — максимально близко):\n${refFooterTplSnip || refFooterTpl}`
      );
    } else if (incF) {
      refChromePieces.push(
        "Эталон подвала не извлечён — верни полноценный <footer> в **том же стиле**, что шапка и <main> (ссылки, копирайт, компактные ряды ссылок допустимы)."
      );
    }
    aiChromeBlock = refChromePieces.filter(Boolean).join("\n\n");
  } else if (templateChromeMode) {
    aiChromeBlock = [
      `ШАПКА И ПОДВАЛ: **не генерируй** — сборщик подставит единый chrome lw-*: **${logoPrompt}**, меню, кнопки на gateway. ${chromeVariantHint} Не дублируй шапку/подвал в <main>.`,
      incH ? `- **headerHtml**: "". Отступ под header — **css/chrome.css**.` : `- **headerHtml**: "".`,
      incF ? `- **footerHtml**: "". ` : `- **footerHtml**: "".`,
      `Меню (справка):\n${navLayoutPromptBlock || "  (см. план страниц)"}`,
      `В pageCss — только контент «${classPrefix}*», не .lw-header/.lw-footer/.lw-nav/.lw-btn.`,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    aiChromeBlock = [
      `ШАПКА И ПОДВАЛ — **уникальные для этого сайта** (НЕ шаблон lw-header/lw-nav/lw-footer):`,
      incH
        ? `- **headerHtml**: полный <header class="${classPrefix}…"> с логотипом <img class="… lw-logo-img" src="${logoPrompt}">, навигацией и CTA; стили шапки — в **pageCss** (flex/grid, фон, hover, transition; допустим position:sticky/fixed с padding у body/main в pageCss).`
        : `- **headerHtml**: "".`,
      incF
        ? `- **footerHtml**: полный <footer> с ссылками, копирайтом, при желании «Вверх»/«Связаться»; стили — в **pageCss**.`
        : `- **footerHtml**: "".`,
      hdrGateway
        ? `Кнопки регистрации/входа: href **только** ${gtw}, target="_blank" rel="noopener noreferrer nofollow".`
        : `Без gateway-кнопок в шапке — добавь уместную CTA на ${gtw} в <main>.`,
      `Пункты меню (строго href):\n${chromeNavHrefContract || navLayoutPromptBlock || "  (см. план)"}`,
      `Запрещены классы lw-header, lw-nav, lw-footer, lw-btn, lw-quick-btns. Префикс классов: «${classPrefix}».`,
      `Анимации: hover на кнопках/карточках/ссылках меню; @keyframes для появления секций в pageCss.`,
      `Не дублируй header/footer внутри <main>.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const chromeHeaderFooterJsonRuleLine =
    !incH && !incF
      ? "headerHtml и footerHtml — пустые строки; не дублируй шапку в <main> как отдельный <header> на уровне body."
      : refChromePromptEnabled
        ? `Если шапка включена (${incH}), поле **headerHtml** — одна строка с **полным** валидным <header>...</header> (не пустое). Если подвал включен (${incF}), **footerHtml** — полный <footer>...</footer> или эквивалентный блок с id="footer" (не пустое). Не повторяй их дублирующим блоком внутри <main>.`
        : templateChromeMode
          ? "headerHtml и footerHtml — пустые строки \"\" (lw-шаблон подставит сборщик); в <main> только контент."
          : `Если шапка (${incH}) / подвал (${incF}) включены — верни **непустые** полные headerHtml/footerHtml; оформи их в pageCss; не используй lw-* классы.`;
  const chromeJsonHeaderFooterLines =
    !incH && !incF
      ? `  "headerHtml": "",
  "mainHtml": "<main class=\\"...\\">...</main> только main",
  "footerHtml": "",`
      : refChromePromptEnabled
        ? `${incH ? `  "headerHtml": "<header class=\\"${classPrefix}ref-h\\">...</header>",` : `  "headerHtml": "",`}
  "mainHtml": "<main class=\\"...\\">...</main> только main",
${incF ? `  "footerHtml": "<footer class=\\"${classPrefix}ref-f\\">...</footer>",` : `  "footerHtml": "",`}`
        : templateChromeMode
          ? `  "headerHtml": "",
  "mainHtml": "<main class=\\"...\\">...</main> только main",
  "footerHtml": "",`
          : `${incH ? `  "headerHtml": "<header class=\\"${classPrefix}site-header\\">...</header>",` : `  "headerHtml": "",`}
  "mainHtml": "<main class=\\"...\\">...</main> только main",
${incF ? `  "footerHtml": "<footer class=\\"${classPrefix}site-footer\\">...</footer>",` : `  "footerHtml": "",`}`;

  return `Ты senior фронтенд-разработчик. Сгенерируй контент ОДНОЙ страницы для статического сайта.

${forbiddenBlock}

${buildQualityAndSeoPriorityBlock("page")}

${siteGenerationRulesBlock ? `\n${siteGenerationRulesBlock}\n` : ""}
${sourceArticlesOverlay ? `\n${sourceArticlesOverlay}\n` : ""}

Gateway CTA URL: ${gtw}
Internal links ONLY to: ${allowedPageFiles || "файлы плана"}
Available ./img/ files: ${allowedImgList || "logo.png, favicon.png"}
Min word count (<main>, русский текст): ${Number(minPageWords) || MIN_PAGE_WORDS}

${referenceTemplateBlock}
${diversityPackText}
${promptProfileOverlay ? `\n${promptProfileOverlay}\n` : ""}
${promptFamilyOverlay ? `\n${promptFamilyOverlay}\n` : ""}
${fpBlock}
${buildArchitectPageSkeletonPromptBlock(pageMeta, { referenceTemplateMode: refTpl })}
${blueprintBlock}
${siblingPlanSummary ? `\n${siblingPlanSummary}\n` : ""}

Публичное имя бренда для текстов в <main> (из темы; не имя папки на диске): «${String(themeBrandHint || "").trim() || "возьми из темы читаемое русское имя бренда"}».
ЗАПРЕЩЕНО выводить в HTML латинское имя папки сборки, шаблон my-project-NN, служебную метку билда и полный build id в видимых текстах, title, alt, schema.
Тема: ${theme}
Страница: ${pageMeta.file} — ${pageMeta.role}
Title: ${pageMeta.title}
Meta description: ${pageMeta.description}
Редакционный ракурс: ${String(pageMeta.contentAngle || "уникальный ракурс для этой страницы")}
Тон: ${String(pageMeta.tone || "уникальный тон для этой страницы")}
SEO ключевые направления: ${keywordHint}
${antiClicheRuBlock}
${igamingContentBlock}
${premiumCatalogBlock}
${uiPolishRuBlock}
${pagePolicy}
${refBlend ? buildAiCreativeReferenceBlendBlock(`${buildNonce}|${pageMeta.file}|${structureFingerprint}`) : buildAiCreativeMaxVarietyBlock(`${buildNonce}|${pageMeta.file}|${structureFingerprint}`)}
${aiChromeBlock}

${uniqueSitePalettePromptBlock(sitePaletteIn)}
${uniqueSiteStructurePromptBlock(pageMeta.file)}
${innerPageLayoutAntiBlock}
${games}${vip}${sectionImages}${heroExtras}${homeFlowBlock}${
    usesPremiumIgamingLayout() && !refTpl
      ? ""
      : pickIndexHeroOpeningModeBlock(structureFingerprint, buildNonce, pageMeta.file, refBlend || refTpl)
  }${indexHeroVisualRule}
${registrationPageHint}${zerkaloPageHint}
${brandAssetRules}
${buildHeadingFormatPromptBlock(pageMeta, brandTerms)}
${referenceStrictBlock}
${referenceMainSectionContract}
${refTpl ? "" : structuralSectionBlock}
${uniquenessUrgencyLevel > 0 ? `\nПОВТОРНАЯ ГЕНЕРАЦИЯ (попытка усиления уникальности ${uniquenessUrgencyLevel}): автоматическая проверка показала высокое пересечение лексики с уже готовыми страницами этого сайта. Полностью смени темы абзацев, примеры и формулировки; ${refTpl ? "сохрани **порядок и каркас HTML шаблона** референса; меняй копирайт **внутри** существующих блоков" : "сохрани **порядок** секций и архетипов из плана архитектора, но сильно измени вёрстку и микрокопирайт **внутри** секций"}; не копируй типы блоков с других URL; сохрани палитру билда из блока выше и правила для изображений.\n` : ""}${wordCountUrgencyLevel > 0 ? `\nПОВТОРНАЯ ГЕНЕРАЦИЯ (попытка исправить объём ${wordCountUrgencyLevel}): прошлый вариант был слишком коротким. ${refTpl ? "Нарасти текст **внутри** блоков шаблона; **не** выкидывай крупные секции референса ради объёма." : "Добавь полноценные секции и абзацы в <main> (больше, чем в прошлый раз), не сокращай каркас;"} цель — не меньше ${minPageWords} слов, ориентир до ${MAX_PAGE_WORDS} слов в сумме по <main> (не сокращай развёрнутый текст только ради занижения объёма).\n` : ""}${wordCountOverMaxUrgencyLevel > 0 ? `\nПОВТОРНАЯ ГЕНЕРАЦИЯ (попытка уложиться в лимит ${wordCountOverMaxUrgencyLevel}): прошлый вариант дал **слишком длинный** <main> (слов больше ${MAX_PAGE_WORDS}). ${refTpl ? "Сжимай копирайт **внутри** секций шаблона; **не** удаляй крупные блоки референса только ради лимита слов." : "Убери второстепенные или дублирующие секции и сделай часть блоков короче;"} суммарный plain-текст <main> — **ориентир не больше ${MAX_PAGE_WORDS} слов**, при этом не меньше ${minPageWords}. Если не уложишься — допустимо; генератор сохранит вариант и продолжит остальные страницы.\n` : ""}
Короткие обязательные правила:
- Архитектура <main>: ${refTpl ? "**порядок и крупные блоки — строго по HTML шаблона референса** выше; план архитектора и sectionOrder вторичны, не перестраивай DOM под них." : "порядок крупных секций по плану архитектора (см. выше); внутри секций — гибкая вёрстка."}
- Вёрстка <main>: ровные сетки и flex-выравнивание; проверь узкую ширину (~390px), чтобы блоки не «ломались» и не перекрывали друг друга.
- Русский язык для всего пользовательского текста.
- Семантика: section/article + корректные h1/h2/h3.
- Объём plain-текста в <main>: ${minPageWords}–${MAX_PAGE_WORDS} слов.
- Для zerkalo.php/mirror.php (если есть в плане) — фокус на зеркале/доступе; для остальных URL — свой угол темы «${theme}».
- Не копируй каркас и формулировки других страниц сайта.
- ${chromeHeaderFooterJsonRuleLine}
- В **headHtml** при желании добавь превью для соцсетей: \`<meta property="og:image" content="${logoPrompt}">\` и \`<meta name="twitter:image" content="${logoPrompt}">\` — **тот же путь**, что у логотипа в chrome (без выдуманных URL); сборщик подставит meta, если ты их пропустишь.
- Если есть изображения, используй только ./img/...; если нет, делай страницу без обязательных картинок.
- Добавь 2-4 внутренних ссылки между страницами пакета как inline-ссылки в абзацах (синий цвет); href только ./имя-страницы.php из списка URL этого сайта, без ${gtw} и без внешних доменов (кроме cdn.tailwindcss.com при необходимости). Чипы вкладок и кнопки **вне** #lw-games — тоже только внутренние \`./\*.php\`.
- Пользовательские CSS-классы начинай с префикса "${classPrefix}".
- Избегай клише из списка: ${avoidPhrases.length ? avoidPhrases.join(" | ") : "нет ограничений"}.

В ответе верни ТОЛЬКО JSON (все ключи обязательны):
{
  "headHtml": "<head>...</head> целиком",
${chromeJsonHeaderFooterLines}
  "pageCss": "/* уникальный CSS страницы (включая стили шапки/подвала этой страницы) */",
  "pageJs": "// уникальный JS; без сторонних библиотек"
}

Внутри headHtml обязательно (title и description — целиком на русском):
<meta charset=\"UTF-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
<meta name=\"robots\" content=\"index, follow\">
<meta name=\"description\" content=\"...\">
<title>...</title>  ← сюда вставь **точно** плановый Title из блока выше («${String(pageMeta.title || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}»), один в один; не придумывай шаблон «бренд — index» и не подставляй имя файла.
<link rel=\"canonical\" href=\"${baseUrl}/${isIndexPageFile(pageMeta.file) ? "" : pageMeta.file}\">
<link rel=\"icon\" href=\"./img/favicon.ico\" type=\"image/x-icon\">
<link rel=\"stylesheet\" href=\"css/chrome.css\">
<link rel=\"stylesheet\" href=\"css/page-${pageIndex}.css\">
<script defer src=\"js/page-${pageIndex}.js\"></script>
<script src=\"https://cdn.tailwindcss.com\"></script>

ВАЖНО для парсера: итоговая строка должна быть одним валидным JSON; внутри headHtml/headerHtml/mainHtml/footerHtml экранируй " как \\", переносы как \\n, иначе сборка сломается.
pageJs: только исполняемый JavaScript для браузера; без import/export, без TypeScript и JSX; при необходимости оборачивай логику в (function(){ ... })(); не оставляй обрывов скобок.`;
}

function pickMainFromBrokenJson(text, _pageFile) {
  const raw = String(text || "");
  const lo = raw.toLowerCase();
  const start = lo.indexOf("<main");
  const end = lo.lastIndexOf("</main>");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.slice(start, end + 7);
  }
  return null;
}

function normalizeEscapedHtmlFragment(input) {
  let out = String(input || "").trim();
  if (!out) return out;
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1);
  }
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return out.trim();
}

/**
 * Якщо JSON обірваний або модель дала <meta>/<title> без обгортки <head>, відновлюємо валідний фрагмент — інакше збірка падає.
 */
function repairHeadHtmlFromModelOutput(headHtml, rawModelText) {
  let head = normalizeEscapedHtmlFragment(String(headHtml || ""));
  if (/^<head\b/i.test(head)) return head;
  const raw = String(rawModelText || "");
  const fromTags = extractHeadFromRaw(raw);
  if (fromTags && /^<head\b/i.test(fromTags.trim())) return fromTags.trim();
  const fromKey = extractJsonStringField(raw, "headHtml");
  if (fromKey) {
    const h = normalizeEscapedHtmlFragment(fromKey);
    if (/^<head\b/i.test(h)) return h;
    if (/<meta\b/i.test(h) || /<title\b/i.test(h) || /<link\b/i.test(h)) {
      return `<head>${h}</head>`;
    }
  }
  if (head && (/<meta\b/i.test(head) || /<title\b/i.test(head) || /<link\b/i.test(head))) {
    return `<head>${head}</head>`;
  }
  return '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title></title></head>';
}

function hashString(input) {
  let h = 0;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickBannerBackgrounds(imageFiles = [], imagePools = null) {
  const bannerFiles = imagePools
    ? resolveBannerImageFiles(imageFiles, imagePools)
    : (Array.isArray(imageFiles) ? imageFiles : []).filter((name) =>
        /(forbaner|baner|banner)/i.test(String(name || ""))
      );
  const fromImg = bannerFiles
    .filter((name) => /\.(webp|png|jpe?g|gif|avif)$/i.test(String(name || "")))
    .map((name) => `./img/${name}`);
  const fallback = [
    "./img/forBaner.webp",
    "./img/baner-image.webp",
    "./img/banner-1.webp",
    "./img/banner-1-mob.webp",
  ];
  return [...new Set([...fromImg, ...fallback])];
}

/**
 * Підставляє в <section id="lw-games"> src для <img> послідовно з плоского списку пакетів вкладок
 * (спочатку всі картинки вкладки 1, потім 2, …) — щоб вкладки не дублювали одні й ті самі прев'ю.
 */
function enforceLwGamesTabSlotImages(mainHtml, tabBatches) {
  const batches = Array.isArray(tabBatches) ? tabBatches.filter((b) => b?.length) : [];
  if (!batches.length) return String(mainHtml || "");
  const flat = batches.flat();
  if (!flat.length) return String(mainHtml || "");
  const re =
    /(<section\b[^>]*\bid\s*=\s*["']lw-games["'][^>]*>)([\s\S]*?)(<\/section\s*>)/i;
  const full = String(mainHtml || "");
  const m = full.match(re);
  if (!m) return full;
  let idx = 0;
  const inner = m[2].replace(/<img\b[^>]*>/gi, (tag) => {
    if (!/\bsrc\s*=/i.test(tag)) return tag;
    const pick = flat[idx];
    idx += 1;
    if (!pick) return tag;
    return tag.replace(/\bsrc\s*=\s*["'][^"']+["']/i, `src="${pick}"`);
  });
  return full.replace(re, `$1${inner}$3`);
}

/**
 * Додає класи lw-cta-solid / lw-cta-outline на посилання gateway у <main>, щоб guard CSS
 * гарантував #101710 на жовтій заливці та #fff на контурі (LLM часто ставить text-white на заливку).
 */
function patchMainCtaContrast(mainHtml, palette) {
  const html = String(mainHtml || "");
  if (!/<main\b/i.test(html) || !/gateway/i.test(html)) return html;
  const accentHex = String(palette?.accent || BRAND_ACCENT).toLowerCase().replace(/^#/, "");
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    if (!/\bhref\s*=\s*["'][^"']*gateway[^"']*["']/i.test(attrs)) return full;
    const al = attrs.toLowerCase();
    const hasAccentFill =
      /bg-\[#ffe14a|bg-\[#FFE14A|bg-yellow|bg-amber|ffe14a|_cta_button|cta-button|btn_primary|btn-primary/i.test(
        attrs
      ) ||
      /style\s*=\s*["'][^"']*ffe14a/i.test(attrs) ||
      (accentHex.length > 2 && al.includes(accentHex));
    const outlineOnly =
      !hasAccentFill &&
      /border-\[#ffe14a|border-yellow|border-amber|border-2\s+border/i.test(attrs);
    if (outlineOnly) {
      if (/\blw-cta-outline\b/.test(attrs)) return full;
      if (/\bclass\s*=\s*["']/.test(attrs)) {
        return full.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (m, q, cls) => {
          if (/\blw-cta-solid\b/.test(cls)) {
            return `class=${q}${cls.replace(/\blw-cta-solid\b/g, "").trim()} lw-cta-outline${q}`;
          }
          return `class=${q}${cls} lw-cta-outline${q}`;
        });
      }
      return `<a${attrs} class="lw-cta-outline">`;
    }
    if (/\blw-cta-solid\b/.test(attrs)) return full;
    if (/\bclass\s*=\s*["']/.test(attrs)) {
      return full.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, (m, q, cls) => {
        if (/\blw-cta-outline\b/.test(cls)) {
          return `class=${q}${cls.replace(/\blw-cta-outline\b/g, "").trim()} lw-cta-solid${q}`;
        }
        return `class=${q}${cls} lw-cta-solid${q}`;
      });
    }
    return `<a${attrs} class="lw-cta-solid">`;
  });
}

function htmlVisibleTextLen(fragment) {
  return String(fragment || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function escapeHtmlLite(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeVisualCtaButton(openAttrs) {
  const a = String(openAttrs || "").toLowerCase();
  if (/\bdata-tab\b/.test(a)) return false;
  if (/\brole\s*=\s*["']tab["']/i.test(a)) return false;
  if (/\baria-expanded\b/.test(a)) return false;
  if (/\bclass\s*=\s*["'][^"']*(?:faq-item|accordion|lw-tab|menu-toggle|hamburger)[^"']*["']/i.test(a))
    return false;
  if (
    /bg-green|bg-emerald|bg-lime|border-green|border-emerald|from-green|to-emerald|via-green|ring-green|ring-emerald/.test(
      a
    )
  )
    return true;
  if (
    /btn-primary|btn-outline|btn-secondary|cta|shadow-lg|shadow-md/.test(a) &&
    /rounded-full|rounded-xl|rounded-2xl|px-6|px-8|py-3|py-4|min-h-\[/.test(a)
  )
    return true;
  if (/style\s*=\s*["'][^"']*background\s*:\s*(?!transparent)/i.test(a)) return true;
  return false;
}

/**
 * Якщо CTA-кнопка / кнопкоподібне посилання без видимого тексту (лише іконка) — додаємо підпис з aria-label/title або короткий fallback.
 */
function repairBareActionControls(mainHtml) {
  let html = String(mainHtml || "");
  if (!/<main\b/i.test(html)) return html;
  html = html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (full, attrs, inner) => {
    if (!looksLikeVisualCtaButton(attrs)) return full;
    if (htmlVisibleTextLen(inner) >= 2) return full;
    const aria = String(attrs).match(/\baria-label\s*=\s*["']([^"']+)["']/i);
    const title = String(attrs).match(/\btitle\s*=\s*["']([^"']+)["']/i);
    const label = String(aria?.[1] || title?.[1] || "").trim();
    const text =
      label.length >= 2 ? escapeHtmlLite(label) : "Подробнее";
    return `<button${attrs}>${inner}<span class="lw-cta-fallback">${text}</span></button>`;
  });
  html = html.replace(
    /<a\b([^>]*\bclass\s*=\s*["'][^"']*(?:inline-flex|items-center|btn|rounded-full|rounded-xl|border-green|border-emerald|bg-green|bg-emerald|shadow-lg|shadow-md|cta)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,
    (full, attrs, inner) => {
      if (!looksLikeVisualCtaButton(attrs)) return full;
      if (htmlVisibleTextLen(inner) >= 2) return full;
      const aria = String(attrs).match(/\baria-label\s*=\s*["']([^"']+)["']/i);
      const title = String(attrs).match(/\btitle\s*=\s*["']([^"']+)["']/i);
      const label = String(aria?.[1] || title?.[1] || "").trim();
      const text =
        label.length >= 2 ? escapeHtmlLite(label) : "Подробнее";
      return `<a${attrs}>${inner}<span class="lw-cta-fallback">${text}</span></a>`;
    }
  );
  return html;
}

/**
 * Посилання на реєстраційний gateway у фрагменті HTML (main / header / footer від моделі)
 * замінюємо на відносні URL сторінок пакета. Блок #lw-games тимчасово виноситься — посилання
 * на gateway всередині нього не змінюються (прев’ю слотів).
 */
function rewriteProseGatewayAnchorsInMainToInternal(
  mainHtml,
  pageMeta,
  allPages,
  gatewayUrl = DEFAULT_GATEWAY_URL
) {
  const gw = String(gatewayUrl || DEFAULT_GATEWAY_URL).trim();
  let html = String(mainHtml || "");
  if (!gw || !html) return html;
  let gwHost = "";
  try {
    gwHost = new URL(gw).host.toLowerCase();
  } catch {
    return html;
  }
  if (!gwHost) return html;
  const low = html.toLowerCase();
  if (!low.includes(gwHost)) return html;

  const files = (Array.isArray(allPages) ? allPages : [])
    .map((p) => String(p?.file || "").trim())
    .filter(Boolean);
  const current = String(pageMeta?.file || "").trim().toLowerCase();
  const others = files.filter((f) => f.toLowerCase() !== current);
  if (!others.length) return html;

  const norm = (f) => String(f || "").replace(/^\.\//, "").toLowerCase();
  const hasFile = (name) => files.some((f) => norm(f) === norm(name));
  const findMirror = () =>
    files.find((f) => /zerkalo\.php$/i.test(f)) ||
    files.find((f) => /mirror\.php$/i.test(f)) ||
    "";
  const zerk = findMirror() || others[0];
  const pickRoundRobin = (seed) =>
    others[Math.abs(Number(seed) || 0) % others.length] || zerk;
  const pickFaqFile = () =>
    files.find((f) => /guides\.php$/i.test(f)) ||
    files.find((f) => /faq\.php$/i.test(f)) ||
    "";

  const pickInternalTarget = (inner, pre, post) => {
    const blob = (
      inner.replace(/<[^>]+>/g, " ") +
      " " +
      String(pre || "") +
      " " +
      String(post || "")
    )
      .replace(/\s+/g, " ")
      .toLowerCase();

    const mirrorF = findMirror();
    if (
      mirrorF &&
      /зеркал|mirror|доступ|официальн|актуальн|блокиров|безопасн|авторизац|рабочее\s+зерк/i.test(
        blob
      )
    ) {
      return mirrorF.replace(/^\.\//, "");
    }
    if (
      hasFile("index.php") &&
      /(^|[^а-яё])слот|slot|игров|игр|зал|lobby|(^|[^а-яё])live|новин|горяч|megaway|bonus\s*buy|оригинал|сундук|турнир|лотере|магазин|календар|казино|ton\b/.test(
        blob
      )
    ) {
      return "index.php";
    }
    const faqF = pickFaqFile();
    if (faqF && /faq|вопрос|ответ|гайд|помощ|энциклоп/.test(blob))
      return faqF.replace(/^\.\//, "");
    if (hasFile("registration.php") && /регистр|signup|создать\s+акк|аккаунт|клиент/.test(blob))
      return "registration.php";
    if (hasFile("payments.php") && /платеж|пополн|вывод|касс|карт/.test(blob))
      return "payments.php";
    if (hasFile("reviews.php") && /отзыв|рейтинг/.test(blob)) return "reviews.php";
    if (hasFile("bonus.php") && /бонус|фриспин|фрисп|промо|акци/.test(blob))
      return "bonus.php";
    if (
      /(^|[^а-яё])вход|войти|login|кабинет|авториз/.test(blob) &&
      (hasFile("registration.php") || hasFile("index.php"))
    ) {
      return hasFile("registration.php") ? "registration.php" : "index.php";
    }

    const text = inner.replace(/<[^>]+>/g, " ");
    const seed = [...text].reduce((a, c) => a + c.charCodeAt(0), 0);
    return norm(pickRoundRobin(seed));
  };

  const reGames = /<section\b[^>]*\bid=["']lw-games["'][^>]*>[\s\S]*?<\/section>/i;
  const m = html.match(reGames);
  const PL = "\x00__LW_GAMES__\x00";
  if (m) {
    html = `${html.slice(0, m.index)}${PL}${html.slice(m.index + m[0].length)}`;
  }

  const escGw = gw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escHost = gwHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linkExact = new RegExp(
    `<a\\b([^>]*?)\\bhref=(["'])${escGw}\\2([^>]*?)>([\\s\\S]*?)<\\/a>`,
    "gi"
  );
  const linkHttps = new RegExp(
    `<a\\b([^>]*?)\\bhref=(["'])https?:\\/\\/${escHost}\\b[^"']*\\2([^>]*?)>([\\s\\S]*?)<\\/a>`,
    "gi"
  );
  const linkProto = new RegExp(
    `<a\\b([^>]*?)\\bhref=(["'])\\/\\/${escHost}\\b[^"']*\\2([^>]*?)>([\\s\\S]*?)<\\/a>`,
    "gi"
  );

  const replaceOne = (_full, pre, q, post, inner) => {
    const attrBlob = `${pre} ${post}`;
    if (
      /\b(lw-cta-solid|lw-cta-outline|lw-btn|lw-cta)\b/i.test(attrBlob) ||
      /\b(cta-btn|cta-button|btn-reg|hero-cta|game-card|cta_banner)\b/i.test(
        attrBlob
      )
    ) {
      return _full;
    }
    const target = pickInternalTarget(inner, pre, post);
    const cleanPost = String(post || "")
      .replace(/\s*target\s*=\s*(["'])[^"']*\1/gi, "")
      .replace(/\s*rel\s*=\s*(["'])[^"']*\1/gi, "");
    const path = `./${String(target).replace(/^\.\//, "")}`;
    return `<a${pre}href=${q}${path}${q}${cleanPost}>${inner}</a>`;
  };

  html = html.replace(linkExact, replaceOne);
  html = html.replace(linkHttps, replaceOne);
  html = html.replace(linkProto, replaceOne);

  if (m) {
    html = html.replace(PL, m[0]);
  }
  return html;
}

/** У #lw-games подменяем src, если модель вставила не слот-превью (иконки, баннеры и т.д.). */
function sanitizeLwGamesSectionImages(mainHtml, slotPaths) {
  const paths = Array.isArray(slotPaths) ? slotPaths.filter(Boolean) : [];
  if (!paths.length) return String(mainHtml || "");
  const re =
    /(<section\b[^>]*\bid\s*=\s*["']lw-games["'][^>]*>)([\s\S]*?)(<\/section\s*>)/i;
  const full = String(mainHtml || "");
  const m = full.match(re);
  if (!m) return full;
  const normFile = (s) =>
    String(s || "")
      .replace(/^\.\//, "")
      .replace(/^img\//, "")
      .split("/")
      .pop()
      .toLowerCase() || "";
  let idx = 0;
  const inner = m[2].replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return tag;
    const allowed = paths.some((p) => normFile(srcMatch[1]) === normFile(p));
    if (allowed) return tag;
    const pick = paths[idx % paths.length];
    idx += 1;
    return tag.replace(/\bsrc\s*=\s*["'][^"']+["']/i, `src="${pick}"`);
  });
  return full.replace(re, `$1${inner}$3`);
}

function stripBannerFilesUsedAsImg(mainHtml, imageFiles = []) {
  let html = String(mainHtml || "");
  const files = Array.isArray(imageFiles) ? imageFiles : [];
  for (const name of files) {
    if (!isBannerAsset(name)) continue;
    const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imgRe = new RegExp(
      `<img\\b[^>]*\\bsrc\\s*=\\s*["']\\.\\/img\\/${esc}["'][^>]*>`,
      "gi"
    );
    html = html.replace(imgRe, "");
  }
  return html;
}

function enforceForBanerUsage(mainHtml, _classPrefix, _imageFiles = [], _palette) {
  return String(mainHtml || "");
}

function enforceHeadlineLength(mainHtml) {
  let html = String(mainHtml || "");
  const shorten = (text, maxWords) => {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const words = clean.split(" ").filter(Boolean);
    if (words.length <= maxWords) return clean;
    return `${words.slice(0, maxWords).join(" ")}…`;
  };
  html = html.replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi, (_m, attrs, inner) => {
    const plain = inner.replace(/<[^>]+>/g, " ");
    return `<h1${attrs}>${shorten(plain, HEADLINE_H1_MAX_WORDS)}</h1>`;
  });
  html = html.replace(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (_m, lvl, attrs, inner) => {
    const plain = inner.replace(/<[^>]+>/g, " ");
    return `<h${lvl}${attrs}>${shorten(plain, HEADLINE_H23_MAX_WORDS)}</h${lvl}>`;
  });
  return html;
}

function ensureFaviconInHead(html) {
  const src = String(html || "");
  if (!src) return src;
  const iconTag = '<link rel="icon" href="./img/favicon.ico" type="image/x-icon">';
  if (/<link\b[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i.test(src)) {
    return src.replace(
      /<link\b[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i,
      iconTag
    );
  }
  if (/<\/head>/i.test(src)) {
    return src.replace(/<\/head>/i, `  ${iconTag}\n</head>`);
  }
  return src;
}

/**
 * Модель інколи повертає неповний headHtml без chrome/page CSS, JS і Tailwind.
 * Доповнюємо перед </head>, не дублюючи те, що вже є.
 */
function ensureMultipageHeadPipeline(
  headHtml,
  pageIndex,
  palette = null,
  logoSrc = LAKI_LOGO_IMG_SRC,
  headDiversifyKey = "",
  headStyleExtras = {}
) {
  const h0 = String(headHtml || "");
  if (!/<\/head>/i.test(h0)) return h0;
  const pal = palette && typeof palette === "object" ? palette : {};
  const canvas = pal.bg ?? BRAND_BG;
  const slot = pal.card ?? BRAND_CARD;
  const section = pal.block ?? BRAND_BLOCK;
  const accent = pal.accent ?? BRAND_ACCENT;
  const text = pal.text ?? BRAND_TEXT;
  const swapColorKeys = Math.abs(Number(pageIndex) || 0) % 2 === 1;
  const th = siteHash32(`${String(headDiversifyKey || "")}|p${pageIndex}|tw`);
  const inject = [];
  if (!/chrome\.css/i.test(h0)) {
    inject.push('<link rel="stylesheet" href="css/chrome.css">');
  }
  if (headStyleExtras.includeIgamingCss && !/igaming\.css/i.test(h0)) {
    inject.push('<link rel="stylesheet" href="css/igaming.css">');
  }
  if (headStyleExtras.includeSiteShellCss && !/site-shell\.css/i.test(h0)) {
    inject.push('<link rel="stylesheet" href="css/site-shell.css">');
  }
  const pageCssRe = new RegExp(`page-${pageIndex}\\.css`, "i");
  if (!pageCssRe.test(h0)) {
    inject.push(`<link rel="stylesheet" href="css/page-${pageIndex}.css">`);
  }
  const pageJsRe = new RegExp(`page-${pageIndex}\\.js`, "i");
  if (!pageJsRe.test(h0)) {
    inject.push(`<script defer src="js/page-${pageIndex}.js"></script>`);
  }
  if (!/cdn\.tailwindcss\.com/i.test(h0)) {
    inject.push('<script src="https://cdn.tailwindcss.com"></script>');
  }
  const logoPreview = String(logoSrc || LAKI_LOGO_IMG_SRC || "./img/logo.png").trim();
  if (!/property=["']og:image["']/i.test(h0) && !/name=["']twitter:image/i.test(h0)) {
    inject.push(
      `<meta property="og:image" content="${logoPreview.replace(/"/g, "&quot;")}">`
    );
    inject.push(
      `<meta name="twitter:image" content="${logoPreview.replace(/"/g, "&quot;")}">`
    );
  }
  if (!/tailwind\.config\s*=/i.test(h0)) {
    const colorLines = swapColorKeys
      ? `        'brand-slot': '${slot}',
        'brand-canvas': '${canvas}',
        'brand-section': '${section}',
        'brand-accent': '${accent}',
        'brand-text': '${text}'`
      : `        'brand-canvas': '${canvas}',
        'brand-slot': '${slot}',
        'brand-section': '${section}',
        'brand-accent': '${accent}',
        'brand-text': '${text}'`;
    const sansStacks = [
      "['Arial','Helvetica','sans-serif']",
      "['system-ui','-apple-system','Segoe UI','Arial','sans-serif']",
      "['Helvetica Neue','Helvetica','Arial','sans-serif']",
      "['Tahoma','Geneva','Arial','sans-serif']",
    ];
    const sansPick = sansStacks[th % sansStacks.length];
    const fontBlock = `      fontFamily: {\n        'sans': ${sansPick}\n      }`;
    const colorsBlock = `      colors: {\n${colorLines}\n      }`;
    const innerExtend =
      th % 2 === 1 ? `${colorsBlock},\n${fontBlock}` : `${fontBlock},\n${colorsBlock}`;
    const tailNl = th % 3 === 0 ? "\n" : th % 3 === 1 ? "\n\n" : "\n\n\n";
    inject.push(`<script>
tailwind.config = {
  theme: {
    extend: {
${innerExtend}
    }
  }
}${tailNl}</script>`);
  }
  if (!inject.length) return h0;
  return h0.replace(/<\/head>/i, `\n${inject.join("\n")}\n</head>`);
}

function escapeHtmlText(raw) {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureHeadSeoTags(headHtml, pageMeta) {
  let head = String(headHtml || "");
  if (!/^<head\b/i.test(head) || !/<\/head>/i.test(head)) return head;

  const rawTitle = String(pageMeta?.title || "").trim();
  const fallbackTitle = String(pageMeta?.role || "Онлайн казино")
    .trim()
    .slice(0, 100);
  const effectiveTitle = (rawTitle || fallbackTitle || "Онлайн казино").slice(0, 120);
  const titleRe = /<title\b[^>]*>[\s\S]*?<\/title>/i;
  if (head.match(titleRe)) {
    head = head.replace(titleRe, `<title>${escapeHtmlText(effectiveTitle)}</title>`);
  } else {
    head = head.replace(/<\/head>/i, `\n<title>${escapeHtmlText(effectiveTitle)}</title>\n</head>`);
  }

  const description = String(pageMeta?.description || "").trim();

  if (description) {
    const descRe = /<meta\b[^>]*name=["']description["'][^>]*>/i;
    const descMatch = head.match(descRe);
    if (descMatch) {
      const tag = descMatch[0];
      const contentMatch = tag.match(/content=(["'])([\s\S]*?)\1/i);
      const hasContent = contentMatch && String(contentMatch[2] || "").trim().length > 0;
      if (!hasContent) {
        const escaped = escapeHtmlText(description);
        const updatedTag = /content=(["'])[\s\S]*?\1/i.test(tag)
          ? tag.replace(/content=(["'])[\s\S]*?\1/i, `content="${escaped}"`)
          : tag.replace(/\s*\/?>$/, ` content="${escaped}">`);
        head = head.replace(descRe, updatedTag);
      }
    } else {
      head = head.replace(
        /<\/head>/i,
        `\n<meta name="description" content="${escapeHtmlText(description)}">\n</head>`
      );
    }
  }

  return head;
}

function buildInteractionRuntime(gatewayUrl = DEFAULT_GATEWAY_URL) {
  const gwJson = JSON.stringify(
    String(gatewayUrl || DEFAULT_GATEWAY_URL).trim() || DEFAULT_GATEWAY_URL
  );
  return `(() => {
  if ("ontouchstart" in window) document.body.classList.add("touch-device");
  const setAnimDur = () => {
    document.documentElement.style.setProperty(
      "--animation-duration",
      window.innerWidth <= 600 ? "0.2s" : "0.3s"
    );
  };
  setAnimDur();
  window.addEventListener("resize", setAnimDur);

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const hide = (el) => { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); };
  const show = (el) => { el.style.display = ""; el.setAttribute("aria-hidden", "false"); };

  // Tabs: [data-tab-target] controls and [data-tab-panel] panels
  const tabButtons = $$("[data-tab-target]");
  if (tabButtons.length) {
    const allPanels = $$("[data-tab-panel]");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-tab-target");
        if (!target) return;
        allPanels.forEach((p) => hide(p));
        const panel = document.querySelector(target) || document.getElementById(target.replace(/^#/, ""));
        if (panel) show(panel);
        tabButtons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });
    if (allPanels.some((p) => p.style.display !== "none")) {
      // keep existing state
    } else if (tabButtons[0]) {
      tabButtons[0].click();
    }
  }

  // Вкладки игр: button[data-tab] + панели #games-<name> / #lw-games-<name> внутри #lw-games (без data-tab-target)
  (function bindLwGamesDataTabs() {
    const root = document.getElementById("lw-games");
    if (!root) return;
    const tabBtns = $$("button[data-tab]", root).filter((b) => !b.hasAttribute("data-tab-target"));
    if (!tabBtns.length) return;
    const panelCandidates = $$(
      "[id^='games-'], [id^='lw-games-'], [data-tab-content], [data-panel]",
      root
    );
    const panels = panelCandidates.filter((el) => {
      if (el.tagName === "BUTTON") return false;
      if (el.id && (el.id.indexOf("games-") === 0 || el.id.indexOf("lw-games-") === 0)) return true;
      if (el.hasAttribute("data-tab-content")) return true;
      return el.hasAttribute("data-panel");
    });
    if (!panels.length) return;
    const showTab = (name) => {
      panels.forEach((p) => {
        const id = p.id || "";
        const dc = p.getAttribute("data-tab-content");
        const dp = p.getAttribute("data-panel");
        const match =
          dc === name ||
          dp === name ||
          id === "games-" + name ||
          id === "lw-games-" + name;
        if (match) {
          p.style.display = "";
          p.classList.remove("hidden");
          p.removeAttribute("aria-hidden");
        } else {
          p.style.display = "none";
          p.setAttribute("aria-hidden", "true");
        }
      });
      tabBtns.forEach((b) => {
        const on = b.getAttribute("data-tab") === name;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    };
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const name = btn.getAttribute("data-tab");
        if (name) showTab(name);
      });
    });
    const first = tabBtns.find((b) => b.className && /tab-active|_tab-active/i.test(b.className)) || tabBtns[0];
    const initial = first && first.getAttribute("data-tab");
    if (initial) showTab(initial);
  })();

  // Вкладки вне #lw-games (registration: шаги, сценарии) — button[data-tab] + [data-panel] в той же <section>
  (function bindGenericDataTabPanels() {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    $$("section", mainEl).forEach((sec) => {
      if (sec.id === "lw-games") return;
      const tabBtns = $$("button[data-tab]", sec).filter(
        (b) => !b.hasAttribute("data-tab-target")
      );
      if (!tabBtns.length) return;
      const panels = $$("[data-panel]", sec).filter((el) => !el.closest("#lw-games"));
      if (!panels.length) return;
      const showTab = (name) => {
        panels.forEach((p) => {
          const dp = p.getAttribute("data-panel");
          if (dp === name) {
            p.style.display = "";
            p.classList.remove("hidden");
            p.removeAttribute("aria-hidden");
          } else {
            p.style.display = "none";
            p.setAttribute("aria-hidden", "true");
          }
        });
        tabBtns.forEach((b) => {
          const on = b.getAttribute("data-tab") === name;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.classList.toggle("lw-tab-on", on);
        });
      };
      tabBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const name = btn.getAttribute("data-tab");
          if (name) showTab(name);
        });
      });
      const first =
        tabBtns.find((b) => /tab_active|tab-active|lw-tab-on/i.test(b.className)) ||
        tabBtns[0];
      const initial = first && first.getAttribute("data-tab");
      if (initial) showTab(initial);
    });
  })();

  // FAQ / аккордеон: клик по кнопке внутри секции с faq/accordion (не #lw-games)
  (function bindFaqAccordion() {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    mainEl.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest("button[type='button']");
      if (!btn || !mainEl.contains(btn) || btn.closest("#lw-games")) return;
      if (btn.hasAttribute("data-tab")) return;
      const sec = btn.closest("section[class*='faq'], section[id*='faq'], [class*='faq-section'], [class*='accordion']");
      if (!sec) return;
      const item =
        btn.closest("[class*='faq-item'], [class*='acc-item'], [class*='accordion-item']") ||
        btn.parentElement;
      if (!item || item === sec) return;
      const wasOpen = item.classList.contains("lw-faq-open");
      const hideAns = (el) => {
        const a = el.querySelector("[class*='answer'], [class*='acc-content'], [class*='faq-content']");
        if (a && a !== btn && el.contains(a)) {
          a.style.display = "none";
          a.hidden = true;
        }
        const b = el.querySelector("button[type='button']");
        if (b) b.setAttribute("aria-expanded", "false");
      };
      sec.querySelectorAll(".lw-faq-open").forEach((el) => {
        el.classList.remove("lw-faq-open");
        hideAns(el);
      });
      if (!wasOpen) {
        item.classList.add("lw-faq-open");
        btn.setAttribute("aria-expanded", "true");
        const ans = item.querySelector("[class*='answer'], [class*='acc-content'], [class*='faq-content']");
        if (ans && ans !== btn) {
          ans.style.display = "block";
          ans.hidden = false;
        }
      } else {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  })();

  // FAQ <details>: only one open at a time per section
  (function bindFaqDetailsExclusive() {
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    const bySection = new Map();
    $$("details", mainEl).forEach((d) => {
      if (d.closest("#lw-games")) return;
      const sec = d.closest("section") || mainEl;
      if (!bySection.has(sec)) bySection.set(sec, []);
      bySection.get(sec).push(d);
    });
    bySection.forEach((detailsList) => {
      detailsList.forEach((d) => {
        d.addEventListener("toggle", () => {
          if (!d.open) return;
          detailsList.forEach((other) => {
            if (other !== d) other.open = false;
          });
        });
      });
    });
  })();

  // #lw-games card hover: class is-hover for CSS baseline
  (function bindLwGamesCardHover() {
    const root = document.getElementById("lw-games");
    if (!root) return;
    $$("a", root).forEach((card) => {
      const on = () => card.classList.add("is-hover");
      const off = () => card.classList.remove("is-hover");
      card.addEventListener("mouseenter", on);
      card.addEventListener("mouseleave", off);
      card.addEventListener("focus", on);
      card.addEventListener("blur", off);
    });
  })();

  // Reveal-on-scroll for main > section
  (function bindRevealOnScroll() {
    const sections = $$("main > section");
    if (!sections.length) return;
    if (!("IntersectionObserver" in window)) {
      sections.forEach((s) => s.classList.add("is-visible"));
      return;
    }
    sections.forEach((s) => s.classList.add("reveal-on-scroll"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    sections.forEach((s) => io.observe(s));
  })();

  // Scroll-to-top if footer exposes a control
  (function bindScrollToTop() {
    const btn =
      document.getElementById("lw-scroll-top") ||
      document.querySelector(".lw-quick-up") ||
      document.querySelector("footer .lw-quick-up") ||
      document.querySelector("footer button[title*='Вверх' i]") ||
      document.querySelector("footer a[title*='Вверх' i]") ||
      document.querySelector(
        "footer [class*='scroll-top'], footer [class*='back-to-top'], footer [data-scroll-top]"
      );
    if (!btn || btn.dataset.scrollTopBound) return;
    btn.dataset.scrollTopBound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  })();

  // Generic carousel: container [data-carousel], slides [data-slide], controls [data-carousel-prev/next]
  $$("[data-carousel]").forEach((carousel) => {
    const slides = $$("[data-slide]", carousel);
    if (slides.length <= 1) return;
    const usesActiveClass = slides.some((s) => s.classList && s.classList.contains("is-active"));
    const dots = $$("[data-carousel-dot], [data-slide-to]", carousel).filter(
      (el) => el.matches("[data-slide-to], [data-carousel-dot]")
    );
    let idx = usesActiveClass
      ? Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")))
      : 0;
    let timer = null;
    const show = (i) => {
      idx = ((i % slides.length) + slides.length) % slides.length;
      slides.forEach((s, n) => {
        const on = n === idx;
        if (usesActiveClass) {
          s.classList.toggle("is-active", on);
          if (on) {
            s.removeAttribute("hidden");
            s.setAttribute("aria-hidden", "false");
          } else {
            s.setAttribute("hidden", "");
            s.setAttribute("aria-hidden", "true");
          }
        } else {
          s.style.display = on ? "" : "none";
          s.setAttribute("aria-hidden", on ? "false" : "true");
        }
      });
      dots.forEach((d, n) => {
        const on = n === idx;
        d.classList.toggle("is-active", on);
        d.setAttribute("aria-selected", on ? "true" : "false");
      });
    };
    const next = () => show(idx + 1);
    const prev = () => show(idx - 1);
    const restart = () => {
      if (timer) clearInterval(timer);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        timer = setInterval(next, 5500);
      }
    };
    show(idx);
    $$("[data-carousel-next]", carousel).forEach((b) =>
      b.addEventListener("click", () => { next(); restart(); })
    );
    $$("[data-carousel-prev]", carousel).forEach((b) =>
      b.addEventListener("click", () => { prev(); restart(); })
    );
    dots.forEach((d) => {
      d.addEventListener("click", () => {
        const to = Number(d.getAttribute("data-slide-to"));
        if (!Number.isNaN(to)) show(to);
        restart();
      });
    });
    restart();
    carousel.addEventListener("mouseenter", () => { if (timer) clearInterval(timer); });
    carousel.addEventListener("mouseleave", restart);
  });

  // If there are obvious next/prev buttons without attributes, attempt fallback by text
  $$("button, a").forEach((el) => {
    const t = (el.textContent || "").trim().toLowerCase();
    if ((t === "далее" || t === "вперед" || t === "next") && !el.dataset.boundAction) {
      el.dataset.boundAction = "1";
      el.addEventListener("click", () => window.scrollBy({ top: 280, behavior: "smooth" }));
    }
    if ((t === "назад" || t === "prev" || t === "previous") && !el.dataset.boundAction) {
      el.dataset.boundAction = "1";
      el.addEventListener("click", () => window.scrollBy({ top: -280, behavior: "smooth" }));
    }
  });

  // Never leave placeholder href="#"
  $$('a[href="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.querySelector("#lw-games") || document.querySelector("main");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Force gateway links for game cards and play buttons
  const gateway = ${gwJson};
  $$("main a").forEach((a) => {
    const text = (a.textContent || "").toLowerCase();
    const hasImage = !!a.querySelector("img");
    const looksLikePlay =
      /(играть|игра|демо|play|слот|казино)/i.test(text) ||
      /game|slot|play|card|btn/i.test(a.className || "");
    if (hasImage || looksLikePlay) {
      a.setAttribute("href", gateway);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });

  document.querySelectorAll("[data-chip-row]").forEach((row) => {
    row.querySelectorAll("[data-chip], button, [role='tab']").forEach((chip) => {
      chip.addEventListener("click", () => {
        row.querySelectorAll("[data-chip], button, [role='tab']").forEach((c) =>
          c.classList.remove("is-active")
        );
        chip.classList.add("is-active");
      });
    });
  });

  // Ensure frequently used click handlers from LLM are defined.
  if (typeof window.p1_switchGameTab !== "function") {
    window.p1_switchGameTab = (event, tabId) => {
      const root = document.querySelector("main");
      if (!root) return;
      root.querySelectorAll('[id^="slots"], [id^="live"], [id^="table"], .p1_8f124d24f9_tab-content, [data-tab]').forEach((el) => {
        if (el.id && (el.id === "slots" || el.id === "live" || el.id === "table")) el.style.display = "none";
        if (el.classList?.contains("p1_8f124d24f9_tab-content")) el.style.display = "none";
      });
      const target = document.getElementById(tabId);
      if (target) target.style.display = "";
      if (event?.currentTarget?.parentElement) {
        event.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.classList.remove("p1_8f124d24f9_tab-active"));
      }
      event?.currentTarget?.classList?.add("p1_8f124d24f9_tab-active");
    };
  }
})();`;
}

function buildSeoKeywordHint(theme, file, role) {
  const base = String(theme || "").trim();
  const f = String(file || "").toLowerCase();
  const r = String(role || "").toLowerCase();
  let pageFocus = "игры, бонусы, VIP, слоты";
  if (f.includes("payment") || r.includes("платеж") || r.includes("зеркал") || r.includes("вывод")) {
    pageFocus = "зеркало, платежи, вывод средств";
  } else if (f.includes("registration") || r.includes("регистрац")) {
    pageFocus = "регистрация, аккаунт, вход";
  } else if (f.includes("review") || r.includes("отзыв")) {
    pageFocus = "отзывы, рейтинг, надежность";
  } else if (f.includes("bonus") || r.includes("бонус")) {
    pageFocus = "бонусы, акции, условия";
  } else if (f !== "index.php" && r.length > 3) {
    pageFocus = r.slice(0, 120);
  }
  return `${base}; ${pageFocus}; онлайн казино; безопасная игра; бонусы и фриспины`;
}

function isLegacyLakiBrandLabel(text) {
  return /\b(laki|лаки)(\s+(world|ворлд))?\b/i.test(String(text || ""));
}

/** Імʼя бренду для текстів: admin brand → архітектор → тема (без примусу Laki). */
function resolveBuildBrandName({ themeBrandHint, architectSuggested, theme }) {
  const hint = String(themeBrandHint || "").trim();
  const suggested = String(architectSuggested || "").trim();
  if (hint && !isLegacyLakiBrandLabel(hint)) return hint;
  if (suggested && !isLegacyLakiBrandLabel(suggested)) return suggested;
  if (hint) return hint;
  const fromTheme = deriveBrandHintFromTheme(String(theme || ""));
  if (fromTheme && !isLegacyLakiBrandLabel(fromTheme)) return fromTheme;
  return suggested || hint || "Бренд";
}

function slugifyBrandForPrefix(brandName) {
  const slug = String(brandName || "site")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[а-яё]/g, (ch) => {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
        и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
        с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
        щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
      };
      return map[ch] || "";
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "site").slice(0, 14);
}

/** @deprecated — один BEM-префікс на сайт через buildSiteClassNamespace. */
function buildSemanticClassPrefix(brandName, _pageFile, _pageIndex, seedKey = "") {
  return buildSiteClassNamespace(brandName, seedKey).bemPrefix;
}

/**
 * Прибирає згадки Laki та сторонні ./img/laki_* з HTML; підставляє логотип бренду.
 */
function sanitizeBrandLeaksInHtml(html, { brandName, logoSrc, allowedImageNames = [] }) {
  let out = String(html || "");
  const brand = String(brandName || "").trim() || "Бренд";
  const logo = String(logoSrc || "./img/logo.png").trim();
  const allowed = new Set(
    (Array.isArray(allowedImageNames) ? allowedImageNames : []).map((f) =>
      String(f || "")
        .replace(/^\.\/img\//, "")
        .toLowerCase()
    )
  );

  out = out.replace(
    /\b(?:laki\s*world|laki\s*ворлд|лаки\s*ворлд|laki|лаки)\b/gi,
    brand
  );
  out = out.replace(/ЛАКИ\s*ВОРЛД/gi, brand);

  out = out.replace(
    /<img\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi,
    (full, pre, src, post) => {
      const file = String(src || "")
        .replace(/^\.\/img\//, "")
        .toLowerCase();
      if (!file || !/laki/i.test(file)) return full;
      if (allowed.size && !allowed.has(file)) {
        const altMatch = /alt=["']([^"']*)["']/i.exec(full);
        const alt = altMatch ? altMatch[1] : brand;
        return `<img${pre}src="${logo}" alt="${alt}"${post}>`;
      }
      return full;
    }
  );

  out = out.replace(
    /(property=["']og:image["']|name=["']twitter:image["'])\s+content=["'][^"']*laki[^"']*["']/gi,
    `$1 content="${logo.replace(/"/g, "&quot;")}"`
  );

  return out;
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function jaccardSimilarity(a, b) {
  const sa = new Set(tokenizeText(a));
  const sb = new Set(tokenizeText(b));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter++;
  }
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

function countWords(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

/**
 * Якщо plain-текст <main> довший за maxWords — один запит до Claude з поверненням JSON { mainOuterHtml }.
 * Повертає оновлений bundle або вихідний, якщо скорочення не вдалося; збірку не перериває.
 */
async function tryClampPageHtmlMainToMaxWordCount({
  bundle,
  maxWords,
  claudeApiKey,
  claudeBudgetTracker,
  pageMeta,
  onLog,
  shouldStop,
}) {
  const html = String(bundle.html || "");
  const reMain = /<main\b[^>]*>[\s\S]*?<\/main>/i;
  const m = reMain.exec(html);
  if (!m) return bundle;
  const mainTag = m[0];
  const before = html.slice(0, m.index);
  const after = html.slice(m.index + mainTag.length);
  const wc = countWords(htmlToPlainText(mainTag));
  if (wc <= maxWords) return bundle;

  emitLog(
    onLog,
    `LLM: «${pageMeta.file}» — жёсткий лимит слов: ${wc} > ${maxWords}, запрос сокращения <main> у Claude…`
  );

  const sys =
    "Отвечай только валидным JSON без markdown и без текста до/после. Поле mainOuterHtml: строка — полный один элемент <main…>…</main> с тем же открывающим тегом <main> (сохрани атрибуты class и др., если были). " +
    `Сохрани структуру (section, grid, таблицы, кнопки, ссылки); сократи русские тексты так, чтобы без HTML-тегов (plain) было **не более ${maxWords} слов**. Не вводи маркеры @@PH@@ — только готовый текст. Не добавляй новых секций.`;

  const user = `ИСХОДНЫЙ <main> (сейчас ~${wc} слов plain):\n${mainTag}`;

  try {
    const fillRaw = await callClaudeOnly({
      apiKey: claudeApiKey,
      system: sys,
      user,
      maxTokens: PAGE_MAX_TOKENS,
      temperature: Math.min(GENERATION_TEMPERATURE, 0.45),
      onLog,
      shouldStop,
      budgetTracker: claudeBudgetTracker,
    });
    const fillData = extractJsonObject(fillRaw);
    let out = String(fillData.mainOuterHtml || "").trim();
    if (!out) {
      emitLog(
        onLog,
        `Предупреждение: «${pageMeta.file}» — сокращение: пустой mainOuterHtml.`
      );
      return bundle;
    }
    out = normalizeEscapedHtmlFragment(out);
    if (!/^<main\b/i.test(out) || !/<\/main>/i.test(out)) {
      emitLog(
        onLog,
        `Предупреждение: «${pageMeta.file}» — сокращение: ответ без полного <main>, пропуск.`
      );
      return bundle;
    }
    const newWc = countWords(htmlToPlainText(out));
    emitLog(
      onLog,
      `«${pageMeta.file}» после сокращения <main>: ~${newWc} слов (лимит ${maxWords}).`
    );
    return {
      ...bundle,
      html: before + out + after,
      mainText: htmlToPlainText(out),
    };
  } catch (e) {
    emitLog(
      onLog,
      `Предупреждение: «${pageMeta.file}» — сокращение не удалось: ${e instanceof Error ? e.message : String(e)}`
    );
    return bundle;
  }
}

function buildDomStructureSignature(html) {
  const src = String(html || "").toLowerCase();
  const tags = [];
  const re = /<([a-z0-9-]+)(\s|>)/g;
  let m;
  while ((m = re.exec(src)) && tags.length < 1200) {
    const t = m[1];
    if (t === "script" || t === "style") continue;
    tags.push(t);
  }
  return tags.join(" ");
}

function buildClassNamingRhythmSignature(html) {
  const src = String(html || "").toLowerCase();
  const seq = [];
  const re = /\bclass\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(src)) && seq.length < 480) {
    const classes = String(m[1] || "")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!classes.length) continue;
    const rhythm = classes
      .map((c) => c.replace(/[0-9]+/g, "#").split(/[-_]/).length)
      .join(".");
    seq.push(`${classes.length}:${rhythm}`);
  }
  return seq.join(" ");
}

function buildDomDepthHistogramSignature(html) {
  const src = String(html || "").toLowerCase();
  const re = /<\/?([a-z0-9-]+)(\s[^>]*)?>/g;
  const hist = [0, 0, 0, 0, 0, 0];
  let depth = 0;
  let m;
  while ((m = re.exec(src))) {
    const token = m[0] || "";
    const tag = m[1] || "";
    if (tag === "script" || tag === "style") continue;
    const closing = token.startsWith("</");
    const selfClosing = token.endsWith("/>");
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const bucket = Math.min(hist.length - 1, depth);
    hist[bucket] += 1;
    if (!selfClosing) depth += 1;
  }
  const sum = hist.reduce((acc, n) => acc + n, 0) || 1;
  return hist.map((n) => (n / sum).toFixed(3)).join(" ");
}

function extractMainBlockForRefSimilarity(html) {
  const m = String(html || "").match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (m?.[0]) return m[0];
  return String(html || "");
}

function extractSectionSignaturesFromHtml(html) {
  const src = extractMainBlockForRefSimilarity(html);
  const out = [];
  const re = /<section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(src)) !== null && out.length < 24) {
    const attrs = String(m[1] || "");
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const cls = (attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i) || [])[1] || "";
    const clsTop = cls
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(".");
    out.push(id ? `#${id}` : clsTop ? `.${clsTop}` : "section");
  }
  return out;
}

function inferSectionRoleFromHtml(attrs, innerHtml) {
  const attrsText = String(attrs || "").toLowerCase();
  const inner = String(innerHtml || "");
  const innerText = htmlToPlainText(inner).toLowerCase();
  if (/\bid\s*=\s*["'][^"']*lw-games[^"']*["']/i.test(attrsText)) return "games";
  if (/\bid\s*=\s*["'][^"']*lw-vip[^"']*["']/i.test(attrsText)) return "vip";
  if (/\bclass\s*=\s*["'][^"']*(?:games-wrap|games_wrap)[^"']*["']/i.test(attrsText))
    return "games";
  const hay = `${attrsText} ${innerText.slice(0, 400)}`;
  if (/(hero|banner|welcome|джекпот|bonus|бонус|promo|offer)/i.test(hay)) return "hero";
  if (/(faq|вопрос|ответ)/i.test(hay)) return "faq";
  if (/(register|signup|login|вход|регистрац|кабинет|cta)/i.test(hay)) return "cta";
  if (/(games|slots|слот|игр|providers|провайдер|catalog|каталог)/i.test(hay)) return "games";
  if (/(^|\b)vip\b|привилег|loyalt|лояльн/i.test(hay)) return "vip";
  if (/(tabs?|data-tab|категор|menu|меню|nav)/i.test(hay)) return "menu_or_tabs";
  if (/(tournament|турнир|leaderboard|рейтинг)/i.test(hay)) return "tournaments";
  if (/(review|отзыв|обзор|guides?|гайд)/i.test(hay)) return "content";
  if (/<table\b/i.test(inner) || /таблиц/i.test(hay)) return "table";
  if (/(sidebar|aside|filter|фильтр)/i.test(hay)) return "sidebar";
  return "section";
}

function extractSectionRoleSequenceFromHtml(html) {
  return extractSectionRoleSequenceForSimilarity(
    extractMainBlockForRefSimilarity(html),
    inferSectionRoleFromHtml
  );
}

function extractHeadingLevelSignatureFromHtml(html) {
  const src = extractMainBlockForRefSimilarity(html);
  const out = [];
  const re = /<(h1|h2|h3)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(src)) !== null && out.length < 36) {
    out.push(String(m[1] || "").toLowerCase());
  }
  return out;
}

function longestCommonSubsequenceLen(aa, bb) {
  const n = aa.length;
  const m = bb.length;
  if (!n || !m) return 0;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (String(aa[i - 1]) === String(bb[j - 1])) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[n][m];
}

/** Порядок секцій: LCS / max(len), щоб вставки/пропуски не обнуляли схожість. */
function sequenceOrderSimilarity(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (!aa.length || !bb.length) return 0;
  const lcs = longestCommonSubsequenceLen(aa, bb);
  return lcs / Math.max(aa.length, bb.length);
}

function setJaccardSimilarity(a, b) {
  const sa = new Set((Array.isArray(a) ? a : []).map((x) => String(x || "")));
  const sb = new Set((Array.isArray(b) ? b : []).map((x) => String(x || "")));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const item of sa) if (sb.has(item)) inter += 1;
  return inter / (sa.size + sb.size - inter || 1);
}

function extractStyleClassTokensFromHtml(html) {
  const src = String(html || "").toLowerCase();
  const out = [];
  const re = /\bclass\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(src)) !== null && out.length < 240) {
    const classes = String(m[1] || "")
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const cls of classes) {
      if (
        /(?:^|[-_])(layout|wrap|container|grid|row|col|sidebar|menu|footer|header|hero|card|btn|button|tabs?|accordion|faq|content|section|nav)(?:$|[-_])/.test(
          cls
        )
      ) {
        out.push(cls);
      }
    }
  }
  return [...new Set(out)].slice(0, 80);
}

function extractSemanticStyleFeaturesFromHtml(html) {
  const src = String(html || "").toLowerCase();
  const out = [];
  const imgCount = (src.match(/<img\b/g) || []).length;
  if (/<table\b/.test(src)) out.push("table");
  if (/<form\b/.test(src)) out.push("form");
  if (/data-tab=|role=["']tab/i.test(src)) out.push("tabs");
  if (/<input\b[^>]*(search|поиск)/i.test(src)) out.push("search");
  if (/(overflow-x|scroll-snap|carousel|slider)/i.test(src)) out.push("horizontal-scroll");
  if (/(grid|masonry|cards|tile)/i.test(src)) out.push("grid-cards");
  if (/(hero|banner|background-image)/i.test(src)) out.push("hero-visual");
  if (
    /<footer\b[\s\S]*?<nav\b/.test(src) ||
    /\b(lw-footer-links|footer-links)\b/.test(src)
  )
    out.push("footer-menu");
  if (/<aside\b|sidebar/.test(src)) out.push("sidebar");
  if (imgCount >= 10) out.push("media-heavy");
  else if (imgCount > 0) out.push("media-light");
  return [...new Set(out)].slice(0, 20);
}

function computeReferenceStructureSimilarity(html, referenceSignals) {
  const refSections = Array.isArray(referenceSignals?.sectionRoleSequence)
    ? referenceSignals.sectionRoleSequence
    : Array.isArray(referenceSignals?.sectionSignatures)
      ? referenceSignals.sectionSignatures
    : [];
  const refHeadings = Array.isArray(referenceSignals?.headingOutline)
    ? referenceSignals.headingOutline
        .map((x) => String(x || "").match(/^(H[1-3]):/)?.[1]?.toLowerCase() || "")
        .filter(Boolean)
    : [];
  const pageSections = extractSectionRoleSequenceFromHtml(html);
  const pageHeadings = extractHeadingLevelSignatureFromHtml(html);
  const refStyleTokens = Array.isArray(referenceSignals?.styleClassTokens)
    ? referenceSignals.styleClassTokens
    : [];
  const pageStyleTokens = extractStyleClassTokensFromHtml(html);
  const refSemanticFeatures = Array.isArray(referenceSignals?.semanticStyleFeatures)
    ? referenceSignals.semanticStyleFeatures
    : [];
  const refLayout = referenceSignals?.layoutFeatures || {};
  const pageLayout = detectLayoutFeaturesForSimilarity(html);
  let pageSemanticFeatures = extractSemanticStyleFeaturesFromHtml(html);
  if (pageLayout.hasBottomDockNav) {
    pageSemanticFeatures = [...new Set([...pageSemanticFeatures, "bottom-dock"])].slice(0, 20);
  }
  const sectionsSet = setJaccardSimilarity(refSections, pageSections);
  const sectionsOrder = sequenceOrderSimilarity(refSections, pageSections);
  const headingOrder = sequenceOrderSimilarity(refHeadings, pageHeadings);
  const headingSet = setJaccardSimilarity(refHeadings, pageHeadings);
  const styleSet = setJaccardSimilarity(refStyleTokens, pageStyleTokens);
  const semanticStyleSet = setJaccardSimilarity(refSemanticFeatures, pageSemanticFeatures);
  let layoutCompared = 0;
  let layoutScoreSum = 0;
  for (const k of [
    "hasLeftSidebar",
    "hasRightSidebar",
    "hasAnySidebar",
    "hasFooterMenu",
    "hasBottomDockNav",
  ]) {
    if (typeof refLayout?.[k] !== "boolean") continue;
    layoutCompared += 1;
    const r = Boolean(refLayout[k]);
    const p = Boolean(pageLayout[k]);
    if (r === p) layoutScoreSum += 1;
    else if (!r && p) layoutScoreSum += 1;
    else layoutScoreSum += 0;
  }
  const layoutFlagsMatch = layoutCompared ? layoutScoreSum / layoutCompared : 1;
  const refRoleSeq = Array.isArray(referenceSignals?.sectionRoleSequence)
    ? referenceSignals.sectionRoleSequence
    : [];
  /** Повний мікс (заголовки + class-токени референса) — лише для логів; на поріг не впливає, якщо є sectionRoleSequence. */
  const fullCompositeScore =
    0.31 * sectionsSet +
    0.29 * sectionsOrder +
    0.08 * headingOrder +
    0.06 * headingSet +
    0.06 * styleSet +
    0.15 * semanticStyleSet +
    0.05 * layoutFlagsMatch;
  /** Режим «референс по URL»: один зрозумілий бал — каркас секцій + трохи семантики/layout, без чужих CSS-класів. */
  const referenceStructureScore =
    0.46 * sectionsSet +
    0.46 * sectionsOrder +
    0.05 * semanticStyleSet +
    0.03 * layoutFlagsMatch;
  const score =
    refRoleSeq.length >= 2 ? referenceStructureScore : fullCompositeScore;
  return {
    score,
    fullCompositeScore,
    sectionsSet,
    sectionsOrder,
    headingOrder,
    headingSet,
    styleSet,
    semanticStyleSet,
    layoutFlagsMatch,
    refSections: refSections.length,
    pageSections: pageSections.length,
  };
}

function getCrossBuildSignatureMemoryPath() {
  return path.join(
    getAppRoot(),
    "storage",
    "generation-memory",
    "page-signatures.json"
  );
}

function getChromePresetHistoryPath() {
  return path.join(
    getAppRoot(),
    "storage",
    "generation-memory",
    "chrome-presets-history.json"
  );
}

async function loadCrossBuildSignatureMemory() {
  try {
    const raw = await fs.readFile(getCrossBuildSignatureMemoryPath(), "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x) =>
        x &&
        typeof x.domSig === "string" &&
        typeof x.classRhythmSig === "string" &&
        typeof x.depthHistSig === "string"
    );
  } catch {
    return [];
  }
}

async function loadChromePresetHistory() {
  try {
    const raw = await fs.readFile(getChromePresetHistoryPath(), "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x) =>
        x &&
        typeof x.templateId === "string" &&
        Number.isFinite(Number(x.headerPresetId)) &&
        Number.isFinite(Number(x.footerPresetId))
    );
  } catch {
    return [];
  }
}

async function saveCrossBuildSignatureMemory(rows) {
  const file = getCrossBuildSignatureMemoryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const list = Array.isArray(rows) ? rows.slice(-CROSS_BUILD_HISTORY_PAGES) : [];
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

async function saveChromePresetHistory(rows) {
  const file = getChromePresetHistoryPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const list = Array.isArray(rows) ? rows.slice(-240) : [];
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

function pickChromePresetPair(seed, templateId, recentRows) {
  const tpl = String(templateId || "bet162").toLowerCase();
  const recent = Array.isArray(recentRows) ? recentRows.slice(-10) : [];
  const banned = new Set(
    recent.map(
      (r) =>
        `${String(r?.templateId || "").toLowerCase()}|${Number(r?.headerPresetId) || 0}|${Number(r?.footerPresetId) || 0}`
    )
  );
  const candidates = [];
  for (let h = 1; h <= 10; h += 1) {
    for (let f = 1; f <= 10; f += 1) {
      const score = siteHash32(`${seed}|${tpl}|H${h}|F${f}`);
      candidates.push({ h, f, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const picked =
    candidates.find((c) => !banned.has(`${tpl}|${c.h}|${c.f}`)) || candidates[0];
  return {
    templateId: tpl,
    headerPresetId: picked.h,
    footerPresetId: picked.f,
  };
}

function normalizeWordsForNav(text) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.replace(/[^\p{L}\p{N}-]+/gu, ""))
    .filter(Boolean);
  if (!words.length) return "Раздел";
  return words.slice(0, 2).join(" ");
}

function enforceChromeLabelQuality(html) {
  return String(html || "").replace(
    /(<(?:a|button)\b[^>]*>)([^<]{1,120})(<\/(?:a|button)>)/gi,
    (_m, open, inner, close) => `${open}${normalizeWordsForNav(inner)}${close}`
  );
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-ish match for brand terms; JS `\\b` does not treat Cyrillic as word chars. */
function countBrandTermMatchesInPlainText(text, term) {
  const t = String(term || "").trim().toLowerCase();
  if (t.length < 2) return 0;
  const s = String(text || "").toLowerCase();
  try {
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(t)}(?=[^\\p{L}\\p{N}]|$)`,
      "giu"
    );
    return (s.match(re) || []).length;
  } catch {
    let n = 0;
    let i = 0;
    while ((i = s.indexOf(t, i)) !== -1) {
      n += 1;
      i += t.length;
    }
    return n;
  }
}

function countBrandMentionsInHeadings(html, brandTerms = []) {
  const terms = Array.from(
    new Set(
      (Array.isArray(brandTerms) ? brandTerms : [])
        .map((t) => String(t || "").trim().toLowerCase())
        .filter((t) => t.length >= 3)
    )
  );
  if (!terms.length) return 0;
  const re = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let mentions = 0;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const text = String(m[1] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    for (const term of terms) {
      mentions += countBrandTermMatchesInPlainText(text, term);
    }
  }
  return mentions;
}

function countBrandMentionsInParagraphs(html, brandTerms = []) {
  const terms = Array.from(
    new Set(
      (Array.isArray(brandTerms) ? brandTerms : [])
        .map((t) => String(t || "").trim().toLowerCase())
        .filter((t) => t.length >= 3)
    )
  );
  if (!terms.length) return 0;
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let mentions = 0;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const text = String(m[1] || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    for (const term of terms) {
      mentions += countBrandTermMatchesInPlainText(text, term);
    }
  }
  return mentions;
}

function buildAvoidPhrases(previousMainTexts) {
  const source = previousMainTexts.join(" ");
  const tokens = tokenizeText(source);
  const freq = new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([w]) => w);
}

function enforceMainVisualRules(pageCss = "", palette) {
  const bg = palette?.bg ?? BRAND_BG;
  const block = palette?.block ?? BRAND_BLOCK;
  const text = palette?.text ?? BRAND_TEXT;
  const accent = palette?.accent ?? BRAND_ACCENT;
  const heading = palette?.heading ?? "#ffe14a";
  const accentOn = palette?.accentOn ?? "#101710";
  const font = palette?.fontStack ?? "Arial, sans-serif";
  const guardTag = `/* ${(siteHash32(`${bg}|${block}|${accent}|${font}|layer`) >>> 0)
    .toString(16)
    .slice(0, 10)} */`;
  const guard = `
${guardTag}
html, body {
  background-color: ${bg} !important;
}
main {
  background-color: transparent !important;
  color: ${text} !important;
  font-family: ${font} !important;
}
main * {
  font-family: inherit !important;
}
main, main p, main li, main label, main span, main small, main td, main th, main dd, main dt {
  color: ${text} !important;
}
main h1, main h2, main h3, main h4 {
  color: ${heading} !important;
}
main .accent, main strong, main b {
  color: ${accent} !important;
}
/* FAQ/аккордеон: заголовки h* внутри кнопки не делаем жёлтыми (было нечитаемо на жёлтом фоне) */
main button :is(h1, h2, h3, h4),
main [role="button"] :is(h1, h2, h3, h4) {
  color: #ffffff !important;
}
main button :is(span, p, div),
main [role="button"] :is(span, p, div) {
  color: inherit !important;
}
main a {
  color: #3b82f6 !important;
}
main a:hover {
  color: #60a5fa !important;
}
/* Tailwind / классы: жёлтая заливка — текст #101710 (перекрывает main a) */
main a[class*="bg-yellow"],
main a[class*="bg-amber"],
main a[class*="bg-lime"],
main a[class*="bg-[#ffe14a"],
main a[class*="bg-[#FFE14A"],
main button[class*="bg-yellow"],
main button[class*="bg-amber"],
main button[class*="bg-lime"],
main button[class*="bg-[#ffe14a"],
main button[class*="bg-[#FFE14A"] {
  color: #101710 !important;
}
main a[class*="bg-yellow"] *,
main a[class*="bg-amber"] *,
main button[class*="bg-yellow"] *,
main button[class*="bg-amber"] *,
main a[class*="bg-[#ffe14a"] *,
main a[class*="bg-[#FFE14A"] *,
main button[class*="bg-[#ffe14a"] *,
main button[class*="bg-[#FFE14A"] * {
  color: #101710 !important;
}
/* Контур / прозрачный фон + жёлтая рамка или ring — белый текст */
main a[class*="border-yellow"]:not([class*="bg-yellow"]),
main a[class*="border-amber"]:not([class*="bg-yellow"]):not([class*="bg-amber"]),
main button[class*="border-yellow"]:not([class*="bg-yellow-4"]):not([class*="bg-yellow-5"]):not([class*="bg-amber-4"]):not([class*="bg-amber-5"]),
main button[class*="border-amber"]:not([class*="bg-yellow"]):not([class*="bg-amber"]),
main a[class*="ring-yellow"]:not([class*="bg-yellow"]),
main button[class*="ring-yellow"]:not([class*="bg-yellow"]),
main a[class*="ring-amber"]:not([class*="bg-amber"]),
main button[class*="ring-amber"]:not([class*="bg-amber"]) {
  color: #ffffff !important;
}
main a[class*="border-yellow"]:not([class*="bg-yellow"]) *,
main button[class*="border-yellow"]:not([class*="bg-yellow"]) *,
main a[class*="ring-yellow"]:not([class*="bg-yellow"]) *,
main button[class*="ring-yellow"]:not([class*="bg-yellow"]) * {
  color: #ffffff !important;
}
/* Tailwind arbitrary: border-[#ffe14a] / ring — жёлтая обводка на прозрачном фоне = белый текст */
main a[class*="bg-transparent"][class*="border-[#ffe14a"],
main a[class*="bg-transparent"][class*="border-[#FFE14A"],
main button[class*="bg-transparent"][class*="border-[#ffe14a"],
main button[class*="bg-transparent"][class*="border-[#FFE14A"],
main a[class*="border-[#ffe14a"][class*="bg-transparent"],
main button[class*="border-[#ffe14a"][class*="bg-transparent"],
main a[class*="border-[#FFE14A"][class*="bg-transparent"],
main button[class*="border-[#FFE14A"][class*="bg-transparent"],
main a[class*="ring-[#ffe14a"]:not([class*="bg-[#ffe14a"]),
main button[class*="ring-[#ffe14a"]:not([class*="bg-[#ffe14a"]),
main a[class*="ring-[#FFE14A"]:not([class*="bg-[#ffe14a"]),
main button[class*="ring-[#FFE14A"]:not([class*="bg-[#ffe14a"]) {
  color: #ffffff !important;
}
main a[class*="bg-transparent"][class*="border-[#ffe14a"] *,
main button[class*="bg-transparent"][class*="border-[#ffe14a"] *,
main a[class*="border-[#ffe14a"][class*="bg-transparent"] *,
main button[class*="border-[#ffe14a"][class*="bg-transparent"] * {
  color: #ffffff !important;
}
/* Та же кнопка при hover с заливкой — тёмный текст */
main a[class*="border-[#ffe14a"][class*="hover:bg-[#ffe14a"]:hover,
main button[class*="border-[#ffe14a"][class*="hover:bg-[#ffe14a"]:hover,
main a[class*="border-[#FFE14A"][class*="hover:bg-[#FFE14A"]:hover,
main button[class*="border-[#FFE14A"][class*="hover:bg-[#FFE14A"]:hover {
  color: #101710 !important;
}
main a[class*="border-[#ffe14a"][class*="hover:bg-[#ffe14a"]:hover *,
main button[class*="border-[#ffe14a"][class*="hover:bg-[#ffe14a"]:hover * {
  color: #101710 !important;
}
/* Жёлтая ЗАЛИВКА CTA — только явный жёлтый фон (не border-color + transparent) */
main a[style*="background:#ffe14a"],
main a[style*="background: #ffe14a"],
main a[style*="background-color:#ffe14a"],
main a[style*="background-color: #ffe14a"],
main a[style*="linear-gradient"][style*="ffe14a"],
main a[style*="background:rgb(255, 225, 74)"],
main a[style*="background: rgb(255, 225, 74)"],
main a.bg-brand-accent {
  color: #101710 !important;
}
main a[style*="background:#ffe14a"]:hover,
main a[style*="background: #ffe14a"]:hover,
main a.bg-brand-accent:hover {
  color: #0a0f0a !important;
}
main a[style*="background:#ffe14a"] :is(span, strong, b),
main a[style*="background: #ffe14a"] :is(span, strong, b),
main a[style*="linear-gradient"][style*="ffe14a"] :is(span, strong, b),
main a.bg-brand-accent :is(span, strong, b) {
  color: #101710 !important;
}
main button[style*="background:#ffe14a"],
main button[style*="background: #ffe14a"],
main button[style*="background-color:#ffe14a"],
main button[style*="background-color: #ffe14a"],
main button[style*="linear-gradient"][style*="ffe14a"],
main button.bg-brand-accent {
  color: #101710 !important;
}
main button[style*="background:#ffe14a"] :is(span, strong, b),
main button[style*="background: #ffe14a"] :is(span, strong, b),
main button.bg-brand-accent :is(span, strong, b) {
  color: #101710 !important;
}
/* Контурные кнопки: прозрачный фон + рамка акцента — белый текст */
main button[style*="background:transparent"],
main button[style*="background: transparent"],
main button[style*="background-color:transparent"],
main button[style*="background-color: transparent"] {
  color: #ffffff !important;
}
main button[style*="background:transparent"] :is(span, strong, b),
main button[style*="background: transparent"] :is(span, strong, b),
main button[style*="background-color:transparent"] :is(span, strong, b),
main button[style*="background-color: transparent"] :is(span, strong, b) {
  color: #ffffff !important;
}
main a[style*="background:transparent"][class*="border"],
main a[style*="background: transparent"][class*="border"],
main a[style*="border"][style*="background:transparent"] {
  color: #ffffff !important;
}
main a[style*="background:transparent"] :is(span, strong, b),
main a[style*="background: transparent"] :is(span, strong, b) {
  color: #ffffff !important;
}
/* Tailwind: text-white на жёлтой заливке — тёмный текст */
main a[class*="bg-yellow"][class*="text-white"],
main button[class*="bg-yellow"][class*="text-white"],
main a[class*="bg-amber"][class*="text-white"],
main button[class*="bg-amber"][class*="text-white"],
main a[class*="bg-lime"][class*="text-white"],
main button[class*="bg-lime"][class*="text-white"] {
  color: #101710 !important;
}
main a[class*="bg-yellow"][class*="text-white"] *,
main button[class*="bg-yellow"][class*="text-white"] * {
  color: #101710 !important;
}
/* Контур: text-gray/zinc/slate на тёмном фоне — белый */
main a[class*="border-yellow"][class*="text-gray"],
main button[class*="border-yellow"][class*="text-gray"],
main a[class*="border-yellow"][class*="text-zinc"],
main button[class*="border-yellow"][class*="text-zinc"],
main a[class*="border-yellow"][class*="text-slate"],
main button[class*="border-yellow"][class*="text-slate"],
main a[class*="border-amber"][class*="text-gray"],
main button[class*="border-amber"][class*="text-gray"] {
  color: #ffffff !important;
}
main a[class*="border-yellow"][class*="text-gray"] *,
main button[class*="border-yellow"][class*="text-gray"] *,
main a[class*="border-amber"][class*="text-gray"] * {
  color: #ffffff !important;
}
/* Кнопки из промптов: primary = заливка, outline/secondary = контур */
main a.btn-primary:not([class*="outline"]),
main button.btn-primary:not([class*="outline"]),
main [class*="btn-primary"]:not([class*="outline"]):not([class*="border-2"]):not([class*="border-y"]) {
  color: #101710 !important;
}
main a[class*="btn-outline"],
main button[class*="btn-outline"],
main a.btn-secondary,
main button.btn-secondary {
  color: #ffffff !important;
}
/* Синие/indigo полосы — в палитру бренда (не «чужие» блоки) */
main section[class*="bg-blue"],
main section[class*="from-blue"],
main section[class*="to-blue"],
main [class*="bg-gradient"][class*="from-blue"],
main [class*="bg-gradient"][class*="to-indigo"] {
  background: linear-gradient(180deg, ${block} 0%, ${bg} 100%) !important;
  background-color: ${block} !important;
  background-image: linear-gradient(180deg, ${block} 0%, ${bg} 100%) !important;
}
/* CTA с фоном: overlay position:absolute без высоты секции → контент наезжает на предыдущий блок */
main section[class*="cta"][style*="background"],
main section[style*="background-image"][class*="cta"] {
  position: relative !important;
  overflow: hidden !important;
  min-height: min(52vh, 440px) !important;
  isolation: isolate;
}
main section[class*="cta"] > [class*="overlay"],
main section[style*="background-image"] > div[class*="overlay"] {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: 100% !important;
  min-height: 240px !important;
  padding: clamp(2rem, 5vw, 3.5rem) 1rem !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(0, 0, 0, 0.72) !important;
}
main section[class*="faq"],
main section[id="faq"] {
  position: relative;
  z-index: 1;
}
main section[class*="cta"] {
  z-index: 0;
}
main section[class*="cta"] a[class*="button"],
main section[class*="cta"] a[class*="cta_"] {
  display: inline-block !important;
  width: auto !important;
  max-width: min(96vw, 420px) !important;
  white-space: normal !important;
  text-align: center !important;
  line-height: 1.35 !important;
  box-sizing: border-box !important;
}
/* Вкладки шагов (registration и др.) вне #lw-games */
main section:not(#lw-games) button[data-tab].is-active,
main section:not(#lw-games) button[data-tab].lw-tab-on {
  background-color: ${accent} !important;
  color: ${accentOn} !important;
  border-color: ${accent} !important;
}
main section:not(#lw-games) button[data-tab]:not(.is-active):not(.lw-tab-on) {
  background-color: transparent !important;
  color: #ffffff !important;
  border: 2px solid ${accent} !important;
}
/* Ритм секций: первая секция не дублирует отступ под фиксированный header (padding-top уже в chrome.css для <main>) */
main > *:first-child {
  margin-top: 0 !important;
}
main > section {
  box-sizing: border-box;
  padding-left: max(1rem, env(safe-area-inset-left)) !important;
  padding-right: max(1rem, env(safe-area-inset-right)) !important;
  padding-bottom: 2.5rem !important;
}
main > section:first-of-type {
  padding-top: clamp(0.25rem, 1vw, 0.65rem) !important;
}
main > section:not(:first-of-type) {
  padding-top: 2.5rem !important;
}
main .lw-cta-fallback {
  display: inline-block;
  margin-left: 0.28rem;
  font-weight: 700;
  line-height: 1.25;
  vertical-align: middle;
}
/* Заливки green/emerald: контрастный тёмный текст (LLM часто оставляет text-green на зелёном фоне) */
main a[class*="bg-green"],
main button[class*="bg-green"],
main a[class*="bg-emerald"],
main button[class*="bg-emerald"],
main a[class*="bg-lime"],
main button[class*="bg-lime"] {
  color: #0b1f12 !important;
}
main a[class*="bg-green"] .lw-cta-fallback,
main button[class*="bg-green"] .lw-cta-fallback,
main a[class*="bg-emerald"] .lw-cta-fallback,
main button[class*="bg-emerald"] .lw-cta-fallback {
  color: #0b1f12 !important;
}
/* FAQ: единый читаемый вид в палитре билда */
main section[id*="faq"] [class*="faq-item"],
main section[class*="faq"] [class*="faq-item"],
main [class*="faq-section"] [class*="faq-item"] {
  background-color: ${block} !important;
  border-radius: 12px !important;
  margin-bottom: 0.75rem !important;
  overflow: hidden;
}
main section[id*="faq"] [class*="faq-item"] > button,
main section[class*="faq"] [class*="faq-item"] > button,
main [class*="faq-section"] [class*="faq-item"] > button {
  color: #ffffff !important;
  width: 100%;
  text-align: left;
  padding: 0.85rem 1rem !important;
  background: transparent !important;
  border: none !important;
  font-weight: 700 !important;
  box-sizing: border-box !important;
}
/* FAQ: тіло відповіді — ті самі горизонтальні відступи, що у кнопки питання */
main section[id*="faq"] [class*="faq-item"] [class*="answer"],
main section[class*="faq"] [class*="faq-item"] [class*="answer"],
main [class*="faq-section"] [class*="faq-item"] [class*="answer"],
main section[id*="faq"] [class*="faq-item"] [class*="acc-content"],
main section[class*="faq"] [class*="faq-item"] [class*="acc-content"],
main [class*="faq-section"] [class*="faq-item"] [class*="acc-content"],
main section[id*="faq"] [class*="faq-item"] [class*="faq-content"]:not(button),
main section[class*="faq"] [class*="faq-item"] [class*="faq-content"]:not(button),
main [class*="faq-section"] [class*="faq-item"] [class*="faq-content"]:not(button) {
  padding: 0 1rem 1rem 1rem !important;
  margin: 0 !important;
  text-align: left !important;
  box-sizing: border-box !important;
}
/* Чипи / превʼю: box-sizing, щоб padding не ламав ширину ряду */
main [class*="tab"] a,
main [class*="chip"] a,
main [class*="pill"] a,
main [class*="category"] a {
  box-sizing: border-box !important;
}
main section[id*="faq"] h2,
main section[class*="faq"] h2,
main [class*="faq-section"] h2 {
  text-align: center !important;
  margin-bottom: 1.25rem !important;
}
/* Секции не получают принудительную полосу от генератора — только контент задаёт фон */
main > section:first-of-type {
  background-color: transparent !important;
}
/* Не переопределяем фон всех button — ломались вкладки и аккордеоны; CTA оформляй в HTML/Tailwind (жёлтая заливка + тёмный текст) */
#lw-games a,
[class*="games"] a,
[id*="games"] a {
  display: block;
  overflow: hidden;
  border-radius: 14px;
  transition: transform .22s ease, box-shadow .22s ease, filter .22s ease;
}
#lw-games a:hover,
[class*="games"] a:hover,
[id*="games"] a:hover {
  transform: translateY(-4px) scale(1.015);
  box-shadow: 0 10px 26px rgba(0,0,0,0.35);
  filter: saturate(1.12);
}
#lw-games img,
[class*="games"] img,
[id*="games"] img {
  width: 100%;
  min-height: 120px;
  object-fit: cover !important;
  object-position: center;
  display: block;
}
/* Вкладки #lw-games: активная — заливка акцента */
#lw-games button[data-tab].is-active,
#lw-games button[data-tab][aria-pressed="true"] {
  background-color: ${accent} !important;
  color: ${accentOn} !important;
  border-color: ${accent} !important;
}
#lw-games button[data-tab]:not(.is-active) {
  background-color: transparent !important;
  color: #ffffff !important;
  border: 2px solid ${accent} !important;
}
#lw-games button[data-tab] * {
  color: inherit !important;
}
/* Постобработка patchMainCtaContrast: контраст gateway-ссылок в main */
main a.lw-cta-solid,
main a.lw-cta-solid * {
  color: ${accentOn} !important;
}
main a.lw-cta-solid:hover {
  color: color-mix(in srgb, ${accentOn} 85%, #000) !important;
}
main a.lw-cta-outline,
main a.lw-cta-outline * {
  color: #ffffff !important;
}
`;

  const page = String(pageCss || "").trim();
  return page ? `${page}\n${guard}` : guard;
}

/** Проверка синтаксиса JS так же, как браузер загрузит один файл (функция не выполняет код). */
function getJsSyntaxError(scriptBody) {
  const code = String(scriptBody || "").trim();
  if (!code) return null;
  try {
    new Function(code);
    return null;
  } catch (e) {
    return e?.message || "syntax error";
  }
}

async function generatePageBundle(
  claudeApiKey,
  ctx,
  pageMeta,
  pageIndex,
  onLog
) {
  const totalPg = Math.max(1, Number(ctx.totalPages) || 1);
  const perFileCap =
    ctx.claudePageMaxTokensByFile?.[pageMeta.file] ??
    ctx.claudePageMaxTokens;
  const claudePageCap =
    Number(perFileCap) > 0
      ? Math.min(
          PAGE_MAX_TOKENS,
          Math.max(512, Math.trunc(Number(perFileCap)))
        )
      : PAGE_MAX_TOKENS;
  emitLog(
    onLog,
    `LLM: страница ${pageIndex}/${totalPg} — «${pageMeta.file}» (запрос и ожидание ответа…)`
  );
  emitLog(
    onLog,
    `ЭТАП: «${pageMeta.file}» — Claude вёрстка+текст (JSON) + fix JS`
  );
  const sectionImagePaths = pickContentImagesForPage(
    ctx.imageFiles,
    `${ctx.siteSeed}|${pageMeta.file}`,
    4
  );
  const heroExtraPaths =
    isIndexPageFile(pageMeta.file)
      ? pickContentImagesForPage(
          ctx.imageFiles,
          `${ctx.siteSeed}|hero-decor`,
          3
        )
      : [];
  const siblingPlanSummary = formatSiblingPlanSummary(
    ctx.allPages,
    pageMeta.file
  );
  const sourceArticlesPicked = pickSourceArticlesFromPool(
    ctx.sourceArticlesPool || [],
    `${ctx.structureSeed || ctx.siteSeed || ""}|${pageMeta.file}|${ctx.buildNonce || ""}`,
    resolveSourceArticlesSettings().countPerPage
  );
  const sourceArticlesOverlay = formatSourceArticlesPromptBlock(
    sourceArticlesPicked,
    {
      themeBrandHint: ctx.themeBrandHint || ctx.publicBrandName || "",
      pageFile: pageMeta.file,
    }
  );
  const retryStep = Math.max(
    Number(ctx.similarityRetryCount) || 0,
    Number(ctx.wordCountRetryCount) || 0,
    Number(ctx.wordCountOverMaxRetryCount) || 0
  );
  const pagePromptFamily = pickPromptFamilyBySeed(
    `${ctx.structureSeed || ctx.siteSeed || ""}|${pageMeta.file}|${ctx.buildNonce || ""}`,
    retryStep
  );
  const retryEntropyOverlay = buildPromptEntropyOverlay(
    `${ctx.structureSeed || ctx.siteSeed || ""}|${pageMeta.file}|${ctx.buildNonce || ""}|retry:${retryStep}`,
    `page:${pageMeta.file}:retry:${retryStep}`
  );
  const promptFamilyOverlay = buildPromptFamilyOverlay({
    family: pagePromptFamily,
    retryStep,
    kind: "page",
  });
  const navLayoutPromptBlock = formatNavLayoutForAiPagePrompt(
    ctx.chromeVariant,
    ctx.navLinks || []
  );
  const pageRefMainHtml = resolveMainHtmlTemplateForPage(
    ctx.referenceStructureSignals || {},
    pageMeta.file
  );
  const pageSiteTemplate = resolvePageSiteTemplate(
    ctx.referenceStructureSignals || {},
    pageMeta.file
  );
  const pageReferenceTemplateMode = Boolean(
    ctx.referenceTemplateMode && String(pageRefMainHtml || "").trim().length > 0
  );
  const tplFirstSeen = ctx.siteCanonicalChromeByTemplate || {};
  const isFirstPageForTemplate = Boolean(
    pageSiteTemplate && !tplFirstSeen[pageSiteTemplate]
  );
  const userBase = buildPagePrompt({
    theme: ctx.theme,
    pageMeta,
    buildNonce: ctx.buildNonce,
    navLayoutPromptBlock,
    imageFiles: ctx.imageFiles,
    gameImages: ctx.gameImages,
    gameSlotPaths:
      isIndexPageFile(pageMeta.file) ? ctx.gameSlotPaths || [] : [],
    gameTabSlotBatches:
      isIndexPageFile(pageMeta.file) && ctx.homeGamesMode === "tabs"
        ? ctx.gameTabSlotBatches || []
        : [],
    homeGamesMode: isIndexPageFile(pageMeta.file)
      ? ctx.homeGamesMode || "single-grid"
      : "tabs",
    structureFingerprint: ctx.structureFingerprint || "",
    sectionImagePaths,
    heroExtraPaths,
    avoidPhrases: ctx.avoidPhrases || [],
    yandexVerification: ctx.yandexVerification,
    baseUrl: ctx.baseUrl,
    pageIndex,
    themeBrandHint: ctx.themeBrandHint || "",
    diversityPackText: ctx.diversityPackText || "",
    promptProfileOverlay: [ctx.promptProfileOverlay || "", retryEntropyOverlay]
      .filter(Boolean)
      .join("\n\n"),
    promptFamilyOverlay,
    siblingPlanSummary,
    uniquenessUrgencyLevel: Number(ctx.similarityRetryCount) || 0,
    minPageWords:
      Number(ctx.minPageWords) || minWordsTargetForPageFile(pageMeta.file),
    wordCountUrgencyLevel: Number(ctx.wordCountRetryCount) || 0,
    wordCountOverMaxUrgencyLevel:
      Number(ctx.wordCountOverMaxRetryCount) || 0,
    brandTerms: ctx.brandTerms || [],
    sitePalette: ctx.sitePalette,
    totalPageCount: ctx.totalPages || 4,
    blueprintDirectives: pageMeta.blueprint || null,
    chromeShell: ctx.chromeShell || { includeHeader: true, includeFooter: true },
    chromeContentOptions: ctx.chromeContentOptions || null,
    referenceStructureSignals: ctx.referenceStructureSignals || null,
    referenceBlendMode: Boolean(ctx.referenceBlendMode),
    referenceTemplateMode: pageReferenceTemplateMode,
    referenceTemplateMainHtml: pageRefMainHtml,
    chromeVariant: ctx.chromeVariant,
    navLinks: ctx.navLinks || [],
    gatewayUrl: ctx.gatewayUrl || DEFAULT_GATEWAY_URL,
    logoSrcForPrompt: ctx.logoSrc || LAKI_LOGO_IMG_SRC,
    useTemplateChrome: ctx.useTemplateChrome,
    siteCanonicalChrome: ctx.siteCanonicalChrome || null,
    siteCanonicalChromeForTemplate: tplFirstSeen[pageSiteTemplate] || null,
    isFirstSitePage: Boolean(ctx.isFirstSitePage),
    isFirstPageForTemplate,
    pageSiteTemplate:
      usesDualSiteTemplates() || ctx.strictEtalonLayout ? pageSiteTemplate : "",
    siteClassNamespace: ctx.siteClassNamespace || null,
    catalogSeedKey: `${ctx.structureFingerprint || ""}|${ctx.buildNonce || ""}`,
    strictEtalonLayout: Boolean(ctx.strictEtalonLayout),
    allPages: ctx.allPages || [],
    projectSlug: ctx.projectSlug || "",
    siteGenerationRulesBlock: ctx.siteGenerationRulesBlock || "",
    sourceArticlesOverlay,
  });

  let user = userBase;
  const pageQualityRetryAttempt =
    Math.max(
      Number(ctx.similarityRetryCount) || 0,
      Number(ctx.wordCountRetryCount) || 0,
      Number(ctx.wordCountOverMaxRetryCount) || 0
    ) > 0;
  const runPagePromptRewrite =
    isPromptRewriteEnabled() &&
    (!pageQualityRetryAttempt || PROMPT_REWRITE_PAGE_ON_RETRY) &&
    !Boolean(ctx.referenceBlendMode) &&
    !pageReferenceTemplateMode;
  if (runPagePromptRewrite) {
    try {
      user = await rewritePromptByClaude({
        claudeApiKey,
        promptType: `page:${pageMeta.file}`,
        seed: `${ctx.buildNonce}|${pageMeta.file}|retry:${retryStep}`,
        basePrompt: userBase,
        onLog,
        shouldStop: ctx.shouldStop,
        budgetTracker: ctx.claudeBudgetTracker,
      });
      emitLog(
        onLog,
        `Prompt rewrite: ${pageMeta.file} (${Math.min(99999, user.length)} chars)`
      );
    } catch (e) {
      emitLog(
        onLog,
        `Prompt rewrite (${pageMeta.file}) skipped: ${String(e?.message || e).slice(0, 180)}`
      );
      user = userBase;
    }
  } else if (isPromptRewriteEnabled() && pageQualityRetryAttempt) {
    emitLog(
      onLog,
      `Prompt rewrite: «${pageMeta.file}» пропущен при перегенерации страницы (SOFTGEN_PROMPT_REWRITE_PAGE_ON_RETRY=0) — base prompt + слои retry`
    );
  }

  const sp = ctx.sitePalette || {};
  const bgS = sp.bg ?? BRAND_BG;
  const cardS = sp.card ?? BRAND_CARD;
  const blockS = sp.block ?? BRAND_BLOCK;
  const accS = sp.accent ?? BRAND_ACCENT;
  const fontS = sp.fontStack ?? "Arial, sans-serif";
  const minWordsDs =
    Number(ctx.minPageWords) || minWordsTargetForPageFile(pageMeta.file);
  const pageTemp = Math.min(
    GENERATION_TEMPERATURE,
    readPromptTemperatureEnv("SOFTGEN_PAGE_TEMPERATURE", PAGE_JSON_TEMPERATURE)
  );
  const systemDeepseekPage =
    buildPageJsonSystemPrompt({
      minWords: minWordsDs,
      bg: bgS,
      card: cardS,
      block: blockS,
      accent: accS,
      fontStack: fontS,
      strictEtalonDom: Boolean(ctx.strictEtalonLayout),
    }) +
    " " +
    buildQualityAndSeoPriorityBlock("system") +
    " " +
    "Финальный русский текст без @@PHn@@. " +
    "Не используй Tailwind bg-slate/bg-zinc/bg-blue для обложки. Приоритет абзацам <p>, не коллажу картинок.";

  const systemDeepseekRetry =
    systemDeepseekPage +
    " Прошлый ответ был невалидным JSON или обрезан: укороти только pageCss/pageJs; НЕ сокращай headHtml ниже полного <head>…</head> с charset/viewport/title/description/canonical/scripts как в шаблоне user; не вырезай контентные абзацы из mainHtml; сохрани полные headerHtml и footerHtml если они не пустые в user-запросе. " +
    "Проверь, что весь JSON парсится (закрыты все кавычки и скобки).";

  const systemJsFixDeepseek =
    "Ты исправляешь один JSON-объект страницы (без markdown). После склейки служебного runtime и pageJs синтаксис JS невалиден. " +
    "Верни полный JSON; исправь ТОЛЬКО pageJs: корректный JavaScript для браузера без import/export, TypeScript и JSX; при необходимости оберни в (function(){ ... })(); " +
    "не дублируй имена переменных из типичных паттернов вроде $$ или gateway. Остальные поля сохрани как в запросе.";

  const regenOverlay = buildPageRegenFailureOverlay(ctx.pageRegenReason);
  const userWithLayout = `${user}${regenOverlay}${LAYOUT_PLACEHOLDER_BLOCK}`;

  let data;
  let lastParseError = null;
  let lastLayoutModelText = "";
  const pageLayoutAttempts = getPageLayoutLlmAttempts();
  for (let attempt = 1; attempt <= pageLayoutAttempts; attempt++) {
    if (attempt > 1) {
      emitLog(
        onLog,
        `Повтор запроса «${pageMeta.file}» (${attempt - 1}/${pageLayoutAttempts - 1}): прошлый ответ модели с битым JSON или пустой`
      );
    }
    const text = await callDeepseekChat({
      apiKey: claudeApiKey,
      system: attempt === 1 ? systemDeepseekPage : systemDeepseekRetry,
      user: userWithLayout,
      maxTokens: claudePageCap,
      temperature: pageTemp,
      onLog,
      shouldStop: ctx.shouldStop,
      budgetTracker: ctx.claudeBudgetTracker,
    });
    lastLayoutModelText = text;
    if (isTrivialLayoutModelText(text)) {
      lastParseError = new Error("пустой или слишком короткий ответ модели");
      data = null;
      if (attempt < pageLayoutAttempts) {
        await sleepMs(getRetryDelayMs(attempt));
        continue;
      }
      break;
    }
    try {
      data = parsePageBundleFromModelText(
        text,
        pageMeta.file,
        `p${pageIndex}_${ctx.buildNonce.slice(0, 10)}_`
      );
      lastParseError = null;
      break;
    } catch (e) {
      lastParseError = e;
      data = null;
      if (attempt < pageLayoutAttempts) {
        await sleepMs(getRetryDelayMs(attempt));
      }
    }
  }

  if (!data) {
    throw new Error(
      `Страница ${pageMeta.file}: не удалось разобрать ответ LLM — ${lastParseError?.message || "unknown"}`
    );
  }

  if (!data.mainHtml) {
    throw new Error(`Страница ${pageMeta.file}: пустой mainHtml.`);
  }

  if (ctx.strictEtalonLayout && ctx.clonedMainByFile?.[pageMeta.file]) {
    data.mainHtml = ctx.clonedMainByFile[pageMeta.file];
    data.pageCss = "";
    emitLog(
      onLog,
      `Эталон: «${pageMeta.file}» — mainHtml (механическая подстановка, DOM 1:1).`
    );
  }

  let headForFill = String(data.headHtml || "");
  let mainForFill = String(data.mainHtml || "");
  const phKeys = collectPhPlaceholders(headForFill, mainForFill);
  if (phKeys.length) {
    emitLog(
      onLog,
      `LLM: «${pageMeta.file}» — Claude заполняет ${phKeys.length} плейсхолдеров @@PHn@@…`
    );
    const cap = Math.min(
      PAGE_MAX_TOKENS,
      Number(ctx.requestTokenCap) || PAGE_MAX_TOKENS
    );
    const fillSys =
      "Отвечай только валидным JSON без markdown и без текста до/после. Поле replacements: объект; ключи — точные строки @@PHn@@ из запроса user; значения — финальный русский текст или короткий HTML-фрагмент для подстановки вместо маркера (без обрамления ```). " +
      `Каждое значение для маркера внутри <main> — развёрнуто: по возможности 2–5 предложений или полноценный список, не одно короткое предложение. Не добавляй новых ключей, которых не было в списке. Соблюдай объём: суммарно значения replacements для маркеров внутри <main> должны давать не меньше ${Number(ctx.minPageWords) || minWordsTargetForPageFile(pageMeta.file)} слов русского текста после подстановки (ориентир ${Number(ctx.minPageWords) || minWordsTargetForPageFile(pageMeta.file)}–${MAX_PAGE_WORDS}; не оставляй заглушки вроде «текст»).`;
    const strictPlaceholderFill =
      String(process.env.SOFTGEN_STRICT_PLACEHOLDER_FILL || "").trim() === "1";
    let lastFillError = null;
    for (let attempt = 1; attempt <= TEXT_FILL_MAX_ATTEMPTS; attempt++) {
      const remaining = collectPhPlaceholders(headForFill, mainForFill);
      if (!remaining.length) {
        data.headHtml = headForFill;
        data.mainHtml = mainForFill;
        lastFillError = null;
        break;
      }
      if (attempt > 1) {
        await sleepMs(getRetryDelayMs(attempt - 1));
      }
      const fillUserBase = buildPageTextFillUser({
        theme: ctx.theme,
        pageMeta,
        avoidPhrases: ctx.avoidPhrases || [],
        brandTerms: ctx.brandTerms || [],
        minPageWords:
          Number(ctx.minPageWords) || minWordsTargetForPageFile(pageMeta.file),
        headHtml: headForFill,
        mainHtml: mainForFill,
        placeholders: remaining,
      });
      const fillUser =
        attempt === 1
          ? fillUserBase
          : `${fillUserBase}\n\n--- ПОВТОР ${attempt}/${TEXT_FILL_MAX_ATTEMPTS} ---\nПредыдущая попытка не удалила все маркеры из HTML. Причина: ${lastFillError || "—"}\nВерни один JSON-объект с полем replacements, где присутствуют ВСЕ ключи ниже (точное совпадение строки ключа). Значения — осмысленный русский текст/HTML, не пустые строки и не заглушки.\nОбязательные ключи: ${remaining.join(", ")}`;
      try {
        const fillRaw = await callClaudeOnly({
          apiKey: claudeApiKey,
          system: fillSys,
          user: fillUser,
          maxTokens: cap,
          temperature: Math.min(GENERATION_TEMPERATURE, 0.9),
          onLog,
          shouldStop: ctx.shouldStop,
          budgetTracker: ctx.claudeBudgetTracker,
        });
        const fillData = extractJsonObject(fillRaw);
        const rep =
          fillData.replacements && typeof fillData.replacements === "object"
            ? fillData.replacements
            : {};
        const repKeys = Object.keys(rep).filter((k) => /^@@PH\d+@@$/.test(k));
        if (!repKeys.length && remaining.length) {
          throw new Error(
            "В ответе нет replacements с ключами вида @@PHn@@ (пустой объект или неверные ключи)."
          );
        }
        headForFill = applyPlaceholderReplacements(headForFill, rep);
        mainForFill = applyPlaceholderReplacements(mainForFill, rep);
        const after = collectPhPlaceholders(headForFill, mainForFill);
        if (after.length) {
          lastFillError = `после подстановки остались: ${after.slice(0, 40).join(", ")}${after.length > 40 ? "…" : ""}`;
          emitLog(
            onLog,
            `Claude text-fill «${pageMeta.file}» (${attempt}/${TEXT_FILL_MAX_ATTEMPTS}): ${lastFillError}`
          );
          if (attempt >= TEXT_FILL_MAX_ATTEMPTS) {
            if (strictPlaceholderFill) {
              throw new Error(
                `Страница ${pageMeta.file}: после ${TEXT_FILL_MAX_ATTEMPTS} попыток Claude text-fill остались плейсхолдеры @@PHn@@ (${after.length} шт.). ${lastFillError}`
              );
            }
            emitLog(
              onLog,
              `Предупреждение: «${pageMeta.file}» — после ${TEXT_FILL_MAX_ATTEMPTS} попыток Claude text-fill остались маркеры @@PHn@@ (${after.length} шт.). ${lastFillError} Сохраняем вёрстку и продолжаем со следующей страницы.`
            );
            data.headHtml = headForFill;
            data.mainHtml = mainForFill;
            lastFillError = null;
            break;
          }
          continue;
        }
        lastFillError = null;
        data.headHtml = headForFill;
        data.mainHtml = mainForFill;
        break;
      } catch (e) {
        lastFillError = e instanceof Error ? e.message : String(e);
        emitLog(
          onLog,
          `Claude text-fill «${pageMeta.file}» (${attempt}/${TEXT_FILL_MAX_ATTEMPTS}): ${lastFillError}`
        );
        if (attempt >= TEXT_FILL_MAX_ATTEMPTS) {
          if (strictPlaceholderFill) {
            throw new Error(
              `Страница ${pageMeta.file}: Claude text-fill не удался после ${TEXT_FILL_MAX_ATTEMPTS} попыток — ${lastFillError}`
            );
          }
          emitLog(
            onLog,
            `Предупреждение: «${pageMeta.file}» — Claude text-fill после ${TEXT_FILL_MAX_ATTEMPTS} попыток: ${lastFillError} Сохраняем вёрстку с плейсхолдерами и продолжаем со следующей страницы.`
          );
          data.headHtml = headForFill;
          data.mainHtml = mainForFill;
          lastFillError = null;
          break;
        }
      }
    }
  } else {
    emitLog(
      onLog,
      `Предупреждение: «${pageMeta.file}» — нет @@PHn@@ во вёрстке, Claude text-fill пропущен`
    );
  }

  /** Після text-fill / fix JS зберігаємо head, main і AI-chrome (шапка/підвал). */
  const mainHeadAfterLayoutAndFill = {
    headHtml: String(data.headHtml || ""),
    mainHtml: String(data.mainHtml || ""),
    headerHtml: String(data.headerHtml || ""),
    footerHtml: String(data.footerHtml || ""),
  };

  const runtimeBlock = buildInteractionRuntime(
    ctx.gatewayUrl || DEFAULT_GATEWAY_URL
  );
  for (let j = 0; j < 2; j++) {
    const assembledJs = `${runtimeBlock}\n\n${String(data.pageJs || "")}`;
    const jsErr = getJsSyntaxError(assembledJs);
    if (!jsErr) break;
    emitLog(
      onLog,
      `Синтаксис page.js: ${jsErr} — исправление через LLM (${j + 1}/2)…`
    );
    const fixUser = `${userWithLayout}\n\n---\nОШИБКА: итоговый скрипт страницы (runtime + pageJs) не парсится: ${jsErr}\nВерни полный валидный JSON с исправленным pageJs.`;
    let textJs;
    try {
      textJs = await callDeepseekChat({
        apiKey: claudeApiKey,
        system: systemJsFixDeepseek,
        user: fixUser,
        maxTokens: Math.min(JS_FIX_MAX_TOKENS, claudePageCap),
        temperature: Math.min(GENERATION_TEMPERATURE, 0.82),
        onLog,
        shouldStop: ctx.shouldStop,
        budgetTracker: ctx.claudeBudgetTracker,
      });
    } catch (e) {
      emitLog(onLog, `Запрос исправления pageJs не удался: ${e?.message || e}`);
      break;
    }
    try {
      lastLayoutModelText = textJs;
      data = parsePageBundleFromModelText(
        textJs,
        pageMeta.file,
        `p${pageIndex}_${ctx.buildNonce.slice(0, 10)}_`
      );
      if (!data.mainHtml) throw new Error("пустой mainHtml");
      data.headHtml = mainHeadAfterLayoutAndFill.headHtml;
      data.mainHtml = mainHeadAfterLayoutAndFill.mainHtml;
      data.headerHtml = mainHeadAfterLayoutAndFill.headerHtml;
      data.footerHtml = mainHeadAfterLayoutAndFill.footerHtml;
    } catch (e) {
      emitLog(
        onLog,
        `Ответ исправления pageJs: невалидный JSON — ${e?.message || e}`
      );
      break;
    }
  }
  const assembledFinal = `${runtimeBlock}\n\n${String(data.pageJs || "")}`;
  if (getJsSyntaxError(assembledFinal)) {
    emitLog(
      onLog,
      "pageJs по-прежнему с синтаксической ошибкой — записываем только встроенный runtime."
    );
    data.pageJs = "";
  }

  let headBlock = normalizeEscapedHtmlFragment(
    String(data.headHtml || data.headExtra || "")
  );
  if (!/^<head\b/i.test(headBlock)) {
    emitLog(
      onLog,
      `Предупреждение: «${pageMeta.file}» — headHtml без тега <head> (часто обрезка JSON); восстановление.`
    );
    headBlock = repairHeadHtmlFromModelOutput(
      data.headHtml || data.headExtra,
      lastLayoutModelText
    );
  }

  const slugScrubRep =
    String(ctx.publicBrandName || "").trim() ||
    String(ctx.themeBrandHint || "").trim();
  if (slugScrubRep && String(ctx.projectSlug || "").trim()) {
    headBlock = scrubTechnicalProjectSlugFromHtml(
      headBlock,
      ctx.projectSlug,
      slugScrubRep
    );
  }

  headBlock = ensureHeadSeoTags(headBlock, pageMeta);
  headBlock = sanitizeMultipageHeadHtml(headBlock, ctx.baseUrl, pageMeta.file);
  headBlock = ensureMultipageHeadPipeline(
    headBlock,
    pageIndex,
    ctx.sitePalette,
    ctx.logoSrc || LAKI_LOGO_IMG_SRC,
    `${ctx.structureSeed || ""}|${ctx.buildNonce || ""}|${ctx.projectSlug || ""}`,
    {
      includeIgamingCss:
        Boolean(ctx.needsIgamingCss) ||
        markupUsesIgamingComponents(
          `${data.mainHtml || ""} ${data.headerHtml || ""} ${data.footerHtml || ""}`
        ),
      includeSiteShellCss: Boolean(ctx.needsSiteShellCss),
    }
  );

  const shell = ctx.chromeShell || { includeHeader: true, includeFooter: true };
  const classPrefix =
    ctx.siteClassNamespace?.bemPrefix ||
    buildSiteClassNamespace(
      ctx.publicBrandName || ctx.themeBrandHint || "site",
      `${ctx.structureSeed || ""}|${ctx.buildNonce || ""}`
    ).bemPrefix;
  const pageSiteTemplateAsm = resolvePageSiteTemplate(
    ctx.referenceStructureSignals || {},
    pageMeta.file
  );
  const brandSanitizeOpts = {
    brandName:
      String(ctx.publicBrandName || "").trim() ||
      String(ctx.themeBrandHint || "").trim() ||
      "Бренд",
    logoSrc: ctx.logoSrc || LAKI_LOGO_IMG_SRC,
    allowedImageNames: ctx.imageFiles || [],
  };
  const skins =
    ctx.chromeLayoutSkins ||
    pickChromeLayoutSkins(ctx.structureSeed || ctx.siteSeed || "0");
  const refAsmSig = ctx.referenceStructureSignals || {};
  const tplChrome = refAsmSig.chromeByTemplate?.[pageSiteTemplateAsm] || null;
  const refAsmHdrTpl = String(
    pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
      ? tplChrome?.headerHtml || refAsmSig.referenceRailTemplate || ""
      : tplChrome?.headerHtml || refAsmSig.referenceHeaderTemplate || ""
  ).trim();
  const refAsmFtrTpl = String(
    pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
      ? tplChrome?.footerHtml || refAsmSig.referenceRichFooterTemplate || ""
      : tplChrome?.footerHtml || refAsmSig.referenceFooterTemplate || ""
  ).trim();
  const refChromeTplPresent =
    refAsmHdrTpl.length > 0 || refAsmFtrTpl.length > 0;
  const sharedPresetChromeMode =
    usesDualSiteTemplates() && !ctx.strictEtalonLayout;
  const useRefChromeAssembly =
    (Boolean(ctx.strictEtalonLayout) && Boolean(ctx.clonedChrome)) ||
    (refChromeTplPresent &&
      !sharedPresetChromeMode &&
      (Boolean(ctx.referenceBlendMode) || pageReferenceTemplateMode));
  const useTemplateChrome =
    ctx.useTemplateChrome !== false &&
    (usesTemplateChrome() || usesDualSiteTemplates());
  const minRefChromeHtmlLen = 48;
  const chromeAliasSeed = `${ctx.structureSeed || ""}|${ctx.buildNonce || ""}|${pageSiteTemplateAsm}`;
  const headerChromeOpts = {
    ...(ctx.chromeContentOptions || {}),
    gatewayUrl: ctx.gatewayUrl || DEFAULT_GATEWAY_URL,
    logoSrc: ctx.logoSrc || LAKI_LOGO_IMG_SRC,
    brandAlt:
      String(ctx.publicBrandName || "").trim() ||
      String(ctx.themeBrandHint || "").trim() ||
      "Логотип",
    brandName:
      String(ctx.publicBrandName || "").trim() ||
      String(ctx.themeBrandHint || "").trim() ||
      "Бренд",
  };
  let headerBlock = "";
  let footerBlock = "";
  if (ctx.strictEtalonLayout && ctx.clonedChrome) {
    if (shell.includeHeader && ctx.clonedChrome.headerHtml) {
      headerBlock = enforceCanonicalLogoInChromeHtml(
        stripUnsafeChromeMarkup(String(ctx.clonedChrome.headerHtml || "").trim()),
        ctx.logoSrc || LAKI_LOGO_IMG_SRC
      );
    }
    if (shell.includeFooter && ctx.clonedChrome.footerHtml) {
      footerBlock = enforceCanonicalLogoInChromeHtml(
        stripUnsafeChromeMarkup(String(ctx.clonedChrome.footerHtml || "").trim()),
        ctx.logoSrc || LAKI_LOGO_IMG_SRC
      );
    }
  }
  if (shell.includeHeader && !headerBlock) {
    if (useTemplateChrome && !useRefChromeAssembly) {
      if (
        sharedPresetChromeMode &&
        pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
      ) {
        headerBlock = resolveSpot064RailHtml(
          ctx,
          pageMeta,
          headerChromeOpts,
          ctx.sharedHeaderPresetId || 1
        );
      } else if (sharedPresetChromeMode) {
        headerBlock = applyChromeAliasClasses(
          enforceCanonicalLogoInChromeHtml(
            buildSharedTemplateHeaderHtml({
              presetId: ctx.sharedHeaderPresetId || 1,
              templateId: ctx.siteChromeTemplateId || pageSiteTemplateAsm,
              variant: ctx.chromeVariant,
              navLinks: ctx.navLinks || [],
              gatewayUrl: headerChromeOpts.gatewayUrl,
              logoSrc: headerChromeOpts.logoSrc,
              brandAlt: headerChromeOpts.brandAlt,
              ctaPrimary: ctx.chromeVariant?.ctaPrimary,
              ctaSecondary: ctx.chromeVariant?.ctaSecondary,
            }),
            ctx.logoSrc || LAKI_LOGO_IMG_SRC
          ),
          { seed: chromeAliasSeed, kind: "h", variantNo: Number(ctx.sharedHeaderPresetId) || 1 }
        );
      } else if (pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064) {
        const etalonRail = stripUnsafeChromeMarkup(
          String(refAsmHdrTpl || "").trim()
        );
        headerBlock =
          etalonRail && /<aside\b/i.test(etalonRail)
            ? enforceCanonicalLogoInChromeHtml(
                etalonRail,
                ctx.logoSrc || LAKI_LOGO_IMG_SRC
              )
            : resolveSpot064RailHtml(
                ctx,
                pageMeta,
                headerChromeOpts,
                skins.headerSkin || 1
              );
      } else {
        headerBlock = enforceCanonicalLogoInChromeHtml(
          buildBrandHeaderHtml(
            ctx.chromeVariant,
            ctx.navLinks || [],
            skins.headerSkin,
            headerChromeOpts
          ),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    } else if (useRefChromeAssembly && refAsmHdrTpl) {
      const cand = sanitizeModelChromeFragment(
        String(data.headerHtml || "").trim()
      );
      if (
        (isWellFormedChromeFragment(cand, "header") ||
          (pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064 &&
            isSpot064RailBlock(cand))) &&
        cand.length >= minRefChromeHtmlLen
      ) {
        headerBlock = enforceCanonicalLogoInChromeHtml(
          cand,
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else if (useTemplateChrome) {
        emitLog(
          onLog,
          pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
            ? `Референс-chrome: «${pageMeta.file}» — нет валидного rail, подставляем lw-site-rail.`
            : `Референс-chrome: «${pageMeta.file}» — нет валидного headerHtml, подставляем lw-шапку.`
        );
        headerBlock =
          pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
            ? resolveSpot064RailHtml(
                ctx,
                pageMeta,
                headerChromeOpts,
                ctx.sharedHeaderPresetId || skins.headerSkin || 1
              )
            : enforceCanonicalLogoInChromeHtml(
                buildBrandHeaderHtml(
                  ctx.chromeVariant,
                  ctx.navLinks || [],
                  skins.headerSkin,
                  headerChromeOpts
                ),
                ctx.logoSrc || LAKI_LOGO_IMG_SRC
              );
      } else {
        emitLog(
          onLog,
          pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
            ? `Референс-chrome: «${pageMeta.file}» — нет валидного rail, подставляем компактный rail-fallback.`
            : `Референс-chrome: «${pageMeta.file}» — нет валидного headerHtml, подставляем компактную AI-шапку.`
        );
        headerBlock = enforceCanonicalLogoInChromeHtml(
          spot064OrCompactHeaderFallback(
            pageSiteTemplateAsm,
            ctx,
            pageMeta,
            headerChromeOpts,
            classPrefix,
            ctx.sharedHeaderPresetId || 1
          ),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    } else {
      const cand = sanitizeModelChromeFragment(
        String(data.headerHtml || "").trim()
      );
      if (
        (isWellFormedChromeFragment(cand, "header") ||
          (pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064 &&
            isSpot064RailBlock(cand))) &&
        cand.length >= minRefChromeHtmlLen
      ) {
        headerBlock = enforceCanonicalLogoInChromeHtml(
          cand,
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else if (useTemplateChrome) {
        headerBlock =
          pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
            ? resolveSpot064RailHtml(
                ctx,
                pageMeta,
                headerChromeOpts,
                ctx.sharedHeaderPresetId || skins.headerSkin || 1
              )
            : enforceCanonicalLogoInChromeHtml(
                buildBrandHeaderHtml(
                  ctx.chromeVariant,
                  ctx.navLinks || [],
                  skins.headerSkin,
                  headerChromeOpts
                ),
                ctx.logoSrc || LAKI_LOGO_IMG_SRC
              );
      } else {
        emitLog(
          onLog,
          pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
            ? `«${pageMeta.file}» — нет валидного rail от модели, подставляем lw-site-rail.`
            : `«${pageMeta.file}» — нет валидного headerHtml от модели, подставляем компактную AI-шапку.`
        );
        headerBlock = enforceCanonicalLogoInChromeHtml(
          spot064OrCompactHeaderFallback(
            pageSiteTemplateAsm,
            ctx,
            pageMeta,
            headerChromeOpts,
            classPrefix,
            ctx.sharedHeaderPresetId || 1
          ),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    }
  }
  const footerBrandName =
    String(ctx.publicBrandName || "").trim() ||
    String(ctx.themeBrandHint || "").trim() ||
    "Бренд";
  const footerOpts = {
    brandName: footerBrandName,
    logoSrc: ctx.logoSrc || LAKI_LOGO_IMG_SRC,
    footerShowLogo: ctx.chromeContentOptions?.footerShowLogo !== false,
  };
  if (shell.includeFooter && !footerBlock) {
    const navEntries = buildOrderedNavEntries(
      ctx.chromeVariant,
      ctx.navLinks || []
    );
    const footerLinks = navEntries.slice(0, 3).map((e) => ({
      href: e.href,
      label: e.label,
    }));
    if (useTemplateChrome && !useRefChromeAssembly) {
      if (sharedPresetChromeMode) {
        footerBlock = applyChromeAliasClasses(
          enforceCanonicalLogoInChromeHtml(
            buildSharedTemplateFooterHtml({
              presetId: ctx.sharedFooterPresetId || 1,
              templateId: ctx.siteChromeTemplateId || pageSiteTemplateAsm,
              brandName: footerBrandName,
              variant: ctx.chromeVariant,
              footerLinks,
              showFooterLogo: footerOpts.footerShowLogo !== false,
              logoSrc: footerOpts.logoSrc,
            }),
            ctx.logoSrc || LAKI_LOGO_IMG_SRC
          ),
          { seed: chromeAliasSeed, kind: "f", variantNo: Number(ctx.sharedFooterPresetId) || 1 }
        );
      } else {
        footerBlock = enforceCanonicalLogoInChromeHtml(
          buildBrandFooterHtml({
            brandName: footerBrandName,
            variant: ctx.chromeVariant,
            footerLinks,
            footerSkin: skins.footerSkin,
            showFooterLogo: footerOpts.footerShowLogo !== false,
            logoSrc: footerOpts.logoSrc,
          }),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    } else if (useRefChromeAssembly && refAsmFtrTpl) {
      const cand = sanitizeModelChromeFragment(
        String(data.footerHtml || "").trim()
      );
      if (
        isWellFormedChromeFragment(cand, "footer") &&
        cand.length >= minRefChromeHtmlLen
      ) {
        footerBlock = enforceCanonicalLogoInChromeHtml(
          cand,
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else if (useTemplateChrome) {
        emitLog(
          onLog,
          `Референс-chrome: «${pageMeta.file}» — нет валидного footerHtml, подставляем lw-подвал.`
        );
        footerBlock = enforceCanonicalLogoInChromeHtml(
          buildBrandFooterHtml({
            brandName: footerBrandName,
            variant: ctx.chromeVariant,
            footerLinks,
            footerSkin: skins.footerSkin,
            showFooterLogo: footerOpts.footerShowLogo !== false,
            logoSrc: footerOpts.logoSrc,
          }),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else {
        emitLog(
          onLog,
          `Референс-chrome: «${pageMeta.file}» — нет валидного footerHtml, подставляем компактный AI-подвал.`
        );
        footerBlock = enforceCanonicalLogoInChromeHtml(
          buildFallbackAiChromeFooter(
            classPrefix,
            ctx.chromeVariant,
            ctx.navLinks || [],
            footerOpts
          ),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    } else {
      const cand = sanitizeModelChromeFragment(
        String(data.footerHtml || "").trim()
      );
      if (
        isWellFormedChromeFragment(cand, "footer") &&
        cand.length >= minRefChromeHtmlLen
      ) {
        footerBlock = enforceCanonicalLogoInChromeHtml(
          cand,
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else if (useTemplateChrome) {
        footerBlock = enforceCanonicalLogoInChromeHtml(
          buildBrandFooterHtml({
            brandName: footerBrandName,
            variant: ctx.chromeVariant,
            footerLinks,
            footerSkin: skins.footerSkin,
            showFooterLogo: footerOpts.footerShowLogo !== false,
            logoSrc: footerOpts.logoSrc,
          }),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      } else {
        emitLog(
          onLog,
          `«${pageMeta.file}» — нет валидного footerHtml от модели, подставляем компактный AI-подвал.`
        );
        footerBlock = enforceCanonicalLogoInChromeHtml(
          buildFallbackAiChromeFooter(
            classPrefix,
            ctx.chromeVariant,
            ctx.navLinks || [],
            footerOpts
          ),
          ctx.logoSrc || LAKI_LOGO_IMG_SRC
        );
      }
    }
  }
  if (slugScrubRep && String(ctx.projectSlug || "").trim()) {
    headerBlock = scrubTechnicalProjectSlugFromHtml(
      headerBlock,
      ctx.projectSlug,
      slugScrubRep
    );
    footerBlock = scrubTechnicalProjectSlugFromHtml(
      footerBlock,
      ctx.projectSlug,
      slugScrubRep
    );
  }
  if (
    shell.includeHeader &&
    headerBlock &&
    !/<header\b/i.test(headerBlock) &&
    !/<aside\b/i.test(headerBlock) &&
    !/partials\/site-rail\.php/i.test(headerBlock)
  ) {
    emitLog(
      onLog,
      `Предупреждение: «${pageMeta.file}» — headerHtml без тега <header>; оборачиваем.`
    );
    headerBlock = `<header class="${classPrefix}ai-chrome">${headerBlock}</header>`;
  }
  if (shell.includeFooter && footerBlock && !/<footer\b/i.test(footerBlock)) {
    emitLog(
      onLog,
      `Предупреждение: «${pageMeta.file}» — footerHtml без тега <footer>; оборачиваем.`
    );
    footerBlock = `<footer class="${classPrefix}ai-footer" id="footer">${footerBlock}</footer>`;
  }
  const headerChromeOk =
    headerBlock &&
    (isWellFormedChromeFragment(headerBlock, "header") ||
      (pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064 &&
        isSpot064RailBlock(headerBlock) &&
        !isBrokenLwSiteRailFragment(headerBlock)));
  if (
    shell.includeHeader &&
    ctx.spot064RailPartialReady &&
    pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064 &&
    isBrokenLwSiteRailFragment(headerBlock)
  ) {
    emitLog(
      onLog,
      `«${pageMeta.file}» — зламаний lw-site-rail від моделі, підставляємо partials/site-rail.php.`
    );
    headerBlock = buildSpot064RailInclude(pageMeta.file);
  }
  if (shell.includeHeader && !headerChromeOk) {
    emitLog(
      onLog,
      pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
        ? `«${pageMeta.file}» — гарантированный lw-site-rail (модель не дала валидный rail).`
        : `«${pageMeta.file}» — гарантированная AI-шапка (модель не дала валидный header).`
    );
    headerBlock = enforceCanonicalLogoInChromeHtml(
      spot064OrCompactHeaderFallback(
        pageSiteTemplateAsm,
        ctx,
        pageMeta,
        headerChromeOpts,
        classPrefix,
        ctx.sharedHeaderPresetId || 1
      ),
      ctx.logoSrc || LAKI_LOGO_IMG_SRC
    );
  }
  if (shell.includeFooter && (!footerBlock || !isWellFormedChromeFragment(footerBlock, "footer"))) {
    emitLog(
      onLog,
      `«${pageMeta.file}» — гарантированный AI-подвал (модель не дала валидный footer).`
    );
    footerBlock = enforceCanonicalLogoInChromeHtml(
      buildFallbackAiChromeFooter(
        classPrefix,
        ctx.chromeVariant,
        ctx.navLinks || [],
        footerOpts
      ),
      ctx.logoSrc || LAKI_LOGO_IMG_SRC
    );
  }
  const siteChromeTpl =
    (usesDualSiteTemplates() &&
      ctx.siteCanonicalChromeByTemplate?.[pageSiteTemplateAsm]) ||
    null;
  const siteChrome = siteChromeTpl || ctx.siteCanonicalChrome || null;
  if (
    usesPremiumIgamingLayout() &&
    !useTemplateChrome &&
    !useRefChromeAssembly &&
    siteChrome
  ) {
    if (shell.includeHeader && siteChrome.headerHtml) {
      headerBlock = enforceCanonicalLogoInChromeHtml(
        siteChrome.headerHtml,
        ctx.logoSrc || LAKI_LOGO_IMG_SRC
      );
    }
    if (shell.includeFooter && siteChrome.footerHtml) {
      footerBlock = enforceCanonicalLogoInChromeHtml(
        siteChrome.footerHtml,
        ctx.logoSrc || LAKI_LOGO_IMG_SRC
      );
    }
  }
  const gwNormOpts = {
    gatewayUrl: ctx.gatewayUrl || DEFAULT_GATEWAY_URL,
    brandName:
      String(ctx.publicBrandName || "").trim() ||
      String(ctx.themeBrandHint || "").trim() ||
      "",
  };
  if (headerBlock) {
    headerBlock = repairCorruptedHtmlMarkup(headerBlock);
    headerBlock = normalizeGatewayUrlsInHtml(
      headerBlock,
      gwNormOpts.gatewayUrl,
      gwNormOpts.brandName
    );
    headerBlock = enforceRegistrationCtasToGateway(
      headerBlock,
      gwNormOpts.gatewayUrl
    );
  }
  if (footerBlock) {
    footerBlock = repairCorruptedHtmlMarkup(footerBlock);
    footerBlock = normalizeGatewayUrlsInHtml(
      footerBlock,
      gwNormOpts.gatewayUrl,
      gwNormOpts.brandName
    );
  }
  let mainRaw = ctx.strictEtalonLayout && ctx.clonedMainByFile?.[pageMeta.file]
    ? ctx.clonedMainByFile[pageMeta.file]
    : normalizeEscapedHtmlFragment(String(data.mainHtml));
  mainRaw = ensureMainClosedBeforeChrome(mainRaw);
  mainRaw = repairCorruptedHtmlMarkup(mainRaw);
  mainRaw = normalizeGatewayUrlsInHtml(
    mainRaw,
    gwNormOpts.gatewayUrl,
    gwNormOpts.brandName
  );
  mainRaw = enforceRegistrationCtasToGateway(mainRaw, gwNormOpts.gatewayUrl);
  mainRaw = rewriteProseGatewayAnchorsInMainToInternal(
    mainRaw,
    pageMeta,
    ctx.allPages,
    ctx.gatewayUrl
  );
  mainRaw = rewriteInternalLinksInMainToPlan(
    mainRaw,
    ctx.allPages,
    pageMeta.file
  );
  if (!ctx.strictEtalonLayout) {
    mainRaw = enforceForBanerUsage(
      mainRaw,
      classPrefix,
      ctx.imageFiles,
      ctx.sitePalette
    );
    mainRaw = patchMainCtaContrast(mainRaw, ctx.sitePalette);
    mainRaw = repairBareActionControls(mainRaw);
    mainRaw = flattenShallowWrapperDivsInMain(mainRaw);
    mainRaw = ensureLwGamesSectionOnIndex(mainRaw, {
      pageFile: pageMeta.file,
      isIndex: isIndexPageFile(pageMeta.file),
      gameSlotPaths: ctx.gameSlotPaths || [],
      classPrefix,
      gatewayUrl: gwNormOpts.gatewayUrl,
    });
    if (isIndexPageFile(pageMeta.file) && (ctx.gameSlotPaths || []).length) {
      mainRaw = sanitizeLwGamesSectionImages(mainRaw, ctx.gameSlotPaths);
      if (ctx.homeGamesMode === "tabs" && (ctx.gameTabSlotBatches || []).length) {
        mainRaw = enforceLwGamesTabSlotImages(mainRaw, ctx.gameTabSlotBatches);
      }
    }
  }
  let mainOnly = enforceHeadlineLength(mainRaw);
  if (slugScrubRep && String(ctx.projectSlug || "").trim()) {
    mainOnly = scrubTechnicalProjectSlugFromHtml(
      mainOnly,
      ctx.projectSlug,
      slugScrubRep
    );
  }
  if (!mainOnly.toLowerCase().includes("<main")) {
    throw new Error(`Страница ${pageMeta.file}: нет тега <main>.`);
  }

  headBlock = sanitizeBrandLeaksInHtml(headBlock, brandSanitizeOpts);
  headerBlock = sanitizeBrandLeaksInHtml(headerBlock, brandSanitizeOpts);
  footerBlock = sanitizeBrandLeaksInHtml(footerBlock, brandSanitizeOpts);
  mainOnly = sanitizeBrandLeaksInHtml(mainOnly, brandSanitizeOpts);

  const bodyInner =
    pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064
      ? `${headerBlock}
<div class="lw-site-col">
${mainOnly}
${footerBlock}
</div>`
      : `${headerBlock}
${mainOnly}
${footerBlock}`;
  const bodyClass =
    pageSiteTemplateAsm === SITE_TEMPLATE_SPOT064 ? ' class="has-lw-rail"' : "";
  const withChrome = `<!DOCTYPE html>
<html lang="ru-RU">
${headBlock}
<body${bodyClass}>
${bodyInner}
</body>
</html>`;

  let finalHtml = ensureFaviconInHead(rewriteAssetPaths(withChrome));
  finalHtml = applyMultipageHtmlPostprocess(finalHtml, {
    currentPageFile: pageMeta.file,
    navLinks: ctx.navLinks || [],
    chromeVariant: ctx.chromeVariant,
    pages: ctx.allPages || [],
    gatewayUrl: gwNormOpts.gatewayUrl,
    useRailPartial: Boolean(ctx.spot064RailPartialReady),
  });
  const qa = runMultipageHtmlQa(finalHtml, {
    pages: ctx.allPages || [],
    currentPageFile: pageMeta.file,
  });
  if (!qa.ok && typeof onLog === "function") {
    emitLog(
      onLog,
      `QA «${pageMeta.file}»: ${qa.warnings.slice(0, 6).join(", ")} (авто-исправление nav/links применено)`
    );
  }

  emitLog(onLog, `LLM: «${pageMeta.file}» — ответ получен, сборка файлов страницы`);
  const mainText = htmlToPlainText(mainOnly);
  const pageCssRaw = repairUnbalancedPageCss(String(data.pageCss || ""));
  const truncatedMain = isMainHtmlLikelyTruncated(mainOnly);
  const premiumPageCss =
    usesPremiumIgamingLayout() && !useTemplateChrome
      ? `\n\n${buildPageTypographyBaselineCss()}`
      : "";
  const dualTplStyles =
    usesDualSiteTemplates() ||
    Boolean(ctx.referenceStructureSignals?.singleEtalonClone);
  const etalonPageCss = String(
    ctx.referenceStructureSignals?.etalonPageCssByFile?.[pageMeta.file] || ""
  ).trim();
  const etalonPageJs = String(
    ctx.referenceStructureSignals?.etalonPageJsByFile?.[pageMeta.file] || ""
  ).trim();
  const aiCssDelta = ctx.strictEtalonLayout
    ? ""
    : enforceMainVisualRules(pageCssRaw, ctx.sitePalette);
  const gamesBaseline = [pageCssRaw, aiCssDelta, etalonPageCss].some((s) =>
    String(s || "").includes("#lw-games")
  )
    ? ""
    : `\n\n${buildGamesBlockBaselineCss()}`;
  const pageCssOut =
    ctx.strictEtalonLayout && etalonPageCss
      ? `${mergeEtalonPageCss(etalonPageCss, aiCssDelta)}${gamesBaseline}`
      : dualTplStyles && etalonPageCss
      ? `${mergeEtalonPageCss(etalonPageCss, aiCssDelta)}${gamesBaseline}`
      : `${aiCssDelta}${
          useTemplateChrome
            ? `${premiumPageCss}${gamesBaseline}`
            : `\n\n${buildGamesBlockBaselineCss()}\n\n${buildMainInteractBaselineCss()}\n\n${buildAiChromeBaselineCss()}${premiumPageCss}`
        }`;
  const runtimeJs = buildInteractionRuntime(
    ctx.gatewayUrl || DEFAULT_GATEWAY_URL
  );
  const pageJsOut =
    ctx.strictEtalonLayout && etalonPageJs
      ? mergeEtalonPageJs(etalonPageJs, runtimeJs, "")
      : dualTplStyles && etalonPageJs
        ? mergeEtalonPageJs(etalonPageJs, runtimeJs, String(data.pageJs || ""))
        : `${runtimeJs}\n\n${String(data.pageJs || "")}`;
  return {
    html: finalHtml,
    css: pageCssOut,
    js: pageJsOut,
    mainText,
    truncatedMain,
  };
}

export async function buildPromptPreview({
  projectName,
  theme,
  siteUrl,
  pageCount = 4,
  brandKey = "",
}) {
  syncGeneratorLimitsFromEnv();
  const safeName = sanitizeProjectName(projectName || "preview-project");
  const themeNorm = String(theme || "").trim();
  if (!themeNorm) {
    throw new Error("Укажите theme для preview промпта.");
  }
  const brandKeyNorm = String(brandKey || "").trim().toLowerCase();
  const baseUrl =
    normalizeSiteUrl(siteUrl) || `https://${safeName.replace(/[^a-z0-9.-]/gi, "-")}`;

  const buildNonce = randomHex(12);
  const structureSalt = randomHex(16);
  const yandexVerification = "";
  const siteSeed = `${safeName}|${buildNonce}|${themeNorm}`;
  const structureSeed = `${siteSeed}|fp|${structureSalt}`;
  const structureFingerprint = `${structureSalt.slice(0, 8)}-${buildNonce.slice(0, 6)}`;
  const expectedFiles = pickExpectedMultipageFiles(structureSeed, pageCount);
  const themeBrandHintEarly = resolveThemeBrandHint(themeNorm, brandKeyNorm);

  let promptProfileOverlay = "";
  let referenceSiteOverlay = "";
  let referenceStructureOverlay = "";
  let referenceStructureSignals = null;
  try {
    const profile = await selectGenerationPromptProfileForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}|preview`,
    });
    if (profile) {
      promptProfileOverlay = formatGenerationPromptProfileBlock(profile, {
        themeBrandHint: themeBrandHintEarly,
      });
    }
  } catch {
    /* ignore profile load errors in preview */
  }
  try {
    const refSite = await selectReferenceSiteForBuild({
      pickSeed: `${buildNonce}|${safeName}|preview|ref`,
      incrementCounter: false,
    });
    if (refSite) {
      referenceSiteOverlay = formatReferenceSitePromptBlock(refSite);
      try {
        const refStruct = await buildReferenceStructureOverlay(refSite.reference_url, {
          includeMainTemplate: REFERENCE_TEMPLATE_MODE_DEFAULT,
        });
        referenceStructureOverlay = String(refStruct?.overlay || "");
        referenceStructureSignals = refStruct?.signals || null;
      } catch {
        referenceStructureOverlay = "";
      }
    }
  } catch {
    /* ignore reference site load errors in preview */
  }

  const referenceLockedPreview = Boolean(String(referenceStructureOverlay || "").trim());
  const diversityPack = buildDiversityPack(structureSeed);
  const diversityPackText = formatDiversityPackForPrompt(diversityPack, {
    internalTag: buildNonce.slice(0, 12),
    themeBrandHint: themeBrandHintEarly,
    pageCount: expectedFiles.length,
    referenceBlend: referenceLockedPreview,
  });

  const promptRemixOverlay = isPromptRegenEnabled()
    ? referenceLockedPreview
      ? "REMIX NOTE: при реальной сборке с активным ref-structure prompt remix **отключён**, entropy — тоже; приоритет у **зеркала каркаса** референса."
      : "REMIX NOTE: при реальной сборке этот блок дополнительно перегенерируется через Claude (prompt remix), поэтому финальный промпт в job будет отличаться от preview."
    : "";
  const finalPromptOverlay = [
    sanitizePromptOverlayText(promptProfileOverlay),
    sanitizePromptOverlayText(referenceSiteOverlay),
    sanitizePromptOverlayText(referenceStructureOverlay),
    sanitizePromptOverlayText(promptRemixOverlay),
    ...(referenceLockedPreview
      ? []
      : [
          sanitizePromptOverlayText(
            buildPromptEntropyOverlay(`${structureSeed}|${safeName}|${buildNonce}`, "architect")
          ),
        ]),
  ]
    .filter(Boolean)
    .join("\n\n");

  const architectPromptFamily = pickPromptFamilyBySeed(
    `${structureSeed}|architect|${safeName}|${buildNonce}`,
    0
  );
  const architectPromptFamilyOverlay = buildPromptFamilyOverlay({
    family: architectPromptFamily,
    retryStep: 0,
    kind: "architect",
  });

  const architectPrompt = buildArchitectPrompt({
    theme: themeNorm,
    buildNonce,
    imageFiles: [],
    yandexVerification,
    baseUrl,
    projectSlug: safeName,
    themeBrandHint: themeBrandHintEarly,
    diversityPackText,
    structureSalt,
    expectedFiles,
    promptProfileOverlay: finalPromptOverlay,
    promptFamilyOverlay: architectPromptFamilyOverlay,
    referenceBlend: referenceLockedPreview,
  });

  let pages = normalizePagesPlan([], expectedFiles, {
    brandName: resolveBuildBrandName({
      themeBrandHint: themeBrandHintEarly,
      architectSuggested: "",
      theme: themeNorm,
    }),
    themeNorm,
    seed: structureSeed,
  });
  if (
    referenceLockedPreview &&
    referenceStructureSignals?.sectionRoleSequence?.length >= 2
  ) {
    pages = snapIndexSectionOrderFromReferenceStructure(
      pages,
      referenceStructureSignals,
      structureSeed,
      null
    );
  }
  const firstPage = pages[0] || {
    file: "index.php",
    role: "Главная — обзор темы, игры, VIP",
    title: "Preview",
    description: "Preview",
    layoutVariant: "L01",
    contentAngle: "preview",
    tone: "preview",
    mainComponents: ["tabs"],
    sectionOrder: ["hero", "faq", "cta"],
    structuralArchetypeIds: [],
    structuralArchetypeIdsOrdered: [],
    homeFlowDescription: "",
  };
  const referenceTemplatePreviewEnabled = Boolean(
    referenceLockedPreview &&
      REFERENCE_TEMPLATE_MODE_DEFAULT &&
      resolveMainHtmlTemplateForPage(referenceStructureSignals || {}, firstPage.file).length > 0
  );
  const firstPageFamily = pickPromptFamilyBySeed(
    `${structureSeed}|${firstPage.file}|${buildNonce}`,
    0
  );
  const pageFamilyOverlay = buildPromptFamilyOverlay({
    family: firstPageFamily,
    retryStep: 0,
    kind: "page",
  });
  const chromeVariant = pickBrandChromeVariant(
    `${safeName}|${themeNorm}|${buildNonce}|preview|${structureSalt}`
  );
  const previewGatewayUrl = resolveGatewayUrlForBuild({
    projectSlug: safeName,
    buildNonce,
  });
  const brandName = resolveBuildBrandName({
    themeBrandHint: themeBrandHintEarly,
    architectSuggested: "",
    theme: themeNorm,
  });
  const previewNavLinks = buildNavLinkMap(pages, structureSeed);
  const previewNavLayout = formatNavLayoutForAiPagePrompt(
    chromeVariant,
    previewNavLinks
  );
  const pagePromptBase = buildPagePrompt({
    theme: themeNorm,
    pageMeta: firstPage,
    buildNonce,
    navLayoutPromptBlock: previewNavLayout,
    imageFiles: [],
    gameImages: [],
    gameSlotPaths: [],
    gameTabSlotBatches: [],
    homeGamesMode: resolveHomeGamesMode(structureSeed),
    structureFingerprint,
    sectionImagePaths: [],
    heroExtraPaths: [],
    avoidPhrases: [],
    yandexVerification,
    baseUrl,
    pageIndex: 1,
    themeBrandHint: themeBrandHintEarly,
    diversityPackText,
    promptProfileOverlay: finalPromptOverlay,
    promptFamilyOverlay: pageFamilyOverlay,
    siblingPlanSummary: "",
    uniquenessUrgencyLevel: 0,
    minPageWords: minWordsTargetForPageFile(firstPage.file),
    wordCountUrgencyLevel: 0,
    wordCountOverMaxUrgencyLevel: 0,
    brandTerms: [brandName, themeBrandHintEarly].filter(Boolean),
    sitePalette: { ...FIXED_SITE_PALETTE },
    totalPageCount: pages.length,
    blueprintDirectives: firstPage.blueprint || null,
    chromeShell: pickChromeShell(structureSeed),
    chromeContentOptions: pickChromeHeaderFooterOptions(structureSeed),
    referenceStructureSignals,
    referenceBlendMode: referenceLockedPreview,
    referenceTemplateMode: referenceTemplatePreviewEnabled,
    referenceTemplateMainHtml: resolveMainHtmlTemplateForPage(
      referenceStructureSignals || {},
      firstPage.file
    ),
    chromeVariant,
    navLinks: previewNavLinks,
    gatewayUrl: previewGatewayUrl,
    logoSrcForPrompt: LAKI_LOGO_IMG_SRC,
    useTemplateChrome: usesTemplateChrome(),
    allPages: pages,
  });

  let pagePrompt = pagePromptBase;
  if (!referenceLockedPreview) {
    try {
      pagePrompt = await rewritePromptByClaude({
        claudeApiKey: process.env.ANTHROPIC_API_KEY_W1 || "",
        promptType: "preview-page",
        seed: `${safeName}|${buildNonce}|preview-page`,
        basePrompt: pagePromptBase,
      });
    } catch {
      pagePrompt = pagePromptBase;
    }
  }

  return {
    projectName: safeName,
    theme: themeNorm,
    baseUrl,
    expectedFiles,
    buildNonce,
    structureFingerprint,
    promptFamilyArchitect: architectPromptFamily?.id || "",
    promptFamilyPage: firstPageFamily?.id || "",
    architectPrompt,
    samplePagePrompt: pagePrompt,
    note:
      "Это preview. В реальном build prompt remix генерируется отдельно через Claude, поэтому финальный промпт может отличаться.",
  };
}

export async function buildMultipageSite({
  projectName,
  windowId,
  theme,
  siteUrl,
  claudeApiKey,
  onLog,
  shouldStop,
  pageCount: pageCountInput,
  brandKey: brandKeyInput,
  brandKit: brandKitInput = null,
  referenceTemplateMode: referenceTemplateModeInput = false,
  generationMode: generationModeInput = "standard",
  etalonAlternatingIndex: etalonAlternatingIndexInput = 0,
}) {
  syncGeneratorLimitsFromEnv();
  const generationMode = normalizeGenerationMode(generationModeInput);
  const ensureNotStopped = () => {
    if (typeof shouldStop === "function" && shouldStop()) {
      throw new Error("Генерация остановлена пользователем.");
    }
  };

  const safeName = sanitizeProjectName(projectName);
  const wid = Math.trunc(Number(windowId));
  if (!Number.isFinite(wid) || wid < 1 || wid > 10) {
    throw new Error("windowId должен быть числом 1..10.");
  }
  const themeNorm = String(theme || "").trim();
  if (!themeNorm) {
    throw new Error("Укажите theme (поисковая тема сайта).");
  }
  const brandKeyNorm = String(brandKeyInput || "").trim().toLowerCase();

  const claudeKey = resolveWindowApiKey(wid, claudeApiKey);
  const baseUrl =
    normalizeSiteUrl(siteUrl) || `https://${safeName.replace(/[^a-z0-9.-]/gi, "-")}`;
  emitLog(
    onLog,
    `Старт сборки: проект «${safeName}», windowId=${wid}, Claude=${ANTHROPIC_MODEL}, режим=${
      generationMode === "bot_gate"
        ? "SEO (боты Yandex/Google → сайт, люди → gateway)"
        : "стандартный (все видят сайт; эталоны 1↔2, DOM 1:1)"
    }`
  );
  emitLog(onLog, `Базовый URL: ${baseUrl}`);
  emitLog(
    onLog,
    `Ключи: Claude ${maskApiKey(claudeKey)} (${describeClaudeKeyForBuildLog(claudeKey)})`
  );
  const shouldStopJob = () =>
    Boolean(typeof shouldStop === "function" && shouldStop());
  ensureNotStopped();

  const outputDir = path.join(PROJECTS_DIR, safeName);
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  emitLog(onLog, "Очистка и создание папки проекта…");
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const imgDir = path.join(outputDir, "img");
  const brandKit =
    brandKitInput && typeof brandKitInput === "object" ? brandKitInput : null;
  let imageFiles;
  if (brandKit?.userId) {
    const { materializeBrandImagesForBuild } = await import(
      "@/lib/generator-brand-kit.js"
    );
    imageFiles = await materializeBrandImagesForBuild({
      userId: brandKit.userId,
      brandKit,
      projectImgDir: imgDir,
      onLog,
    });
  } else {
    imageFiles = await copyImgGenToProject(imgDir);
    emitLog(
      onLog,
      `Скопировано файлов в img/: ${imageFiles.length}${imageFiles.length ? ` (${imageFiles.slice(0, 5).join(", ")}${imageFiles.length > 5 ? "…" : ""})` : ""}`
    );
  }
  if (brandKit?.userId && imageFiles.length) {
    emitLog(
      onLog,
      `img/: ${imageFiles.length} файл(ов)${imageFiles.length ? ` (${imageFiles.slice(0, 5).join(", ")}${imageFiles.length > 5 ? "…" : ""})` : ""}`
    );
  }
  await ensureProjectFaviconIco(imgDir, onLog);
  if (!imageFiles.includes("favicon.ico")) {
    imageFiles = [...imageFiles, "favicon.ico"];
  }

  const imagePools = buildImagePools(imageFiles);
  const gameSourceFiles = resolveGameImageFiles(imageFiles, imagePools, brandKit);
  const bannerImagePaths = resolveBannerImageFiles(imageFiles, imagePools).map(
    (f) => `./img/${f}`
  );
  const paymentImagePaths = resolvePaymentImageFiles(imageFiles, imagePools).map(
    (f) => `./img/${f}`
  );
  if (brandKit?.userId) {
    emitLog(onLog, `Бренд-ассеты: ${formatImagePoolsLogLine(imagePools)}`);
  }

  const cssDir = path.join(outputDir, "css");
  const jsDir = path.join(outputDir, "js");
  await fs.mkdir(cssDir, { recursive: true });
  await fs.mkdir(jsDir, { recursive: true });

  const buildNonce = randomHex(12);
  const structureSalt = randomHex(16);
  const gatewayUrl = resolveGatewayUrlForBuild({
    projectSlug: safeName,
    buildNonce,
  });
  emitLog(onLog, "Запись config.php (Yandex / gateway gate)…");
  await writeMultipageSiteConfig(outputDir, gatewayUrl);
  emitLog(
    onLog,
    `Регистрационный шлюз (config.php, CTA, runtime): ${gatewayUrl}`
  );

  /** Пусто: токен Yandex Webmaster подставляет auto-script при деплое на хост. */
  const yandexVerification = "";
  const siteSeed = `${safeName}|${buildNonce}|${themeNorm}`;
  const logoSrcForBuild = pickLogoSrcForBuild(imageFiles, siteSeed);
  /** Окремий зерновий рядок для каркасу (порядок блоків, архетипи, режим головної) — завжди з унікальним structureSalt для відмінності між білдами (fingerprints). */
  const structureSeed = `${siteSeed}|fp|${structureSalt}`;
  const structureFingerprint = `${structureSalt.slice(0, 8)}-${buildNonce.slice(0, 6)}`;
  const expectedFiles = pickExpectedMultipageFiles(structureSeed, pageCountInput);
  if (expectedFiles.length < 2) {
    emitLog(
      onLog,
      `Предупреждение: в сборке только ${expectedFiles.length} страница — для полноценного multipage выберите 2–4 в форме генератора (или смените пресет темы).`
    );
  }
  emitLog(
    onLog,
    `План страниц: ${expectedFiles.length} шт. (${expectedFiles.join(", ")})`
  );
  const pageCountForBudget = Math.max(1, expectedFiles.length);
  const claudeBudgetTracker = {
    budget: SITE_CLAUDE_OUTPUT_BUDGET,
    used: 0,
  };
  const claudeTokenPlan = computeClaudeSiteTokenBudgets(
    expectedFiles,
    SITE_CLAUDE_OUTPUT_BUDGET
  );
  const claudeArchitectCap = Math.max(
    512,
    Math.min(
      ARCHITECT_MAX_TOKENS,
      claudeTokenPlan.architectMaxTokens
    )
  );
  const perPageCaps = Object.values(claudeTokenPlan.pageMaxTokensByFile).map(
    (n) => Number(n) || 0
  );
  const claudePagePassCap = Math.max(
    512,
    Math.min(
      PAGE_MAX_TOKENS,
      ...(perPageCaps.length ? perPageCaps : [8192]),
      Math.floor(
        (SITE_CLAUDE_OUTPUT_BUDGET - claudeArchitectCap) /
          Math.max(1, pageCountForBudget)
      )
    )
  );
  emitLog(
    onLog,
    `Claude-only: бюджет ~${SITE_CLAUDE_OUTPUT_BUDGET} output-токенов → архитектор max≈${claudeArchitectCap} (15%, cap 2000), страницы: index≈40% остатка, прочие поровну (${pageCountForBudget} стр., default cap≈${claudePagePassCap})`
  );
  const themeBrandHintEarly = brandKit?.brandName
    ? String(brandKit.brandName).trim()
    : resolveThemeBrandHint(themeNorm, brandKeyNorm);
  if (brandKit?.brandName) {
    emitLog(onLog, `Бренд клиента (admin): «${themeBrandHintEarly}»`);
  }
  const referenceTemplateModeWanted =
    REFERENCE_TEMPLATE_MODE_DEFAULT || Boolean(referenceTemplateModeInput);

  let promptProfileOverlay = "";
  let referenceSiteOverlay = "";
  let referenceStructureOverlay = "";
  let referenceStructureSignals = null;
  try {
    const profile = await selectGenerationPromptProfileForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}`,
      themeBrandHint: themeBrandHintEarly,
      onLog: (m) => emitLog(onLog, m),
    });
    if (profile) {
      promptProfileOverlay = formatGenerationPromptProfileBlock(profile, {
        themeBrandHint: themeBrandHintEarly,
      });
      emitLog(
        onLog,
        `Профиль промпта (Supabase): ${String(profile.name || profile.id || "?").slice(0, 80)}`
      );
    }
  } catch (e) {
    emitLog(
      onLog,
      `Supabase generation_prompt_profiles: ${String(e?.message || e).slice(0, 240)} — без профиля`
    );
  }

  let sourceArticlesPool = [];
  let sourceArticlesArchitectBlock = "";
  try {
    const saArchitect = await loadSourceArticlesContextForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}`,
      pageFile: "architect",
      themeBrandHint: themeBrandHintEarly,
      articleCount: 1,
      onLog: (m) => emitLog(onLog, m),
    });
    sourceArticlesPool = saArchitect.pool;
    sourceArticlesArchitectBlock = saArchitect.block;
  } catch (e) {
    emitLog(
      onLog,
      `source_articles (architect): ${String(e?.message || e).slice(0, 180)}`
    );
  }

  const siteRulesForArchitect = buildSiteGenerationRulesBlock({
    themeBrandHint: themeBrandHintEarly,
    logoSrc: logoSrcForBuild,
    bannerImagePaths,
    paymentImagePaths,
  });
  let pageTemplatePlan = {};
  let templateCssFromEtalon = null;
  let singleEtalonTemplateId = null;
  let clonedMainByFile = {};
  let clonedChrome = null;

  const strictEtalonLayout = !usesDualSiteTemplates();

  if (usesDualSiteTemplates()) {
    try {
      pageTemplatePlan = pickPageTemplatePlan(structureSeed, expectedFiles);
      const dualPack = await loadDualEtalonReferencePack({
        pickSeed: structureSeed,
        plan: pageTemplatePlan,
        pageFiles: expectedFiles,
        onLog: (m) => emitLog(onLog, m),
      });
      templateCssFromEtalon = dualPack.templateCss || null;
      referenceSiteOverlay = dualPack.siteOverlay;
      referenceStructureOverlay = dualPack.overlay;
      referenceStructureSignals = dualPack.signals;
      emitLog(
        onLog,
        `Двойной эталон: шаблоны по страницам ${formatTemplatePlanLog(pageTemplatePlan)}.`
      );
    } catch (dualErr) {
      emitLog(
        onLog,
        `Двойной эталон: ${String(dualErr?.message || dualErr).slice(0, 220)} — fallback на Supabase-референс.`
      );
      pageTemplatePlan = {};
    }
  } else {
    try {
      const altIdx = Math.max(
        0,
        Math.trunc(Number(etalonAlternatingIndexInput) || 0)
      );
      singleEtalonTemplateId = resolveEtalonTemplateForAlternatingIndex(altIdx);
      pageTemplatePlan = pickUniformPageTemplatePlan(
        expectedFiles,
        singleEtalonTemplateId
      );
      const singlePack = await loadSingleEtalonReferencePack({
        templateId: singleEtalonTemplateId,
        pageFiles: expectedFiles,
        onLog: (m) => emitLog(onLog, m),
      });
      templateCssFromEtalon = singlePack.templateCss || null;
      referenceSiteOverlay = singlePack.siteOverlay;
      referenceStructureOverlay = singlePack.overlay;
      referenceStructureSignals = singlePack.signals;
      const etalonOpts = {
        brandName: themeBrandHintEarly,
        themeBrandHint: themeBrandHintEarly,
        gatewayUrl,
        baseUrl,
      };
      for (const f of expectedFiles) {
        const raw = referenceStructureSignals?.mainHtmlTemplatesByFile?.[f];
        if (raw) {
          clonedMainByFile[f] = applyEtalonCloneTransforms(raw, etalonOpts);
        }
      }
      const chrome =
        referenceStructureSignals?.chromeByTemplate?.[singleEtalonTemplateId];
      if (chrome) {
        clonedChrome = {
          headerHtml: applyEtalonCloneTransforms(
            String(chrome.headerHtml || ""),
            etalonOpts
          ),
          footerHtml: applyEtalonCloneTransforms(
            String(chrome.footerHtml || ""),
            etalonOpts
          ),
        };
      }
      emitLog(
        onLog,
        `Эталон: ${etalonLabelForTemplateId(singleEtalonTemplateId)} (черга 1↔2, индекс ${altIdx}) на все ${expectedFiles.length} стр.; план ${formatTemplatePlanLog(pageTemplatePlan)}.`
      );
    } catch (etalonErr) {
      throw new Error(
        `Не удалось загрузить эталон — ${String(etalonErr?.message || etalonErr).slice(0, 240)}`
      );
    }
  }
  try {
    if (
      referenceStructureSignals?.dualSiteTemplates ||
      referenceStructureSignals?.singleEtalonClone
    ) {
      emitLog(onLog, "Референс Supabase: пропуск — активны локальные эталоны u-bet162/u-spot064.");
    }
    const refSite =
      referenceStructureSignals?.dualSiteTemplates ||
      referenceStructureSignals?.singleEtalonClone
        ? null
        : await selectReferenceSiteForBuild({
            pickSeed: `${buildNonce}|${safeName}|ref`,
            incrementCounter: true,
            onLog: (m) => emitLog(onLog, m),
          });
    if (refSite) {
      referenceSiteOverlay = formatReferenceSitePromptBlock(refSite);
      emitLog(
        onLog,
        `Референс сайта (Supabase): ${String(refSite.reference_url || "?").slice(0, 120)}`
      );
      try {
        const refStruct = await buildReferenceStructureOverlay(refSite.reference_url, {
          includeMainTemplate: referenceTemplateModeWanted,
          includeChromeTemplates: true,
        });
        referenceStructureOverlay = String(refStruct?.overlay || "");
        referenceStructureSignals = refStruct?.signals || null;
        if (!refStruct) {
          emitLog(
            onLog,
            "Референс-структура: HTML получен, но снимок отклонён (нет сигналов: section/h1–h3/nav/layout-классы, цвета, semantic, layout flags или достаточного объёма main). Проверьте reference_url или ослабьте SOFTGEN_REQUIRE_REFERENCE_STRUCTURE."
          );
        } else if (referenceStructureOverlay) {
          emitLog(
            onLog,
            `Референс-структура: снимок каркаса загружен (${Math.min(9999, referenceStructureOverlay.length)} chars)`
          );
        }
      } catch (e2) {
        emitLog(
          onLog,
          `Референс-структура: ${String(e2?.message || e2).slice(0, 220)} — без структурного снимка`
        );
      }
    } else {
      emitLog(onLog, "Референс сайта: не выбран (пустая выборка).");
    }
  } catch (e) {
    emitLog(
      onLog,
      `Supabase generation_reference_sites: ${String(e?.message || e).slice(0, 240)} — без референса`
    );
  }
  if (REQUIRE_REFERENCE_STRUCTURE) {
    if (!referenceSiteOverlay.trim()) {
      throw new Error(
        "Сборка остановлена: не удалось получить reference_url из generation_reference_sites, а SOFTGEN_REQUIRE_REFERENCE_STRUCTURE=1."
      );
    }
    if (!referenceStructureOverlay.trim()) {
      throw new Error(
        "Сборка остановлена: не удалось построить структурный snapshot референса (main/section/headings), а SOFTGEN_REQUIRE_REFERENCE_STRUCTURE=1."
      );
    }
  }
  const referenceLocked = Boolean(String(referenceStructureOverlay || "").trim());
  const mainTpl = String(referenceStructureSignals?.mainHtmlTemplate || "").trim();
  const perPageTplCount = Object.keys(
    referenceStructureSignals?.mainHtmlTemplatesByFile || {}
  ).length;
  const tplLibCounts = referenceStructureSignals?.mainHtmlTemplateLibraryCounts;
  const referenceTemplateModeEnabled = Boolean(
    referenceLocked &&
      referenceTemplateModeWanted &&
      (perPageTplCount > 0 || mainTpl.length > 0)
  );
  if (referenceTemplateModeEnabled) {
    const libHint =
      referenceStructureSignals?.dualSiteTemplates && tplLibCounts
        ? `; библиотека main: bet162=${tplLibCounts.bet162 ?? 0}, spot064=${tplLibCounts.spot064 ?? 0}`
        : "";
    emitLog(
      onLog,
      referenceStructureSignals?.singleEtalonClone
        ? `Эталон ${singleEtalonTemplateId === SITE_TEMPLATE_SPOT064 ? "u-spot064" : "u-bet162"}, inner <main> по страницам (${perPageTplCount} шт., DOM 1:1).`
        : referenceStructureSignals?.dualSiteTemplates
          ? `Режим шаблона: эталоны u-bet162/u-spot064, inner <main> по страницам (${perPageTplCount} шт., план ${formatTemplatePlanLog(pageTemplatePlan)}${libHint}).`
          : `Режим шаблона: один эталонный inner <main> с reference_url (${Number(referenceStructureSignals?.mainHtmlTemplateChars) || mainTpl.length} симв.) — для всех страниц пакета; ref-structure gate отключён при непустом шаблоне.`
    );
  } else if (referenceTemplateModeWanted && referenceLocked) {
    emitLog(
      onLog,
      "Режим шаблона запрошен, но внутри <main> референса нечего вставить — продолжаем без HTML-шаблона."
    );
  }
  const diversityPack = buildDiversityPack(structureSeed);
  const diversityPackText = formatDiversityPackForPrompt(diversityPack, {
    internalTag: buildNonce.slice(0, 12),
    themeBrandHint: themeBrandHintEarly,
    pageCount: expectedFiles.length,
    referenceBlend: referenceLocked,
  });
  if (referenceLocked) {
    emitLog(
      onLog,
      "Референс-lock: приоритет зеркала каркаса референса (DOM/сайдбары); diversity/entropy/remix ослаблены."
    );
  }

  let promptRemixOverlay = "";
  if (isPromptRegenEnabled() && !referenceLocked) {
    try {
      emitLog(
        onLog,
        "LLM: перегенерация prompt-overlay (анти-шаблонный слой инструкций)…"
      );
      promptRemixOverlay = await buildRegeneratedPromptOverlay({
        claudeApiKey: claudeKey,
        theme: themeNorm,
        projectSlug: safeName,
        buildNonce,
        expectedFiles,
        diversityPackText,
        baseOverlay: promptProfileOverlay,
        onLog,
        shouldStop: shouldStopJob,
        budgetTracker: claudeBudgetTracker,
      });
      emitLog(
        onLog,
        `Prompt remix overlay: ${Math.min(
          9999,
          String(promptRemixOverlay).length
        )} chars`
      );
    } catch (e) {
      emitLog(
        onLog,
        `Prompt remix: ${String(e?.message || e).slice(0, 220)} — fallback на базовый overlay`
      );
      promptRemixOverlay = "";
    }
  }
  const brandPromptOverlay = formatBrandPromptOverlay(brandKit?.promptOverlay);
  const finalPromptOverlay = [
    sanitizePromptOverlayText(promptProfileOverlay),
    sanitizePromptOverlayText(referenceSiteOverlay),
    sanitizePromptOverlayText(referenceStructureOverlay),
    sanitizePromptOverlayText(promptRemixOverlay),
    brandPromptOverlay,
    ...(referenceLocked
      ? []
      : [
          sanitizePromptOverlayText(
            buildPromptEntropyOverlay(
              `${structureSeed}|${safeName}|${buildNonce}|preview`,
              "preview"
            )
          ),
        ]),
  ]
    .filter(Boolean)
    .join("\n\n");
  const architectPromptFamily = pickPromptFamilyBySeed(
    `${structureSeed}|architect|${safeName}|${buildNonce}`,
    0
  );
  const architectPromptFamilyOverlay = buildPromptFamilyOverlay({
    family: architectPromptFamily,
    retryStep: 0,
    kind: "architect",
  });
  if (architectPromptFamily?.id) {
    emitLog(onLog, `Prompt family (architect): ${architectPromptFamily.id}`);
  }

  const manifestPlan = await buildSiteManifestPlan({
    theme: themeNorm,
    projectSlug: safeName,
    siteSeed,
    expectedFiles,
    onLog,
  });
  const diversityPackTextWithManifest = referenceLocked
    ? diversityPackText
    : `${diversityPackText}\n${manifestPlan.promptBlock}`;
  emitLog(
    onLog,
    `Manifest: archetype=${manifestPlan.manifest.site_archetype}; nav=${manifestPlan.manifest.navigation_type}; similarity=${manifestPlan.similarity}`
  );
  if (referenceLocked) {
    emitLog(
      onLog,
      "Manifest guidance soft-disabled: активен reference-lock, приоритет у каркаса референса."
    );
  }

  const architectUserBase = buildArchitectPrompt({
    theme: themeNorm,
    buildNonce,
    imageFiles,
    yandexVerification,
    baseUrl,
    projectSlug: safeName,
    themeBrandHint: themeBrandHintEarly,
    diversityPackText: diversityPackTextWithManifest,
    structureSalt,
    expectedFiles,
    promptProfileOverlay: finalPromptOverlay,
    promptFamilyOverlay: architectPromptFamilyOverlay,
    referenceBlend: referenceLocked,
    siteGenerationRulesBlock: siteRulesForArchitect,
    sourceArticlesOverlay: sourceArticlesArchitectBlock,
  });
  let architectUser = architectUserBase;
  if (!referenceLocked) {
    try {
      architectUser = await rewritePromptByClaude({
        claudeApiKey: claudeKey,
        promptType: "architect",
        seed: `${safeName}|${buildNonce}|architect`,
        basePrompt: architectUserBase,
        onLog,
        shouldStop: shouldStopJob,
        budgetTracker: claudeBudgetTracker,
      });
      emitLog(onLog, `Prompt rewrite: architect (${architectUser.length} chars)`);
    } catch (e) {
      emitLog(
        onLog,
        `Prompt rewrite (architect) skipped: ${String(e?.message || e).slice(0, 180)}`
      );
      architectUser = architectUserBase;
    }
  } else {
    emitLog(
      onLog,
      "Prompt rewrite (architect) пропущен: активен reference-lock (без перефразирования промпта)."
    );
  }

  emitLog(
    onLog,
    "LLM: архитектор сайта — запрос плана страниц и бренда (это может занять несколько минут)…"
  );
  emitLog(onLog, "ЭТАП: архитектор JSON (Claude) — план страниц и brandName");
  const architectTemp = readPromptTemperatureEnv(
    "SOFTGEN_ARCHITECT_TEMPERATURE",
    ARCHITECT_JSON_TEMPERATURE
  );
  const architectSystemJsonRules =
    buildArchitectJsonSystemPrompt({
      expectedPageCount: expectedFiles.length,
      referenceLocked,
      minIndexWords: MIN_INDEX_PAGE_WORDS,
      minPageWords: MIN_PAGE_WORDS,
      maxPageWords: MAX_PAGE_WORDS,
      mainWordGuide: MAIN_WORD_VOLUME_GUIDE,
    }) +
    " " +
    buildQualityAndSeoPriorityBlock("architect") +
    " " +
    "Экранируй \" как \\\". Только русский в title/description/role. Не подставляй имя папки сборки в brandName. ";
  const architectSystemPlanTail = referenceLocked
    ? `Режим референса (зеркало каркаса): если в user есть референс и ref-structure — **sectionOrder**, **layoutVariant** и типы секций **максимально как у референса** (включая сценарий с сайдбаром). Свежесть — в title/description/contentAngle/tone/role и текстах; **не** ломай каркас и **не** гони контраст URL ценой расхождения с референсом. Избегай типовых заголовков-штампов. Цель по объёму в <main>: ориентир ~${MAIN_WORD_VOLUME_GUIDE} слов; **index.php** — минимум ${MIN_INDEX_PAGE_WORDS} слов; остальные страницы пакета — минимум ${MIN_PAGE_WORDS} слов; максимум на любой странице ${MAX_PAGE_WORDS}; упор на полноценные абзацы <p>, минимум таблиц и галерей изображений. В плане ровно ${expectedFiles.length} страниц; title/description не дублировать между URL.`
    : `Разные проекты и разные билды не должны схлопываться в один шаблон: меняй акценты, формулировки title/description, contentAngle и порядок смысловых блоков; избегай типовых заголовков-штампов. Цель по объёму в <main>: ориентир ~${MAIN_WORD_VOLUME_GUIDE} слов; **index.php** — минимум ${MIN_INDEX_PAGE_WORDS} слов; остальные страницы пакета — минимум ${MIN_PAGE_WORDS} слов; максимум на любой странице ${MAX_PAGE_WORDS}; упор на полноценные абзацы <p>, минимум таблиц и галерей изображений. В плане ровно ${expectedFiles.length} страниц — все должны быть контрастны по структуре; не копируй один каркас на все URL. Разнообразь типы секций. Каждый новый JSON-план не должен повторять предыдущую генерацию другого сайта — важна уникальность для анти-дубликатных сигнатур.`;
  const architectText = await callClaudeOnly({
    apiKey: claudeKey,
    shouldStop: shouldStopJob,
    system: architectSystemJsonRules + architectSystemPlanTail,
    user: architectUser,
    maxTokens: claudeArchitectCap,
    temperature: architectTemp,
    onLog,
    budgetTracker: claudeBudgetTracker,
  });

  let plan;
  try {
    plan = extractJsonObject(architectText);
  } catch (e1) {
    const msg1 = e1?.message != null ? String(e1.message) : String(e1);
    emitLog(
      onLog,
      `Архитектор: JSON не распарсился (${msg1.slice(0, 200)}) — пробуем исправление через Claude…`
    );
    try {
      const repairRaw = String(architectText || "");
      const repairUser =
        `Парсер JSON выдал ошибку:\n${msg1}\n\n` +
        `Ниже невалидный ответ архитектора. Верни ТОЛЬКО один исправленный JSON-объект того же смысла: корень **только** brandName и pages (поле jsonLd удали целиком, если оно есть — сборщик его не использует). ` +
        `Экранируй кавычки внутри строк как \\". Убери текст после корневого закрывающего }, если он не JSON. Без markdown и без пояснений.\n\n---\n${repairRaw.slice(0, 24000)}`;
      const repaired = await callClaudeOnly({
        apiKey: claudeKey,
        shouldStop: shouldStopJob,
        system:
          "Ты исправляешь синтаксис JSON. Ответ — только валидный JSON-объект, без ``` и без текста до/после.",
        user: repairUser,
        maxTokens: Math.min(Math.max(4096, claudeArchitectCap), 16384),
        temperature: 0.15,
        onLog,
        budgetTracker: claudeBudgetTracker,
      });
      plan = extractJsonObject(repaired);
    } catch (e2) {
      const msg2 = e2?.message != null ? String(e2.message) : String(e2);
      emitLog(
        onLog,
        `Архитектор: repair-ответ тоже невалиден (${msg2.slice(0, 200)}) — делаем повторный запрос к архитектору в JSON-safe режиме…`
      );
      let lastRetryErr = null;
      for (let architectRetry = 1; architectRetry <= 2; architectRetry += 1) {
        try {
          const retryText = await callClaudeOnly({
            apiKey: claudeKey,
            shouldStop: shouldStopJob,
            system:
              "Только валидный JSON-объект. Без markdown, без комментариев, без текста до/после. " +
              "Корень строго: brandName (string), pages (array). Никаких других ключей. " +
              "Внутри pages каждый объект: file, role, title, description, contentAngle, tone, layoutVariant, sectionOrder, mainComponents, structuralArchetypeIds. " +
              "Если не уверен — верни минимально безопасный JSON с пустыми строками, но строго валидный.",
            user: architectUser,
            maxTokens: Math.min(Math.max(4096, claudeArchitectCap), 12288),
            temperature: 0.2,
            onLog,
            budgetTracker: claudeBudgetTracker,
          });
          plan = extractJsonObject(retryText);
          emitLog(
            onLog,
            `Архитектор: fallback JSON-safe retry ${architectRetry}/2 — успешно`
          );
          lastRetryErr = null;
          break;
        } catch (retryErr) {
          lastRetryErr = retryErr;
          emitLog(
            onLog,
            `Архитектор: fallback retry ${architectRetry}/2 не удался (${String(retryErr?.message || retryErr).slice(0, 160)})`
          );
        }
      }
      if (!plan) {
        const raw = String(architectText || "");
        const head = raw.slice(0, 400).replace(/\s+/g, " ");
        throw new Error(
          `Архитектор (Claude) вернул невалидный JSON — ${msg1}. Повторный разбор после исправления: ${msg2}. Fallback retries не помогли: ${String(lastRetryErr?.message || "unknown")}. Начало ответа (${raw.length} симв.): ${head}${raw.length > 400 ? "…" : ""}`
        );
      }
    }
  }
  const brandName = resolveBuildBrandName({
    themeBrandHint: themeBrandHintEarly,
    architectSuggested:
      publicBrandLabelFromBrandKey(brandKeyNorm) ||
      String(plan?.brandName != null ? plan.brandName : "").trim(),
    theme: themeNorm,
  });
  if (plan && typeof plan === "object") {
    plan.brandName = brandName;
  }
  emitLog(
    onLog,
    `План сайта получен. Бренд: «${String(brandName || "—").slice(0, 80)}»`
  );
  const sitePalette = brandKit?.palette
    ? { ...FIXED_SITE_PALETTE, ...brandKit.palette }
    : { ...FIXED_SITE_PALETTE };
  const chromeVariant = pickBrandChromeVariant(
    `${safeName}|${themeNorm}|${buildNonce}|${wid}|${structureSalt}`
  );

  let pages = Array.isArray(plan.pages) ? plan.pages : [];
  pages = pages
    .map((p) => (p ? { ...p, file: canonicalMultipageFile(p.file) } : p))
    .filter((p) => p && expectedFiles.includes(String(p.file)));
  if (pages.length !== expectedFiles.length) {
    emitLog(
      onLog,
      `План архитектора: ожидалось ${expectedFiles.length} страниц, получено ${pages.length} — недостающие файлы достроит normalizePagesPlan (поля каркаса по seed только для пустых страниц).`
    );
  }
  pages = normalizePagesPlan(pages, expectedFiles, {
    brandName,
    themeNorm,
    seed: structureSeed,
    brandKey: brandKeyNorm,
  });
  if (
    referenceLocked &&
    referenceStructureSignals?.sectionRoleSequence?.length >= 2
  ) {
    pages = snapIndexSectionOrderFromReferenceStructure(
      pages,
      referenceStructureSignals,
      structureSeed,
      onLog
    );
  }
  const blueprints = buildPageBlueprintPlan({
    manifest: manifestPlan.manifest,
    pages,
    siteSeed,
    onLog,
    referenceBlend: referenceLocked,
  });
  const diversityPackTextWithPlan = `${diversityPackTextWithManifest}\n${blueprints.promptBlock}`;
  pages = pages.map((p) => {
    const bp = blueprints.byFile[String(p.file)];
    if (!bp?.blueprint) return p;
    return {
      ...p,
      blueprint: bp.blueprint,
    };
  });

  const navLinks = buildNavLinkMap(pages, structureSeed);
  const chromeShell = pickChromeShell(structureSeed);
  const chromeLayoutSkins = pickChromeLayoutSkins(structureSeed);
  const chromeContentOptions =
    pickChromeHeaderFooterOptions(structureSeed);
  const templateChromeEnabled =
    usesTemplateChrome() || usesDualSiteTemplates() || strictEtalonLayout;
  emitLog(
    onLog,
    `Chrome: ${templateChromeEnabled ? "lw-шаблон" : "уникальный AI chrome"} (логотип ${logoSrcForBuild}${templateChromeEnabled ? `, скины h${chromeLayoutSkins.headerSkin}/f${chromeLayoutSkins.footerSkin}` : ""}); <header>=${chromeShell.includeHeader ? "да" : "нет"}, <footer>=${chromeShell.includeFooter ? "да" : "нет"}; gateway в шапке=${chromeContentOptions.headerShowGatewayCtas ? "да" : "нет"}`
  );
  const chromeCss = [
    getBrandChromeCss(chromeVariant, sitePalette, {
      chromeMode: templateChromeEnabled ? "full" : "palette-only",
      layoutSkins: chromeLayoutSkins,
      cssDiversifyKey: `${structureSeed}|${buildNonce}|${safeName}`,
    }),
    buildGamesBlockBaselineCss(),
    buildMainInteractBaselineCss(),
  ].join("\n");

  emitLog(onLog, "Запись css/chrome.css…");
  await fs.writeFile(
    path.join(cssDir, "chrome.css"),
    `${chromeCss}\n`,
    "utf8"
  );

  const needsIgamingCss =
    (usesDualSiteTemplates() || strictEtalonLayout) &&
    (siteNeedsIgamingCss(pageTemplatePlan) || usesPremiumIgamingLayout());
  const needsSiteShellCss =
    (usesDualSiteTemplates() || strictEtalonLayout) &&
    siteNeedsSiteShellCss(pageTemplatePlan);
  if (needsIgamingCss) {
    const igCss =
      String(templateCssFromEtalon?.igaming || "").trim() ||
      (await readBundledIgamingCss({ onLog: (m) => emitLog(onLog, m) }));
    if (igCss) {
      emitLog(onLog, "Запись css/igaming.css (эталон bet162, Supabase)…");
      await fs.writeFile(path.join(cssDir, "igaming.css"), `${igCss}\n`, "utf8");
    }
  }
  let spot064RailPartialReady = false;
  if (needsSiteShellCss) {
    const shellCss =
      String(templateCssFromEtalon?.siteShell || "").trim() ||
      (await readBundledSiteShellCss({ onLog: (m) => emitLog(onLog, m) }));
    if (shellCss) {
      emitLog(onLog, "Запись css/site-shell.css (rail + rich footer, u-spot064)…");
      await fs.writeFile(path.join(cssDir, "site-shell.css"), `${shellCss}\n`, "utf8");
    }
    try {
      await writeSpot064RailPartial(outputDir, {
        chromeVariant,
        navLinks,
        gatewayUrl,
        brandAlt: brandName || themeBrandHintEarly || "Логотип",
      });
      spot064RailPartialReady = true;
      emitLog(onLog, "Запись partials/site-rail.php (навигация spot064, как u-spot064)…");
    } catch (railPartialErr) {
      emitLog(
        onLog,
        `Предупреждение: partials/site-rail.php — ${String(railPartialErr?.message || railPartialErr).slice(0, 180)}`
      );
    }
  }

  const gameImages = pickGameImages(gameSourceFiles, {
    seed: siteSeed,
    max: 36,
  });
  const gameTabSlotBatches = buildGameTabSlotBatches(gameSourceFiles, siteSeed, 3, 8);
  const gameSlotPaths =
    gameTabSlotBatches[0]?.length > 0
      ? gameTabSlotBatches[0]
      : buildIndexedGameSlots(gameSourceFiles, siteSeed, 8);
  const siteGenerationRulesBlock = buildSiteGenerationRulesBlock({
    themeBrandHint: themeBrandHintEarly,
    gameSlotPaths,
    bannerImagePaths,
    paymentImagePaths,
    logoSrc: logoSrcForBuild,
    sitePalette,
  });
  const canonSlotCount = CANONICAL_SLOT_GAME_FILENAMES.filter((f) =>
    gameSourceFiles.includes(f)
  ).length;
  if (canonSlotCount < 4) {
    emitLog(
      onLog,
      `Превью слотов: в img/ найдено ${canonSlotCount}/${CANONICAL_SLOT_GAME_FILENAMES.length} канонических файлов — положите недостающие .webp в src/img-gen/ (копируются при сборке).`
    );
  }
  const homeGamesMode = resolveHomeGamesMode(structureSeed);
  const siteChromeTemplateId = resolvePageSiteTemplate(
    { pageTemplateByFile: pageTemplatePlan },
    "index.php"
  );
  const chromePresetHistory = await loadChromePresetHistory();
  const chosenPresetPair = pickChromePresetPair(
    `${structureSeed}|${buildNonce}|${safeName}`,
    siteChromeTemplateId,
    chromePresetHistory
  );
  const sharedHeaderPresetId = chosenPresetPair.headerPresetId;
  const sharedFooterPresetId = chosenPresetPair.footerPresetId;
  await saveChromePresetHistory([
    ...chromePresetHistory,
    {
      createdAt: new Date().toISOString(),
      projectName: safeName,
      siteSeed,
      templateId: chosenPresetPair.templateId,
      headerPresetId: sharedHeaderPresetId,
      footerPresetId: sharedFooterPresetId,
    },
  ]);
  emitLog(
    onLog,
    `Каркас: structureSalt=${structureSalt.slice(0, 12)}…; главная — режим игр «${homeGamesMode}»; отпечаток ${structureFingerprint}; igaming-block-catalog=${usesPremiumIgamingLayout() ? "on" : "off"}; dual-templates=${usesDualSiteTemplates() ? formatTemplatePlanLog(pageTemplatePlan) : "off"}.`
  );
  const siteClassNamespace = buildSiteClassNamespace(
    brandName || themeBrandHintEarly,
    `${structureSeed}|${buildNonce}`
  );
  const ctx = {
    theme: themeNorm,
    buildNonce,
    siteSeed,
    structureSeed,
    structureFingerprint,
    homeGamesMode,
    imageFiles,
    gameImages,
    gameSlotPaths,
    gameTabSlotBatches,
    gatewayUrl,
    logoSrc: logoSrcForBuild,
    avoidPhrases: [],
    yandexVerification,
    baseUrl,
    projectSlug: safeName,
    themeBrandHint: themeBrandHintEarly,
    publicBrandName: brandName,
    diversityPackText: diversityPackTextWithPlan,
    promptProfileOverlay: finalPromptOverlay,
    sourceArticlesPool,
    siteGenerationRulesBlock,
    allPages: pages,
    sitePalette,
    totalPages: pages.length,
    minPageWords: MIN_PAGE_WORDS,
    brandTerms: [brandName, themeBrandHintEarly].filter(Boolean),
    requestTokenCap: claudePagePassCap,
    claudePageMaxTokens: claudePagePassCap,
    claudePageMaxTokensByFile: claudeTokenPlan.pageMaxTokensByFile,
    claudeBudgetTracker,
    shouldStop: shouldStopJob,
    chromeShell,
    chromeVariant,
    chromeLayoutSkins,
    chromeContentOptions,
    navLinks,
    referenceStructureSignals,
    referenceBlendMode: referenceLocked,
    referenceTemplateMode: referenceTemplateModeEnabled,
    useTemplateChrome: templateChromeEnabled,
    siteCanonicalChrome: null,
    siteCanonicalChromeByTemplate: {},
    siteClassNamespace,
    pageTemplatePlan,
    needsIgamingCss,
    needsSiteShellCss,
    sharedHeaderPresetId,
    sharedFooterPresetId,
    siteChromeTemplateId,
    spot064RailPartialReady,
    strictEtalonLayout,
    clonedMainByFile,
    clonedChrome,
    singleEtalonTemplateId,
  };
  if (usesDualSiteTemplates() && !strictEtalonLayout) {
    emitLog(
      onLog,
      `Shared chrome presets: template=${siteChromeTemplateId}; header H${sharedHeaderPresetId}/10 + footer F${sharedFooterPresetId}/10 (fixed for all pages of this site; anti-repeat window=10).`
    );
  }

  const results = [];
  const previousMainTexts = [];
  const previousDomSignatures = [];
  const previousClassRhythmSignatures = [];
  const previousDepthHistSignatures = [];
  const crossBuildHistory = isCrossBuildMemoryEnabled()
    ? await loadCrossBuildSignatureMemory()
    : [];
  const crossBuildFresh = [];
  if (isCrossBuildMemoryEnabled()) {
    emitLog(
      onLog,
      `Анти-дубликат (между сайтами): загружено сигнатур ${crossBuildHistory.length}`
    );
  } else if (isFreeGenerationMode()) {
    emitLog(
      onLog,
      "Свободная генерация: без quality-regen, памяти прошлых сайтов и LLM remix/rewrite промптов; уникальность — seed/manifest/палитра этого билда."
    );
  } else {
    emitLog(onLog, "Память каркасов прошлых сайтов: выключена (SOFTGEN_CROSS_BUILD_MEMORY_ENABLED=0)");
  }
  await writeBuildProgress(outputDir, pages.length, 0);
  for (let i = 0; i < pages.length; i++) {
    ensureNotStopped();
    const pageMeta = pages[i];
    ctx.minPageWords = minWordsTargetForPageFile(pageMeta.file);
    ctx.avoidPhrases = isQualityRegenEnabled()
      ? buildAvoidPhrases(previousMainTexts)
      : [];
    ctx.similarityRetryCount = 0;
    ctx.wordCountRetryCount = 0;
    ctx.wordCountOverMaxRetryCount = 0;
    ctx.pageRegenReason = "";
    ctx.isFirstSitePage = i === 0;
    const pageCapLog =
      ctx.claudePageMaxTokensByFile?.[pageMeta.file] ?? ctx.claudePageMaxTokens;
    if (pageCapLog) {
      emitLog(
        onLog,
        `Страница «${pageMeta.file}»: max_tokens≈${pageCapLog} (бюджет пакета)`
      );
    }
    let bundle = await generatePageBundle(
      claudeKey,
      ctx,
      pageMeta,
      i + 1,
      onLog
    );
    const maxTruncRetries = Math.max(
      0,
      Number(process.env.SOFTGEN_TRUNCATED_PAGE_RETRIES ?? 1) || 0
    );
    for (let tr = 0; bundle.truncatedMain && tr < maxTruncRetries; tr++) {
      ensureNotStopped();
      emitLog(
        onLog,
        `Страница «${pageMeta.file}»: обрезанный HTML — повтор ${tr + 1}/${maxTruncRetries}…`
      );
      ctx.wordCountRetryCount = Math.max(
        Number(ctx.wordCountRetryCount) || 0,
        tr + 1
      );
      try {
        bundle = await generatePageBundle(
          claudeKey,
          ctx,
          pageMeta,
          i + 1,
          onLog
        );
      } catch (truncErr) {
        emitLog(
          onLog,
          `Предупреждение: «${pageMeta.file}» — повтор после обрезки не удался (${String(truncErr?.message || truncErr).slice(0, 180)})`
        );
        break;
      }
    }
    const textRegenStages = getTextRegenStages();
    if (!ctx.strictEtalonLayout) {
    for (let retry = 0; retry < textRegenStages; retry++) {
        ensureNotStopped();
        const maxSim = previousMainTexts.length
          ? Math.max(
              ...previousMainTexts.map((txt) =>
                jaccardSimilarity(txt, bundle.mainText || "")
              )
            )
          : 0;
        const domSig = buildDomStructureSignature(bundle.html || "");
        const maxDomSim = previousDomSignatures.length
          ? Math.max(
              ...previousDomSignatures.map((sig) => jaccardSimilarity(sig, domSig))
            )
          : 0;
        const classRhythmSig = buildClassNamingRhythmSignature(bundle.html || "");
        const maxClassRhythmSim = previousClassRhythmSignatures.length
          ? Math.max(
              ...previousClassRhythmSignatures.map((sig) =>
                jaccardSimilarity(sig, classRhythmSig)
              )
            )
          : 0;
        const depthHistSig = buildDomDepthHistogramSignature(bundle.html || "");
        const maxDepthHistSim = previousDepthHistSignatures.length
          ? Math.max(
              ...previousDepthHistSignatures.map((sig) =>
                jaccardSimilarity(sig, depthHistSig)
              )
            )
          : 0;
        const maxCrossBuildDomSim = crossBuildHistory.length
          ? Math.max(
              ...crossBuildHistory.map((row) =>
                jaccardSimilarity(row?.domSig || "", domSig)
              )
            )
          : 0;
        const maxCrossBuildClassSim = crossBuildHistory.length
          ? Math.max(
              ...crossBuildHistory.map((row) =>
                jaccardSimilarity(row?.classRhythmSig || "", classRhythmSig)
              )
            )
          : 0;
        const words = countWords(bundle.mainText || "");
        const minWordsPage = minWordsTargetForPageFile(pageMeta.file);
        const contractQuality =
          isQualityRegenEnabled() && !ctx.strictEtalonLayout
            ? evaluatePageQualityRegen({
                html: bundle.html || "",
                mainText: bundle.mainText || "",
                wordCount: words,
                gatewayUrl: ctx.gatewayUrl,
                pages: ctx.allPages,
                pageFile: pageMeta.file,
                minWords: minWordsPage,
              })
            : { regen: false };
        const contractFail = Boolean(contractQuality.regen);
        const tooShort = words < minWordsPage;
        const tooLong = words > MAX_PAGE_WORDS;
        const truncatedMain = Boolean(bundle.truncatedMain);
        const headingBrandMentions = countBrandMentionsInHeadings(
          bundle.html || "",
          ctx.brandTerms || []
        );
        const tooFewBrandMentions =
          headingBrandMentions < MIN_BRAND_MENTIONS_IN_HEADINGS;
        const paragraphBrandMentions = countBrandMentionsInParagraphs(
          bundle.html || "",
          ctx.brandTerms || []
        );
        const tooFewBrandParagraphMentions =
          paragraphBrandMentions < MIN_BRAND_MENTIONS_IN_PARAGRAPHS;
        const tooSimilar =
          previousMainTexts.length && maxSim >= MAIN_TEXT_SIMILARITY_REGEN_THRESHOLD;
        const tooSimilarCrossBuild =
          maxCrossBuildDomSim >= CROSS_BUILD_DOM_SIM_THRESHOLD ||
          maxCrossBuildClassSim >= CROSS_BUILD_CLASS_SIM_THRESHOLD;
        const shouldCheckReference =
          Boolean(ctx.referenceStructureSignals) &&
          (!REFERENCE_SIMILARITY_CHECK_INDEX_ONLY || isIndexPageFile(pageMeta.file));
        const refSim = shouldCheckReference
          ? computeReferenceStructureSimilarity(
              bundle.html || "",
              ctx.referenceStructureSignals
            )
          : null;
        const pageTplHtml = resolveMainHtmlTemplateForPage(
          ctx.referenceStructureSignals || {},
          pageMeta.file
        );
        const skipRefStructureGate = Boolean(
          ctx.strictEtalonLayout ||
            (ctx.referenceTemplateMode &&
              String(pageTplHtml || "").trim().length > 0)
        );
        const tooFarFromReference = Boolean(
          !skipRefStructureGate &&
            shouldCheckReference &&
            refSim &&
            Number(refSim.score) < REFERENCE_STRUCTURE_SIMILARITY_THRESHOLD
        );
        const tooLowReferenceOrder = Boolean(
          !skipRefStructureGate &&
            shouldCheckReference &&
            refSim &&
            Number(refSim.sectionsOrder) < REFERENCE_SECTION_ORDER_MIN
        );
        if (
          !tooShort &&
          !tooLong &&
          !truncatedMain &&
          !contractFail &&
          !tooSimilar &&
          !tooSimilarCrossBuild &&
          !tooFarFromReference &&
          !tooLowReferenceOrder &&
          maxDomSim < DOM_STRUCTURE_SIMILARITY_REGEN_THRESHOLD &&
          maxClassRhythmSim < CLASS_RHYTHM_SIMILARITY_REGEN_THRESHOLD &&
          maxDepthHistSim < DOM_DEPTH_HIST_SIMILARITY_REGEN_THRESHOLD &&
          !tooFewBrandMentions &&
          !tooFewBrandParagraphMentions
        ) {
          break;
        }
        if (contractFail) {
          ctx.pageRegenReason = contractQuality.reason || "quality_contract";
        }
        ctx.similarityRetryCount = retry + 1;
        if (tooShort) ctx.wordCountRetryCount = retry + 1;
        if (tooLong) ctx.wordCountOverMaxRetryCount = retry + 1;
        if (truncatedMain) ctx.wordCountRetryCount = retry + 1;
        emitLog(
          onLog,
          `Страница «${pageMeta.file}»: ${truncatedMain ? "обрезанный HTML (нет </main> или обрыв текста); " : ""}${contractFail ? `контракт JSON/ссылок (${contractQuality.reason}); ` : ""}${tooShort ? `объём ${words} слов (< ${minWordsPage}); ` : ""}${tooLong ? `объём ${words} слов (> ${MAX_PAGE_WORDS}); ` : ""}${tooFewBrandMentions ? `бренд в h1-h3=${headingBrandMentions} (< ${MIN_BRAND_MENTIONS_IN_HEADINGS}); ` : ""}${tooFewBrandParagraphMentions ? `бренд в <p>=${paragraphBrandMentions} (< ${MIN_BRAND_MENTIONS_IN_PARAGRAPHS}); ` : ""}${tooSimilar ? `text-sim=${maxSim.toFixed(2)} (порог < ${(MAIN_TEXT_SIMILARITY_REGEN_THRESHOLD * 100).toFixed(0)}%); ` : ""}${tooSimilarCrossBuild ? `cross-build dom=${maxCrossBuildDomSim.toFixed(2)} (порог < ${(CROSS_BUILD_DOM_SIM_THRESHOLD * 100).toFixed(0)}%), cross-build class=${maxCrossBuildClassSim.toFixed(2)} (порог < ${(CROSS_BUILD_CLASS_SIM_THRESHOLD * 100).toFixed(0)}%); ` : ""}${(tooFarFromReference || tooLowReferenceOrder) && refSim ? `ref-structure=${refSim.score.toFixed(2)} (порог >= ${(REFERENCE_STRUCTURE_SIMILARITY_THRESHOLD * 100).toFixed(0)}%; secSet=${refSim.sectionsSet.toFixed(2)}, secOrder=${refSim.sectionsOrder.toFixed(2)} (min ${(REFERENCE_SECTION_ORDER_MIN * 100).toFixed(0)}%), semStyle=${refSim.semanticStyleSet.toFixed(2)}, layout=${refSim.layoutFlagsMatch.toFixed(2)}, mix=${Number(refSim.fullCompositeScore).toFixed(2)}); ` : ""}dom-sim=${maxDomSim.toFixed(2)}, class-rhythm=${maxClassRhythmSim.toFixed(2)}, depth-hist=${maxDepthHistSim.toFixed(2)} — похожесть каркаса на уже готовые страницы этого сайта (Jaccard 0…1; **чем ниже — тем лучше**); пока любая из метрик **≥** порога (${(DOM_STRUCTURE_SIMILARITY_REGEN_THRESHOLD * 100).toFixed(0)}% / ${(CLASS_RHYTHM_SIMILARITY_REGEN_THRESHOLD * 100).toFixed(0)}% / ${(DOM_DEPTH_HIST_SIMILARITY_REGEN_THRESHOLD * 100).toFixed(0)}%) — перегенерация ${retry + 1}/${textRegenStages}…`
        );
        const mergedAvoid = buildAvoidPhrases([
          ...previousMainTexts,
          bundle.mainText || "",
        ]);
        ctx.avoidPhrases = [
          ...mergedAvoid,
          "бонус",
          "регистрация",
          "популярные игры",
          "vip",
          "преимущества",
          "гарантия",
          "лучший",
          "удобный",
          "надежный",
          "простой",
        ].slice(0, 40);
        try {
          bundle = await generatePageBundle(
            claudeKey,
            ctx,
            pageMeta,
            i + 1,
            onLog
          );
        } catch (regenErr) {
          emitLog(
            onLog,
            `Предупреждение: «${pageMeta.file}» — перегенерация ${retry + 1}/${textRegenStages} не удалась (${String(regenErr?.message || regenErr).slice(0, 220)}); сохраняем последнюю успешную версию страницы`
          );
          break;
        }
      }
    }

    if (!ctx.strictEtalonLayout) {
      bundle = await tryClampPageHtmlMainToMaxWordCount({
        bundle,
        maxWords: MAX_PAGE_WORDS,
        claudeApiKey: claudeKey,
        claudeBudgetTracker,
        pageMeta,
        onLog,
        shouldStop: shouldStopJob,
      });
    }
    const wordsAfterClamp = countWords(bundle.mainText || "");
    const minWordsFinal = minWordsTargetForPageFile(pageMeta.file);
    if (wordsAfterClamp > MAX_PAGE_WORDS) {
      emitLog(
        onLog,
        `Предупреждение: «${pageMeta.file}» — ${wordsAfterClamp} слов в <main> (ориентир макс. ${MAX_PAGE_WORDS}); сохраняем страницу и продолжаем сборку.`
      );
    } else if (wordsAfterClamp < minWordsFinal) {
      emitLog(
        onLog,
        `Предупреждение: «${pageMeta.file}» — ${wordsAfterClamp} слов в <main> (ориентир мин. ${minWordsFinal}); сохраняем страницу и продолжаем сборку.`
      );
    }

    ensureNotStopped();
    let htmlOut = bundle.html;

    const finalWordCount = countWords(bundle.mainText || "");
    emitLog(
      onLog,
      `Финальное количество слов "${pageMeta.file}" = ${finalWordCount}`
    );
    emitLog(onLog, `Запись на диск: ${pageMeta.file}, css/page-${i + 1}.css, js/page-${i + 1}.js`);
    await fs.writeFile(
      path.join(outputDir, pageMeta.file),
      wrapMultipagePhpDocument(htmlOut, { generationMode }),
      "utf8"
    );
    await fs.writeFile(
      path.join(cssDir, `page-${i + 1}.css`),
      rewriteImgUrlsForExternalPageCss(bundle.css),
      "utf8"
    );
    await fs.writeFile(
      path.join(jsDir, `page-${i + 1}.js`),
      bundle.js,
      "utf8"
    );
    previousMainTexts.push(bundle.mainText || "");
    const finalDomSig = buildDomStructureSignature(bundle.html || "");
    const finalClassRhythmSig = buildClassNamingRhythmSignature(bundle.html || "");
    const finalDepthHistSig = buildDomDepthHistogramSignature(bundle.html || "");
    previousDomSignatures.push(finalDomSig);
    previousClassRhythmSignatures.push(finalClassRhythmSig);
    previousDepthHistSignatures.push(finalDepthHistSig);
    crossBuildFresh.push({
      createdAt: new Date().toISOString(),
      projectName: safeName,
      pageFile: pageMeta.file,
      domSig: finalDomSig,
      classRhythmSig: finalClassRhythmSig,
      depthHistSig: finalDepthHistSig,
    });
    const pageTplForChrome = resolvePageSiteTemplate(
      ctx.referenceStructureSignals || {},
      pageMeta.file
    );
    const chromeAlready = usesDualSiteTemplates()
      ? ctx.siteCanonicalChromeByTemplate?.[pageTplForChrome]
      : ctx.siteCanonicalChrome;
    if (
      usesPremiumIgamingLayout() &&
      !templateChromeEnabled &&
      (!referenceLocked || usesDualSiteTemplates()) &&
      !chromeAlready
    ) {
      const pair = extractChromePairFromHtml(bundle.html || "");
      const hdrOk =
        pair.headerHtml &&
        (isWellFormedChromeFragment(pair.headerHtml, "header") ||
          /<aside\b/i.test(pair.headerHtml)) &&
        pair.headerHtml.length >= 48;
      const ftrOk =
        pair.footerHtml &&
        isWellFormedChromeFragment(pair.footerHtml, "footer") &&
        pair.footerHtml.length >= 48;
      if (hdrOk || ftrOk) {
        const chromePair = {
          headerHtml: hdrOk ? pair.headerHtml : "",
          footerHtml: ftrOk ? pair.footerHtml : "",
        };
        if (usesDualSiteTemplates()) {
          ctx.siteCanonicalChromeByTemplate[pageTplForChrome] = chromePair;
        } else {
          ctx.siteCanonicalChrome = chromePair;
        }
        emitLog(
          onLog,
          usesDualSiteTemplates()
            ? `Site chrome (шаблон ${pageTplForChrome === SITE_TEMPLATE_SPOT064 ? "2" : "1"}): зафиксированы ${hdrOk ? "rail/header" : ""}${hdrOk && ftrOk ? " + " : ""}${ftrOk ? "footer" : ""} с «${pageMeta.file}».`
            : `Site chrome: зафиксированы ${hdrOk ? "header" : ""}${hdrOk && ftrOk ? " + " : ""}${ftrOk ? "footer" : ""} с «${pageMeta.file}» для остальных страниц.`
        );
      }
    }
    results.push(pageMeta.file);
    await writeBuildProgress(outputDir, pages.length, results.length);
  }

  ensureNotStopped();
  emitLog(onLog, "Запись .htaccess, warmup_text_cache.php, robots.txt, sitemap.xml…");
  await writeMultipageHtaccess(outputDir);
  await writeStaticWarmupScript(outputDir, pages.length);
  const sitemapPaths = pages.map((p) =>
    isIndexPageFile(p.file) ? "/" : `/${p.file}`
  );
  await writeRobotsSitemap(outputDir, baseUrl, sitemapPaths);

  ensureNotStopped();
  emitLog(onLog, "Финальная проверка качества (файлы, ссылки, img, блоки)…");
  let qualityGate = { ok: true, errors: [], warnings: [], pages: [] };
  try {
    qualityGate = await runGeneratedSiteQualityGate(outputDir, {
      pages: results,
      baseUrl,
      chromeShell,
      onLog,
    });
    await fs.writeFile(
      path.join(outputDir, ".aurora_quality_gate.json"),
      JSON.stringify(qualityGate, null, 2),
      "utf8"
    );
    if (qualityGate.ok) {
      emitLog(
        onLog,
        `QA сайта: пройдено (${results.length} стр., предупреждений ${qualityGate.warningCount || 0})`
      );
    } else {
      emitLog(
        onLog,
        `QA сайта: есть ошибки (${qualityGate.errorCount || 0}) — см. .aurora_quality_gate.json и лог выше`
      );
    }
  } catch (qaErr) {
    emitLog(onLog, `QA сайта: прервано — ${String(qaErr?.message || qaErr).slice(0, 280)}`);
    throw qaErr;
  }

  const keyLine = `${claudeKey.trim()}\n`;
  await fs.writeFile(path.join(outputDir, ".claude_api_key"), keyLine, {
    encoding: "utf8",
    mode: 0o600,
  });

  const manifest = {
    mode: "multipage-static",
    generationMode,
    ...(strictEtalonLayout && singleEtalonTemplateId
      ? { etalonTemplateId: singleEtalonTemplateId }
      : {}),
    projectName: safeName,
    windowId: wid,
    theme: themeNorm,
    baseUrl,
    buildNonce,
    yandexVerification,
    pages: results,
    generatedAt: new Date().toISOString(),
    model: ANTHROPIC_MODEL,
    chromeShell,
    qualityGate: {
      ok: Boolean(qualityGate?.ok),
      errorCount: Number(qualityGate?.errorCount) || 0,
      warningCount: Number(qualityGate?.warningCount) || 0,
    },
  };
  await fs.writeFile(
    path.join(outputDir, ".aurora_multipage.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  if (isCrossBuildMemoryEnabled()) {
    await saveCrossBuildSignatureMemory([...crossBuildHistory, ...crossBuildFresh]);
  }
  await fs.rm(path.join(outputDir, AURORA_BUILD_PROGRESS), { force: true });

  emitLog(onLog, `Готово. Страницы: ${results.join(", ")}`);
  return {
    projectName: safeName,
    outputDir,
    mode: "multipage-static",
    windowId: wid,
    theme: themeNorm,
    baseUrl,
    pages: results,
    imageAssets: imageFiles,
    manifest,
    qualityGate,
  };
}
