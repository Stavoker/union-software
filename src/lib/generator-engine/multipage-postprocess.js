/**
 * Пост-обробка HTML/CSS після збірки multipage (nav, QA, deploy skip).
 */

import fs from "node:fs/promises";
import path from "node:path";

import { buildOrderedNavEntries } from "@/src/lib/brand-chrome";

const DEPLOY_SKIP_EXACT = new Set([
  ".claude_api_key",
  ".aurora_multipage.json",
  ".aurora_site_meta.json",
  ".aurora_build_progress.json",
  ".aurora_quality_gate.json",
  ".DS_Store",
]);

/** Файли/патерни, які не заливаються на production-хост. */
export function shouldSkipDeployProjectEntry(name, isDirectory = false) {
  const base = String(name || "").trim();
  if (!base) return true;
  if (isDirectory && (base === ".git" || base === "node_modules" || base === "cache")) {
    return true;
  }
  if (DEPLOY_SKIP_EXACT.has(base)) return true;
  if (base.startsWith(".aurora_")) return true;
  return false;
}

export async function uploadProjectDirFiltered(sftp, localDir, remoteDir) {
  const local = String(localDir || "").trim();
  const remote = String(remoteDir || "").trim();
  if (!local || !remote) {
    throw new Error("uploadProjectDirFiltered: localDir and remoteDir required");
  }
  await sftp.mkdir(remote, true);
  const entries = await fs.readdir(local, { withFileTypes: true });
  for (const ent of entries) {
    if (shouldSkipDeployProjectEntry(ent.name, ent.isDirectory())) continue;
    const lp = path.join(local, ent.name);
    const rp = `${remote.replace(/\/+$/, "")}/${ent.name}`;
    if (ent.isDirectory()) {
      await uploadProjectDirFiltered(sftp, lp, rp);
    } else {
      await sftp.fastPut(lp, rp);
    }
  }
}

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function canonicalPageFileFromHref(href) {
  const raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || /^https?:/i.test(raw) || /^mailto:/i.test(raw)) {
    return null;
  }
  let h = raw.replace(/^\.\//, "").split("#")[0].split("?")[0].trim();
  if (!h || h === "/") return "index.php";
  if (!/\.(php|html)$/i.test(h)) return null;
  return h.toLowerCase();
}

function hrefForPageFile(file) {
  const f = String(file || "").trim().toLowerCase();
  if (!f || f === "index.php" || f === "index.html") return "./index.php";
  return `./${f.replace(/^\.\//, "")}`;
}

function buildAllowedFileSet(pages) {
  const allowed = new Set(["index.php", "index.html"]);
  for (const p of Array.isArray(pages) ? pages : []) {
    const f = String(p?.file || "").trim().toLowerCase();
    if (f) allowed.add(f);
  }
  return allowed;
}

function extractTagRegion(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  const regions = [];
  let m;
  const s = String(html || "");
  while ((m = re.exec(s)) !== null) {
    regions.push({ start: m.index, end: m.index + m[0].length, html: m[0] });
  }
  return regions;
}

function rewriteInternalAnchorsInFragment(
  fragment,
  { allowedFiles, currentPageFile, fallbackFile = "index.php" }
) {
  const cur = String(currentPageFile || "").trim().toLowerCase();
  const fallback = hrefForPageFile(fallbackFile);

  return String(fragment || "").replace(
    /<a\b([^>]*)\bhref=(["'])([^"']+)\2([^>]*)>/gi,
    (full, pre, q, href, post) => {
      const file = canonicalPageFileFromHref(href);
      if (!file) return full;
      if (allowedFiles.has(file)) {
        const target = hrefForPageFile(file);
        const isActive = file === cur;
        let attrs = `${pre}href=${q}${target}${q}${post}`;
        attrs = attrs.replace(/\s*aria-current\s*=\s*["'][^"']*["']/gi, "");
        attrs = attrs.replace(/\s*union_[a-z0-9]+_nav_active/gi, "");
        if (isActive) {
          if (!/\bclass\s*=/i.test(attrs)) {
            attrs += ` class="union_index_nav_link union_index_nav_active"`;
          } else if (!/nav_active/i.test(attrs)) {
            attrs = attrs.replace(
              /\bclass=(["'])([^"']*)\1/i,
              (m, cq, cls) => `class=${cq}${cls} union_index_nav_active${cq}`
            );
          }
          if (!/\baria-current\s*=/i.test(attrs)) {
            attrs += ` aria-current="page"`;
          }
        }
        return `<a${attrs}>`;
      }
      const innerMatch = full.match(/>([\s\S]*?)<\/a>/i);
      const inner = innerMatch ? innerMatch[1] : "";
      if (inner.trim()) {
        return `<span class="union_nav_orphan">${inner}</span>`;
      }
      return "";
    }
  );
}

function rebuildNavElement(navHtml, entries, currentPageFile) {
  const m = String(navHtml || "").match(/^<nav(\b[^>]*)>/i);
  if (!m) return navHtml;
  const attrs = m[1] || "";
  const cur = String(currentPageFile || "").trim().toLowerCase();
  const links = entries
    .map((e) => {
      const file =
        e.href === "/" ? "index.php" : String(e.href || "").replace(/^\.\//, "").toLowerCase();
      const href = hrefForPageFile(file);
      const active = file === cur;
      const cls = active
        ? "union_index_nav_link union_index_nav_active"
        : "union_index_nav_link";
      const ac = active ? ' aria-current="page"' : "";
      return `<a href="${href}" class="${cls}"${ac}>${escapeHtmlAttr(e.label)}</a>`;
    })
    .join("\n");
  return `<nav${attrs}>\n${links}\n</nav>`;
}

function rebuildFooterLinksDiv(footerHtml, entries, currentPageFile) {
  const re =
    /(<div\b[^>]*(?:footer-links|footer_links)[^>]*>)([\s\S]*?)(<\/div>)/i;
  const cur = String(currentPageFile || "").trim().toLowerCase();
  if (!re.test(footerHtml)) return footerHtml;
  return footerHtml.replace(re, (full, open, _inner, close) => {
    const parts = entries.map((e, i) => {
      const file =
        e.href === "/" ? "index.php" : String(e.href || "").replace(/^\.\//, "").toLowerCase();
      const href = hrefForPageFile(file);
      const sep =
        i > 0 ? '<span class="union_index_footer-sep"> · </span>' : "";
      return `${sep}<a href="${href}">${escapeHtmlAttr(e.label)}</a>`;
    });
    return `${open}${parts.join("")}${close}`;
  });
}

/**
 * Меню/футер: лише сторінки з плану; aria-current на поточній; сироти — прибрати href.
 */
export function rewriteChromeNavToPlan(
  html,
  { currentPageFile, navLinks, chromeVariant, pages }
) {
  let out = String(html || "");
  if (!out) return out;

  const allowedFiles = buildAllowedFileSet(pages);
  const entries = buildOrderedNavEntries(
    chromeVariant,
    Array.isArray(navLinks) ? navLinks : []
  );
  const cur = String(currentPageFile || "").trim().toLowerCase();

  const headerRegions = extractTagRegion(out, "header");
  const footerRegions = extractTagRegion(out, "footer");
  const regions = [...headerRegions, ...footerRegions].sort((a, b) => b.start - a.start);

  for (const reg of regions) {
    let chunk = reg.html;
  if (/<nav\b/i.test(chunk) && entries.length) {
      chunk = chunk.replace(/<nav\b[\s\S]*?<\/nav>/i, (nav) =>
        rebuildNavElement(nav, entries, cur)
      );
    }
    chunk = rebuildFooterLinksDiv(chunk, entries, cur);
    chunk = rewriteInternalAnchorsInFragment(chunk, {
      allowedFiles,
      currentPageFile: cur,
    });
    out = out.slice(0, reg.start) + chunk + out.slice(reg.end);
  }

  const mainMatch = out.match(/<main\b[\s\S]*?<\/main>/i);
  if (mainMatch) {
    const fixedMain = rewriteInternalAnchorsInFragment(mainMatch[0], {
      allowedFiles,
      currentPageFile: cur,
    });
    out = out.replace(mainMatch[0], fixedMain);
  }

  return out;
}

/** Внутрішні посилання в <main> лише на файли з плану. */
export function rewriteInternalLinksInMainToPlan(mainHtml, pages, currentPageFile) {
  const allowedFiles = buildAllowedFileSet(pages);
  return rewriteInternalAnchorsInFragment(String(mainHtml || ""), {
    allowedFiles,
    currentPageFile,
  });
}

export function stripTailwindCdnFromHtml(html) {
  let out = String(html || "");
  out = out.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>\s*/gi,
    ""
  );
  out = out.replace(/<script\b[^>]*>\s*tailwind\.config\s*=[\s\S]*?<\/script>\s*/gi, "");
  return out;
}

export function normalizeGatewayHostCasingInHtml(html, gatewayUrl) {
  const gw = String(gatewayUrl || "").trim();
  if (!gw || !html) return html;
  let canonical;
  try {
    canonical = new URL(gw);
  } catch {
    return html;
  }
  const wantHost = canonical.host.toLowerCase();
  const wantOrigin = `${canonical.protocol}//${canonical.host}`.toLowerCase();

  return String(html).replace(
    /\bhref=(["'])(https?:\/\/[^"']+)\1/gi,
    (full, q, href) => {
      try {
        const u = new URL(href);
        if (
          u.host.toLowerCase() === wantHost ||
          (/gateway/i.test(u.host) && /gateway/i.test(wantHost))
        ) {
          const fixed = `${canonical.protocol}//${canonical.host}${u.pathname}${u.search}${u.hash}`;
          return `href=${q}${fixed}${q}`;
        }
      } catch {
        /* */
      }
      return full;
    }
  );
}

/** Видаляє зайві </a> без відповідного <a> (типовий артефакт LLM). */
export function repairUnbalancedAnchorTags(html) {
  const s = String(html || "");
  if (!/<\/?a\b/i.test(s)) return s;
  const tagRe = /<\/?a\b[^>]*>/gi;
  let out = "";
  let last = 0;
  let open = 0;
  let m;
  while ((m = tagRe.exec(s)) !== null) {
    out += s.slice(last, m.index);
    const tag = m[0];
    const isClose = /^<\//i.test(tag);
    if (isClose) {
      if (open > 0) {
        out += tag;
        open -= 1;
      }
    } else {
      out += tag;
      open += 1;
    }
    last = m.index + tag.length;
  }
  out += s.slice(last);
  return out;
}

function spot064ActiveNavKey(pageFile) {
  const f = String(pageFile || "").trim().toLowerCase();
  if (f === "index.php" || f === "index.html") return "index";
  return f.replace(/\.php$/i, "").replace(/[^a-z0-9_-]/gi, "") || "index";
}

export function isBrokenLwSiteRailFragment(fragment) {
  const s = String(fragment || "");
  if (!/<aside\b/i.test(s) || !/lw-site-rail/i.test(s)) return false;
  if (/partials\/site-rail\.php/i.test(s)) return false;
  if (/\{\{|\{%/.test(s)) return true;
  if (/href=["']\s*["']/i.test(s)) return true;
  if (/<span class="lw-site-rail__link-label">\s*<\/span>/i.test(s)) return true;
  if (
    /<a\b[^>]*class="[^"]*lw-site-rail__link[^"]*"[^>]*>\s*<span class="lw-site-rail__link-label">\s*<\/span>/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
}

/** Підміняє зламаний inline rail на include partials/site-rail.php (як u-spot064). */
export function ensureSpot064RailInclude(html, opts = {}) {
  const s = String(html || "");
  if (!opts.useRailPartial) return s;
  if (/partials\/site-rail\.php/i.test(s)) return s;
  const asideRe = /<aside\b[^>]*\blw-site-rail\b[\s\S]*?<\/aside>/i;
  const m = s.match(asideRe);
  if (!m || !isBrokenLwSiteRailFragment(m[0])) return s;
  const key = spot064ActiveNavKey(opts.currentPageFile);
  const inc = `<?php $lwActiveNav = '${key.replace(/'/g, "\\'")}'; include __DIR__ . '/partials/site-rail.php'; ?>`;
  return s.replace(asideRe, inc);
}

/** Слот-превью поза #lw-games — компактні розміри (не hero 640×360). */
export function capGamePreviewImagesOutsideLwGames(html) {
  const s = String(html || "");
  const mainM = s.match(/<main\b[\s\S]*?<\/main>/i);
  if (!mainM) return s;
  let main = mainM[0];
  const gamesIdx = main.search(/\bid=["']lw-games["']/i);
  let gamesEnd = -1;
  if (gamesIdx >= 0) {
    const close = main.indexOf("</section>", gamesIdx);
    gamesEnd = close >= 0 ? close : main.length;
  }
  const capStyle =
    "max-width:168px;height:112px;object-fit:cover;object-position:center;width:100%;display:block";
  main = main.replace(/<img\b([^>]*)>/gi, (full, attrs, offset) => {
    if (!/\bsrc=["']\.\/img\//i.test(attrs)) return full;
    if (gamesIdx >= 0 && offset >= gamesIdx && offset < gamesEnd) return full;
    if (/\bstyle=/i.test(attrs)) {
      if (/max-width\s*:\s*168px/i.test(attrs)) return full;
      return full.replace(
        /\bstyle=(["'])([^"']*)\1/i,
        (_, q, st) => `style=${q}${st};${capStyle}${q}`
      );
    }
    return `<img${attrs} style="${capStyle}">`;
  });
  return s.replace(mainM[0], main);
}

export function repairMetaDescriptionInHtml(html) {
  const s = String(html || "");
  const descRe =
    /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
  const ogRe =
    /<meta\b[^>]*\bproperty\s*=\s*["']og:description["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
  const descM = s.match(descRe);
  const ogM = s.match(ogRe);
  if (!descM) return s;
  const desc = String(descM[1] || "").trim();
  const og = ogM ? String(ogM[1] || "").trim() : "";
  const looksTruncated =
    desc.length > 0 &&
    desc.length < 120 &&
    (/\s[\p{L}]{1,2}$/u.test(desc) || !/[.!?…]$/.test(desc));
  if (!looksTruncated) return s;
  const replacement =
    og.length >= Math.max(120, desc.length + 20)
      ? og.slice(0, 160)
      : desc.length < 80 && og.length > desc.length
        ? og.slice(0, 160)
        : desc;
  if (replacement === desc) return s;
  return s.replace(descRe, (tag) =>
    tag.replace(descM[1], replacement.replace(/"/g, "&quot;"))
  );
}

export function runMultipageHtmlQa(html, { pages, currentPageFile } = {}) {
  const warnings = [];
  const allowed = buildAllowedFileSet(pages);
  const s = String(html || "");

  if (/cdn\.tailwindcss\.com/i.test(s)) {
    warnings.push("tailwind_cdn_present");
  }

  if (/<\/a>/i.test(s) && !/<a\b/i.test(s)) {
    warnings.push("orphan_anchor_close");
  }

  const mainForImg = s.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || "";
  if (mainForImg) {
    const gamesIdx = mainForImg.search(/\bid=["']lw-games["']/i);
    const heroSlot = /ig-hero-slider[\s\S]{0,4000}?<img\b[^>]*\bsrc=["']\.\/img\//i.test(
      gamesIdx >= 0 ? mainForImg.slice(0, gamesIdx) : mainForImg
    );
    if (heroSlot) warnings.push("slot_img_in_hero");
  }

  if (/\big-hero-premium\b/i.test(s) && !/igaming\.css/i.test(s)) {
    warnings.push("missing_igaming_css");
  }

  const headerFooter = [
    ...extractTagRegion(s, "header"),
    ...extractTagRegion(s, "footer"),
  ];
  const mainM = s.match(/<main\b[\s\S]*?<\/main>/i);
  const scan = (frag, label) => {
    const re = /<a\b[^>]*\bhref=(["'])([^"']+)\1/gi;
    let m;
    while ((m = re.exec(frag || ""))) {
      const file = canonicalPageFileFromHref(m[2]);
      if (file && !allowed.has(file)) {
        warnings.push(`orphan_link:${label}:${file}`);
      }
    }
  };
  for (const r of headerFooter) scan(r.html, "chrome");
  if (mainM) scan(mainM[0], "main");

  if (currentPageFile && headerFooter.length) {
    const cur = String(currentPageFile).toLowerCase();
    const hdr = headerFooter[0]?.html || "";
    if (
      hdr.includes('aria-current="page"') &&
      !hdr.includes(hrefForPageFile(cur).replace("./", ""))
    ) {
      const activeWrong = !new RegExp(
        `href=["']${hrefForPageFile(cur).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*aria-current`,
        "i"
      ).test(hdr);
      if (activeWrong) warnings.push("aria_current_mismatch");
    }
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Єдина пост-обробка HTML перед записом на диск.
 */
function envBool(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizePageFileList(pages) {
  return (Array.isArray(pages) ? pages : [])
    .map((p) => (typeof p === "string" ? p : p?.file))
    .map((f) => String(f || "").trim())
    .filter(Boolean);
}

function collectImgRefsFromHtml(html) {
  const refs = [];
  const s = String(html || "");
  const re = /\b(?:src|href|content)=["'](\.\/img\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    refs.push(
      String(m[1] || "")
        .replace(/^\.\/img\//i, "")
        .split("?")[0]
        .split("#")[0]
        .trim()
    );
  }
  return refs;
}

function collectCssJsRefsFromHtml(html) {
  const css = [];
  const js = [];
  const s = String(html || "");
  let m;
  const cssRe = /<link\b[^>]*\bhref=(["'])([^"']+\.css)\1/gi;
  while ((m = cssRe.exec(s)) !== null) {
    if (!/^https?:/i.test(m[2])) css.push(m[2]);
  }
  const jsRe = /<script\b[^>]*\bsrc=(["'])([^"']+\.js)\1/gi;
  while ((m = jsRe.exec(s)) !== null) {
    if (!/^https?:/i.test(m[2])) js.push(m[2]);
  }
  return { css, js };
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Повна перевірка згенерованого сайту на диску (після всіх сторінок).
 * @returns {Promise<{ ok: boolean, errors: string[], warnings: string[], pages: object[] }>}
 */
export async function runGeneratedSiteQualityGate(
  outputDir,
  { pages, baseUrl, chromeShell, onLog } = {}
) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };
  const root = String(outputDir || "").trim();
  const pageFiles = normalizePageFileList(pages);
  const planPages = pageFiles.map((file) => ({ file }));
  const allowed = buildAllowedFileSet(planPages);
  const errors = [];
  const warnings = [];
  const pageReports = [];

  if (!pageFiles.length) {
    errors.push("no_pages_in_plan");
    return { ok: false, errors, warnings, pages: [] };
  }

  const requiredRoot = ["config.php", "robots.txt", "sitemap.xml"];
  for (const name of requiredRoot) {
    if (!(await pathExists(path.join(root, name)))) {
      errors.push(`missing_root:${name}`);
    }
  }
  if (!(await pathExists(path.join(root, "css", "chrome.css")))) {
    warnings.push("missing_chrome_css");
  }

  let imgOnDisk = new Set();
  const imgDir = path.join(root, "img");
  if (await pathExists(imgDir)) {
    const names = await fs.readdir(imgDir);
    imgOnDisk = new Set(names.map((n) => n.toLowerCase()));
    if (!imgOnDisk.has("logo.png") && !imgOnDisk.has("logo.svg")) {
      warnings.push("img_logo_missing");
    }
  } else {
    warnings.push("img_dir_missing");
  }

  for (let i = 0; i < pageFiles.length; i++) {
    const file = pageFiles[i];
    const fp = path.join(root, file);
    const pageErrors = [];
    const pageWarnings = [];

    let html = "";
    try {
      const stat = await fs.stat(fp);
      if (stat.size < 500) pageErrors.push("file_too_small");
      html = await fs.readFile(fp, "utf8");
    } catch {
      pageErrors.push("file_missing");
      pageReports.push({ file, ok: false, errors: pageErrors, warnings: pageWarnings });
      errors.push(`${file}:file_missing`);
      continue;
    }

    if (!/<!DOCTYPE\s+html/i.test(html) && !/<html\b/i.test(html)) {
      pageWarnings.push("no_html_doctype");
    }
    if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
      pageErrors.push("no_title");
    }
    if (!/<meta\b[^>]*\bname\s*=\s*["']description["']/i.test(html)) {
      pageWarnings.push("no_meta_description");
    }

    const mainM = html.match(/<main\b[\s\S]*?<\/main>/i);
    if (!mainM) {
      pageErrors.push("no_main_block");
    } else {
      const mainText = mainM[0]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (mainText.length < 60) pageErrors.push("main_empty");
    }

    if (chromeShell?.includeHeader !== false && !/<header\b/i.test(html)) {
      pageWarnings.push("no_header");
    }
    if (chromeShell?.includeFooter !== false && !/<footer\b/i.test(html)) {
      pageWarnings.push("no_footer");
    }

    const cssRel = `css/page-${i + 1}.css`;
    const jsRel = `js/page-${i + 1}.js`;
    if (!(await pathExists(path.join(root, cssRel)))) {
      pageErrors.push("page_css_missing");
    }
    if (!(await pathExists(path.join(root, jsRel)))) {
      pageWarnings.push("page_js_missing");
    }

    const assetRefs = collectCssJsRefsFromHtml(html);
    for (const rel of assetRefs.css) {
      const norm = rel.replace(/^\.\//, "");
      if (!(await pathExists(path.join(root, norm)))) {
        pageErrors.push(`broken_css:${norm}`);
      }
    }
    for (const rel of assetRefs.js) {
      const norm = rel.replace(/^\.\//, "");
      if (!(await pathExists(path.join(root, norm)))) {
        pageWarnings.push(`broken_js:${norm}`);
      }
    }

    for (const imgName of collectImgRefsFromHtml(html)) {
      if (!imgName) continue;
      if (!imgOnDisk.has(imgName.toLowerCase())) {
        pageErrors.push(`broken_img:${imgName}`);
      }
    }

    const qa = runMultipageHtmlQa(html, { pages: planPages, currentPageFile: file });
    for (const w of qa.warnings) {
      if (w.startsWith("orphan_link")) pageErrors.push(w);
      else pageWarnings.push(w);
    }

    if (/cdn\.tailwindcss\.com/i.test(html)) {
      pageWarnings.push("tailwind_cdn");
    }

    const ok = pageErrors.length === 0;
    pageReports.push({ file, ok, errors: pageErrors, warnings: pageWarnings });
    for (const e of pageErrors) errors.push(`${file}:${e}`);
    for (const w of pageWarnings) warnings.push(`${file}:${w}`);
  }

  try {
    const sitemap = await fs.readFile(path.join(root, "sitemap.xml"), "utf8");
    const locRe = /<loc>([^<]+)<\/loc>/gi;
    let loc;
    const sitemapFiles = new Set();
    while ((loc = locRe.exec(sitemap)) !== null) {
      const u = String(loc[1] || "").trim();
      const file = canonicalPageFileFromHref(u.replace(/^https?:\/\/[^/]+/i, "") || u);
      if (file) sitemapFiles.add(file);
    }
    for (const f of pageFiles.map((x) => x.toLowerCase())) {
      if (!sitemapFiles.has(f) && f !== "index.php") {
        warnings.push(`sitemap_missing:${f}`);
      }
    }
    for (const sf of sitemapFiles) {
      if (!allowed.has(sf)) warnings.push(`sitemap_orphan:${sf}`);
    }
  } catch {
    /* sitemap already flagged */
  }

  const ok = errors.length === 0;
  log(
    ok
      ? `[qa] сайт OK: ${pageFiles.length} стр., попереджень ${warnings.length}`
      : `[qa] знайдено помилок ${errors.length}, попереджень ${warnings.length}`
  );
  if (errors.length) {
    log(`[qa] errors: ${errors.slice(0, 15).join("; ")}${errors.length > 15 ? "…" : ""}`);
  }
  if (warnings.length) {
    log(`[qa] warnings: ${warnings.slice(0, 10).join("; ")}${warnings.length > 10 ? "…" : ""}`);
  }

  const report = {
    ok,
    checkedAt: new Date().toISOString(),
    baseUrl: String(baseUrl || "").trim(),
    pageCount: pageFiles.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors: errors.slice(0, 80),
    warnings: warnings.slice(0, 80),
    pages: pageReports,
  };

  if (!ok && envBool("SOFTGEN_QA_FAIL_BUILD")) {
    throw new Error(
      `Quality gate: ${errors.slice(0, 6).join("; ")}${errors.length > 6 ? "…" : ""}`
    );
  }

  return report;
}

export function applyMultipageHtmlPostprocess(html, opts = {}) {
  let out = String(html || "");
  const {
    currentPageFile,
    navLinks,
    chromeVariant,
    pages,
    gatewayUrl,
    useRailPartial,
  } = opts;

  out = repairUnbalancedAnchorTags(out);
  out = ensureSpot064RailInclude(out, { currentPageFile, useRailPartial });
  out = capGamePreviewImagesOutsideLwGames(out);
  out = normalizeGatewayHostCasingInHtml(out, gatewayUrl);
  out = rewriteChromeNavToPlan(out, {
    currentPageFile,
    navLinks,
    chromeVariant,
    pages,
  });
  out = stripTailwindCdnFromHtml(out);
  out = repairMetaDescriptionInHtml(out);
  out = repairUnbalancedAnchorTags(out);
  return out;
}
