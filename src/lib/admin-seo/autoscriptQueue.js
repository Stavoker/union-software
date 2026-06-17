import { getSupabaseServerClient } from "./supabaseServer.js";
import { getQueuePositionForRow } from "./autoscriptQueueRepository.js";
import { notifyUserTelegram } from "@/lib/telegram/telegramNotify.js";

/**
 * Поставити сайт у спільну чергу auto-script-v2 (Supabase). Cron worker забирає pending FIFO.
 */
export async function enqueueAutoscriptDeploy({
  userId,
  domain,
  remotePath,
  projectName,
  host,
}) {
  const uid = String(userId || "").trim();
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const remoteDir = String(remotePath || "").trim();
  if (!uid || !normalizedDomain || !remoteDir) {
    return { ok: false, skipped: true, reason: "missing_fields" };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("autoscript_deploy_queue")
    .insert({
      user_id: uid,
      domain: normalizedDomain,
      remote_path: remoteDir,
      project_name: String(projectName || "").trim() || null,
      host_id: host?.id ? String(host.id) : null,
      ssh_host: String(host?.hostIp || "").trim() || null,
      ssh_port: Number(host?.sshPort || 22) || 22,
      ssh_user: String(host?.sshUser || "").trim() || null,
      status: "pending",
    })
    .select("id,created_at")
    .single();

  if (error) {
    return { ok: false, skipped: false, reason: error.message };
  }

  let position = null;
  let totalPending = 0;
  try {
    const pos = await getQueuePositionForRow(data?.id, data?.created_at);
    position = pos.position;
    totalPending = pos.totalPending;
  } catch {
    /* optional */
  }

  try {
    await notifyUserTelegram(uid, "seo_verify_queued", {
      domain: normalizedDomain,
      project: String(projectName || "").trim() || normalizedDomain,
      position,
      totalPending,
    });
  } catch {
    /* optional telegram */
  }

  return {
    ok: true,
    skipped: false,
    queueId: data?.id || null,
    position,
    totalPending,
  };
}
