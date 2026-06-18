import fs from "node:fs/promises";
import path from "node:path";
import { getAppRoot } from "@/src/lib/app-paths";
import { resolveGatewayUrlForBuild } from "@/src/lib/brand-chrome";
import { isBotGateGenerationMode } from "@/src/lib/generation-modes";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} phpFile e.g. index.php, reviews.php
 * @returns {string} route path for sitemap / React Router
 */
export function phpFileToRoutePath(phpFile) {
  const f = String(phpFile || "")
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, "");
  if (!f || f === "index") return "/";
  return `/${f}`;
}

/**
 * @param {string[]} routePaths e.g. ["/", "/reviews"]
 * @returns {string[]} sitemap path segments ("" for home)
 */
export function routePathsForSitemap(routePaths) {
  const out = [];
  for (const p of Array.isArray(routePaths) ? routePaths : []) {
    const raw = String(p || "").trim();
    if (!raw || raw === "/") {
      if (!out.includes("")) out.push("");
      continue;
    }
    const seg = raw.replace(/^\//, "").replace(/\/+$/, "");
    if (seg && !out.includes(seg)) out.push(seg);
  }
  return out.length ? out : [""];
}

export async function writeRobotsSitemap(outputDir, baseUrl, paths) {
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
    const loc = p === "" || p === "/"
      ? `${baseUrl}/`
      : `${baseUrl}/${String(p).replace(/^\//, "")}`;
    lines.push(`  <url><loc>${escapeXml(loc)}</loc><priority>0.85</priority></url>`);
  }
  lines.push(`</urlset>`, "");

  await fs.writeFile(path.join(outputDir, "robots.txt"), robots, "utf8");
  await fs.writeFile(path.join(outputDir, "sitemap.xml"), lines.join("\n"), "utf8");
}

export async function writeMultipageSiteConfig(outputDir, gatewayUrl) {
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

export async function writeMultipageHtaccess(outputDir) {
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

/** Vite base "./" breaks deep routes: /bonus resolves ./assets → /bonus/assets (404). */
export function normalizeSpaIndexHtmlAssetPaths(html) {
  return String(html || "")
    .replace(/(\s(?:src|href)=["'])\.\/assets\//gi, "$1/assets/")
    .replace(/(\s(?:src|href)=["'])\.\/img\//gi, "$1/img/");
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildCanonicalHref(baseUrl, route) {
  const origin = String(baseUrl || "").trim().replace(/\/+$/, "");
  const r = String(route || "/").trim() || "/";
  if (r === "/") return `${origin}/`;
  const seg = r.replace(/^\//, "").replace(/\/+$/, "");
  return `${origin}/${seg}/`;
}

/**
 * Apply per-route title, description, keywords, canonical to SPA shell HTML.
 * @param {string} shellHtml
 * @param {{ route?: string, title?: string, description?: string, seoKeywords?: string[] }} page
 * @param {string} baseUrl
 */
export function applySpaPageHeadMeta(shellHtml, page, baseUrl) {
  let html = String(shellHtml || "");
  const title = String(page?.title || "Сайт").trim();
  const desc = String(page?.description || "").trim();
  const kws = Array.isArray(page?.seoKeywords) ? page.seoKeywords.filter(Boolean) : [];
  const canonHref = buildCanonicalHref(baseUrl, page?.route || "/");
  const canonTag = `<link rel="canonical" href="${escapeHtmlAttr(canonHref)}" />`;

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttr(title)}</title>`);

  const descTag = `<meta name="description" content="${escapeHtmlAttr(desc)}" />`;
  if (/<meta\s+name="description"/i.test(html)) {
    html = html.replace(/<meta\s+name="description"[^>]*>/i, descTag);
  } else {
    html = html.replace(/<\/head>/i, `  ${descTag}\n  </head>`);
  }

  if (kws.length) {
    const kwTag = `<meta name="keywords" content="${escapeHtmlAttr(kws.join(", "))}" />`;
    if (/<meta\s+name="keywords"/i.test(html)) {
      html = html.replace(/<meta\s+name="keywords"[^>]*>/i, kwTag);
    } else {
      html = html.replace(/<\/head>/i, `  ${kwTag}\n  </head>`);
    }
  } else {
    html = html.replace(/<meta\s+name="keywords"[^>]*>\s*/i, "");
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

  if (/<link\b[^>]*\brel=["']canonical["'][^>]*>/i.test(html)) {
    html = html.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, canonTag);
  } else {
    html = html.replace(/<\/head>/i, `  ${canonTag}\n  </head>`);
  }

  return html;
}

/**
 * Write index.html per React route (/, /bonus/, …) with unique SEO head + canonical.
 * @param {string} outputDir
 * @param {{ baseUrl: string, shellHtml: string, pages: Array<{ route?: string, title?: string, description?: string, seoKeywords?: string[] }> }} opts
 */
export async function writeSpaPerRouteHeadHtml(outputDir, opts) {
  const baseUrl = String(opts?.baseUrl || "").trim();
  const shell = normalizeSpaIndexHtmlAssetPaths(String(opts?.shellHtml || ""));
  const pages = Array.isArray(opts?.pages) ? opts.pages : [];
  if (!shell || !pages.length) return;

  for (const page of pages) {
    const route = String(page?.route || "/").trim() || "/";
    const html = applySpaPageHeadMeta(shell, page, baseUrl);
    if (route === "/") {
      await fs.writeFile(path.join(outputDir, "index.html"), html, "utf8");
      continue;
    }
    const seg = route.replace(/^\//, "").replace(/\/+$/, "");
    if (!seg) {
      await fs.writeFile(path.join(outputDir, "index.html"), html, "utf8");
      continue;
    }
    const dir = path.join(outputDir, seg);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), html, "utf8");
  }
}

/** SPA fallback for React static deploy (standard mode). */
export async function writeReactSpaHtaccess(outputDir, opts = {}) {
  const botGate = isBotGateGenerationMode(opts.generationMode);
  const fallback = botGate ? "index.php" : "index.html";
  const content = `<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    RewriteRule ^config\\.php$ - [F,L]

    RewriteCond %{REQUEST_FILENAME} -f
    RewriteRule ^ - [L]

    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    RewriteRule ^ ${fallback} [L,QSA]
</IfModule>

Options -Indexes
`;
  await fs.writeFile(path.join(outputDir, ".htaccess"), content, "utf8");
}

/** bot_gate: PHP gate before SPA shell. */
export function wrapHtmlDocumentForBotGate(html) {
  const body = String(html || "");
  return `<?php
require_once __DIR__ . '/config.php';
if (function_exists('aurora_maybe_redirect_human_visitor')) {
    aurora_maybe_redirect_human_visitor();
}
?>
${body}`;
}

/**
 * Copy Vite dist/ into deploy root; apply site-ops (config, robots, htaccess).
 * @param {object} opts
 * @param {string} opts.outputDir project root
 * @param {string} opts.distDir vite dist folder
 * @param {string} opts.baseUrl
 * @param {string} opts.gatewayUrl
 * @param {string[]} opts.sitemapPaths
 * @param {string} [opts.generationMode]
 */
export async function finalizeReactDeployableSite(opts) {
  const outputDir = String(opts.outputDir || "").trim();
  const distDir = String(opts.distDir || "").trim();
  if (!outputDir || !distDir) {
    throw new Error("finalizeReactDeployableSite: outputDir and distDir required");
  }

  const entries = await fs.readdir(distDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(distDir, ent.name);
    const dest = path.join(outputDir, ent.name);
    if (ent.isDirectory()) {
      await fs.rm(dest, { recursive: true, force: true });
      await fs.cp(src, dest, { recursive: true });
    } else {
      await fs.copyFile(src, dest);
    }
  }

  const generationMode = opts.generationMode || "standard";
  const indexHtmlPath = path.join(outputDir, "index.html");
  let indexHtml = "";
  try {
    indexHtml = await fs.readFile(indexHtmlPath, "utf8");
  } catch {
    throw new Error("React build: dist/index.html not found");
  }

  indexHtml = normalizeSpaIndexHtmlAssetPaths(indexHtml);

  const spaPages = Array.isArray(opts.spaPages) ? opts.spaPages : [];
  if (spaPages.length) {
    await writeSpaPerRouteHeadHtml(outputDir, {
      baseUrl: opts.baseUrl,
      shellHtml: indexHtml,
      pages: spaPages,
    });
  } else {
    await fs.writeFile(indexHtmlPath, indexHtml, "utf8");
  }

  if (isBotGateGenerationMode(generationMode)) {
    const rootHtml = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
    const wrapped = wrapHtmlDocumentForBotGate(rootHtml);
    await fs.writeFile(path.join(outputDir, "index.php"), wrapped, "utf8");
  }

  await writeMultipageSiteConfig(outputDir, opts.gatewayUrl);
  await writeRobotsSitemap(outputDir, opts.baseUrl, opts.sitemapPaths || [""]);
  await writeReactSpaHtaccess(outputDir, { generationMode });
}
