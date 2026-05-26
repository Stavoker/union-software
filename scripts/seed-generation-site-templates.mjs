#!/usr/bin/env node
/**
 * Импорт эталонов u-bet162 / u-spot064 в Supabase (generation_site_template_assets).
 *
 *   node scripts/seed-generation-site-templates.mjs
 *   node scripts/seed-generation-site-templates.mjs --slug bet162
 *
 * Env: SUPABASE_URL (или NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *      SOFTGEN_ETALON_BET162_PATH, SOFTGEN_ETALON_SPOT064_PATH (опционально)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const SLUGS = {
  bet162: {
    label: "u-bet162",
    chrome_mode: "top-header",
    defaultPath: path.join(REPO_ROOT, "src/lib/generator-engine/assets/etalon-u-bet162"),
    envKey: "SOFTGEN_ETALON_BET162_PATH",
    desktopFallback: path.resolve(REPO_ROOT, "../u-bet162"),
  },
  spot064: {
    label: "u-spot064",
    chrome_mode: "rail-rich-footer",
    defaultPath: path.join(REPO_ROOT, "src/lib/generator-engine/assets/etalon-u-spot064"),
    envKey: "SOFTGEN_ETALON_SPOT064_PATH",
    desktopFallback: path.resolve(REPO_ROOT, "../u-spot064"),
  },
};

function classifyAssetPath(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/");
  if (p.startsWith("partials/") && p.endsWith(".php")) return "partial";
  if (p.startsWith("css/") && p.endsWith(".css")) return "css";
  if (p.startsWith("js/") && p.endsWith(".js")) return "js";
  if (/^[^/]+\.php$/i.test(p)) {
    if (p === "config.php" || p === "warmup_text_cache.php") return "other";
    return "page";
  }
  return "other";
}

function walkFiles(rootDir, base = "") {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const name of fs.readdirSync(rootDir)) {
    const full = path.join(rootDir, name);
    const rel = base ? `${base}/${name}` : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full, rel));
      continue;
    }
    if (!/\.(php|css|js)$/i.test(name)) continue;
    out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

function resolveRoot(meta) {
  const fromEnv = String(process.env[meta.envKey] || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(meta.desktopFallback)) return meta.desktopFallback;
  return meta.defaultPath;
}

function supabaseConfig() {
  const supabaseUrl = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), serviceKey };
}

async function upsertAsset(base, serviceKey, slug, assetPath, assetKind, content) {
  const url = `${base}/rest/v1/generation_site_template_assets?on_conflict=template_slug,asset_path`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      template_slug: slug,
      asset_path: assetPath,
      asset_kind: assetKind,
      content,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPSERT ${slug}/${assetPath}: ${res.status} ${text.slice(0, 300)}`);
  }
}

async function seedSlug(slug, meta, base, serviceKey) {
  const root = resolveRoot(meta);
  if (!fs.existsSync(root)) {
    console.warn(`Пропуск ${slug}: нет каталога ${root}`);
    return 0;
  }
  console.log(`\n=== ${slug} ← ${root} ===`);
  const paths = walkFiles(root);
  if (slug === "spot064") {
    const shellBundled = path.join(
      REPO_ROOT,
      "src/lib/generator-engine/assets/etalon-u-spot064/css/site-shell.css"
    );
    if (fs.existsSync(shellBundled) && !paths.includes("css/site-shell.css")) {
      paths.push("css/site-shell.css");
    }
  }
  const includeOther = process.argv.includes("--all");
  let n = 0;
  for (const rel of paths.sort()) {
    let full = path.join(root, rel);
    if (!fs.existsSync(full) && rel === "css/site-shell.css") {
      full = path.join(
        REPO_ROOT,
        "src/lib/generator-engine/assets/etalon-u-spot064/css/site-shell.css"
      );
    }
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");
    const kind = classifyAssetPath(rel);
    if (kind === "other" && !includeOther) continue;
    await upsertAsset(base, serviceKey, slug, rel, kind, content);
    n++;
    process.stdout.write(`  ✓ ${rel} (${kind}, ${content.length} chars)\n`);
  }
  return n;
}

async function main() {
  const onlySlug = process.argv.includes("--slug")
    ? process.argv[process.argv.indexOf("--slug") + 1]
    : null;
  const { supabaseUrl, serviceKey } = supabaseConfig();
  const entries = Object.entries(SLUGS).filter(([slug]) => !onlySlug || slug === onlySlug);
  if (!entries.length) {
    throw new Error(`Неизвестный slug: ${onlySlug}`);
  }
  let total = 0;
  for (const [slug, meta] of entries) {
    total += await seedSlug(slug, meta, supabaseUrl, serviceKey);
  }
  console.log(`\nГотово: ${total} asset(s) в Supabase.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
