const MAIN_OPEN_RE = /<main[^>]*>/i;
const MAIN_CLOSE_RE = /<\/main>/i;

export function normalizeAndExtractMainHtml(inputHtml) {
  const normalized = String(inputHtml || "").trim();
  if (!normalized) {
    throw new Error("HTML пустой.");
  }
  const styleBlocks = extractStyleBlocks(normalized);
  const stylePrefix = styleBlocks.length ? `${styleBlocks.join("\n")}\n\n` : "";

  const mainOpen = normalized.match(MAIN_OPEN_RE);
  if (!mainOpen) {
    return rewriteAssetPaths(stripPhpTags(`${stylePrefix}${normalized}`));
  }

  const start = mainOpen.index + mainOpen[0].length;
  const tail = normalized.slice(start);
  const closeMatch = tail.match(MAIN_CLOSE_RE);
  if (!closeMatch) {
    return rewriteAssetPaths(stripPhpTags(`${stylePrefix}${normalized}`));
  }

  const inner = tail.slice(0, closeMatch.index);
  return rewriteAssetPaths(stripPhpTags(`${stylePrefix}${inner.trim()}`));
}

export function prepareFullHtmlDocument(inputHtml) {
  const normalized = String(inputHtml || "").trim();
  if (!normalized) {
    throw new Error("HTML пустой.");
  }
  return rewriteAssetPaths(stripPhpTags(normalized));
}

export function sanitizeLakiBrandWords(html) {
  const src = String(html || "");
  if (!src) return src;

  // Удаляем world/ворлд только из текстовых узлов.
  // Не трогаем теги, атрибуты, <style> и <script>, чтобы не ломать верстку/селекторы.
  const tokens = src.split(
    /(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>)/gi
  );

  return tokens
    .map((part) => {
      if (!part) return part;
      if (/^<script\b/i.test(part)) return part;
      if (/^<style\b/i.test(part)) return part;
      if (/^<[^>]+>$/.test(part)) return part;
      return sanitizeBrandTextNode(part);
    })
    .join("");
}

function sanitizeBrandTextNode(text) {
  let out = String(text);
  out = out.replace(/\bworld\b/giu, "");
  out = out.replace(/ворлд/giu, "");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\s+([,;:!?])/g, "$1");
  return out;
}

function stripPhpTags(html) {
  return html.replace(/<\?(?:php)?[\s\S]*?\?>/gi, "");
}

export function rewriteAssetPaths(html) {
  let result = html;

  result = result.replace(
    /\b(src|data-src|poster)=["']([^"']+)["']/gi,
    (_m, attr, rawPath) => {
      if (!shouldRewriteAttrPath(attr, rawPath)) {
        return `${attr}="${rawPath}"`;
      }
      return `${attr}="${toImgPath(rawPath)}"`;
    }
  );

  result = result.replace(
    /<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi,
    (_m, before, rawPath, after) => {
      if (!shouldRewriteLinkHref(before, rawPath)) {
        return `<link${before}href="${rawPath}"${after}>`;
      }
      const next = toImgPath(rawPath);
      return `<link${before}href="${next}"${after}>`;
    }
  );

  result = result.replace(
    /url\((['"]?)([^'")]+)\1\)/gi,
    (_m, quote, rawPath) => `url(${quote}${toImgPath(rawPath)}${quote})`
  );

  return result;
}

function toImgPath(rawPath) {
  if (!rawPath) return rawPath;
  if (
    rawPath.startsWith("http://") ||
    rawPath.startsWith("https://") ||
    rawPath.startsWith("data:") ||
    rawPath.startsWith("//")
  ) {
    return rawPath;
  }
  if (rawPath.startsWith("#")) {
    return rawPath;
  }
  if (rawPath.startsWith("./img/")) {
    return rawPath;
  }
  if (rawPath.startsWith("/img/")) {
    return `.${rawPath}`;
  }
  const clean = rawPath.replace(/^\.?\//, "");
  if (clean.startsWith("img/")) {
    return `./${clean}`;
  }
  const fileName = clean.split("/").pop();
  return `./img/${fileName}`;
}

function shouldRewriteAttrPath(attr, rawPath) {
  const name = String(attr || "").toLowerCase();
  const p = String(rawPath || "").trim();
  if (!p) return false;
  if (name === "poster" || name === "data-src") return true;
  if (name !== "src") return false;
  return (
    /^\.?\/?img\//i.test(p) ||
    /\.(avif|webp|png|jpe?g|gif|svg)$/i.test(p)
  );
}

function shouldRewriteLinkHref(linkAttrs, rawPath) {
  const attrs = String(linkAttrs || "");
  const p = String(rawPath || "").trim();
  if (!p) return false;
  if (/rel=["'][^"']*(stylesheet|preload|modulepreload)[^"']*["']/i.test(attrs)) {
    return false;
  }
  return (
    /^\.?\/?img\//i.test(p) ||
    /\.(avif|webp|png|jpe?g|gif|svg|ico)$/i.test(p) ||
    /rel=["'][^"']*(icon|apple-touch-icon|mask-icon)[^"']*["']/i.test(attrs)
  );
}

function extractStyleBlocks(html) {
  const matches = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
  return matches ? matches.map((s) => s.trim()) : [];
}

