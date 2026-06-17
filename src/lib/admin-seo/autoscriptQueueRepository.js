import { getSupabaseServerClient } from "./supabaseServer.js";

const ACTIVE_STATUSES = ["pending", "processing"];

/**
 * Усі активні рядки глобальної черги (FIFO за created_at).
 */
export async function fetchGlobalActiveQueue() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("autoscript_deploy_queue")
    .select(
      "id,user_id,domain,project_name,status,created_at,processed_at,error_message"
    )
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

/**
 * Позиція серед pending (1 = наступний після processing).
 */
export function attachQueuePositions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pending = list.filter((r) => r.status === "pending");
  const totalPending = pending.length;
  const positionById = new Map();
  pending.forEach((row, index) => {
    positionById.set(row.id, index + 1);
  });

  return list.map((row) => ({
    ...row,
    queuePosition: row.status === "pending" ? positionById.get(row.id) ?? null : null,
    queueTotalPending: totalPending,
    queueTotalActive: list.length,
  }));
}

export async function getGlobalQueueSnapshot() {
  const rows = await fetchGlobalActiveQueue();
  const withPos = attachQueuePositions(rows);
  const pending = withPos.filter((r) => r.status === "pending");
  const processing = withPos.filter((r) => r.status === "processing");
  return {
    totalPending: pending.length,
    totalProcessing: processing.length,
    totalActive: withPos.length,
    items: withPos,
  };
}

/**
 * Черга поточного користувача + глобальна позиція кожного pending.
 */
export async function getUserAutoscriptQueue(userId) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { totalPending: 0, totalProcessing: 0, totalActive: 0, items: [] };
  }

  const global = await getGlobalQueueSnapshot();
  const mine = global.items.filter((r) => String(r.user_id || "") === uid);

  const { data: recentDone, error } = await getSupabaseServerClient()
    .from("autoscript_deploy_queue")
    .select("id,domain,project_name,status,created_at,processed_at,error_message")
    .eq("user_id", uid)
    .in("status", ["done", "failed"])
    .order("processed_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);

  return {
    totalPending: global.totalPending,
    totalProcessing: global.totalProcessing,
    totalActive: global.totalActive,
    items: mine,
    recent: Array.isArray(recentDone) ? recentDone : [],
  };
}

export async function getQueuePositionForRow(queueId, createdAt) {
  const supabase = getSupabaseServerClient();
  const qid = String(queueId || "").trim();
  const created = String(createdAt || "").trim();
  if (!qid || !created) {
    return { position: null, totalPending: 0 };
  }

  const { count: ahead, error: aheadErr } = await supabase
    .from("autoscript_deploy_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", created);

  if (aheadErr) throw new Error(aheadErr.message);

  const { count: totalPending, error: totalErr } = await supabase
    .from("autoscript_deploy_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (totalErr) throw new Error(totalErr.message);

  return {
    position: Number(ahead || 0) + 1,
    totalPending: Number(totalPending || 0),
  };
}
