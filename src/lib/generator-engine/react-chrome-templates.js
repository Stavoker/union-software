import {
  buildChromeTemplatesCatalog,
  fallbackChromeTemplate,
} from "@/src/lib/generator-engine/react-chrome-templates-catalog.js";

export { buildChromeTemplatesCatalog, fallbackChromeTemplate };

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function ensureChromeTemplatesSeeded(supabase) {
  const { count, error: countError } = await supabase
    .from("generator_react_chrome_templates")
    .select("id", { count: "exact", head: true });

  if (countError) {
    if (/generator_react_chrome_templates/i.test(countError.message)) {
      return { ok: false, reason: "table_missing" };
    }
    throw new Error(countError.message);
  }

  if ((count ?? 0) >= 100) {
    return { ok: true, seeded: false, count };
  }

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

  if (error) throw new Error(error.message);
  return { ok: true, seeded: true, count: catalog.length };
}

/**
 * Pick least-used chrome template for user (tie-break by seed).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ userId?: string, chromeKind: 'sidebar'|'header', seed: string, batchIndex?: number, batchSize?: number, onLog?: (msg: string) => void }} opts
 */
export async function pickChromeLayoutTemplate(supabase, opts) {
  const chromeKind = opts.chromeKind === "header" ? "header" : "sidebar";
  const seed = String(opts.seed || "chrome");
  const userId = String(opts.userId || "").trim();
  const batchIndex = Math.max(0, Math.trunc(Number(opts.batchIndex) || 0));
  const batchSize = Math.max(1, Math.trunc(Number(opts.batchSize) || 1));

  if (!supabase) {
    return fallbackChromeTemplate(chromeKind, seed);
  }

  try {
    await ensureChromeTemplatesSeeded(supabase);
  } catch (e) {
    opts.onLog?.(`Chrome templates seed: ${String(e?.message || e).slice(0, 80)}`);
    return fallbackChromeTemplate(chromeKind, seed);
  }

  const { data: templates, error: tplError } = await supabase
    .from("generator_react_chrome_templates")
    .select("id, chrome_kind, variant_number, label, style_json")
    .eq("chrome_kind", chromeKind)
    .eq("is_active", true)
    .order("variant_number", { ascending: true });

  if (tplError || !templates?.length) {
    return fallbackChromeTemplate(chromeKind, seed);
  }

  let usageCounts = new Map();
  if (userId) {
    const { data: usageRows } = await supabase
      .from("generator_token_usage")
      .select("chrome_template_id")
      .eq("user_id", userId)
      .not("chrome_template_id", "is", null)
      .limit(5000);

    for (const row of usageRows || []) {
      const id = String(row.chrome_template_id || "").trim();
      if (!id) continue;
      usageCounts.set(id, (usageCounts.get(id) || 0) + 1);
    }
  }

  const hash = (id) => {
    let state = 0;
    const s = `${seed}|${id}`;
    for (let i = 0; i < s.length; i++) {
      state = (state * 31 + s.charCodeAt(i)) >>> 0;
    }
    return state;
  };

  const sorted = [...templates].sort((a, b) => {
    const ca = usageCounts.get(a.id) || 0;
    const cb = usageCounts.get(b.id) || 0;
    if (ca !== cb) return ca - cb;
    return hash(a.id) - hash(b.id);
  });

  // Batch: site 0 → найменш використаний, site 1 → другий у черзі, … (без дубля в одній партії).
  const pickIdx =
    batchSize > 1 ? batchIndex % sorted.length : 0;
  return sorted[pickIdx];
}
