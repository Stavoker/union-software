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
  await fs.writeFile(indexHtmlPath, indexHtml, "utf8");

  if (isBotGateGenerationMode(generationMode)) {
    const wrapped = wrapHtmlDocumentForBotGate(indexHtml);
    await fs.writeFile(path.join(outputDir, "index.php"), wrapped, "utf8");
  }

  await writeMultipageSiteConfig(outputDir, opts.gatewayUrl);
  await writeRobotsSitemap(outputDir, opts.baseUrl, opts.sitemapPaths || [""]);
  await writeReactSpaHtaccess(outputDir, { generationMode });
}
