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
  buildAnthropicMessagesBody,
  buildAnthropicRequestHeaders,
  claudeModelOmitsSamplingParams,
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
  if (claudeModelOmitsSamplingParams(ANTHROPIC_MODEL)) {
    emitLog(
      onLog,
      `Claude ${ANTHROPIC_MODEL}: temperature не передаётся (Opus 4.7+ — только prompting)`
    );
  }
  const messagesUrl = getAnthropicMessagesUrl(key);
  const payload = JSON.stringify(
    buildAnthropicMessagesBody({
      model: ANTHROPIC_MODEL,
      maxTokens,
      system,
      userContent: user,
      temperature,
      maxSystemLen: 120000,
    })
  );
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
  return 2000;
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

/** @param {string} raw */
function parseSeoKeywords(raw) {
  return String(raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

/**
 * @param {Record<string, unknown> | null | undefined} brandKit
 * @param {string} seed
 */
function resolveSiteLayoutVariant(brandKit, seed) {
  const v = String(brandKit?.layoutVariant || "auto").trim();
  if (v === "sidebar-left" || v === "top-nav") return v;
  let state = 0;
  const s = String(seed || "layout");
  for (let i = 0; i < s.length; i++) {
    state = (state * 31 + s.charCodeAt(i)) >>> 0;
  }
  return state % 2 === 0 ? "sidebar-left" : "top-nav";
}

function buildSeoPromptBlock({ themeBrandHint, seoKeywords, theme }) {
  const kws = parseSeoKeywords(seoKeywords);
  if (!kws.length) return "";
  return `
=== SEO (обязательно для title/description страниц) ===
Бренд: ${themeBrandHint}. Тема: ${theme}.
Ключевые слова (включай естественно в title и description каждой pages[]):
${kws.map((k) => `- ${k}`).join("\n")}
- title главной: 50–65 символов, бренд + 1–2 ключа + intent (регистрация, бонусы, скачать и т.д.).
- description: 140–165 символов, бренд + гео/интент + CTA-смысл.
- Внутренние страницы: уникальные title/description с разными ключами из списка.
`.trim();
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

const HOME_COMPONENT_ORDER = [
  "hero-gradient",
  "prose-block",
  "game-carousel",
  "slot-grid",
  "prose-block",
  "section-with-bg",
  "prose-block",
  "feature-cards",
  "faq-accordion",
  "cta-banner",
];

const INNER_PAGE_TEMPLATES = [
  ["section-with-bg", "prose-block", "content-split", "prose-block", "faq-accordion", "cta-banner"],
  ["content-split", "prose-block", "feature-cards", "prose-block", "section-with-bg", "faq-accordion"],
  ["prose-block", "stat-row", "content-split", "prose-block", "section-with-bg", "cta-banner", "faq-accordion"],
  ["content-split", "section-with-bg", "prose-block", "feature-cards", "prose-block", "faq-accordion", "cta-banner"],
];

function rotateComponentIds(ids, pageIndex) {
  const arr = [...ids];
  if (arr.length < 2) return arr;
  const offset = pageIndex % arr.length;
  return [...arr.slice(offset), ...arr.slice(0, offset)];
}

function mergeComponentOrder(preferred, existing) {
  const seen = new Set();
  const out = [];
  for (const id of preferred) {
    if (existing.includes(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of existing) {
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

function ensureMinProseBlocks(ids, minCount) {
  const next = [...ids];
  while (next.filter((id) => id === "prose-block").length < minCount) {
    next.push("prose-block");
  }
  return next;
}

/** Дедуплікація componentIds, але prose-block може повторюватись (кілька секцій на сторінці). */
function finalizeComponentIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (id === "prose-block") {
      out.push(id);
      continue;
    }
    if (!seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

function ensureRichPageComponents(pages) {
  return pages.map((page, i) => {
    let ids = [...page.componentIds];
    if (i === 0) {
      for (const id of HOME_COMPONENT_ORDER) {
        if (!ids.includes(id)) ids.push(id);
      }
      ids = mergeComponentOrder(HOME_COMPONENT_ORDER, ids);
      ids = ensureMinProseBlocks(ids, 3);
    } else {
      const tpl = INNER_PAGE_TEMPLATES[i % INNER_PAGE_TEMPLATES.length];
      for (const id of tpl) {
        if (!ids.includes(id)) ids.push(id);
      }
      ids = mergeComponentOrder(tpl, ids);
      ids = ensureMinProseBlocks(ids, 2);
      ids = rotateComponentIds(ids, i);
    }
    return { ...page, componentIds: finalizeComponentIds(ids) };
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
              "prose-block",
              "section-with-bg",
              "prose-block",
              "feature-cards",
              "faq-accordion",
              "cta-banner",
            ]
          : ["content-split", "prose-block", "section-with-bg", "prose-block", "faq-accordion", "cta-banner"];
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

const MIN_REACT_CSS_BYTES = 15000;
const TAILWIND_IMPORT = `@import "tailwindcss" source(none);`;
const TAILWIND_SOURCE_LINES = [
  `@source "./pages/**/*.{tsx,ts,jsx,js}";`,
  `@source "./components/**/*.{tsx,ts,jsx,js}";`,
  `@source "./lib/**/*.{tsx,ts,jsx,js}";`,
  `@source "./App.tsx";`,
  `@source "./main.tsx";`,
];

/**
 * Tailwind v4 auto-detection walks parent dirs for .gitignore when _react_src has no .git.
 * On Render that often yields empty utilities (~4.5 KB CSS). Force explicit scan paths.
 * @param {string} css
 */
function ensureTailwindCssSources(css) {
  let body = String(css || "");
  body = body.replace(/@import\s+"tailwindcss"(?:\s+source\([^)]*\))?;\s*/g, "");
  body = body.replace(/@source\s+[^;]+;\s*/g, "");
  const header = [TAILWIND_IMPORT, ...TAILWIND_SOURCE_LINES, ""].join("\n");
  return `${header}${body.trimStart()}\n`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasTailwindStack(reactSrcDir) {
  const nm = path.join(reactSrcDir, "node_modules");
  const required = [
    path.join(nm, "vite", "package.json"),
    path.join(nm, "tailwindcss", "package.json"),
    path.join(nm, "@tailwindcss", "vite", "package.json"),
  ];
  for (const pkg of required) {
    if (!(await pathExists(pkg))) return false;
  }
  return true;
}

/** Git boundary + .gitignore so Tailwind does not walk parent storage/ ignores. */
async function ensureReactBuildScanBoundary(reactSrcDir) {
  const gitignorePath = path.join(reactSrcDir, ".gitignore");
  if (!(await pathExists(gitignorePath))) {
    await fs.writeFile(gitignorePath, "node_modules\ndist\n.DS_Store\n", "utf8");
  }
  const gitDir = path.join(reactSrcDir, ".git");
  if (!(await pathExists(gitDir))) {
    await fs.mkdir(gitDir, { recursive: true });
  }
}

async function measureDistCssBytes(distDir) {
  try {
    const assetsDir = path.join(distDir, "assets");
    const entries = await fs.readdir(assetsDir);
    let total = 0;
    for (const name of entries) {
      if (!name.endsWith(".css")) continue;
      const st = await fs.stat(path.join(assetsDir, name));
      total += st.size;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Child process env for Vite build; tune heap via SOFTGEN_REACT_NODE_MAX_MB. */
function reactBuildChildEnv() {
  const mbRaw = Number(process.env.SOFTGEN_REACT_NODE_MAX_MB);
  const mb = Number.isFinite(mbRaw) && mbRaw >= 128
    ? Math.min(1536, Math.trunc(mbRaw))
    : 512;
  const memFlag = `--max-old-space-size=${mb}`;
  const base = String(process.env.NODE_OPTIONS || "").trim();
  return {
    ...process.env,
    NODE_OPTIONS: base ? `${base} ${memFlag}` : memFlag,
  };
}

async function runNpmInstall(reactSrcDir, onLog, label) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  emitLog(onLog, label);
  await execFileAsync(
    npmCmd,
    ["install", "--no-audit", "--no-fund", "--include=dev"],
    {
      cwd: reactSrcDir,
      env: reactBuildChildEnv(),
      maxBuffer: 20 * 1024 * 1024,
      timeout: 600000,
    }
  );
}

async function runViteBuild(reactSrcDir, onLog) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  emitLog(onLog, "React Lab: vite build…");
  await execFileAsync(npmCmd, ["run", "build"], {
    cwd: reactSrcDir,
    env: reactBuildChildEnv(),
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600000,
  });
}

async function runNpmBuild(reactSrcDir, onLog) {
  await ensureReactBuildScanBoundary(reactSrcDir);

  const preinstalled = await hasTailwindStack(reactSrcDir);
  if (!preinstalled) {
    await runNpmInstall(
      reactSrcDir,
      onLog,
      "React Lab: npm install (немає tailwind/vite у шаблоні)…"
    );
  } else {
    emitLog(
      onLog,
      "React Lab: node_modules з шаблону — npm install пропущено (економія RAM)"
    );
  }

  await runViteBuild(reactSrcDir, onLog);

  const distDir = path.join(reactSrcDir, "dist");
  let cssBytes = await measureDistCssBytes(distDir);
  emitLog(onLog, `React Lab: CSS bundle ${cssBytes} bytes`);

  if (cssBytes < MIN_REACT_CSS_BYTES) {
    emitLog(
      onLog,
      `React Lab: CSS замалий (<${MIN_REACT_CSS_BYTES}) — Tailwind utilities не згенеровані. Повтор з npm install…`
    );
    await fs.rm(path.join(reactSrcDir, "node_modules"), { recursive: true, force: true });
    const cssPath = path.join(reactSrcDir, "src/index.css");
    let css = await fs.readFile(cssPath, "utf8");
    css = ensureTailwindCssSources(css);
    await fs.writeFile(cssPath, css, "utf8");
    await ensureReactBuildScanBoundary(reactSrcDir);
    await runNpmInstall(
      reactSrcDir,
      onLog,
      "React Lab: npm install (retry після браку CSS)…"
    );
    await runViteBuild(reactSrcDir, onLog);
    cssBytes = await measureDistCssBytes(distDir);
    emitLog(onLog, `React Lab: CSS bundle після retry: ${cssBytes} bytes`);
    if (cssBytes < MIN_REACT_CSS_BYTES) {
      throw new Error(
        `React Lab: Tailwind CSS не згенерував utilities (${cssBytes} bytes). ` +
          "Перевірте prepare:react-lab на деплої або SOFTGEN_REACT_NODE_MAX_MB."
      );
    }
  }
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
  seoPromptBlock,
}) {
  return `
Тема сайта: ${theme}
Бренд в текстах (СТРОГО): ${themeBrandHint}
Базовый шлюз регистрации (CTA): ${gatewayUrl}
Страницы пакета (ровно ${expectedFiles.length}): ${expectedFiles.join(", ")}
Для каждой страницы укажи file (как в списке), role (короткая русская подпись для меню, 1–4 слова), title, description, contentAngle, componentIds (6–8 id на главной, 4–6 на внутренних).
Стек: React + Vite + Tailwind + framer-motion + curated registry, SiteLayout (sidebar-left или top-nav) и профессиональный footer.
Навигация задаётся в SiteLayout при сборке — в TSX страниц не дублируй header/sidebar.

${seoPromptBlock ? `${seoPromptBlock}\n\n` : ""}${registryBlock}

${siteRules}

${designHint}

${sourceArticlesBlock ? `${sourceArticlesBlock}\n` : ""}
${brandPromptOverlay ? `=== БРЕНД КЛИЕНТА ===\n${brandPromptOverlay}\n` : ""}
${profilePrompt ? `=== ПРОМПТ ПРОФИЛЯ ===\n${profilePrompt}` : ""}

Верни ТОЛЬКО JSON: { "brandName": string, "pages": [ { "file", "role", "title", "description", "contentAngle", "componentIds" } ] }
- Поле **brandName** в корне — строго «${themeBrandHint}» (из /brand пользователя); запрещены «О нашем казино», «онлайн казино», {brand}.
- title и description каждой страницы должны содержать «${themeBrandHint}» и SEO-ключи (если заданы выше), не общие фразы.
- Для index.php: hero-gradient, минимум 3× prose-block, game-carousel, slot-grid, section-with-bg, feature-cards, faq-accordion (8–10 id).
- Для внутренних: минимум 2× prose-block + content-split или section-with-bg.
- Для внутренних страниц: другой порядок componentIds на каждой странице (не копируй одинаковую последовательность).
- Порядок секций на разных file должен заметно отличаться (меняй первый блок: content-split / section-with-bg / prose-block).
- role — короткое меню («Главная», «Бонусы», «Платежи»), не длинный SEO-заголовок.
- title/description планируй под объём не меньше ${minPageWords} слов контента на странице.
Допустимые img: ${(imageFiles || []).slice(0, 20).join(", ")}
`.trim();
}

/** Підрахунок видимих слів у російських рядках TSX (для валідації обсягу). */
function countVisibleWordsInTsx(tsxCode) {
  const strings = [...String(tsxCode || "").matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) =>
    m[1].replace(/\\n/g, " ").replace(/\\"/g, '"')
  );
  const cyrillicText = strings.filter((s) => /[А-Яа-яЁё]/.test(s)).join(" ");
  return cyrillicText.split(/\s+/).filter((w) => /[А-Яа-яЁё]/.test(w)).length;
}

/** @returns {string[]} human-readable issues */
function detectWeakRegistryContentIssues(tsxCode, componentIds, minPageWords = 2000) {
  const issues = [];
  const code = String(tsxCode || "");
  const idList = Array.isArray(componentIds) ? componentIds : [];
  const ids = new Set(idList);
  const expectedProseBlocks = idList.filter((id) => id === "prose-block").length;

  if (ids.has("faq-accordion") && /FaqAccordion/i.test(code)) {
    const faqBlock =
      code.match(/<FaqAccordion[\s\S]*?\/>/)?.[0] ||
      code.match(/<FaqAccordion[\s\S]*?<\/FaqAccordion>/)?.[0] ||
      "";
    if (/items=\{\s*\[\s*\]\s*\}/.test(faqBlock)) {
      issues.push("FaqAccordion: items={[]} — пустой массив");
    }
    if (/q:\s*""/.test(faqBlock) || /a:\s*""/.test(faqBlock)) {
      issues.push("FaqAccordion: есть пункты с пустыми q или a");
    }
    const qCount = (faqBlock.match(/\bq:\s*"/g) || []).length;
    if (qCount < 6) {
      issues.push(`FaqAccordion: только ${qCount} вопросов (нужно 6–8 с непустыми q и a)`);
    }
  }

  if (ids.has("feature-cards") && /FeatureCards/i.test(code)) {
    const cardsBlock =
      code.match(/<FeatureCards[\s\S]*?\/>/)?.[0] ||
      code.match(/<FeatureCards[\s\S]*?<\/FeatureCards>/)?.[0] ||
      "";
    if (/title:\s*""/.test(cardsBlock) || /body:\s*""/.test(cardsBlock)) {
      issues.push("FeatureCards: есть карточки с пустыми title или body");
    }
  }

  if (/\.?\/img\/pay-/i.test(code) && /<img[^>]+pay-/i.test(code) && !/PaymentMethodsRow/i.test(code)) {
    issues.push("Оплаты: используй <PaymentMethodsRow variant=\"inline\" />, не сырые <img src=\"./img/pay-*\">");
  }

  const wordCount = countVisibleWordsInTsx(code);
  const minWords = Math.max(1200, Number(minPageWords) || 2000);
  if (wordCount < Math.round(minWords * 0.82)) {
    issues.push(
      `Объём текста: ~${wordCount} слов (нужно минимум ${minWords}); добавь ProseBlock с 4–6 абзацами по 4–6 предложений`
    );
  }

  const proseBlocks = (code.match(/<ProseBlock/g) || []).length;
  if (expectedProseBlocks >= 2 && proseBlocks < expectedProseBlocks) {
    issues.push(
      `ProseBlock: только ${proseBlocks} блок(а) — нужно ${expectedProseBlocks} текстовых секций с длинными абзацами`
    );
  }

  return issues;
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
  const needsHero = page.componentIds.includes("hero-gradient");
  const needsFaq = page.componentIds.includes("faq-accordion");
  const proseCount = page.componentIds.filter((id) => id === "prose-block").length;
  const componentOrder = page.componentIds.join(" → ");
  return `
Сгенерируй ОДИН React TSX-файл (functional component) для страницы.
Экспорт: export function ${page.componentName}() { ... }
Без default export. Без import React unless needed.
Tailwind utility classes, framer-motion для 2–4 секций (motion.section).
Язык контента: русский. Бренд в текстах: **${brandName}** (везде вместо {brand} и общих фраз). Тема: ${theme}.
Страница: file=${page.file}, route=${page.route}, title=${page.title}, description=${page.description}, angle=${page.contentAngle}.
CTA на gateway: ${gatewayUrl}
Порядок секций на странице (соблюдай): ${componentOrder}

ОБЯЗАТЕЛЬНЫЕ ИМПОРТЫ:
import { GATEWAY_URL, BRAND_NAME, GAME_IMAGE_PATHS, BANNER_IMAGE_PATHS, PAYMENT_IMAGE_PATHS } from "../lib/site-routes";
- Используй BRAND_NAME в заголовках и абзацах (не «О нашем казино», не плейсхолдеры).
${needsHero ? `- HeroGradient: backgroundImage={BANNER_IMAGE_PATHS[0]} (или [1]), title, eyebrow, subtitle (ОДНА короткая строка), ctaHref={GATEWAY_URL}. ЗАПРЕЩЕНО paragraphs в HeroGradient — длинный текст только в ProseBlock сразу после hero.` : ""}
${needsSlotGrid ? "- Обязательно <SlotGrid title=\"Популярные слоты\" images={GAME_IMAGE_PATHS} gatewayHref={GATEWAY_URL} />." : ""}
${needsCarousel ? "- Обязательно <GameCarousel title=\"Популярные игры\" intro=\"4–5 предложений с ${brandName}\" images={GAME_IMAGE_PATHS} gatewayHref={GATEWAY_URL} />." : ""}
${needsProse ? `- Обязательно ${proseCount >= 3 ? "три" : proseCount >= 2 ? "два" : "один"} <ProseBlock title=\"…\" paragraphs={[ … ]} /> — в КАЖДОМ ProseBlock 4–6 абзацев, каждый абзац 4–6 полных предложений, уникальный SEO-текст с ${brandName}.` : ""}
${needsFaq ? `- Обязательно <FaqAccordion title=\"…\" items={[ { q: \"полный вопрос про ${brandName}?\", a: \"развёрнутый ответ 2–4 предложения\" }, … ]} /> — РОВНО 6–8 объектов; у КАЖДОГО q минимум 8 символов и a минимум 40 символов; запрещены пустые строки, заглушки «вопрос»/«ответ»/«текст».` : ""}

Игровые превью (только SlotGrid/GameCarousel): ${gameImages.join(", ") || "GAME_IMAGE_PATHS из site-routes"}
Баннеры (HeroGradient, SectionWithBg, ContentSplit): ${bannerImages.join(", ") || "BANNER_IMAGE_PATHS из site-routes"}
Иконки оплат: ${paymentImages.join(", ") || "PAYMENT_IMAGE_PATHS из site-routes"} — только <PaymentMethodsRow title="…" intro="…" variant="inline" />; запрещены сырые <img> для pay-* и w-full на иконках оплат.
Пути картинок: ./img/имя_файла — только из списка билда.
ЗАПРЕЩЕНО: logo.png и favicon.png в HeroGradient, SectionWithBg, ContentSplit (только chrome/footer).
Не используй slot-превью в hero; не используй баннеры и pay-* в карусели слотов. Шапка, сайдбар и footer уже в SiteLayout — только контент страницы.
Все CTA-кнопки: className="btn-brand ..." — НЕ задавай bg-[#...] text-white на кнопках.
Оберни контент в <div className="space-y-10"> с секциями из registry.

ОБЪЁМ (КРИТИЧНО): минимум ${minPageWords} слов видимого русского текста на странице — считай абзацы ProseBlock, FAQ, карточки, intro карусели.
- ProseBlock — основной объём: 4–6 абзацев в paragraphs, каждый 4–6 предложений; главная — 3 ProseBlock, внутренние — 2 ProseBlock с разными темами.
- ContentSplit: paragraphs={[...]} — 3–4 абзаца по 3–5 предложений; imageSrc={BANNER_IMAGE_PATHS[n]}.
- FaqAccordion: 6–8 пар { q, a }; ответ каждый 3–5 предложений.
- FeatureCards: items body 3–5 предложений (минимум 3 карточки).
- SectionWithBg: body 5–7 предложений; CtaBanner body 3–4 предложения.
- GameCarousel intro: 4–5 предложений, не одна строка.
- Запрещены пустые paragraphs={[]}, пустые items={[]}, заглушки «текст», «описание», незаполненный {brand}.

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
  css = ensureTailwindCssSources(css);
  if (/@theme\s*\{/.test(css)) {
    css = css.replace(/@theme\s*\{[\s\S]*?\}/, themeCss);
  } else {
    css = css.replace(TAILWIND_IMPORT, `${TAILWIND_IMPORT}\n\n${themeCss}`);
  }
  await fs.writeFile(cssPath, css, "utf8");
}

async function writeSiteRoutesModule(
  reactSrcDir,
  {
    gatewayUrl,
    brandName,
    gameImagePaths,
    bannerImagePaths,
    paymentImagePaths,
    siteLayout,
    seoKeywords,
    logoSrc,
    pages,
    pageImports,
  }
) {
  const lines = [
    `import type { ComponentType } from "react";`,
    ...pageImports.map((p) => `import { ${p.componentName} } from "../pages/${p.componentName}";`),
    ``,
    `export const GATEWAY_URL = ${JSON.stringify(gatewayUrl)};`,
    `export const BRAND_NAME = ${JSON.stringify(brandName)};`,
    `export const LOGO_SRC = ${JSON.stringify(logoSrc || "./img/logo.png")};`,
    `export const GAME_IMAGE_PATHS = ${JSON.stringify(gameImagePaths || [])};`,
    `export const BANNER_IMAGE_PATHS = ${JSON.stringify(bannerImagePaths || [])};`,
    `export const PAYMENT_IMAGE_PATHS = ${JSON.stringify(paymentImagePaths || [])};`,
    `export const SITE_LAYOUT = ${JSON.stringify(siteLayout || "sidebar-left")};`,
    `export const SEO_KEYWORDS = ${JSON.stringify(seoKeywords || [])};`,
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

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

async function writePageHeadMeta(reactSrcDir, pages, { seoKeywords = [] } = {}) {
  const indexPage = pages.find((p) => p.route === "/") || pages[0];
  let html = await fs.readFile(path.join(reactSrcDir, "index.html"), "utf8");
  const title = indexPage?.title || "Сайт";
  const desc = indexPage?.description || "";
  const kwList = Array.isArray(seoKeywords) ? seoKeywords.filter(Boolean) : [];
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(title)}</title>`);
  if (/<meta\s+name="description"/i.test(html)) {
    html = html.replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${escapeHtmlAttr(desc)}" />`
    );
  } else {
    html = html.replace(
      /<\/head>/i,
      `  <meta name="description" content="${escapeHtmlAttr(desc)}" />\n  </head>`
    );
  }
  if (kwList.length) {
    const kwTag = `<meta name="keywords" content="${escapeHtmlAttr(kwList.join(", "))}" />`;
    if (/<meta\s+name="keywords"/i.test(html)) {
      html = html.replace(/<meta\s+name="keywords"[^>]*>/i, kwTag);
    } else {
      html = html.replace(/<\/head>/i, `  ${kwTag}\n  </head>`);
    }
  }
  const ogTitle = `<meta property="og:title" content="${escapeHtmlAttr(title)}" />`;
  const ogDesc = `<meta property="og:description" content="${escapeHtmlAttr(desc)}" />`;
  for (const [pattern, tag] of [
    [/<meta\s+property="og:title"[^>]*>/i, ogTitle],
    [/<meta\s+property="og:description"[^>]*>/i, ogDesc],
  ]) {
    if (pattern.test(html)) {
      html = html.replace(pattern, tag);
    } else {
      html = html.replace(/<\/head>/i, `  ${tag}\n  </head>`);
    }
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
    "React Lab RAM: prepare:react-lab при деплої. 2GB: SOFTGEN_REACT_NODE_MAX_MB=1024; 512MB: 280. Без паралельних job на 1 CPU."
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
  const seoKeywords = parseSeoKeywords(brandKit?.seoKeywords);
  const siteLayout = resolveSiteLayoutVariant(brandKit, `${safeName}|${siteSeed}`);
  const seoPromptBlock = buildSeoPromptBlock({
    themeBrandHint,
    seoKeywords: brandKit?.seoKeywords,
    theme: themeNorm,
  });
  const minPageWords = REACT_MIN_PAGE_WORDS;
  emitLog(
    onLog,
    `Layout: ${siteLayout}; SEO keywords: ${seoKeywords.length || "—"} (theme: ${themeNorm.slice(0, 48)}${themeNorm.length > 48 ? "…" : ""})`
  );

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
      seoPromptBlock,
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
    const pageCodegenBase = buildPageCodegenPrompt({
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
    });
    let pageRaw = await callClaude({
      apiKey: claudeKey,
      system: `${designSystemBlock}\n\nТы senior React+Tailwind инженер (ui-ux-pro-max). Верни только TSX-код компонента без markdown.`,
      user: pageCodegenBase,
      maxTokens: 16000,
      temperature: 0.65,
      onLog,
    });
    let code = stripCodeFences(pageRaw);
    const contentIssues = detectWeakRegistryContentIssues(code, page.componentIds, minPageWords);
    if (contentIssues.length) {
      emitLog(onLog, `Контент registry: ${contentIssues.join("; ")} — повтор codegen…`);
      pageRaw = await callClaude({
        apiKey: claudeKey,
        system: `${designSystemBlock}\n\nТы senior React+Tailwind инженер. Исправь TSX: больше текста (минимум ${minPageWords} слов), 2–3 ProseBlock с длинными абзацами. Верни только TSX.`,
        user: `${pageCodegenBase}\n\nОШИБКИ ПРЕДЫДУЩЕЙ ВЕРСИИ:\n${contentIssues.map((x) => `- ${x}`).join("\n")}\n\nПерепиши компонент целиком. Минимум ${minPageWords} русских слов. ProseBlock — 4–6 абзацев по 4–6 предложений. FAQ — полные ответы про ${brandName}.`,
        maxTokens: 16000,
        temperature: 0.55,
        onLog,
      });
      code = stripCodeFences(pageRaw);
    }
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
    bannerImagePaths,
    paymentImagePaths,
    siteLayout,
    seoKeywords,
    logoSrc,
    pages: generatedPages,
    pageImports: generatedPages,
  });
  await writeBrandPaletteForBuild(reactSrcDir, brandKit?.palette);
  emitLog(
    onLog,
    `Палитра /brand: accent=${brandKit?.palette?.accent || "default"}, bg=${brandKit?.palette?.bg || "default"}, text=${brandKit?.palette?.text || "default"}`
  );
  await writePageHeadMeta(reactSrcDir, generatedPages, { seoKeywords });

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
