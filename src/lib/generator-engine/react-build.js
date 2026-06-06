import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getAppRoot, getProjectsDir, getImgGenDir } from "@/src/lib/app-paths";
import {
  buildImagePools,
  formatBrandPromptOverlay,
  formatImagePoolsLogLine,
  resolveBannerImageFiles,
  resolveGameImageFiles,
  resolvePaymentImageFiles,
} from "@/lib/brand-image-pools";
import {
  resolveGatewayUrlForBuild,
  pickLogoSrcForBuild,
  pickGameImages,
} from "@/src/lib/brand-chrome";
import {
  selectGenerationPromptProfileForBuild,
  formatFullGenerationPromptOnly,
  formatGenerationPromptProfileBlock,
} from "@/src/lib/generation-prompt-profiles";
import { buildSiteGenerationRulesBlock } from "@/lib/generator-engine/generation-site-rules";
import { normalizePalette } from "@/lib/generator-brand-palette";
import { loadSourceArticlesContextForBuild } from "@/lib/generator-engine/source-articles-for-generation";
import { normalizeGenerationMode } from "@/src/lib/generation-modes";
import { isReactBuildEnabled } from "@/src/lib/generation-stack";
import {
  finalizeReactDeployableSite,
  phpFileToRoutePath,
  routePathsForSitemap,
} from "@/src/lib/site-ops";
import { sanitizeProjectName } from "@/src/lib/project-paths";
import {
  buildAnthropicRequestHeaders,
  describeClaudeKeyForBuildLog,
  getAnthropicMessagesUrl,
  isAcceptableClaudeApiKey,
} from "@/lib/generator-llm-endpoint";
import { stripModelJsonFences } from "@/lib/generator-engine/multipage-prompt-contract";
import {
  pickRegistryComponentsForArchitect,
  formatComponentRegistryForArchitect,
  formatComponentRegistryForCodegen,
  getRegistryComponentById,
} from "@/src/lib/react-component-registry";
import {
  buildUiUxProMaxSystemBlock,
  buildUiUxProMaxUserHint,
} from "@/src/lib/design-skills-prompt";

const execFileAsync = promisify(execFile);
const PROJECTS_DIR = getProjectsDir();
const REACT_SRC_DIR = "_react_src";
const TEMPLATE_DIR = path.join(getAppRoot(), "assets/react-lab-template");

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";

const INNER_PAGE_SLUG_POOL = [
  "reviews",
  "registration",
  "payments",
  "bonus",
  "games",
  "vip",
  "slots",
  "mirror",
  "promo",
  "faq-page",
  "support",
  "about",
];

function emitLog(onLog, message) {
  if (typeof onLog === "function") onLog(String(message || ""));
}

function randomHex(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

function normalizeSiteUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return withScheme.replace(/\/+$/, "");
  }
}

function resolveWindowApiKey(windowId, override) {
  const fromBody = String(override || "").trim();
  if (fromBody) return fromBody;
  const wid = Math.trunc(Number(windowId));
  const envKeys = [
    process.env[`ANTHROPIC_API_KEY_W${wid}`]?.trim(),
    process.env[`CLAUDE_API_KEY_${wid}`]?.trim(),
    process.env[`ANTHROPIC_WINDOW_${wid}`]?.trim(),
  ].filter(Boolean);
  if (envKeys.length) return envKeys[0];
  throw new Error(
    `Нет API-ключа для окна ${windowId}: задайте ключ в UI или env ANTHROPIC_API_KEY_W${windowId}.`
  );
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

function shuffleWithSeed(items, seedStr) {
  const arr = [...items];
  let state = siteHash32(seedStr) || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickExpectedPageFiles(seed, totalPagesExplicit) {
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

function extractJsonObject(text) {
  let raw = stripModelJsonFences(String(text || "").trim());
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Модель не вернула JSON.");
  }
  const slice = raw.slice(start, end + 1).replace(/,(\s*[\]}])/g, "$1");
  return JSON.parse(slice);
}

async function callClaude({ apiKey, system, user, maxTokens = 8192, temperature = 0.7, onLog }) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Пустой Claude API key.");
  if (!isAcceptableClaudeApiKey(key)) {
    throw new Error("Недопустимый Claude API key.");
  }
  emitLog(onLog, "LLM: Claude (React Lab)");
  const messagesUrl = getAnthropicMessagesUrl(key);
  const payload = JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: String(system || "").slice(0, 120000),
    messages: [{ role: "user", content: user }],
  });
  const res = await fetch(messagesUrl, {
    method: "POST",
    headers: buildAnthropicRequestHeaders(key),
    body: payload,
  });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${rawText.slice(0, 400)}`);
  }
  const data = JSON.parse(rawText);
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = blocks
    .filter((b) => b?.type === "text")
    .map((b) => String(b.text || ""))
    .join("\n")
    .trim();
  if (!text) throw new Error("Claude вернул пустой ответ.");
  return text;
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
    } catch {
      /* skip */
    }
  }
  return copied.sort();
}

function phpFileToComponentName(phpFile) {
  const slug = String(phpFile || "")
    .replace(/\.php$/i, "")
    .replace(/[^a-zA-Z0-9]/g, " ");
  const parts = slug.split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0].toLowerCase() === "index") return "HomePage";
  return `${parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("")}Page`;
}

function stripCodeFences(code) {
  let s = String(code || "").trim();
  s = s.replace(/^```(?:tsx?|jsx?|typescript|javascript)?\s*/i, "");
  s = s.replace(/\s*```$/i, "");
  return s.trim();
}

function normalizeComponentIds(raw) {
  const ids = Array.isArray(raw) ? raw : [];
  return ids
    .map((id) => String(id || "").trim())
    .filter((id) => Boolean(getRegistryComponentById(id)));
}

const REACT_MIN_PAGE_WORDS = (() => {
  const raw = Number(process.env.SOFTGEN_REACT_MIN_PAGE_WORDS);
  if (Number.isFinite(raw) && raw >= 400) return Math.min(5000, Math.trunc(raw));
  return 1200;
})();

const GENERIC_BRAND_PHRASE_RE =
  /\b(о нашем(?:\s+казино)?|онлайн[\s-]*казино|казино[\s-]*онлайн)\b/gi;
const GENERIC_BRAND_PHRASE_TEST =
  /\b(о нашем(?:\s+казино)?|онлайн[\s-]*казино|казино[\s-]*онлайн)\b/i;

function resolveReactBrandName({ brandKit }) {
  const fromKit = String(brandKit?.brandName || brandKit?.publicBrandName || "").trim();
  if (fromKit) return fromKit;
  return "Бренд";
}

function scrubGenericBrandPhrases(text, brandName) {
  const bn = String(brandName || "").trim();
  if (!bn) return String(text || "").trim();
  return String(text || "")
    .replace(GENERIC_BRAND_PHRASE_RE, bn)
    .replace(/\{brand\}/gi, bn)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizePagesForBrand(pages, brandName) {
  const bn = String(brandName || "").trim() || "Бренд";
  return pages.map((page, i) => {
    let title = scrubGenericBrandPhrases(page.title, bn);
    let description = scrubGenericBrandPhrases(page.description, bn);
    if (!title || GENERIC_BRAND_PHRASE_TEST.test(title)) {
      title =
        i === 0
          ? `${bn} — официальный обзор платформы, игры и бонусы`
          : `${bn} — ${page.navLabel || page.role || "раздел"}`;
    }
    if (!description || description.length < 40) {
      description = `${bn}: ${page.contentAngle || page.role || "информация о платформе, бонусах и играх для игроков."}`;
    }
    return { ...page, title, description };
  });
}

function navLabelForPage(page, index) {
  const role = String(page.role || "").trim();
  if (role && role.length <= 48 && !/—|обзор платформы/i.test(role)) return role;
  const slug = String(page.file || "").replace(/\.php$/i, "").toLowerCase();
  const map = {
    index: "Главная",
    reviews: "Отзывы",
    registration: "Регистрация",
    payments: "Платежи",
    bonus: "Бонусы",
    games: "Игры",
    vip: "VIP",
    slots: "Слоты",
    mirror: "Зеркало",
    promo: "Акции",
    support: "Поддержка",
    about: "О нас",
  };
  return map[slug] || `Страница ${index + 1}`;
}

function ensureRichPageComponents(pages) {
  return pages.map((page, i) => {
    const ids = [...page.componentIds];
    if (i === 0) {
      const hasGames = ids.includes("slot-grid") || ids.includes("game-carousel");
      if (!hasGames) ids.splice(1, 0, "game-carousel", "slot-grid");
      if (!ids.includes("section-with-bg")) ids.push("section-with-bg");
      while (ids.filter((id) => id === "prose-block").length < 2) ids.push("prose-block");
    } else {
      if (!ids.includes("prose-block")) ids.push("prose-block");
      if (!ids.includes("content-split")) ids.unshift("content-split");
    }
    return { ...page, componentIds: [...new Set(ids)] };
  });
}

function normalizePagesPlan(rawPages, expectedFiles) {
  const byFile = new Map();
  for (const p of Array.isArray(rawPages) ? rawPages : []) {
    const file = String(p?.file || "").trim().toLowerCase();
    if (file && expectedFiles.includes(file)) byFile.set(file, p);
  }
  const pages = expectedFiles.map((file, i) => {
    const p = byFile.get(file) || {};
    const route = phpFileToRoutePath(file);
    let componentIds = normalizeComponentIds(p.componentIds);
    if (!componentIds.length) {
      componentIds =
        i === 0
          ? [
              "hero-gradient",
              "game-carousel",
              "prose-block",
              "slot-grid",
              "section-with-bg",
              "prose-block",
              "feature-cards",
              "faq-accordion",
              "cta-banner",
            ]
          : ["content-split", "prose-block", "section-with-bg", "faq-accordion", "cta-banner"];
    }
    const role = String(p.role || (i === 0 ? "Главная" : "Раздел")).trim();
    return {
      file,
      route,
      role,
      title: String(p.title || `Страница ${i + 1}`).trim(),
      description: String(p.description || "").trim(),
      contentAngle: String(p.contentAngle || "").trim(),
      componentName: phpFileToComponentName(file),
      componentIds,
      navLabel: navLabelForPage({ ...p, file, role }, i),
    };
  });
  return ensureRichPageComponents(pages);
}

async function hasViteInNodeModules(reactSrcDir) {
  try {
    await fs.access(path.join(reactSrcDir, "node_modules", "vite", "package.json"));
    return true;
  } catch {
    return false;
  }
}

/** Child process env for Vite build; cap heap for 512MB Render instances. */
function reactBuildChildEnv() {
  const mbRaw = Number(process.env.SOFTGEN_REACT_NODE_MAX_MB);
  const mb = Number.isFinite(mbRaw) && mbRaw >= 128
    ? Math.min(512, Math.trunc(mbRaw))
    : 280;
  const memFlag = `--max-old-space-size=${mb}`;
  const base = String(process.env.NODE_OPTIONS || "").trim();
  return {
    ...process.env,
    NODE_OPTIONS: base ? `${base} ${memFlag}` : memFlag,
  };
}

async function runNpmBuild(reactSrcDir, onLog) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const childEnv = reactBuildChildEnv();
  const preinstalled = await hasViteInNodeModules(reactSrcDir);
  if (!preinstalled) {
    emitLog(onLog, "React Lab: npm install (немає node_modules у шаблоні)…");
    await execFileAsync(
      npmCmd,
      ["install", "--no-audit", "--no-fund", "--include=dev"],
      {
        cwd: reactSrcDir,
        env: childEnv,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 600000,
      }
    );
  } else {
    emitLog(
      onLog,
      "React Lab: node_modules з шаблону — npm install пропущено (економія RAM на Render)"
    );
  }
  emitLog(onLog, "React Lab: vite build…");
  await execFileAsync(npmCmd, ["run", "build"], {
    cwd: reactSrcDir,
    env: childEnv,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600000,
  });
}

function buildArchitectUserPrompt({
  theme,
  expectedFiles,
  themeBrandHint,
  profilePrompt,
  brandPromptOverlay,
  siteRules,
  gatewayUrl,
  imageFiles,
  registryBlock,
  designHint,
  minPageWords,
  sourceArticlesBlock,
}) {
  const singlePage = expectedFiles.length <= 1;
  return `
Тема сайта: ${theme}
Бренд в текстах (СТРОГО): ${themeBrandHint}
Базовый шлюз регистрации (CTA): ${gatewayUrl}
Страницы пакета (ровно ${expectedFiles.length}): ${expectedFiles.join(", ")}
Для каждой страницы укажи file (как в списке), role (короткая русская подпись для меню, 1–4 слова), title, description, contentAngle, componentIds (6–8 id на главной, 4–6 на внутренних).
Стек: React + Vite + Tailwind + framer-motion + curated registry, левый сайдбар с иконками и профессиональный footer в layout.
${singlePage ? "Одностраничный сайт: навигация только в левом сайдбаре; в header НЕТ ссылок на разделы." : "Многостраничный: навигация в левом сайдбаре (иконки + подписи); header — логотип и CTA."}

${registryBlock}

${siteRules}

${designHint}

${sourceArticlesBlock ? `${sourceArticlesBlock}\n` : ""}
${brandPromptOverlay ? `=== БРЕНД КЛИЕНТА ===\n${brandPromptOverlay}\n` : ""}
${profilePrompt ? `=== ПРОМПТ ПРОФИЛЯ ===\n${profilePrompt}` : ""}

Верни ТОЛЬКО JSON: { "brandName": string, "pages": [ { "file", "role", "title", "description", "contentAngle", "componentIds" } ] }
- Поле **brandName** в корне — строго «${themeBrandHint}» (из /brand пользователя); запрещены «О нашем казино», «онлайн казино», {brand}.
- title и description каждой страницы должны содержать «${themeBrandHint}», не общие фразы.
- Для index.php в componentIds: hero-gradient, game-carousel, slot-grid, минимум 2× prose-block, section-with-bg, feature-cards, faq-accordion (6–8 id).
- Для внутренних страниц: content-split, prose-block, section-with-bg, faq-accordion.
- role — короткое меню («Главная», «Бонусы», «Платежи»), не длинный SEO-заголовок.
- title/description планируй под объём не меньше ${minPageWords} слов контента на странице.
Допустимые img: ${(imageFiles || []).slice(0, 20).join(", ")}
`.trim();
}

function buildPageCodegenPrompt({
  page,
  brandName,
  theme,
  profilePrompt,
  brandPromptOverlay,
  siteRules,
  gatewayUrl,
  gameImages,
  bannerImages,
  paymentImages,
  registryCodegenBlock,
  designHint,
  minPageWords,
  sourceArticlesBlock,
}) {
  const needsSlotGrid = page.componentIds.includes("slot-grid");
  const needsCarousel = page.componentIds.includes("game-carousel");
  const needsProse = page.componentIds.includes("prose-block");
  const proseCount = page.componentIds.filter((id) => id === "prose-block").length;
  return `
Сгенерируй ОДИН React TSX-файл (functional component) для страницы.
Экспорт: export function ${page.componentName}() { ... }
Без default export. Без import React unless needed.
Tailwind utility classes, framer-motion для 2–4 секций (motion.section).
Язык контента: русский. Бренд в текстах: **${brandName}** (везде вместо {brand} и общих фраз). Тема: ${theme}.
Страница: file=${page.file}, route=${page.route}, title=${page.title}, description=${page.description}, angle=${page.contentAngle}.
CTA на gateway: ${gatewayUrl}

ОБЯЗАТЕЛЬНЫЕ ИМПОРТЫ:
import { GATEWAY_URL, BRAND_NAME, GAME_IMAGE_PATHS } from "../lib/site-routes";
- Используй BRAND_NAME в заголовках и абзацах (не «О нашем казино», не плейсхолдеры).
${needsSlotGrid ? "- Обязательно <SlotGrid title=\"Популярные слоты\" images={GAME_IMAGE_PATHS} gatewayHref={GATEWAY_URL} />." : ""}
${needsCarousel ? "- Обязательно <GameCarousel title=\"Популярные игры\" intro=\"2–3 предложения\" images={GAME_IMAGE_PATHS} gatewayHref={GATEWAY_URL} />." : ""}
${needsProse ? `- Обязательно ${proseCount >= 2 ? "два" : "один"} <ProseBlock title=\"…\" paragraphs={[ \"абзац 3–5 предложений\", … ]} /> — каждый paragraphs: 3–5 полных предложений, уникальный текст с ${brandName}.` : ""}

Игровые превью (только SlotGrid/GameCarousel): ${gameImages.join(", ") || "GAME_IMAGE_PATHS из site-routes"}
Баннеры (hero, SectionWithBg): ${bannerImages.join(", ") || "banner-* из ./img/"}
Иконки оплат (страница payments, footer): ${paymentImages.join(", ") || "pay-* из ./img/"}
Пути картинок: ./img/имя_файла — только из списка билда.
Не используй slot-превью в hero; не используй баннеры и pay-* в карусели слотов. Шапка, сайдбар и footer уже в SiteLayout — только контент страницы.
Оберни контент в <div className="space-y-10"> с секциями из registry.

ОБЪЁМ: минимум ${minPageWords} слов видимого русского текста на странице.
- HeroGradient: paragraphs={[...]} — 3 абзаца по 3–5 предложений (не один subtitle).
- ProseBlock: минимум 3 абзаца в paragraphs, каждый 3–5 предложений; на главной — 2 разных ProseBlock с разными темами.
- ContentSplit: paragraphs={[...]} — 2–3 абзаца, не один короткий body.
- FAQ: 6–8 вопросов, ответ каждый 2–4 предложения; FeatureCards: body 2–4 предложения в карточке.
- SectionWithBg: body минимум 4 предложения; backgroundImage — логотип/баннер из ./img/, не webp слотов.
- Запрещены пустые <section>, пустые заголовки без абзацев, заглушки «текст», «описание», незаполненный {brand}.

${registryCodegenBlock}

${siteRules}
${designHint}
${sourceArticlesBlock ? `${sourceArticlesBlock}\n` : ""}
${brandPromptOverlay ? `=== БРЕНД КЛИЕНТА ===\n${brandPromptOverlay}\n` : ""}
${profilePrompt ? `=== ПРОМПТ ПРОФИЛЯ ===\n${profilePrompt}` : ""}

Верни ТОЛЬКО код компонента, без markdown и пояснений.
`.trim();
}

function shadeAccentHex(accentHex) {
  const raw = String(accentHex || "#d1fe17").replace(/^#/, "");
  if (raw.length !== 6) return "#c8f015";
  const channels = [0, 2, 4].map((i) => Math.max(0, Math.round(parseInt(raw.slice(i, i + 2), 16) * 0.96)));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Підставляє палітру з /brand у CSS @theme та brand-theme.ts перед vite build.
 * @param {string} reactSrcDir
 * @param {Record<string, string> | null | undefined} paletteInput
 */
async function writeBrandPaletteForBuild(reactSrcDir, paletteInput) {
  const pal = normalizePalette(paletteInput || {});
  const accentHover = shadeAccentHex(pal.accent);
  const muted = "#9aa3ad";

  const themeTs = `/**
 * Палітра з /brand (збірка Union). Не редагувати вручну — генерується react-build.
 */
export const BRAND_PALETTE = {
  accent: ${JSON.stringify(pal.accent)},
  bg: ${JSON.stringify(pal.bg)},
  text: ${JSON.stringify(pal.text)},
  block: ${JSON.stringify(pal.block)},
  card: ${JSON.stringify(pal.card)},
  gradEnd: ${JSON.stringify(pal.gradEnd)},
  muted: ${JSON.stringify(muted)},
  accentOn: ${JSON.stringify(pal.accentOn)},
  accentHover: ${JSON.stringify(accentHover)},
} as const;
`;

  const themeCss = `@theme {
  --color-brand-accent: ${pal.accent};
  --color-brand-accent-hover: ${accentHover};
  --color-brand-bg: ${pal.bg};
  --color-brand-block: ${pal.block};
  --color-brand-card: ${pal.card};
  --color-brand-text: ${pal.text};
  --color-brand-muted: ${muted};
  --color-brand-accent-on: ${pal.accentOn};
  --color-brand-grad-end: ${pal.gradEnd};
}`;

  await fs.mkdir(path.join(reactSrcDir, "src/lib"), { recursive: true });
  await fs.writeFile(path.join(reactSrcDir, "src/lib/brand-theme.ts"), themeTs, "utf8");

  const cssPath = path.join(reactSrcDir, "src/index.css");
  let css = await fs.readFile(cssPath, "utf8");
  if (/@theme\s*\{/.test(css)) {
    css = css.replace(/@theme\s*\{[\s\S]*?\}/, themeCss);
  } else {
    css = css.replace(/@import "tailwindcss";/, `@import "tailwindcss";\n\n${themeCss}`);
  }
  await fs.writeFile(cssPath, css, "utf8");
}

async function writeSiteRoutesModule(
  reactSrcDir,
  { gatewayUrl, brandName, gameImagePaths, logoSrc, pages, pageImports }
) {
  const lines = [
    `import type { ComponentType } from "react";`,
    ...pageImports.map((p) => `import { ${p.componentName} } from "../pages/${p.componentName}";`),
    ``,
    `export const GATEWAY_URL = ${JSON.stringify(gatewayUrl)};`,
    `export const BRAND_NAME = ${JSON.stringify(brandName)};`,
    `export const LOGO_SRC = ${JSON.stringify(logoSrc || "./img/logo.png")};`,
    `export const GAME_IMAGE_PATHS = ${JSON.stringify(gameImagePaths || [])};`,
    ``,
    `export type SiteRoute = {`,
    `  path: string;`,
    `  navLabel: string;`,
    `  title: string;`,
    `  description: string;`,
    `  Component: ComponentType;`,
    `};`,
    ``,
    `export const siteRoutes: SiteRoute[] = [`,
  ];
  for (const p of pages) {
    lines.push(`  {`);
    lines.push(`    path: ${JSON.stringify(p.route)},`);
    lines.push(`    navLabel: ${JSON.stringify(p.navLabel || p.role || p.title)},`);
    lines.push(`    title: ${JSON.stringify(p.title)},`);
    lines.push(`    description: ${JSON.stringify(p.description)},`);
    lines.push(`    Component: ${p.componentName},`);
    lines.push(`  },`);
  }
  lines.push(`];`, ``);
  await fs.writeFile(
    path.join(reactSrcDir, "src/lib/site-routes.ts"),
    lines.join("\n"),
    "utf8"
  );
}

async function writePageHeadMeta(reactSrcDir, pages) {
  const indexPage = pages.find((p) => p.route === "/") || pages[0];
  let html = await fs.readFile(path.join(reactSrcDir, "index.html"), "utf8");
  const title = indexPage?.title || "Сайт";
  const desc = indexPage?.description || "";
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  if (/<meta\s+name="description"/i.test(html)) {
    html = html.replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${desc.replace(/"/g, "&quot;")}" />`
    );
  } else {
    html = html.replace(
      /<\/head>/i,
      `  <meta name="description" content="${desc.replace(/"/g, "&quot;")}" />\n  </head>`
    );
  }
  await fs.writeFile(path.join(reactSrcDir, "index.html"), html, "utf8");
}

/**
 * React Lab build (variant a): scaffold → Claude codegen → npm build on Union → dist + site-ops.
 */
export async function buildReactSite({
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
  generationMode: generationModeInput = "standard",
}) {
  if (!isReactBuildEnabled()) {
    throw new Error(
      "React Lab отключён (SOFTGEN_REACT_BUILD=0). На Render задайте SOFTGEN_REACT_BUILD=1."
    );
  }

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
  if (!themeNorm) throw new Error("Укажите theme.");

  const claudeKey = resolveWindowApiKey(wid, claudeApiKey);
  const baseUrl =
    normalizeSiteUrl(siteUrl) || `https://${safeName.replace(/[^a-z0-9.-]/gi, "-")}`;

  emitLog(
    onLog,
    `React Lab: старт «${safeName}», windowId=${wid}, Claude=${ANTHROPIC_MODEL}, режим=${generationMode}`
  );
  emitLog(
    onLog,
    "React Lab RAM: npm install пропускається, якщо node_modules є в шаблоні (prepare:react-lab при деплої). Для 512MB: SOFTGEN_REACT_NODE_MAX_MB=280, 1 сторінка, без паралельних job."
  );
  emitLog(onLog, `Ключи: Claude (${describeClaudeKeyForBuildLog(claudeKey)})`);
  ensureNotStopped();

  const outputDir = path.join(PROJECTS_DIR, safeName);
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  emitLog(onLog, "Очистка папки проекта…");
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
    emitLog(onLog, `img/: ${imageFiles.length} файл(ов)`);
  }

  const buildNonce = randomHex(12);
  const structureSalt = randomHex(16);
  const gatewayUrl = resolveGatewayUrlForBuild({
    projectSlug: safeName,
    buildNonce,
  });
  const siteSeed = `${safeName}|${buildNonce}|${themeNorm}`;
  const structureSeed = `${siteSeed}|fp|${structureSalt}`;
  const expectedFiles = pickExpectedPageFiles(structureSeed, pageCountInput);
  emitLog(onLog, `План страниц: ${expectedFiles.join(", ")}`);

  const themeBrandHint = String(brandKit?.brandName || brandKit?.publicBrandName || "")
    .trim()
    .slice(0, 80);
  if (!themeBrandHint) {
    throw new Error(
      "Не задано имя бренда пользователя. Заполните brand_name на странице /brand в админке."
    );
  }
  emitLog(onLog, `Бренд клиента (admin): «${themeBrandHint}»`);
  const imagePools = buildImagePools(imageFiles);
  emitLog(onLog, `Бренд-ассеты: ${formatImagePoolsLogLine(imagePools)}`);
  const logoSrc = pickLogoSrcForBuild(imageFiles, siteSeed);
  const gameImageFiles = resolveGameImageFiles(imageFiles, imagePools, brandKit);
  const gameImages = pickGameImages(gameImageFiles, { seed: siteSeed, max: 12 });
  const gameImagePaths = gameImages.map((f) => `./img/${f}`);
  const bannerImagePaths = resolveBannerImageFiles(imageFiles, imagePools).map(
    (f) => `./img/${f}`
  );
  const paymentImagePaths = resolvePaymentImageFiles(imageFiles, imagePools).map(
    (f) => `./img/${f}`
  );
  const brandPromptOverlay = formatBrandPromptOverlay(brandKit?.promptOverlay);
  const minPageWords = REACT_MIN_PAGE_WORDS;

  let profilePrompt = "";
  let profileMetaBlock = "";
  try {
    const profile = await selectGenerationPromptProfileForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}|react`,
      themeBrandHint,
      onLog,
    });
    profilePrompt = formatFullGenerationPromptOnly(profile, { themeBrandHint });
    profileMetaBlock = formatGenerationPromptProfileBlock(profile, {
      themeBrandHint,
      publicBrandName: themeBrandHint,
    });
    if (profilePrompt || profileMetaBlock) {
      emitLog(onLog, "Профиль: generation_prompt_profiles загружен.");
    }
  } catch (e) {
    emitLog(onLog, `Профиль: пропуск (${String(e?.message || e).slice(0, 120)})`);
  }

  const siteRules = buildSiteGenerationRulesBlock({
    themeBrandHint,
    gameSlotPaths: gameImagePaths,
    bannerImagePaths,
    paymentImagePaths,
    logoSrc,
    sitePalette: brandKit?.palette || undefined,
    minPageWords,
  });

  const registryPool = pickRegistryComponentsForArchitect(`${siteSeed}|registry`, 10);
  const registryBlock = formatComponentRegistryForArchitect(registryPool);
  const designSystemBlock = buildUiUxProMaxSystemBlock({
    theme: themeNorm,
    brandName: themeBrandHint,
  });
  const designHint = buildUiUxProMaxUserHint({ pageRole: "architect" });

  let sourceArticlesArchitectBlock = "";
  try {
    const saArchitect = await loadSourceArticlesContextForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}|react`,
      pageFile: "architect",
      themeBrandHint,
      articleCount: 2,
      onLog,
    });
    sourceArticlesArchitectBlock = saArchitect.block;
  } catch (e) {
    emitLog(onLog, `source_articles (architect): ${String(e?.message || e).slice(0, 120)}`);
  }

  ensureNotStopped();
  emitLog(onLog, "Архитектор JSON (Claude)…");
  const architectRaw = await callClaude({
    apiKey: claudeKey,
    system: `${designSystemBlock}\n\nТы архитектор iGaming SPA. Ответ — только валидный JSON без markdown. Корень: brandName, pages[].`,
    user: buildArchitectUserPrompt({
      theme: themeNorm,
      expectedFiles,
      themeBrandHint,
      profilePrompt: [profileMetaBlock, profilePrompt].filter(Boolean).join("\n\n"),
      brandPromptOverlay,
      siteRules,
      gatewayUrl,
      imageFiles,
      registryBlock,
      designHint,
      minPageWords,
      sourceArticlesBlock: sourceArticlesArchitectBlock,
    }),
    maxTokens: 4096,
    temperature: 0.5,
    onLog,
  });
  const architectPlan = extractJsonObject(architectRaw);
  const brandName = resolveReactBrandName({ brandKit });
  const pages = sanitizePagesForBrand(
    normalizePagesPlan(architectPlan?.pages, expectedFiles),
    brandName
  );
  emitLog(onLog, `Бренд: ${brandName}; страниц: ${pages.length}; мин. слов: ${minPageWords}`);

  const reactSrcDir = path.join(outputDir, REACT_SRC_DIR);
  emitLog(onLog, "Копирование React Lab template…");
  await fs.cp(TEMPLATE_DIR, reactSrcDir, { recursive: true });
  await fs.mkdir(path.join(reactSrcDir, "public", "img"), { recursive: true });
  try {
    await fs.cp(imgDir, path.join(reactSrcDir, "public", "img"), { recursive: true });
  } catch {
    /* public img optional */
  }

  const generatedPages = [];
  for (const page of pages) {
    ensureNotStopped();
    emitLog(onLog, `Генерация страницы ${page.file} → ${page.componentName}…`);
    const registryCodegenBlock = formatComponentRegistryForCodegen(page.componentIds);
    const pageDesignHint = buildUiUxProMaxUserHint({ pageRole: page.role });
    let sourceArticlesPageBlock = "";
    try {
      const saPage = await loadSourceArticlesContextForBuild({
        theme: themeNorm,
        pickSeed: `${buildNonce}|${safeName}|react`,
        pageFile: page.file,
        themeBrandHint: brandName,
        onLog,
      });
      sourceArticlesPageBlock = saPage.block;
    } catch (e) {
      emitLog(onLog, `source_articles (${page.file}): ${String(e?.message || e).slice(0, 100)}`);
    }
    const pageRaw = await callClaude({
      apiKey: claudeKey,
      system: `${designSystemBlock}\n\nТы senior React+Tailwind инженер (ui-ux-pro-max). Верни только TSX-код компонента без markdown.`,
      user: buildPageCodegenPrompt({
        page,
        brandName,
        theme: themeNorm,
        profilePrompt: [profileMetaBlock, profilePrompt].filter(Boolean).join("\n\n"),
        brandPromptOverlay,
        siteRules,
        gatewayUrl,
        gameImages: gameImagePaths,
        bannerImages: bannerImagePaths,
        paymentImages: paymentImagePaths,
        registryCodegenBlock,
        designHint: pageDesignHint,
        minPageWords,
        sourceArticlesBlock: sourceArticlesPageBlock,
      }),
      maxTokens: 16000,
      temperature: 0.65,
      onLog,
    });
    const code = stripCodeFences(pageRaw);
    await fs.writeFile(
      path.join(reactSrcDir, "src/pages", `${page.componentName}.tsx`),
      `${code}\n`,
      "utf8"
    );
    generatedPages.push(page);
  }

  await writeSiteRoutesModule(reactSrcDir, {
    gatewayUrl,
    brandName,
    gameImagePaths,
    logoSrc,
    pages: generatedPages,
    pageImports: generatedPages,
  });
  await writeBrandPaletteForBuild(reactSrcDir, brandKit?.palette);
  emitLog(
    onLog,
    `Палитра /brand: accent=${brandKit?.palette?.accent || "default"}, bg=${brandKit?.palette?.bg || "default"}, text=${brandKit?.palette?.text || "default"}`
  );
  await writePageHeadMeta(reactSrcDir, generatedPages);

  ensureNotStopped();
  await runNpmBuild(reactSrcDir, onLog);

  const distDir = path.join(reactSrcDir, "dist");
  const sitemapPaths = routePathsForSitemap(generatedPages.map((p) => p.route));
  emitLog(onLog, "Финализация deployable dist + site-ops…");
  await finalizeReactDeployableSite({
    outputDir,
    distDir,
    baseUrl,
    gatewayUrl,
    sitemapPaths,
    generationMode,
  });
  emitLog(
    onLog,
    `React Lab: исходники сохранены в ${REACT_SRC_DIR}/ (не деплоятся на хост; только index.html + assets/ на production).`
  );
  // img/ уже в outputDir (бренд) або скопирован из dist/public через vite — не cp(src===dest)

  const manifest = {
    mode: "react-spa",
    stack: "react",
    generationMode,
    projectName: safeName,
    reactSrcDir: REACT_SRC_DIR,
    windowId: wid,
    theme: themeNorm,
    baseUrl,
    buildNonce,
    brandName,
    pages: generatedPages.map((p) => ({
      file: p.file,
      route: p.route,
      title: p.title,
      component: p.componentName,
      componentIds: p.componentIds,
    })),
    componentRegistry: registryPool.map((c) => c.id),
    generatedAt: new Date().toISOString(),
    model: ANTHROPIC_MODEL,
  };
  await fs.writeFile(
    path.join(outputDir, ".aurora_multipage.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  emitLog(onLog, `React Lab готово. Маршруты: ${generatedPages.map((p) => p.route).join(", ")}`);
  return {
    projectName: safeName,
    outputDir,
    mode: "react-spa",
    stack: "react",
    windowId: wid,
    theme: themeNorm,
    baseUrl,
    pages: generatedPages.map((p) => p.file),
    manifest,
  };
}
