import {
  buildPageFrameworksCatalog,
  fallbackPageFramework,
  fileToPageKind,
  orderKeyForFramework,
} from "./react-page-frameworks-catalog.js";

export {
  buildPageFrameworksCatalog,
  fallbackPageFramework,
  fileToPageKind,
  PAGE_FRAMEWORK_KINDS,
  orderKeyForFramework,
  invalidatePageFrameworksCatalogCache,
} from "./react-page-frameworks-catalog.js";

const EXPECTED_CATALOG_SIZE = 14 * 2 * 100;
const HISTORY_LIMIT = 200;
const RECENT_ORDER_PENALTY = 60;
const EXCLUDE_ID_PENALTY = 1000;

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

function hashPick(seed, id) {
  let state = 0;
  const s = `${seed}|${id}`;
  for (let i = 0; i < s.length; i++) {
    state = (state * 31 + s.charCodeAt(i)) >>> 0;
  }
  return state;
}

/**
 * Load per-user framework usage from generator_token_usage (recent generations).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ userId?: string, layoutKind: string, pageKind: string }} opts
 */
export async function loadPageFrameworkUsageContext(supabase, opts) {
  const layoutKind = opts.layoutKind === "header" ? "header" : "sidebar";
  const pageKind = String(opts.pageKind || "inner").trim() || "inner";
  const userId = String(opts.userId || "").trim();
  const counts = new Map();
  const recentOrderKeys = [];

  if (!supabase || !userId) {
    return { counts, recentOrderKeys, layoutKind, pageKind };
  }

  try {
    const { data, error } = await supabase
      .from("generator_token_usage")
      .select("home_page_framework_id, page_frameworks_json, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) return { counts, recentOrderKeys, layoutKind, pageKind };

    for (const row of data || []) {
      const json = row.page_frameworks_json && typeof row.page_frameworks_json === "object"
        ? row.page_frameworks_json
        : {};

      let frameworkId = "";
      if (pageKind === "home") {
        frameworkId = String(row.home_page_framework_id || json.home || "").trim();
      } else {
        frameworkId = String(json.byPageKind?.[pageKind] || "").trim();
      }

      if (frameworkId && frameworkId.startsWith(`${layoutKind}-${pageKind}-`)) {
        counts.set(frameworkId, (counts.get(frameworkId) || 0) + 1);
      }

      const order = json.orders?.[pageKind];
      if (Array.isArray(order) && order.length) {
        recentOrderKeys.push(orderKeyForFramework(order));
      }
    }
  } catch {
    /* optional */
  }

  return {
    counts,
    recentOrderKeys: recentOrderKeys.slice(0, 20),
    layoutKind,
    pageKind,
  };
}

function normalizeFrameworkRow(row) {
  return {
    ...row,
    section_order: Array.isArray(row.section_order)
      ? row.section_order
      : JSON.parse(String(row.section_order || "[]")),
  };
}

function rankFrameworks(frameworks, ctx, opts) {
  const seed = String(opts.seed || "framework");
  const excludeIds = opts.excludeFrameworkIds instanceof Set ? opts.excludeFrameworkIds : new Set();
  const recentOrders = new Set(ctx.recentOrderKeys || []);

  return [...frameworks]
    .map((fw) => {
      const orderSig = orderKeyForFramework(
        Array.isArray(fw.section_order) ? fw.section_order : []
      );
      let score = ctx.counts.get(fw.id) || 0;
      if (recentOrders.has(orderSig)) score += RECENT_ORDER_PENALTY;
      if (excludeIds.has(fw.id)) score += EXCLUDE_ID_PENALTY;
      return { fw, score, tie: hashPick(seed, fw.id) };
    })
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.tie - b.tie));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ layoutKind: 'sidebar'|'header', pageKind: string, seed: string, userId?: string, batchIndex?: number, batchSize?: number, excludeFrameworkIds?: Set<string>, onLog?: (msg: string) => void }} opts
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

  const ctx = await loadPageFrameworkUsageContext(supabase, {
    userId: opts.userId,
    layoutKind,
    pageKind,
  });
  const ranked = rankFrameworks(frameworks, ctx, opts);
  const pickIdx = batchSize > 1 ? batchIndex % ranked.length : 0;
  const row = normalizeFrameworkRow(ranked[pickIdx].fw);

  if (ctx.counts.size || ctx.recentOrderKeys.length) {
    opts.onLog?.(
      `Framework ${pageKind}: ${row.id} (usage ${ctx.counts.get(row.id) || 0}, history ${ctx.recentOrderKeys.length})`
    );
  }

  return row;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabase
 * @param {{ layoutKind: 'sidebar'|'header', seed: string, userId?: string, batchIndex?: number, batchSize?: number, excludeFrameworkIds?: Set<string>, onLog?: (msg: string) => void }} opts
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
 * @param {{ expectedFiles: string[], layoutKind: 'sidebar'|'header', structureSeed: string, userId?: string, batchIndex?: number, batchSize?: number, onLog?: (msg: string) => void }} opts
 */
export async function buildPageFrameworksPlan(supabase, opts) {
  const files = (Array.isArray(opts.expectedFiles) ? opts.expectedFiles : []).filter(
    (f) => String(f).toLowerCase() !== "index.php"
  );
  const layoutKind = opts.layoutKind === "header" ? "header" : "sidebar";
  const structureSeed = String(opts.structureSeed || "inner");
  const batchIndex = Math.max(0, Math.trunc(Number(opts.batchIndex) || 0));
  const batchSize = Math.max(1, Math.trunc(Number(opts.batchSize) || 1));
  const excludeFrameworkIds = new Set();

  const plan = [];
  for (const file of files) {
    const pageKind = fileToPageKind(file);
    const fw = await pickPageFramework(supabase, {
      layoutKind,
      pageKind,
      seed: `${structureSeed}|${file}`,
      userId: opts.userId,
      batchIndex,
      batchSize,
      excludeFrameworkIds,
      onLog: opts.onLog,
    });
    excludeFrameworkIds.add(fw.id);
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
 * @param {{ id: string, order: string[] }} homeFramework
 * @param {Array<{ file: string, pageKind: string, templateId: string, order: string[] }>} innerPlan
 */
export function buildPageFrameworksUsagePayload(homeFramework, innerPlan) {
  /** @type {Record<string, string>} */
  const byPageKind = {};
  /** @type {Record<string, string[]>} */
  const orders = {
    home: [...(homeFramework?.order || [])],
  };

  for (const row of innerPlan || []) {
    if (!row?.pageKind) continue;
    byPageKind[row.pageKind] = row.templateId;
    orders[row.pageKind] = [...(row.order || [])];
  }

  return {
    home: homeFramework?.id || "",
    byPageKind,
    orders,
  };
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
