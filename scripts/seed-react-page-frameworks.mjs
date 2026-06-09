#!/usr/bin/env node
/**
 * Upsert page section-order frameworks (100 sidebar + 100 header per page_kind).
 *
 * Usage (from repo root):
 *   node scripts/seed-react-page-frameworks.mjs
 *
 * Apply migration first:
 *   supabase/migrations/20260613120000_generator_react_page_frameworks.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildPageFrameworksCatalog } from "../src/lib/generator-engine/react-page-frameworks-catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function loadDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = val;
      }
    }
  } catch {
    /* optional */
  }
}

loadDotEnv(path.join(REPO_ROOT, ".env"));
loadDotEnv(path.join(REPO_ROOT, ".env.local"));

const url = String(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
).trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url || !key) {
  console.error(
    "Missing Supabase credentials. Add to soft-union/.env:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=eyJ..."
  );
  process.exit(1);
}

const supabase = createClient(url.replace(/\/+$/, ""), key);
const catalog = buildPageFrameworksCatalog();

const chunkSize = 200;
for (let i = 0; i < catalog.length; i += chunkSize) {
  const chunk = catalog.slice(i, i + chunkSize);
  const { error } = await supabase.from("generator_react_page_frameworks").upsert(
    chunk.map((row) => ({
      id: row.id,
      layout_kind: row.layout_kind,
      page_kind: row.page_kind,
      variant_number: row.variant_number,
      label: row.label,
      section_order: row.section_order,
      meta_json: row.meta_json,
      is_active: true,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" }
  );
  if (error) {
    console.error("Seed failed:", error.message);
    if (/generator_react_page_frameworks/i.test(error.message)) {
      console.error(
        "Apply migration first: supabase/migrations/20260613120000_generator_react_page_frameworks.sql"
      );
    }
    process.exit(1);
  }
}

const byKind = {};
for (const row of catalog) {
  const k = `${row.layout_kind}/${row.page_kind}`;
  byKind[k] = (byKind[k] || 0) + 1;
}
console.log(`Seeded ${catalog.length} page frameworks.`);
for (const [k, n] of Object.entries(byKind).sort()) {
  console.log(`  ${k}: ${n}`);
}
