import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer";

const TOKENS_LINE_RE =
  /TOKENS Claude \(запрос\): input≈(\d+|\?), output≈(\d+|\?)/;

export function isGeneratorTokenUsageTableError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("generator_token_usage") &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("relation"))
  );
}

/**
 * @param {string[]} logs
 */
export function parseTokenTotalsFromLogs(logs) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const line of logs || []) {
    const m = String(line || "").match(TOKENS_LINE_RE);
    if (!m) continue;
    if (m[1] !== "?") inputTokens += Number.parseInt(m[1], 10) || 0;
    if (m[2] !== "?") outputTokens += Number.parseInt(m[2], 10) || 0;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

/**
 * @param {import('@/lib/generator-engine/build-jobs').BuildJob | { id: string, status?: string, logs?: string[], payload?: Record<string, unknown> } | null} job
 */
export async function recordGeneratorTokenUsageFromJob(job) {
  const userId = String(job?.payload?.userId || "").trim();
  if (!userId || !job?.id) return { ok: false, skipped: true, reason: "no_user" };

  const { inputTokens, outputTokens, totalTokens } = parseTokenTotalsFromLogs(job.logs);
  const dryRun = Boolean(job?.payload?.dryRun);
  const status = String(job?.status || "done");
  const projectName = String(job?.payload?.projectName || "").trim();

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return { ok: false, skipped: true, reason: "supabase_unavailable" };
  }

  const chromeTemplateId = String(
    job?.result?.chromeTemplateId || job?.payload?.chromeTemplateId || ""
  ).trim();

  const row = {
    user_id: userId,
    job_id: job.id,
    project_name: projectName,
    status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    dry_run: dryRun,
    chrome_template_id: chromeTemplateId || null,
  };

  const { error } = await supabase.from("generator_token_usage").upsert(row, {
    onConflict: "job_id",
  });

  if (error) {
    if (isGeneratorTokenUsageTableError(error.message)) {
      return { ok: false, skipped: true, reason: "table_missing" };
    }
    console.error("[generator-token-usage] record failed:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, totalTokens };
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export const USAGE_HISTORY_PAGE_SIZE = 30;

const HISTORY_STATUS_FILTERS = new Set(["all", "done", "error", "cancelled", "dry_run"]);

/**
 * @param {string} raw
 */
function normalizeHistoryStatusFilter(raw) {
  const v = String(raw || "all")
    .trim()
    .toLowerCase();
  return HISTORY_STATUS_FILTERS.has(v) ? v : "all";
}

/**
 * @param {string} raw
 */
function normalizeHistorySearch(raw) {
  return String(raw || "")
    .trim()
    .replace(/[%_]/g, "")
    .slice(0, 120);
}

/**
 * @param {{ search?: string, status?: string }} raw
 */
function buildHistoryFilters(raw = {}) {
  return {
    search: normalizeHistorySearch(raw.search),
    status: normalizeHistoryStatusFilter(raw.status),
  };
}

/**
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder} query
 * @param {{ search?: string, status?: string }} filters
 */
function applyHistoryFilters(query, filters) {
  let q = query;
  const { search, status } = buildHistoryFilters(filters);

  if (search) {
    const pattern = `%${search}%`;
    q = q.or(`project_name.ilike.${pattern},job_id.ilike.${pattern}`);
  }

  if (status === "done") {
    q = q.eq("status", "done").eq("dry_run", false);
  } else if (status === "error") {
    q = q.eq("status", "error");
  } else if (status === "cancelled") {
    q = q.eq("status", "cancelled");
  } else if (status === "dry_run") {
    q = q.eq("dry_run", true);
  }

  return q;
}

function mapHistoryRow(r) {
  return {
    id: r.id,
    jobId: r.job_id,
    projectName: r.project_name || "—",
    status: r.status,
    inputTokens: Number(r.input_tokens) || 0,
    outputTokens: Number(r.output_tokens) || 0,
    totalTokens: Number(r.total_tokens) || 0,
    dryRun: Boolean(r.dry_run),
    chromeTemplateId: r.chrome_template_id || "",
    createdAt: r.created_at,
  };
}

function buildSummaryFromRows(list) {
  const now = Date.now();
  const dayStart = startOfUtcDay().getTime();
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const monthStart = startOfUtcMonth().getTime();

  let today = 0;
  let week = 0;
  let month = 0;
  let allTime = 0;
  let sumForAvg = 0;
  let countForAvg = 0;

  for (const r of list) {
    const total = Number(r.total_tokens) || 0;
    const ts = Date.parse(r.created_at || "") || 0;
    allTime += total;
    if (ts >= dayStart) today += total;
    if (ts >= weekStart) week += total;
    if (ts >= monthStart) month += total;
    if (total > 0 && r.status === "done" && !r.dry_run) {
      sumForAvg += total;
      countForAvg += 1;
    }
  }

  const averagePerGeneration =
    countForAvg > 0 ? Math.round(sumForAvg / countForAvg) : 0;

  return {
    today,
    week,
    month,
    allTime,
    averagePerGeneration,
    generationsCount: countForAvg,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ page?: number, pageSize?: number, search?: string, status?: string }} [options]
 */
export async function fetchGeneratorUsageForUser(supabase, userId, options = {}) {
  const pageSize = Math.min(
    USAGE_HISTORY_PAGE_SIZE,
    Math.max(1, Math.floor(Number(options.pageSize) || USAGE_HISTORY_PAGE_SIZE))
  );
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const historyFilters = buildHistoryFilters(options);

  const tableMissingPayload = {
    ok: true,
    dbReady: false,
    dbError: "",
    summary: emptySummary(),
    history: [],
    filters: historyFilters,
    pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
  };

  let countQuery = supabase
    .from("generator_token_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  countQuery = applyHistoryFilters(countQuery, historyFilters);

  const { count: totalCount, error: countError } = await countQuery;

  if (countError) {
    if (isGeneratorTokenUsageTableError(countError.message)) {
      return { ...tableMissingPayload, dbError: countError.message };
    }
    throw new Error(countError.message);
  }

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const { data: summaryRows, error: summaryError } = await supabase
    .from("generator_token_usage")
    .select("total_tokens, created_at, status, dry_run")
    .eq("user_id", userId);

  if (summaryError) {
    if (isGeneratorTokenUsageTableError(summaryError.message)) {
      return { ...tableMissingPayload, dbError: summaryError.message };
    }
    throw new Error(summaryError.message);
  }

  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let historyQuery = supabase
    .from("generator_token_usage")
    .select(
      "id, job_id, project_name, status, input_tokens, output_tokens, total_tokens, dry_run, chrome_template_id, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  historyQuery = applyHistoryFilters(historyQuery, historyFilters);

  const { data: historyRows, error: historyError } = await historyQuery;

  if (historyError) {
    if (isGeneratorTokenUsageTableError(historyError.message)) {
      return { ...tableMissingPayload, dbError: historyError.message };
    }
    throw new Error(historyError.message);
  }

  return {
    ok: true,
    dbReady: true,
    summary: buildSummaryFromRows(summaryRows || []),
    history: (historyRows || []).map(mapHistoryRow),
    filters: historyFilters,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}

function emptySummary() {
  return {
    today: 0,
    week: 0,
    month: 0,
    allTime: 0,
    averagePerGeneration: 0,
    generationsCount: 0,
  };
}
