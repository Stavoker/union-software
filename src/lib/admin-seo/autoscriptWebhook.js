import { loadIntegrationSettingsForUser } from "@/lib/account-integration-settings";
import { getSupabaseServerClient } from "./supabaseServer.js";

/**
 * Після деплою на хост — POST у auto-script-v2 webhook (верифікація Yandex/Google).
 * Помилка webhook не ламає деплой.
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

  let webhookUrl = String(process.env.AUTOSCRIPT_WEBHOOK_URL || "").trim();
  let webhookSecret = String(process.env.AUTOSCRIPT_WEBHOOK_SECRET || "").trim();

  try {
    const supabase = getSupabaseServerClient();
    const userEnv = await loadIntegrationSettingsForUser(supabase, uid);
    webhookUrl = String(userEnv.AUTOSCRIPT_WEBHOOK_URL || webhookUrl).trim();
    webhookSecret = String(userEnv.AUTOSCRIPT_WEBHOOK_SECRET || webhookSecret).trim();
  } catch {
    /* per-account settings optional */
  }

  if (!webhookUrl) {
    return { ok: false, skipped: true, reason: "no_webhook_url" };
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
        ok: false,
        skipped: false,
        status: res.status,
        reason: text.slice(0, 200) || `http_${res.status}`,
      };
    }
    return { ok: true, skipped: false };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reason: e?.message || String(e),
    };
  }
}
