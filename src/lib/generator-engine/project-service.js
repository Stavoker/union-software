import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getTemplateByKey,
  listTemplates as listTemplateDefs,
} from "@/src/lib/template-config";
import {
  normalizeAndExtractMainHtml,
  prepareFullHtmlDocument,
  sanitizeLakiBrandWords,
} from "@/src/lib/html-adapter";
import { getProjectsDir } from "@/src/lib/app-paths";
import { getPhpBinary } from "@/src/lib/php-binary";
import { buildMultipageSite } from "@/src/lib/multipage-build";

const execFileAsync = promisify(execFile);
const PROJECTS_DIR = getProjectsDir();

/** Глубина цепочки /en/…/en/ в config.php (уровни depth 0 .. maxDepth-1). */
export const MAX_DEPTH_MIN = 10;
export const MAX_DEPTH_MAX = 100;
export const MAX_DEPTH_DEFAULT = 20;

export function clampMaxDepth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_DEPTH_DEFAULT;
  return Math.min(MAX_DEPTH_MAX, Math.max(MAX_DEPTH_MIN, Math.trunc(n)));
}

const CACHE_START_MARKER = "$pageMainHtml = aurora_get_cached_main_text_html";
const RECURSIVE_MARKER = "// Кнопка/ссылка на следующий уровень /en/ в <body>";
const ELSE_OPEN_MARKER = "} else {";
const ELSE_CLOSE_MARKER = "<?php } ?>";

export async function listTemplates() {
  return listTemplateDefs();
}

export async function readProjectDeployReadiness(fullPath) {
  const manifestPath = path.join(fullPath, ".aurora_multipage.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const m = JSON.parse(raw);
    const list = Array.isArray(m.pages) ? m.pages : [];
    const n = list.length;
    return {
      pagesTotal: n,
      pagesDone: n,
      ready: n > 0,
      buildComplete: true,
      status: "completed",
    };
  } catch {
    /* fallthrough */
  }

  const progressPath = path.join(fullPath, ".aurora_build_progress.json");
  try {
    const raw = await fs.readFile(progressPath, "utf8");
    const p = JSON.parse(raw);
    const total = Math.max(0, Number(p.pagesTotal) || 0);
    const done = Math.max(0, Number(p.pagesDone) || 0);
    const ready = total > 0 && done >= total;
    return {
      pagesTotal: total,
      pagesDone: done,
      ready,
      buildComplete: ready,
      status: ready ? "completed" : "building",
    };
  } catch {
    /* fallthrough */
  }

  const indexPath = path.join(fullPath, "index.php");
  try {
    await fs.access(indexPath);
    return {
      pagesTotal: 1,
      pagesDone: 1,
      ready: true,
      buildComplete: true,
      status: "completed",
    };
  } catch {
    /* fallthrough */
  }

  return {
    pagesTotal: 0,
    pagesDone: 0,
    ready: false,
    buildComplete: false,
    status: "pending",
  };
}

async function readProjectMeta(fullPath) {
  const metaPath = path.join(fullPath, ".aurora_site_meta.json");
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    const m = JSON.parse(raw);
    const siteHost = typeof m?.siteHost === "string" ? m.siteHost.trim() : "";
    const siteUrl = typeof m?.siteUrl === "string" ? m.siteUrl.trim() : "";
    const rootDomain = typeof m?.rootDomain === "string" ? m.rootDomain.trim() : "";
    const rawBrand = String(m?.subdomainBrand || m?.brand || "").trim().toLowerCase();
    const subdomainBrand =
      rawBrand === "laki" || rawBrand === "lakiworld" ? rawBrand : null;
    return {
      siteHost: siteHost || null,
      siteUrl: siteUrl || null,
      rootDomain: rootDomain || null,
      subdomainBrand,
    };
  } catch {
    return {
      siteHost: null,
      siteUrl: null,
      rootDomain: null,
      subdomainBrand: null,
    };
  }
}

export async function listGeneratedProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const rows = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(PROJECTS_DIR, entry.name);
    try {
      const st = await fs.stat(fullPath);
      const readiness = await readProjectDeployReadiness(fullPath);
      const meta = await readProjectMeta(fullPath);
      rows.push({
        name: entry.name,
        updatedAt: st.mtime.toISOString(),
        ...readiness,
        ...meta,
      });
    } catch {}
  }

  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows;
}

export async function writeProjectSiteMeta({ projectName, siteUrl, subdomainBrand }) {
  const safeName = sanitizeProjectName(projectName);
  const out = path.join(PROJECTS_DIR, safeName);
  await fs.mkdir(out, { recursive: true });
  const siteUrlNorm = String(siteUrl || "").trim();
  const brandRaw = String(subdomainBrand || "").trim().toLowerCase();
  const brand =
    brandRaw === "laki" || brandRaw === "lakiworld" ? brandRaw : null;
  let siteHost = null;
  let rootDomain = null;
  if (siteUrlNorm) {
    try {
      const u = new URL(
        siteUrlNorm.startsWith("http") ? siteUrlNorm : `https://${siteUrlNorm}`
      );
      const h = (u.hostname || "").trim().toLowerCase();
      if (h && !h.endsWith(".local") && !h.endsWith(".placeholder")) {
        siteHost = h;
        const parts = h.split(".").filter(Boolean);
        if (parts.length >= 3) rootDomain = parts.slice(1).join(".");
      }
    } catch {
      // ignore
    }
  }
  const meta = {
    siteUrl: siteUrlNorm || null,
    siteHost,
    rootDomain,
    subdomainBrand: brand,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(out, ".aurora_site_meta.json"), `${JSON.stringify(meta)}\n`, "utf8");
  return meta;
}

export async function consumeProject({ projectName }) {
  return deleteProject({ projectName });
}

export async function buildProject(opts) {
  const theme = String(opts.theme ?? "").trim();
  const wid = Number(opts.windowId);
  const templateKey = String(opts.templateKey ?? "").trim();
  const htmlStr = opts.html == null ? "" : String(opts.html);
  const hasLegacyTemplate =
    templateKey.length > 0 && htmlStr.trim().length > 0;

  if (hasLegacyTemplate) {
    return buildProjectFromTemplate(opts);
  }

  if (theme.length > 0 && Number.isFinite(wid) && wid >= 1 && wid <= 10) {
    const result = await buildMultipageSite({
      projectName: opts.projectName,
      windowId: wid,
      theme,
      siteUrl: opts.siteUrl,
      claudeApiKey: opts.claudeApiKey,
      onLog: opts.onLog,
      shouldStop: opts.shouldStop,
      pageCount: opts.pageCount,
      brandKey: opts.brandKey,
      referenceTemplateMode: Boolean(opts.referenceTemplateMode),
    });
    // buildMultipageSite очищает outputDir в начале — meta из /jobs/start удаляется.
    // Записываем снова, чтобы в ZIP и /api/projects/list был subdomainBrand для auto-script.
    await writeProjectSiteMeta({
      projectName: opts.projectName,
      siteUrl: String(opts.siteUrl || "").trim() || null,
      subdomainBrand: String(opts.brandKey || "").trim().toLowerCase(),
    });
    return result;
  }

  throw new Error(
    "Укажите theme и windowId (1–10) для многостраничной генерации или templateKey и html для режима PHP-шаблона."
  );
}

async function buildProjectFromTemplate({
  projectName,
  templateKey,
  html,
  clusterTheme,
  maxDepth: maxDepthInput,
  claudeApiKey,
  siteUrl,
}) {
  const safeName = sanitizeProjectName(projectName);
  const template = getTemplateByKey(templateKey);
  if (!template) {
    throw new Error("Шаблон не найден или недоступен.");
  }

  const maxDepth = clampMaxDepth(maxDepthInput);
  const baseUrl = normalizeSiteUrl(siteUrl) || `https://${safeName}`;

  const outputDir = path.join(PROJECTS_DIR, safeName);
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(template.sourceDir, outputDir, { recursive: true });
  // Important: templates include pre-generated cache files.
  // We must not copy template caches into the project, otherwise warmup will "think"
  // text cache already exists and will skip regeneration / use wrong content.
  await fs.rm(path.join(outputDir, "cache"), { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "cache"), { recursive: true });
  await applyMaxDepthToProjectConfig(outputDir, maxDepth);
  await applyClaudeApiKeyToProject(outputDir, claudeApiKey);
  await writeGeneratedRobotsAndSitemap(outputDir, baseUrl, maxDepth);

  let preparedHtml = normalizeAndExtractMainHtml(html);
  let preparedFullDocument = "";
  const hasFullDocument =
    /<html\b/i.test(String(html || "")) && /<main\b/i.test(String(html || ""));

  if (hasFullDocument) {
    preparedFullDocument = prepareFullHtmlDocument(html);
  }
  if (template.brand === "laki") {
    preparedHtml = sanitizeLakiBrandWords(preparedHtml);
    if (preparedFullDocument) {
      preparedFullDocument = sanitizeLakiBrandWords(preparedFullDocument);
    }
  }
  await writeMainTemplateSnapshot(outputDir, preparedHtml);

  const indexPath = path.join(outputDir, "index.php");
  const indexContent = await fs.readFile(indexPath, "utf8");
  const patched = patchIndexPhp(indexContent, {
    newMainHtml: preparedHtml,
    fullDocumentHtml: preparedFullDocument,
  });
  const patchedWithPathFallback = ensurePathFallback(patched);
  const patchedWithRoot200 = ensureRootPage200ForAll(patchedWithPathFallback);
  await fs.writeFile(indexPath, patchedWithRoot200, "utf8");
  await patchClaudeTextExtractor(outputDir, template.key);
  const imageReport = await buildImageReport(
    preparedFullDocument || preparedHtml,
    outputDir
  );

  const appliedTheme = await applyClusterThemeIfNeeded({
    outputDir,
    template,
    clusterTheme,
  });

  return {
    projectName: safeName,
    outputDir,
    maxDepth,
    template: {
      key: template.key,
      mode: template.mode,
      brand: template.brand,
      sourceDir: template.sourceDir,
    },
    clusterTheme: appliedTheme,
    imageReport,
  };
}

function normalizeSiteUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
    ? raw
    : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.origin;
  } catch {
    return "";
  }
}

async function writeGeneratedRobotsAndSitemap(outputDir, baseUrl, maxDepth) {
  // Hosting may not support rewrite rules (.htaccess). In that case we generate
  // static robots.txt + sitemap.xml at build time using the same template format.

  const robotsText = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    "",
  ].join("\n");

  const urls = [{ loc: `${baseUrl}/`, priority: "1.00" }];

  const sitemapLines = [];
  sitemapLines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  sitemapLines.push(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`);
  for (const u of urls) {
    sitemapLines.push(`  <url>`);
    sitemapLines.push(`    <loc>${u.loc}</loc>`);
    sitemapLines.push(`    <priority>${u.priority}</priority>`);
    sitemapLines.push(`  </url>`);
  }
  sitemapLines.push(`</urlset>`);
  sitemapLines.push("");

  await Promise.all([
    fs.writeFile(path.join(outputDir, "robots.txt"), robotsText, "utf8"),
    fs.writeFile(path.join(outputDir, "sitemap.xml"), sitemapLines.join("\n"), "utf8"),
  ]);
}

export async function warmupProject({ projectName, force = true }) {
  const safeName = sanitizeProjectName(projectName);
  const outputDir = path.join(PROJECTS_DIR, safeName);
  await ensureProjectExists(outputDir);

  const scriptArgs = ["warmup_text_cache.php"];
  if (force) scriptArgs.push("--force");
  const phpArgs = [
    "-d",
    "output_buffering=0",
    "-d",
    "implicit_flush=1",
    "-d",
    "zlib.output_compression=0",
    ...scriptArgs,
  ];
  const phpBin = getPhpBinary();

  const result = await execFileAsync(phpBin, phpArgs, {
    cwd: outputDir,
    maxBuffer: 1024 * 1024 * 20,
    timeout: 1000 * 60 * 120,
  });

  return {
    projectName: safeName,
    command: `${phpBin} ${phpArgs.join(" ")}`,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export async function getProjectPath(projectName) {
  const safeName = sanitizeProjectName(projectName);
  const outputDir = path.join(PROJECTS_DIR, safeName);
  await ensureProjectExists(outputDir);
  return outputDir;
}

export async function deleteProject({ projectName }) {
  const safeName = sanitizeProjectName(projectName);
  const outputDir = path.join(PROJECTS_DIR, safeName);
  await fs.rm(outputDir, { recursive: true, force: true });
  return {
    projectName: safeName,
    deletedPath: outputDir,
  };
}

function patchIndexPhp(content, { newMainHtml, fullDocumentHtml }) {
  if (fullDocumentHtml) {
    return patchFromFullHtmlDocument(content, fullDocumentHtml);
  }

  const cachePos = content.indexOf(CACHE_START_MARKER);
  if (cachePos === -1) {
    throw new Error("Не найден кеш-блок в index.php.");
  }

  const elseOpenPos = content.indexOf(ELSE_OPEN_MARKER, cachePos);
  if (elseOpenPos === -1) {
    throw new Error("Не найден открывающий else-блок.");
  }

  const openEnd = elseOpenPos + ELSE_OPEN_MARKER.length;
  const closePos = content.indexOf(ELSE_CLOSE_MARKER, openEnd);
  if (closePos === -1) {
    throw new Error("Не найден закрывающий PHP-блок перед recursive-link.");
  }

  const before = content.slice(0, openEnd);
  const after = content.slice(closePos);
  const indentedMain = indentHtml(newMainHtml, "        ");
  return `${before}\n?>\n\n${indentedMain}\n\n${after}`;
}

function patchFromFullHtmlDocument(templateIndexPhp, fullHtmlDoc) {
  const preamble = extractPhpPreamble(templateIndexPhp);
  const cacheBlock = extractCacheOpenBlock(templateIndexPhp);
  const recursiveBlock = extractRecursiveBlock(templateIndexPhp);

  const withDynamicHead = applyDynamicHead(fullHtmlDoc);
  const withPhpInsideMain = injectPhpBlocksIntoMain(withDynamicHead, {
    cacheBlock,
    recursiveBlock,
  });

  return `${preamble}\n\n${withPhpInsideMain}`;
}

function extractPhpPreamble(content) {
  const firstClosePhp = findPhpCloseTagOutsideStrings(content, 0);
  if (firstClosePhp === -1) {
    throw new Error("Не найден PHP-пролог в index.php.");
  }
  return content.slice(0, firstClosePhp + 2).trimEnd();
}

function extractCacheOpenBlock(content) {
  const cachePos = content.indexOf(CACHE_START_MARKER);
  if (cachePos === -1) {
    throw new Error("Не найден кеш-блок в index.php.");
  }
  const openPos = content.lastIndexOf("<?php", cachePos);
  if (openPos === -1) {
    throw new Error("Не найдено начало PHP кеш-блока.");
  }
  const closePos = findPhpCloseTagOutsideStrings(content, cachePos);
  if (closePos === -1) {
    throw new Error("Не найден конец PHP кеш-блока.");
  }
  const rawBlock = content.slice(openPos, closePos + 2).trim();
  return normalizeCacheBlock(rawBlock);
}

function findPhpCloseTagOutsideStrings(content, fromIndex) {
  const s = String(content);
  let i = Math.max(0, Number(fromIndex) || 0);
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;

  for (; i < s.length - 1; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingle) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }

    if (inDouble) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }

    // Not in string/comment.
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "#") {
      inLineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "?" && next === ">") {
      return i;
    }
  }

  return -1;
}

function normalizeCacheBlock(cacheBlock) {
  let out = String(cacheBlock);
  const target = `$pageMainHtml = aurora_normalize_cached_main_html($pageMainHtml);`;
  const legacyHelperName = "aurora_normalize_cached_main_html";
  const normalizeInline = [
    `$pageMainHtml = html_entity_decode($pageMainHtml, ENT_QUOTES | ENT_HTML5, 'UTF-8');`,
    `$pageMainHtml = preg_replace('~^\\s*<section\\b[^>]*>\\s*<article\\b[^>]*>~iu', '', (string) $pageMainHtml);`,
    `$pageMainHtml = preg_replace('~</article>\\s*</section>\\s*$~iu', '', (string) $pageMainHtml);`,
    `echo trim((string) $pageMainHtml);`,
  ].join("\n        ");

  out = out.replace(
    /echo\s+\$pageMainHtml\s*;/g,
    normalizeInline
  );

  // Remove legacy function call if present.
  out = out.replace(
    /\$pageMainHtml\s*=\s*aurora_normalize_cached_main_html\(\$pageMainHtml\);\s*/g,
    ""
  );

  if (out.includes(legacyHelperName)) {
    // Remove legacy helper declaration block from cache section.
    out = out.replace(
      /if\s*\(!function_exists\('aurora_normalize_cached_main_html'\)\)\s*\{[\s\S]*?\n\}\s*/g,
      ""
    );
  }

  if (!out.includes(target)) {
    return out;
  }
  return out;
}

function extractRecursiveBlock(content) {
  const markerPos = content.indexOf(RECURSIVE_MARKER);
  if (markerPos === -1) {
    throw new Error("Не найден recursive-блок в index.php.");
  }
  const openPos = content.lastIndexOf("<?php", markerPos);
  if (openPos === -1) {
    throw new Error("Не найдено начало recursive PHP-блока.");
  }
  const mainClosePos = content.indexOf("</main>", markerPos);
  if (mainClosePos === -1) {
    throw new Error("Не найден </main> после recursive-блока.");
  }
  return content.slice(openPos, mainClosePos).trim();
}

function applyDynamicHead(html) {
  let out = String(html);
  out = out.replace(
    /<html\b[^>]*>/i,
    `<html lang="<?= htmlspecialchars($pageLang ?? 'ru', ENT_QUOTES, 'UTF-8') ?>">`
  );

  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(
      /<title\b[^>]*>[\s\S]*?<\/title>/i,
      `<title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>`
    );
  } else {
    out = out.replace(
      /<head\b[^>]*>/i,
      `$&\n    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>`
    );
  }

  if (/<meta\b[^>]*name=["']description["'][^>]*>/i.test(out)) {
    out = out.replace(
      /<meta\b[^>]*name=["']description["'][^>]*>/i,
      `<meta name="description" content="<?= htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') ?>">`
    );
  } else {
    out = out.replace(
      /<head\b[^>]*>/i,
      `$&\n    <meta name="description" content="<?= htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') ?>">`
    );
  }

  // Чистим старые canonical/hreflang и вставляем валидный блок.
  out = out.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  out = out.replace(/\s*<\?=\s*\$hreflangLinks\s*\?>\s*/gi, "\n");
  const descriptionTag = `<meta name="description" content="<?= htmlspecialchars($desc, ENT_QUOTES, 'UTF-8') ?>">`;
  out = out.replace(
    descriptionTag,
    `${descriptionTag}\n    <link rel="canonical" href="<?= htmlspecialchars($canonicalUrl, ENT_QUOTES, 'UTF-8') ?>">\n    <?= $hreflangLinks ?>`
  );
  return out;
}

function injectPhpBlocksIntoMain(html, { cacheBlock, recursiveBlock }) {
  const mainOpenMatch = html.match(/<main\b[^>]*>/i);
  if (!mainOpenMatch || mainOpenMatch.index == null) {
    throw new Error("Во вставленном HTML не найден тег <main>.");
  }

  const mainOpen = mainOpenMatch[0];
  const mainOpenPos = mainOpenMatch.index;
  const mainOpenEnd = mainOpenPos + mainOpen.length;
  const mainClosePos = html.toLowerCase().indexOf("</main>", mainOpenEnd);
  if (mainClosePos === -1) {
    throw new Error("Во вставленном HTML не найден закрывающий тег </main>.");
  }

  const beforeMain = html.slice(0, mainOpenEnd);
  const mainInner = html.slice(mainOpenEnd, mainClosePos).trim();
  const afterMain = html.slice(mainClosePos);
  const articleOpenMatch = mainInner.match(/<article\b[^>]*>/i);
  if (!articleOpenMatch || articleOpenMatch.index == null) {
    // Fallback: если article отсутствует, оставляем старое поведение (кеш на весь main).
    const rebuiltMain = [
      "",
      cacheBlock,
      "",
      mainInner,
      "",
      "<?php } ?>",
      "",
      recursiveBlock,
      "",
    ].join("\n");
    return `${beforeMain}\n${rebuiltMain}${afterMain}`;
  }

  const articleOpen = articleOpenMatch[0];
  const articleOpenPos = articleOpenMatch.index;
  const articleOpenEnd = articleOpenPos + articleOpen.length;
  const articleInnerLower = mainInner.toLowerCase();
  const articleClosePos = articleInnerLower.indexOf("</article>", articleOpenEnd);
  if (articleClosePos === -1) {
    throw new Error("Во вставленном HTML найден <article>, но не найден </article>.");
  }

  const beforeArticleContent = mainInner.slice(0, articleOpenEnd);
  const articleBody = mainInner.slice(articleOpenEnd, articleClosePos).trim();
  const afterArticleContent = mainInner.slice(articleClosePos);

  const wrappedArticleBody = [
    "",
    cacheBlock,
    "",
    articleBody,
    "",
    "<?php } ?>",
    "",
  ].join("\n");

  const rebuiltMainInner = `${beforeArticleContent}\n${wrappedArticleBody}${afterArticleContent}`;
  const rebuiltMain = `${rebuiltMainInner}\n\n${recursiveBlock}\n`;
  return `${beforeMain}\n${rebuiltMain}${afterMain}`;
}

function indentHtml(html, indent) {
  return String(html)
    .split("\n")
    .map((line) => (line.trim() ? indent + line : ""))
    .join("\n");
}

async function writeMainTemplateSnapshot(outputDir, mainHtml) {
  const snapshotPath = path.join(outputDir, "_aurora_main_template.html");
  const content = String(mainHtml || "").trim();
  if (!content) return;
  await fs.writeFile(snapshotPath, `${content}\n`, "utf8");
}

async function applyMaxDepthToProjectConfig(outputDir, maxDepth) {
  const configPath = path.join(outputDir, "config.php");
  const content = await fs.readFile(configPath, "utf8");
  const maxDepthRegex = /^\s*\$maxDepth\s*=\s*\d+\s*;/m;
  if (!maxDepthRegex.test(content)) {
    throw new Error("Не найдена строка $maxDepth в config.php шаблона.");
  }
  const patched = content.replace(
    maxDepthRegex,
    `$maxDepth = ${maxDepth};`
  );
  await fs.writeFile(configPath, patched, "utf8");
}

async function applyClaudeApiKeyToProject(outputDir, claudeApiKey) {
  const value = String(claudeApiKey || "").trim();
  if (!value) return;
  const filePath = path.join(outputDir, ".claude_api_key");
  // Avoid leaking keys via logs; store per-project key for PHP templates.
  await fs.writeFile(filePath, `${value}\n`, { encoding: "utf8", mode: 0o600 });
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

async function ensureProjectExists(projectPath) {
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new Error("Путь проекта не является папкой.");
    }
  } catch {
    throw new Error("Проект не найден. Сначала выполни сборку.");
  }
}

async function applyClusterThemeIfNeeded({ outputDir, template, clusterTheme }) {
  if (template.mode !== "one-cluster") {
    return null;
  }

  const normalized = String(clusterTheme || "").trim();
  if (!normalized) {
    return null;
  }

  if (template.key === "laki-world-one-calster") {
    const filePath = path.join(outputDir, "aurora_seo_themes.php");
    await patchThemeFunction({
      filePath,
      functionName: "aurora_get_seo_themes",
      newTheme: normalized,
      arraySize: 40,
    });
    return normalized;
  }

  if (template.key === "laki-one-claster") {
    const filePath = path.join(outputDir, "aurora_page_themes.php");
    await patchThemeFunction({
      filePath,
      functionName: "aurora_page_theme_list",
      newTheme: normalized,
      arraySize: 40,
    });
    return normalized;
  }

  return null;
}

async function patchThemeFunction({ filePath, functionName, newTheme, arraySize }) {
  const content = await fs.readFile(filePath, "utf8");
  const escaped = phpSingleQuoted(newTheme);
  const fnRegex = new RegExp(
    `function\\s+${functionName}\\s*\\(\\)\\s*:\\s*array\\s*\\{[\\s\\S]*?\\n\\}`,
    "m"
  );

  if (!fnRegex.test(content)) {
    throw new Error(`Не удалось найти функцию ${functionName} в ${filePath}.`);
  }

  const replacement = `function ${functionName}(): array {\n    return array_fill(0, ${arraySize}, '${escaped}');\n}`;
  const patched = content.replace(fnRegex, replacement);
  await fs.writeFile(filePath, patched, "utf8");
}

function phpSingleQuoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function buildImageReport(html, projectDir) {
  const imgSrcs = [];
  const re = /\b(?:src|data-src|poster)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    imgSrcs.push(m[1]);
  }

  const uniqueLocal = Array.from(
    new Set(
      imgSrcs.filter((src) => {
        return (
          src.startsWith("/img/") &&
          !src.startsWith("http://") &&
          !src.startsWith("https://")
        );
      })
    )
  );

  const missing = [];
  for (const src of uniqueLocal) {
    const filePath = path.join(projectDir, src.replace(/^\//, ""));
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) missing.push(src);
    } catch {
      missing.push(src);
    }
  }

  return {
    totalLocalImgRefs: uniqueLocal.length,
    missingCount: missing.length,
    missing,
  };
}

async function patchClaudeTextExtractor(outputDir, templateKey = "") {
  // For laki-random-topic we keep the template implementation as-is:
  // it already contains warmup fallback logic, and legacy auto-patching
  // may partially override it and cause false FAIL logs in warmup.
  if (String(templateKey) === "laki-random-topic") {
    return;
  }
  const filePath = path.join(outputDir, "claude_text.php");
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  const oldMainMarker = `$mainMarker = '<main>';`;
  const newMainMarker = `$mainRegex = '/<main\\b[^>]*>/i';`;
  let patched = content;
  if (patched.includes(oldMainMarker)) {
    patched = patched.replace(oldMainMarker, newMainMarker);
  }

  const oldMainPosBlock = `    $mainPos = strpos($src, $mainMarker);
    if ($mainPos === false) {
        return '';
    }`;
  const newMainPosBlock = `    if (!preg_match($mainRegex, $src, $mainMatch, PREG_OFFSET_CAPTURE)) {
        return '';
    }
    $mainPos = (int) $mainMatch[0][1];`;

  if (patched.includes(oldMainPosBlock)) {
    patched = patched.replace(oldMainPosBlock, newMainPosBlock);
  }

  const extractFnRegex =
    /function\s+aurora_extract_main_template_html\(\):\s*string\s*\{[\s\S]*?\n\}\n\n\/\*\*/m;
  const newExtractFn = `function aurora_extract_main_template_html(): string {
    $indexPath = __DIR__ . '/index.php';
    $src = @file_get_contents($indexPath);
    if ($src === false) {
        return '';
    }

    // Приоритет: берем fallback HTML из cache-блока (ветка else),
    // чтобы исключить PHP-код и случайные совпадения с "</article>" в строках regex.
    if (preg_match(
        '~if\\s*\\(!empty\\(\\$pageMainHtml\\)\\)\\s*\\{[\\s\\S]*?\\}\\s*else\\s*\\{\\s*\\?>\\s*([\\s\\S]*?)\\s*<\\?php\\s*\\}\\s*\\?>~iu',
        $src,
        $m
    )) {
        return trim((string) ($m[1] ?? ''));
    }

    // Второй приоритет: контент внутри article без PHP.
    if (preg_match('~<article\\b[^>]*>([\\s\\S]*?)</article>~iu', $src, $m)) {
        $candidate = (string) ($m[1] ?? '');
        $candidate = preg_replace('~<\\?php[\\s\\S]*?\\?>~u', '', $candidate);
        return trim((string) $candidate);
    }

    // Fallback для старых шаблонов.
    if (!preg_match('/<main\\\\b[^>]*>/i', $src, $mainMatch, PREG_OFFSET_CAPTURE)) {
        return '';
    }
    $mainPos = (int) $mainMatch[0][1];
    $startPos = strpos($src, '<section', $mainPos);
    if ($startPos === false) {
        return '';
    }
    $endPos = strpos($src, '// Кнопка/ссылка на следующий уровень /en/');
    if ($endPos === false) {
        return '';
    }
    return substr($src, $startPos, $endPos - $startPos);
}

/**`;
  if (extractFnRegex.test(patched)) {
    patched = patched.replace(extractFnRegex, `${newExtractFn}`);
  }

  const fallbackFn = `
function aurora_build_offline_fallback_main_html(string $placeholderHtml, array $slots, int $depth, string $path, string $theme): string {
    $rendered = $placeholderHtml;
    $pathLabel = trim($path) === '' ? 'root' : str_replace('/', ' / ', trim($path, '/'));
    $leadVariants = [
        'Подробный обзор',
        'Практическое руководство',
        'Актуальная информация',
        'Стратегия и советы',
        'Разбор условий и преимуществ',
        'Навигация по возможностям',
    ];
    $detailVariants = [
        'материал акцентирует ключевые условия и действия',
        'раздел раскрывает порядок регистрации и входа',
        'контент фокусируется на бонусах и безопасности',
        'обзор показывает рабочие сценарии использования',
        'текст уточняет нюансы и практические шаги',
        'описание помогает быстро ориентироваться в разделе',
    ];
    foreach ($slots as $s) {
        $i = (int) ($s['i'] ?? 0);
        $tag = strtolower((string) ($s['tag'] ?? 'p'));
        $example = trim((string) ($s['example'] ?? ''));
        if ($example === '') {
            $example = 'Информация обновляется.';
        }
        $lead = $leadVariants[($depth + $i) % count($leadVariants)];
        $detail = $detailVariants[($depth * 3 + $i) % count($detailVariants)];
        $suffix = ' — ' . $theme . '; ' . $detail . ' [' . $pathLabel . ', depth ' . $depth . ']';
        if ($tag === 'h1' || $tag === 'h2') {
            $text = aurora_truncate_to_max_words($lead . ' ' . $theme, 7);
        } elseif ($tag === 'h3') {
            $text = aurora_truncate_to_max_words($lead . ': ' . $theme, 8);
        } else {
            $text = $example . $suffix;
        }
        $safeText = htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $rendered = str_replace('%%SLOT_' . $i . '%%', $safeText, $rendered);
    }
    return $rendered;
}

`;
  if (!patched.includes("function aurora_build_offline_fallback_main_html(")) {
    patched = patched.replace(
      /function\s+aurora_truncate_to_max_words[\s\S]*?return trim\(implode\(' ', \$words\)\);\n\}\n\n\/\*\*/m,
      (m) => `${m.replace(/\n\/\*\*$/, "\n")}${fallbackFn}/**`
    );
  }

  patched = patched.replace(
    `if ($claudeApiKey === '' || strpos($claudeApiKey, 'sk-ant-') !== 0) {
        return null;
    }`,
    `if ($claudeApiKey === '' || strpos($claudeApiKey, 'sk-ant-') !== 0) {
        $offlineOnly = true;
    } else {
        $offlineOnly = false;
    }`
  );

  patched = patched.replace(
    `    $theme = aurora_resolve_theme_for_page_content($depth, $seoPath);
    $prompt = aurora_build_claude_prompt($isRootRequest, $depth, $path, $slots, $theme);
`,
    `    $theme = aurora_resolve_theme_for_page_content($depth, $seoPath);
    $prompt = aurora_build_claude_prompt($isRootRequest, $depth, $path, $slots, $theme);
    $fallbackRendered = aurora_build_offline_fallback_main_html($placeholderHtml, $slots, $depth, $path, $theme);
    if ($offlineOnly) {
        echo date('c') . ' TEXT_CACHE=OFFLINE reason=no_api_key_or_bad_prefix depth=' . (int) $depth . PHP_EOL;
        $cacheFile = $claudeSeoCacheDir . '/claude_text_depth' . $depth . '_' . $pathSlug . '.json';
        @file_put_contents($cacheFile, json_encode([
            'generatedAt' => date('c'),
            'depth' => $depth,
            'pathKey' => $pathKey,
            'contentTheme' => $theme,
            'slotCount' => $slotCount,
            'mainHtml' => $fallbackRendered,
            'offlineFallback' => true,
        ], JSON_UNESCAPED_UNICODE));
        return $fallbackRendered;
    }
`
  );

  patched = patched.replace(
    `        if ($httpCode !== 200 || !$response) {
            @unlink($lockFile);
            return null;
        }`,
    `        if ($httpCode !== 200 || !$response) {
            @unlink($lockFile);
            echo date('c') . ' TEXT_CACHE=OFFLINE reason=api_http http=' . (int) $httpCode . ' err=' . substr(preg_replace('/\\s+/', ' ', (string) $curlError), 0, 180) . PHP_EOL;
            return $fallbackRendered;
        }`
  );
  patched = patched.replace(
    `        if ($innerText === '') {
            @unlink($lockFile);
            return null;
        }`,
    `        if ($innerText === '') {
            @unlink($lockFile);
            echo date('c') . ' TEXT_CACHE=OFFLINE reason=empty_inner_text depth=' . (int) $depth . PHP_EOL;
            return $fallbackRendered;
        }`
  );
  patched = patched.replace(
    `        if (!is_array($data) || empty($data['slots']) || !is_array($data['slots'])) {
            @unlink($lockFile);
            return null;
        }`,
    `        if (!is_array($data) || empty($data['slots']) || !is_array($data['slots'])) {
            @unlink($lockFile);
            echo date('c') . ' TEXT_CACHE=OFFLINE reason=bad_slots_json depth=' . (int) $depth . PHP_EOL;
            return $fallbackRendered;
        }`
  );
  patched = patched.replace(
    `    } catch (Throwable $e) {
        if ($debug) {
            @file_put_contents($textDebugLogFile, date('c') . " [exception] " . $e->getMessage() . "\\n", FILE_APPEND);
        }
        return null;
    } finally {`,
    `    } catch (Throwable $e) {
        if ($debug) {
            @file_put_contents($textDebugLogFile, date('c') . " [exception] " . $e->getMessage() . "\\n", FILE_APPEND);
        }
        echo date('c') . ' TEXT_CACHE=OFFLINE reason=exception ' . substr(preg_replace('/\\s+/', ' ', $e->getMessage()), 0, 200) . PHP_EOL;
        return $fallbackRendered ?? null;
    } finally {`
  );

  // Final safety net for template variants:
  // if the call was added, but function insert regex missed, append function.
  if (
    patched.includes("aurora_build_offline_fallback_main_html(") &&
    !patched.includes("function aurora_build_offline_fallback_main_html(")
  ) {
    patched = `${patched}\n\n${fallbackFn}\n`;
  }

  if (patched !== content) {
    await fs.writeFile(filePath, patched, "utf8");
  }
}

function ensurePathFallback(indexPhp) {
  const marker = "$path = $_GET['path'] ?? '';";
  if (!indexPhp.includes(marker)) {
    return indexPhp;
  }
  if (indexPhp.includes("fallback: derive path from REQUEST_URI")) {
    return indexPhp;
  }

  const injection = `${marker}
// fallback: derive path from REQUEST_URI when rewrite/path param is missing
if ($path === '') {
    $reqPath = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (preg_match('#^/en/(.*)$#', $reqPath, $mPath)) {
        $path = trim((string) ($mPath[1] ?? ''), '/');
    }
}`;
  return indexPhp.replace(marker, injection);
}

function ensureRootPage200ForAll(indexPhp) {
  const pattern =
    /if\s*\(\$isRootRequest\)\s*\{\s*if\s*\(!is_crawler_bot\(\)\)\s*\{\s*\$currentPathDisplay\s*=\s*'\/';\s*\$redirectUrl\s*=\s*\$scheme\s*\.\s*':\/\/'\s*\.\s*\$host\s*\.\s*'\/en\/';\s*\$redirectType\s*=\s*'next';\s*\}\s*\}\s*elseif\s*\(!is_crawler_bot\(\)\)\s*\{/s;
  const replacement = `if ($isRootRequest) {
    $currentPathDisplay = '/';
} elseif (!is_crawler_bot()) {`;

  if (!pattern.test(indexPhp)) {
    return indexPhp;
  }
  return indexPhp.replace(pattern, replacement);
}
