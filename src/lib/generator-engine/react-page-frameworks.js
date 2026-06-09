import {
  buildPageFrameworksCatalog,
  fallbackPageFramework,
  fileToPageKind,
} from "./react-page-frameworks-catalog.js";

export {
  buildPageFrameworksCatalog,
  fallbackPageFramework,
  fileToPageKind,
  PAGE_FRAMEWORK_KINDS,
} from "./react-page-frameworks-catalog.js";

const EXPECTED_CATALOG_SIZE = 14 * 2 * 100;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function ensurePageFrameworksSeeded(supabase) {
  const { count, error: countError } = await supabase
    .from("generator_react_page_frameworks")
    .select("id", { count: "exact", head: true });

  if (countError) {
    if (/generator_react_page_frameworks/i.test(countError.message)) {
      return { ok: false, reason: "table_missing" };
    }
    throw new Error(countError.message);
  }

  if ((count ?? 0) >= EXPECTED_CATALOG_SIZE) {
    return { ok: true, seeded: false, count };
  }

  const catalog = buildPageFrameworksCatalog();
  const { error } = await supabase.from("generator_react_page_frameworks").upsert(
    catalog.map((row) => ({
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

  if (error) throw new Error(error.message);
  return { ok: true, seeded: true, count: catalog.length };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ layoutKind: 'sidebar'|'header', pageKind: string, seed: string, batchIndex?: number, batchSize?: number, onLog?: (msg: string) => void }} opts
 */
export async function pickPageFramework(supabase, opts) {
  const layoutKind = opts.layoutKind === "header" ? "header" : "sidebar";
  const pageKind = String(opts.pageKind || "inner").trim() || "inner";
  const seed = String(opts.seed || "framework");
  const batchIndex = Math.max(0, Math.trunc(Number(opts.batchIndex) || 0));
  const batchSize = Math.max(1, Math.trunc(Number(opts.batchSize) || 1));

  if (!supabase) {
    return fallbackPageFramework(layoutKind, pageKind, seed);
  }

  try {
    await ensurePageFrameworksSeeded(supabase);
  } catch (e) {
    opts.onLog?.(`Page frameworks seed: ${String(e?.message || e).slice(0, 80)}`);
    return fallbackPageFramework(layoutKind, pageKind, seed);
  }

  const { data: frameworks, error } = await supabase
    .from("generator_react_page_frameworks")
    .select("id, layout_kind, page_kind, variant_number, label, section_order, meta_json")
    .eq("layout_kind", layoutKind)
    .eq("page_kind", pageKind)
    .eq("is_active", true)
    .order("variant_number", { ascending: true });

  if (error || !frameworks?.length) {
    return fallbackPageFramework(layoutKind, pageKind, seed);
  }

  const hash = (id) => {
    let state = 0;
    const s = `${seed}|${id}`;
    for (let i = 0; i < s.length; i++) {
      state = (state * 31 + s.charCodeAt(i)) >>> 0;
    }
    return state;
  };

  const sorted = [...frameworks].sort((a, b) => hash(a.id) - hash(b.id));
  const pickIdx = batchSize > 1 ? batchIndex % sorted.length : 0;
  const row = sorted[pickIdx];
  return {
    ...row,
    section_order: Array.isArray(row.section_order)
      ? row.section_order
      : JSON.parse(String(row.section_order || "[]")),
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ layoutKind: 'sidebar'|'header', seed: string, batchIndex?: number, batchSize?: number, onLog?: (msg: string) => void }} opts
 */
export async function pickHomePageFramework(supabase, opts) {
  const fw = await pickPageFramework(supabase, {
    ...opts,
    pageKind: "home",
    seed: `${opts.seed}|home`,
  });
  return {
    id: fw.id,
    order: [...(fw.section_order || [])],
    label: fw.label,
    meta: fw.meta_json,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ expectedFiles: string[], layoutKind: 'sidebar'|'header', structureSeed: string, batchIndex?: number, batchSize?: number, onLog?: (msg: string) => void }} opts
 */
export async function buildPageFrameworksPlan(supabase, opts) {
  const files = (Array.isArray(opts.expectedFiles) ? opts.expectedFiles : []).filter(
    (f) => String(f).toLowerCase() !== "index.php"
  );
  const layoutKind = opts.layoutKind === "header" ? "header" : "sidebar";
  const structureSeed = String(opts.structureSeed || "inner");
  const batchIndex = Math.max(0, Math.trunc(Number(opts.batchIndex) || 0));
  const batchSize = Math.max(1, Math.trunc(Number(opts.batchSize) || 1));

  const plan = [];
  for (const file of files) {
    const pageKind = fileToPageKind(file);
    const fw = await pickPageFramework(supabase, {
      layoutKind,
      pageKind,
      seed: `${structureSeed}|${file}`,
      batchIndex,
      batchSize,
      onLog: opts.onLog,
    });
    plan.push({
      file,
      pageKind,
      templateId: fw.id,
      order: [...(fw.section_order || [])],
    });
  }
  return plan;
}

/**
 * @param {ReturnType<typeof buildPageFrameworksPlan> extends Promise<infer T> ? T : never} plan
 */
export function formatPageFrameworksPlanForArchitect(plan) {
  const lines = [
    "PAGE_FRAMEWORKS (фиксированы сборщиком — порядок componentIds не меняй):",
  ];
  for (const row of plan) {
    lines.push(`- ${row.file} [${row.pageKind}]: «${row.templateId}» → ${row.order.join(" → ")}`);
  }
  return lines.join("\n");
}

/**
 * @param {Array<{ file: string, order: string[] }>} plan
 */
export function innerFrameworksMapFromPlan(plan) {
  const map = new Map();
  for (const row of plan || []) {
    if (row?.file && Array.isArray(row.order)) {
      map.set(String(row.file).toLowerCase(), [...row.order]);
    }
  }
  return map;
}
