import { loadIntegrationSettingsForUser } from "@/lib/account-integration-settings";
import { enqueueAutoscriptDeploy } from "./autoscriptQueue.js";

/**
 * Після деплою на хост — черга Supabase для auto-script-v2 Cron.
 * Опційно: миттєвий POST на webhook, якщо AUTOSCRIPT_WEBHOOK_URL заданий.
 */
export async function notifyAutoscriptAfterDeploy({
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

  const queued = await enqueueAutoscriptDeploy({
    userId: uid,
    domain: normalizedDomain,
    remotePath: remoteDir,
    projectName,
    host,
  });

  if (!queued.ok && !queued.skipped) {
    return queued;
  }

  let webhookUrl = String(process.env.AUTOSCRIPT_WEBHOOK_URL || "").trim();
  let webhookSecret = String(process.env.AUTOSCRIPT_WEBHOOK_SECRET || "").trim();

  try {
    const { getSupabaseServerClient } = await import("./supabaseServer.js");
    const supabase = getSupabaseServerClient();
    const userEnv = await loadIntegrationSettingsForUser(supabase, uid);
    webhookUrl = String(userEnv.AUTOSCRIPT_WEBHOOK_URL || webhookUrl).trim();
    webhookSecret = String(userEnv.AUTOSCRIPT_WEBHOOK_SECRET || webhookSecret).trim();
  } catch {
    /* per-account settings optional */
  }

  if (!webhookUrl) {
    return {
      ok: Boolean(queued.ok),
      skipped: false,
      mode: "queue",
      queueId: queued.queueId || null,
    };
  }

  const body = {
    domain: normalizedDomain,
    remotePath: remoteDir,
    projectName: String(projectName || "").trim(),
    userId: uid,
    hostId: host?.id ? String(host.id) : "",
    sshHost: String(host?.hostIp || "").trim(),
    sshPort: Number(host?.sshPort || 22) || 22,
    sshUser: String(host?.sshUser || "").trim(),
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (webhookSecret) {
    headers["X-Autoscript-Secret"] = webhookSecret;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: Boolean(queued.ok),
        skipped: false,
        mode: "queue+webhook_failed",
        queueId: queued.queueId || null,
        status: res.status,
        reason: text.slice(0, 200) || `http_${res.status}`,
      };
    }
    return {
      ok: true,
      skipped: false,
      mode: "queue+webhook",
      queueId: queued.queueId || null,
    };
  } catch (e) {
    return {
      ok: Boolean(queued.ok),
      skipped: false,
      mode: "queue+webhook_error",
      queueId: queued.queueId || null,
      reason: e?.message || String(e),
    };
  }
}
