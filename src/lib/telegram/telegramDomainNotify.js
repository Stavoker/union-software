import { notifyUserTelegram } from "./telegramNotify.js";

function resolveDomain(result, requestSummary) {
  return (
    result?.domain ||
    (requestSummary?.domainLabel && requestSummary?.zone
      ? `${String(requestSummary.domainLabel).trim()}.${String(requestSummary.zone).trim().replace(/^\./, "")}`
      : "—")
  );
}

function findStep(steps, id) {
  return (Array.isArray(steps) ? steps : []).find((s) => s?.id === id) || null;
}

/**
 * Короткі персональні сповіщення про домен (замість довгих звітів).
 */
export async function sendUserDomainTelegramEvents({ userId, ok, result, error, requestSummary }) {
  const uid = String(userId || "").trim();
  if (!uid) return { skipped: true, reason: "no_user_id" };

  const domain = resolveDomain(result, requestSummary);
  const isSslCompletion = !!requestSummary?.sslAsyncCompletion;
  const steps = result?.steps || [];
  const sslStep = findStep(steps, "spaceship-ssl-letsencrypt-dns01");
  const hostStep = findStep(steps, "host-nginx-ssl-deploy");
  const hostDirStep = findStep(steps, "host-project-dir-create");

  const out = [];

  if (isSslCompletion) {
    const certOk = !!(
      sslStep?.ok ||
      (sslStep?.certificatePem && String(sslStep.certificatePem).trim())
    );
    out.push(
      await notifyUserTelegram(
        uid,
        certOk ? "domain_ssl_ok" : "domain_ssl_fail",
        {
          domain,
          reason: sslStep?.warning || error?.message || "SSL",
        }
      )
    );
    if (hostStep && !hostStep.skipped && hostStep.ok) {
      out.push(
        await notifyUserTelegram(uid, "domain_host_ok", {
          domain,
          dir: hostStep.remoteProjectDir || hostStep.sslDir || "",
        })
      );
    }
    out.push(
      await notifyUserTelegram(uid, "domain_done", {
        domain,
        ip: result?.hostIp || "",
      })
    );
    return { events: out };
  }

  if (!ok) {
    out.push(
      await notifyUserTelegram(uid, "domain_error", {
        domain,
        error: String(error?.message || error || "failed").slice(0, 300),
      })
    );
    return { events: out };
  }

  out.push(
    await notifyUserTelegram(uid, "domain_started", {
      domain,
      skipPurchase: !!requestSummary?.skipPurchase,
    })
  );

  const sslPending = !!sslStep?.pending;
  if (!sslPending) {
    if (sslStep && sslStep.ok) {
      out.push(await notifyUserTelegram(uid, "domain_ssl_ok", { domain }));
    } else if (sslStep && !sslStep.ok) {
      out.push(
        await notifyUserTelegram(uid, "domain_ssl_fail", {
          domain,
          reason: sslStep?.warning || "SSL",
        })
      );
    }

    if (hostDirStep?.ok) {
      out.push(
        await notifyUserTelegram(uid, "domain_host_ok", {
          domain,
          dir: hostDirStep.remoteProjectDir || "",
        })
      );
    } else if (hostStep && !hostStep.skipped && hostStep.ok) {
      out.push(
        await notifyUserTelegram(uid, "domain_host_ok", {
          domain,
          dir: hostStep.sslDir || "",
        })
      );
    }

    out.push(
      await notifyUserTelegram(uid, "domain_done", {
        domain,
        ip: result?.hostIp || "",
      })
    );
  }

  return { events: out };
}
