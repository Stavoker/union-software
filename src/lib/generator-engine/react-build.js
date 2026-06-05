import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getAppRoot, getProjectsDir, getImgGenDir } from "@/src/lib/app-paths";
import {
  resolveGatewayUrlForBuild,
  pickLogoSrcForBuild,
  pickGameImages,
} from "@/src/lib/brand-chrome";
import {
  selectGenerationPromptProfileForBuild,
  formatFullGenerationPromptOnly,
} from "@/src/lib/generation-prompt-profiles";
import { buildSiteGenerationRulesBlock } from "@/lib/generator-engine/generation-site-rules";
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

function normalizePagesPlan(rawPages, expectedFiles) {
  const byFile = new Map();
  for (const p of Array.isArray(rawPages) ? rawPages : []) {
    const file = String(p?.file || "").trim().toLowerCase();
    if (file && expectedFiles.includes(file)) byFile.set(file, p);
  }
  return expectedFiles.map((file, i) => {
    const p = byFile.get(file) || {};
    const route = phpFileToRoutePath(file);
    let componentIds = normalizeComponentIds(p.componentIds);
    if (!componentIds.length) {
      componentIds =
        i === 0
          ? ["hero-gradient", "slot-grid", "feature-cards", "cta-banner"]
          : ["content-split", "faq-accordion", "cta-banner"];
    }
    return {
      file,
      route,
      role: String(p.role || (i === 0 ? "home" : "inner")).trim(),
      title: String(p.title || `Страница ${i + 1}`).trim(),
      description: String(p.description || "").trim(),
      contentAngle: String(p.contentAngle || "").trim(),
      componentName: phpFileToComponentName(file),
      componentIds,
    };
  });
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
  siteRules,
  gatewayUrl,
  imageFiles,
  registryBlock,
  designHint,
}) {
  return `
Тема сайта: ${theme}
Бренд в текстах: ${themeBrandHint}
Базовый шлюз регистрации (CTA): ${gatewayUrl}
Страницы пакета (ровно ${expectedFiles.length}): ${expectedFiles.join(", ")}
Для каждой страницы укажи file (как в списке), role, title, description, contentAngle, componentIds (2–4 id).
Стек: React + Vite + Tailwind + framer-motion + curated registry, левый сайдбар в layout.

${registryBlock}

${siteRules}

${designHint}

${profilePrompt ? `=== ПРОМПТ ПРОФИЛЯ ===\n${profilePrompt}` : ""}

Верни ТОЛЬКО JSON: { "brandName": string, "pages": [ { "file", "role", "title", "description", "contentAngle", "componentIds" } ] }
Допустимые img: ${(imageFiles || []).slice(0, 20).join(", ")}
`.trim();
}

function buildPageCodegenPrompt({
  page,
  brandName,
  theme,
  profilePrompt,
  siteRules,
  gatewayUrl,
  gameImages,
  registryCodegenBlock,
  designHint,
}) {
  return `
Сгенерируй ОДИН React TSX-файл (functional component) для страницы.
Экспорт: export function ${page.componentName}() { ... }
Без default export. Без import React unless needed.
Tailwind utility classes, framer-motion для 1–2 секций (motion.section).
Язык контента: русский. Бренд: ${brandName}. Тема: ${theme}.
Страница: file=${page.file}, route=${page.route}, title=${page.title}, description=${page.description}, angle=${page.contentAngle}.
CTA на gateway: ${gatewayUrl}
Игровые превью (только в SlotGrid / #lw-games): ${gameImages.join(", ") || "нет"}
Пути картинок: ./img/имя_файла — только из списка билда.
Не используй slot-превью в hero. Левый сайдбар уже в SiteLayout — только контент страницы.
Оберни контент в <div className="space-y-10"> с секциями из registry.

${registryCodegenBlock}

${siteRules}
${designHint}
${profilePrompt ? `=== ПРОМПТ ПРОФИЛЯ ===\n${profilePrompt}` : ""}

Верни ТОЛЬКО код компонента, без markdown и пояснений.
`.trim();
}

async function writeSiteRoutesModule(reactSrcDir, { gatewayUrl, brandName, pages, pageImports }) {
  const lines = [
    `import type { ComponentType } from "react";`,
    ...pageImports.map((p) => `import { ${p.componentName} } from "../pages/${p.componentName}";`),
    ``,
    `export const GATEWAY_URL = ${JSON.stringify(gatewayUrl)};`,
    `export const BRAND_NAME = ${JSON.stringify(brandName)};`,
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
    lines.push(`    navLabel: ${JSON.stringify(p.title)},`);
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

  const themeBrandHint = String(brandKit?.publicBrandName || themeNorm).trim().slice(0, 80);
  const logoSrc = pickLogoSrcForBuild(imageFiles, siteSeed);
  const gameImages = pickGameImages(imageFiles, { seed: siteSeed, max: 12 });

  let profilePrompt = "";
  try {
    const profile = await selectGenerationPromptProfileForBuild({
      theme: themeNorm,
      pickSeed: `${buildNonce}|${safeName}|react`,
      onLog,
    });
    profilePrompt = formatFullGenerationPromptOnly(profile, { themeBrandHint });
    if (profilePrompt) emitLog(onLog, "Профиль: full_generation_prompt загружен.");
  } catch (e) {
    emitLog(onLog, `Профиль: пропуск (${String(e?.message || e).slice(0, 120)})`);
  }

  const siteRules = buildSiteGenerationRulesBlock({
    themeBrandHint,
    gameSlotPaths: gameImages.map((f) => `./img/${f}`),
    logoSrc,
    sitePalette: brandKit?.palette || undefined,
  });

  const registryPool = pickRegistryComponentsForArchitect(`${siteSeed}|registry`, 8);
  const registryBlock = formatComponentRegistryForArchitect(registryPool);
  const designSystemBlock = buildUiUxProMaxSystemBlock({
    theme: themeNorm,
    brandName: themeBrandHint,
  });
  const designHint = buildUiUxProMaxUserHint({ pageRole: "architect" });

  ensureNotStopped();
  emitLog(onLog, "Архитектор JSON (Claude)…");
  const architectRaw = await callClaude({
    apiKey: claudeKey,
    system: `${designSystemBlock}\n\nТы архитектор iGaming SPA. Ответ — только валидный JSON без markdown. Корень: brandName, pages[].`,
    user: buildArchitectUserPrompt({
      theme: themeNorm,
      expectedFiles,
      themeBrandHint,
      profilePrompt,
      siteRules,
      gatewayUrl,
      imageFiles,
      registryBlock,
      designHint,
    }),
    maxTokens: 4096,
    temperature: 0.5,
    onLog,
  });
  const architectPlan = extractJsonObject(architectRaw);
  const brandName = String(architectPlan?.brandName || themeBrandHint).trim();
  const pages = normalizePagesPlan(architectPlan?.pages, expectedFiles);
  emitLog(onLog, `Бренд: ${brandName}; страниц: ${pages.length}`);

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
    const pageRaw = await callClaude({
      apiKey: claudeKey,
      system: `${designSystemBlock}\n\nТы senior React+Tailwind инженер (ui-ux-pro-max). Верни только TSX-код компонента без markdown.`,
      user: buildPageCodegenPrompt({
        page,
        brandName,
        theme: themeNorm,
        profilePrompt,
        siteRules,
        gatewayUrl,
        gameImages,
        registryCodegenBlock,
        designHint: pageDesignHint,
      }),
      maxTokens: 12000,
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
    pages: generatedPages,
    pageImports: generatedPages,
  });
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
  // img/ уже в outputDir (бренд) або скопирован из dist/public через vite — не cp(src===dest)

  const manifest = {
    mode: "react-spa",
    stack: "react",
    generationMode,
    projectName: safeName,
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
