import {
  computeSkeletonSimilarityPercent,
  findMaxSimilarityForRow,
  findTopSimilarPairs,
  isGeneratorSiteSkeletonsTableError,
} from "@/lib/generator-site-skeleton";
import { isGeneratorTokenUsageTableError } from "@/lib/generator-token-usage";

export const ADMIN_ANALYTICS_PAGE_SIZE = 30;

const HISTORY_STATUS_FILTERS = new Set(["all", "done", "error", "cancelled", "dry_run"]);

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function normalizeHistoryStatusFilter(raw) {
  const v = String(raw || "all").trim().toLowerCase();
  return HISTORY_STATUS_FILTERS.has(v) ? v : "all";
}

function normalizeHistorySearch(raw) {
  return String(raw || "")
    .trim()
    .replace(/[%_]/g, "")
    .slice(0, 120);
}

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
function applyTokenHistoryFilters(query, filters) {
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

function buildGlobalTokenSummary(rows) {
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
  const userIds = new Set();

  for (const r of rows || []) {
    const total = Number(r.total_tokens) || 0;
    const ts = Date.parse(r.created_at || "") || 0;
    allTime += total;
    if (ts >= dayStart) today += total;
    if (ts >= weekStart) week += total;
    if (ts >= monthStart) month += total;
    if (r.user_id) userIds.add(r.user_id);
    if (total > 0 && r.status === "done" && !r.dry_run) {
      sumForAvg += total;
      countForAvg += 1;
    }
  }

  return {
    today,
    week,
    month,
    allTime,
    averagePerGeneration: countForAvg > 0 ? Math.round(sumForAvg / countForAvg) : 0,
    generationsCount: countForAvg,
    uniqueUsers: userIds.size,
    totalJobs: (rows || []).length,
  };
}

function emptyPayload(extra = {}) {
  return {
    ok: true,
    dbReady: false,
    dbError: "",
    summary: {
      today: 0,
      week: 0,
      month: 0,
      allTime: 0,
      averagePerGeneration: 0,
      generationsCount: 0,
      uniqueUsers: 0,
      totalJobs: 0,
      skeletonCount: 0,
    },
    history: [],
    similarPairs: [],
    filters: buildHistoryFilters(),
    pagination: { page: 1, pageSize: ADMIN_ANALYTICS_PAGE_SIZE, total: 0, totalPages: 1 },
    ...extra,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ page?: number, pageSize?: number, search?: string, status?: string }} [options]
 */
export async function fetchAdminGeneratorAnalytics(supabase, options = {}) {
  const pageSize = Math.min(
    ADMIN_ANALYTICS_PAGE_SIZE,
    Math.max(1, Math.floor(Number(options.pageSize) || ADMIN_ANALYTICS_PAGE_SIZE))
  );
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const historyFilters = buildHistoryFilters(options);

  let countQuery = supabase
    .from("generator_token_usage")
    .select("id", { count: "exact", head: true });
  countQuery = applyTokenHistoryFilters(countQuery, historyFilters);

  const { count: totalCount, error: countError } = await countQuery;
  if (countError) {
    if (isGeneratorTokenUsageTableError(countError.message)) {
      return emptyPayload({ dbError: countError.message });
    }
    throw new Error(countError.message);
  }

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: allTokenRows, error: summaryError } = await supabase
    .from("generator_token_usage")
    .select("total_tokens, created_at, status, dry_run, user_id");

  if (summaryError) {
    if (isGeneratorTokenUsageTableError(summaryError.message)) {
      return emptyPayload({ dbError: summaryError.message });
    }
    throw new Error(summaryError.message);
  }

  let skeletonCount = 0;
  const { count: skCount, error: skCountError } = await supabase
    .from("generator_site_skeletons")
    .select("id", { count: "exact", head: true });
  if (!skCountError) skeletonCount = skCount ?? 0;

  let historyQuery = supabase
    .from("generator_token_usage")
    .select(
      "id, job_id, user_id, project_name, status, input_tokens, output_tokens, total_tokens, dry_run, chrome_template_id, home_page_framework_id, created_at"
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  historyQuery = applyTokenHistoryFilters(historyQuery, historyFilters);

  const { data: historyRows, error: historyError } = await historyQuery;
  if (historyError) {
    if (isGeneratorTokenUsageTableError(historyError.message)) {
      return emptyPayload({ dbError: historyError.message });
    }
    throw new Error(historyError.message);
  }

  const userIds = [...new Set((historyRows || []).map((r) => r.user_id).filter(Boolean))];
  /** @type {Map<string, { email?: string, displayName?: string }>} */
  const profileById = new Map();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds);
    for (const p of profiles || []) {
      profileById.set(p.id, {
        email: p.email || "",
        displayName: p.display_name || "",
      });
    }
  }

  const jobIds = (historyRows || []).map((r) => r.job_id).filter(Boolean);
  /** @type {Map<string, Record<string, unknown>>} */
  const skeletonByJob = new Map();
  if (jobIds.length) {
    const { data: skeletonRows, error: skError } = await supabase
      .from("generator_site_skeletons")
      .select(
        "job_id, project_name, user_id, site_layout, chrome_template_id, home_page_framework_id, page_count, skeleton_json, skeleton_fingerprint"
      )
      .in("job_id", jobIds);
    if (!skError) {
      for (const sk of skeletonRows || []) {
        skeletonByJob.set(sk.job_id, sk);
      }
    }
  }

  const { data: recentSkeletons } = await supabase
    .from("generator_site_skeletons")
    .select(
      "job_id, project_name, user_id, site_layout, chrome_template_id, home_page_framework_id, page_count, skeleton_json, skeleton_fingerprint, created_at"
    )
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(80);

  const similarPairs = findTopSimilarPairs(recentSkeletons || [], 12, 55);

  const comparePool = recentSkeletons || [];

  const history = (historyRows || []).map((r) => {
    const prof = profileById.get(r.user_id) || {};
    const sk = skeletonByJob.get(r.job_id);
    let maxSimilarity = 0;
    let similarToProject = "";
    if (sk) {
      const match = findMaxSimilarityForRow(comparePool, sk, r.job_id);
      maxSimilarity = match.percent;
      similarToProject = match.projectName;
    }
    return {
      id: r.id,
      jobId: r.job_id,
      userId: r.user_id,
      userEmail: prof.email || "—",
      userDisplayName: prof.displayName || "",
      projectName: r.project_name || "—",
      status: r.status,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      totalTokens: Number(r.total_tokens) || 0,
      dryRun: Boolean(r.dry_run),
      chromeTemplateId: r.chrome_template_id || "",
      homePageFrameworkId: r.home_page_framework_id || "",
      siteLayout: sk?.site_layout || "",
      pageCount: Number(sk?.page_count) || 0,
      skeletonFingerprint: sk?.skeleton_fingerprint || "",
      maxSimilarityPercent: maxSimilarity,
      similarToProject,
      createdAt: r.created_at,
    };
  });

  const summary = {
    ...buildGlobalTokenSummary(allTokenRows || []),
    skeletonCount,
  };

  return {
    ok: true,
    dbReady: true,
    dbError: skCountError && isGeneratorSiteSkeletonsTableError(skCountError.message)
      ? skCountError.message
      : "",
    summary,
    history,
    similarPairs: similarPairs.map((pair) => ({
      percent: pair.percent,
      projectA: pair.a.projectName,
      projectB: pair.b.projectName,
      jobIdA: pair.a.jobId,
      jobIdB: pair.b.jobId,
    })),
    filters: historyFilters,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export { computeSkeletonSimilarityPercent };
