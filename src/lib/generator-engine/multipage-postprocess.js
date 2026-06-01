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
export function applyMultipageHtmlPostprocess(html, opts = {}) {
  let out = String(html || "");
  const {
    currentPageFile,
    navLinks,
    chromeVariant,
    pages,
    gatewayUrl,
  } = opts;

  out = normalizeGatewayHostCasingInHtml(out, gatewayUrl);
  out = rewriteChromeNavToPlan(out, {
    currentPageFile,
    navLinks,
    chromeVariant,
    pages,
  });
  out = stripTailwindCdnFromHtml(out);
  out = repairMetaDescriptionInHtml(out);
  return out;
}
