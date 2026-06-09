#!/usr/bin/env node
/**
 * Upsert 50 sidebar + 50 header chrome presets into Supabase.
 *
 * Usage (from repo root):
 *   node scripts/seed-react-chrome-templates.mjs
 *
 * Reads .env / .env.local automatically. Needs:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildChromeTemplatesCatalog } from "../src/lib/generator-engine/react-chrome-templates-catalog.js";

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
const catalog = buildChromeTemplatesCatalog();

const { error } = await supabase.from("generator_react_chrome_templates").upsert(
  catalog.map((row) => ({
    id: row.id,
    chrome_kind: row.chrome_kind,
    variant_number: row.variant_number,
    label: row.label,
    style_json: row.style_json,
    is_active: true,
    updated_at: new Date().toISOString(),
  })),
  { onConflict: "id" }
);

if (error) {
  console.error("Seed failed:", error.message);
  if (/generator_react_chrome_templates/i.test(error.message)) {
    console.error(
      "Apply migration first: supabase/migrations/20260611120000_generator_react_chrome_templates.sql"
    );
  }
  process.exit(1);
}

const sidebar = catalog.filter((r) => r.chrome_kind === "sidebar").length;
const header = catalog.filter((r) => r.chrome_kind === "header").length;
console.log(`Seeded ${catalog.length} chrome templates (${sidebar} sidebar + ${header} header).`);
