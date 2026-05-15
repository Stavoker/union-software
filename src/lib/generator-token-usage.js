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

  const row = {
    user_id: userId,
    job_id: job.id,
    project_name: projectName,
    status,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    dry_run: dryRun,
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function fetchGeneratorUsageForUser(supabase, userId) {
  const { data: rows, error } = await supabase
    .from("generator_token_usage")
    .select(
      "id, job_id, project_name, status, input_tokens, output_tokens, total_tokens, dry_run, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isGeneratorTokenUsageTableError(error.message)) {
      return {
        ok: true,
        dbReady: false,
        dbError: error.message,
        summary: emptySummary(),
        history: [],
      };
    }
    throw new Error(error.message);
  }

  const list = rows || [];
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
    ok: true,
    dbReady: true,
    summary: {
      today,
      week,
      month,
      allTime,
      averagePerGeneration,
      generationsCount: list.length,
    },
    history: list.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      projectName: r.project_name || "—",
      status: r.status,
      inputTokens: Number(r.input_tokens) || 0,
      outputTokens: Number(r.output_tokens) || 0,
      totalTokens: Number(r.total_tokens) || 0,
      dryRun: Boolean(r.dry_run),
      createdAt: r.created_at,
    })),
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
