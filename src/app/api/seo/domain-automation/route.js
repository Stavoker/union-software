import { NextResponse } from "next/server";
import {
  buildDomainAutomationCredentials,
  buildProvisioningOptions,
  loadIntegrationSettingsForUser,
  pickIntegrationConfig,
  resolveZomroApiDnsEnabled,
  resolveZomroDnsmgrEnabled,
  withUserIntegrationEnv,
} from "@/lib/account-integration-settings";
import { automateDomainProvisioning } from "@/lib/admin-seo/domainAutomation";
import { deploySslCertificateToHost } from "@/lib/admin-seo/hostNginxSslDeploy";
import { requireSeoSession } from "@/lib/admin-seo/seoApiAuth";
import { sendUserDomainTelegramEvents } from "@/lib/telegram/telegramDomainNotify";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { upsertSeoDomainForUser } from "@/lib/admin-seo/seoDomainsRepository";
import {
  appendDomainAutomationLog,
  appendDomainAutomationStep,
  completeDomainAutomationRun,
  createDomainAutomationRun,
  patchDomainAutomationRunResult,
} from "@/lib/admin-seo/domainAutomationRuns";

const STEP_TELEGRAM_EVENTS = {
  "spaceship-purchase": "domain_purchased",
  "spaceship-nameservers": "domain_dns_ns",
  "zomro-dnsmgr-panel-domain": "domain_dns_ready",
};

function buildDomainStepTelegramHandler(userId) {
  return async ({ domain, step }) => {
    const uid = String(userId || "").trim();
    if (!uid || !step) return;
    if (step.id === "spaceship-ssl-letsencrypt-dns01" && step.pending) {
      const { notifyUserTelegram } = await import("@/lib/telegram/telegramNotify.js");
      await notifyUserTelegram(uid, "domain_ssl_pending", { domain }).catch(() => {});
      return;
    }
    const eventKey = STEP_TELEGRAM_EVENTS[step.id];
    if (!eventKey || !step.ok) return;
    const { notifyUserTelegram } = await import("@/lib/telegram/telegramNotify.js");
    await notifyUserTelegram(uid, eventKey, { domain }).catch(() => {});
  };
}

function buildSslRetryTelegramHandler(userId, runId = null) {
  return async ({ attempt, errorMessage, domain }) => {
    const uid = String(userId || "").trim();
    if (!uid) return;
    if (runId) {
      appendDomainAutomationLog(
        runId,
        `[${domain}] SSL retry #${attempt || 1}: ${String(errorMessage || "").slice(0, 220)}`
      );
    }
    const { notifyUserTelegram } = await import("@/lib/telegram/telegramNotify.js");
    await notifyUserTelegram(uid, "domain_ssl_retry", {
      domain,
      attempt: attempt || 1,
      reason: String(errorMessage || "").slice(0, 220),
    }).catch(() => {});
  };
}

function buildCombinedOnStepHandler(userId, runId, streamPush = null) {
  const telegramHandler = buildDomainStepTelegramHandler(userId);
  return async (payload) => {
    if (runId) {
      appendDomainAutomationStep(runId, payload);
    }
    if (typeof streamPush === "function") {
      streamPush({ type: "step", ...payload });
    }
    await telegramHandler(payload);
  };
}

function wantsNdjsonStream(request, body) {
  if (body?.stream === false) return false;
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  return accept.includes("application/x-ndjson") || body?.stream === true;
}

function createNdjsonStreamWriter() {
  const encoder = new TextEncoder();
  let controller = null;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  const push = (obj) => {
    if (!controller) return;
    controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
  };
  const close = () => {
    if (controller) {
      controller.close();
      controller = null;
    }
  };
  return { stream, push, close };
}

async function registerDomainInSeoDashboard(userId, domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) {
    return;
  }
  try {
    // Domain purchase only — not a site deploy; SEO/auto-script runs after host upload.
    await upsertSeoDomainForUser(userId, d, { setDeployedAt: false });
  } catch (e) {
    console.warn(`[domain-automation] seo_domains upsert failed for ${d}:`, e?.message || e);
  }
}

function buildRequestSummary(body, userEnv = {}) {
  const { pick, envBool } = pickIntegrationConfig(body, userEnv);
  const ns = body?.nameservers;
  const nsStr = typeof ns === "string" ? ns : Array.isArray(ns) ? ns.join(", ") : "";
  const zomroDnsmgrEmail =
    String(body?.zomroDnsmgrDomainEmail || pick("ZOMRO_DNSMGR_DOMAIN_EMAIL", ["zomroDnsmgrDomainEmail"])).trim() ||
    null;
  return {
    domainLabel: body?.domainLabel ?? null,
    zone: body?.zone ?? null,
    skipPurchase: !!body?.skipPurchase,
    years: body?.years ?? null,
    nameservers: nsStr ? nsStr.slice(0, 500) : null,
    hostRecordName: body?.hostRecordName ?? null,
    hostIpFromRequest: body?.hostIp || null,
    hostId: body?.hostId || null,
    zomroZoneFunc: body?.zomroZoneFunc ?? null,
    zomroRecordFunc: body?.zomroRecordFunc ?? null,
    zomroVpsEnabled: !!body?.zomroVpsEnabled,
    zomroDnsmgrEnabled: resolveZomroDnsmgrEnabled(body, userEnv),
    zomroApiDnsEnabled: resolveZomroApiDnsEnabled(body, userEnv),
    zomroDnsmgrUrlConfigured: !!pick("ZOMRO_DNSMGR_URL"),
    zomroDnsmgrEmailConfigured: !!zomroDnsmgrEmail,
    zomroDnsmgrTxtFuncsConfigured:
      !!pick("ZOMRO_DNSMGR_TXT_CREATE_FUNC", ["zomroDnsmgrTxtCreateFunc"]) ||
      !!pick("ZOMRO_DNSMGR_TXT_DELETE_FUNC", ["zomroDnsmgrTxtDeleteFunc"]),
    sslLetsEncryptEmailConfigured: !!pick("SSL_LETSENCRYPT_EMAIL", ["sslLetsEncryptEmail"]),
    sslStagingEnv: envBool("SSL_LETSENCRYPT_STAGING"),
    hostSslDeployEnabled: envBool("SUBDOMAIN_HOST_SSL_DEPLOY"),
  };
}

function parseBatchDomains(body) {
  if (Array.isArray(body?.domains)) {
    return body.domains
      .map((item) => ({
        domainLabel: String(item?.domainLabel || item?.label || "").trim(),
        zone: String(item?.zone || "").trim(),
      }))
      .filter((d) => d.domainLabel && d.zone);
  }
  if (Array.isArray(body?.domainLabels)) {
    const zone = String(body?.zone || "").trim();
    return body.domainLabels
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .map((domainLabel) => ({ domainLabel, zone }));
  }
  if (typeof body?.domainLabels === "string") {
    const zone = String(body?.zone || "").trim();
    return body.domainLabels
      .split(/[\n,;\s]+/)
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .map((domainLabel) => ({ domainLabel, zone }));
  }
  const single = String(body?.domainLabel || "").trim();
  const zone = String(body?.zone || "").trim();
  return single && zone ? [{ domainLabel: single, zone }] : [];
}

async function resolveDeployTarget(body, creds, userId) {
  const selectedHostId = String(body?.hostId || "").trim();
  if (selectedHostId) {
    const host = await getHostById(selectedHostId, userId);
    if (!host) {
      throw new Error("Selected host not found or inactive");
    }
    if (!host.hostIp || !host.sshUser || !host.sshPassword) {
      throw new Error("Selected host has incomplete SSH credentials (ip/user/password)");
    }
    return {
      hostId: host.id,
      hostName: host.name || null,
      hostIp: host.hostIp,
      deployHostIp: host.hostIp,
      deploySshUser: host.sshUser,
      deploySshPassword: host.sshPassword,
      deploySshPort: host.sshPort || 22,
      projectsDir: host.projectsDir || creds?.projectsDirFallback || null,
    };
  }
  const fallbackIp = creds?.hostIpFallback || "";
  return {
    hostId: null,
    hostName: null,
    hostIp: String(body?.hostIp || fallbackIp).trim(),
    deployHostIp: String(body?.deployHostIp || body?.hostIp || fallbackIp).trim(),
    deploySshUser: creds?.deploySshUser || "",
    deploySshPassword: creds?.deploySshPassword || "",
    deploySshPort: creds?.deploySshPort || 22,
    projectsDir: creds?.projectsDirFallback || null,
  };
}

/** Після фонового SSL — PEM у /var/www/<domain>/ssl/ + nginx vhost (single і batch). */
function scheduleSslAsyncHostDeploy({
  sslTask,
  result,
  deployTarget,
  creds,
  userId,
  userEnv,
  requestSummary,
  runId = null,
}) {
  const sslDomain = result?.domain || requestSummary?.domainLabel || "domain";
  console.info(`[domain-automation] SSL background task scheduled for ${sslDomain}`);
  if (runId) {
    appendDomainAutomationLog(runId, `[${sslDomain}] SSL background job scheduled`);
    patchDomainAutomationRunResult(runId, result);
  }
  sslTask
    .then(async (sslResult) =>
      withUserIntegrationEnv(userEnv, async () => {
        console.info(`[domain-automation] SSL background task completed for ${sslDomain}`);
        if (runId) {
          appendDomainAutomationLog(runId, `[${sslDomain}] SSL certificate received`);
        }
        const steps = Array.isArray(result.steps) ? [...result.steps] : [];
        const idx = steps.findIndex((s) => s?.id === "spaceship-ssl-letsencrypt-dns01");
        const prevSsl = idx >= 0 ? steps[idx] : null;
        const certPem = sslResult?.certificatePem && String(sslResult.certificatePem).trim();
        const sslStep = {
          id: "spaceship-ssl-letsencrypt-dns01",
          ok: !!certPem,
          pending: false,
          provider: prevSsl?.provider || "spaceship",
          staging: !!sslResult?.staging,
          challengeRecords: sslResult?.challengeRecords || [],
          certificatePem: sslResult?.certificatePem || "",
          privateKeyPem: sslResult?.privateKeyPem || "",
        };
        if (idx >= 0) {
          steps[idx] = sslStep;
        } else {
          steps.push(sslStep);
        }
        if (certPem) {
          try {
            const deploy = await deploySslCertificateToHost({
              domain: result.domain,
              certificatePem: sslResult.certificatePem,
              privateKeyPem: sslResult.privateKeyPem,
              deployHostIp: deployTarget.deployHostIp || result?.hostIp || creds.hostIpFallback,
              sshUser: deployTarget.deploySshUser,
              sshPassword: deployTarget.deploySshPassword,
              sshPort: deployTarget.deploySshPort,
              projectsBaseDir:
                deployTarget.projectsDir || creds.projectsDirFallback || "/var/www",
            });
            steps.push({
              id: "host-nginx-ssl-deploy",
              ok: deploy.skipped ? true : !!deploy.ok,
              skipped: !!deploy.skipped,
              reason: deploy.reason || null,
              warning: deploy.warning || null,
              remoteProjectDir: deploy.remoteProjectDir || null,
              sslDir: deploy.sslDir || null,
              nginxConfPath: deploy.nginxConfPath || null,
              nginxLinkPath: deploy.nginxLinkPath || null,
              nginxReloaded: !!deploy.nginxReloaded,
            });
            console.info(
              `[domain-automation][${sslDomain}] host nginx/ssl deploy: ${deploy.skipped ? "skipped" : deploy.ok ? "ok" : "failed"}${deploy.sslDir ? ` → ${deploy.sslDir}` : ""}`
            );
          } catch (e) {
            steps.push({
              id: "host-nginx-ssl-deploy",
              ok: false,
              warning: e?.message || String(e),
            });
            console.warn(`[domain-automation][${sslDomain}] host nginx/ssl deploy error:`, e?.message || e);
          }
        }
        const completedResult = { ...result, steps };
        if (result?.domain) {
          await registerDomainInSeoDashboard(userId, result.domain);
        }
        if (runId) {
          for (const step of steps) {
            if (step?.id) {
              appendDomainAutomationStep(runId, { domain: result.domain, step });
            }
          }
          completeDomainAutomationRun(runId, { ok: !!certPem, result: completedResult });
        }
        try {
          const tgResult = await sendUserDomainTelegramEvents({
            userId,
            ok: true,
            result: completedResult,
            requestSummary: { ...requestSummary, sslAsyncCompletion: true },
          });
          console.info(
            `[domain-automation][telegram] ssl-complete for ${sslDomain}:`,
            JSON.stringify({
              certOk: !!certPem,
              events: tgResult?.events?.length ?? 0,
              skipped: tgResult?.skipped || false,
            })
          );
        } catch (e) {
          console.error("[domain-automation][telegram] ssl-complete:", e);
        }
      })
    )
    .catch(async (e) => {
      console.error(`[domain-automation][ssl-async] worker failed for ${sslDomain}:`, e);
      if (runId) {
        appendDomainAutomationLog(runId, `[${sslDomain}] SSL background job failed: ${e?.message || e}`);
        completeDomainAutomationRun(runId, { ok: false, result, error: e });
      }
      try {
        await sendUserDomainTelegramEvents({
          userId,
          ok: false,
          result,
          error: e,
          requestSummary: { ...requestSummary, sslAsyncCompletion: true },
        });
      } catch (tgErr) {
        console.error("[domain-automation][telegram] ssl-fail:", tgErr);
      }
    });
}

export async function POST(request) {
  const session = await requireSeoSession();
  if (session.errorResponse) {
    return session.errorResponse;
  }

  let userEnv = {};
  try {
    userEnv = await loadIntegrationSettingsForUser(session.supabase, session.userId);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load integration settings",
        details: error.message,
      },
      { status: 500 }
    );
  }

  return withUserIntegrationEnv(userEnv, async () => {
  const body = await request.json().catch(() => ({}));
  const creds = buildDomainAutomationCredentials(body, userEnv);
  const domainEntries = parseBatchDomains(body);
  if (!domainEntries.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Domain automation failed",
        details: "Provide domain+zone via domainLabel/zone, domainLabels+zone or domains[] (up to 60).",
      },
      { status: 400 }
    );
  }
  if (domainEntries.length > 60) {
    return NextResponse.json(
      {
        ok: false,
        error: "Domain automation failed",
        details: "Maximum 60 domains per batch request.",
      },
      { status: 400 }
    );
  }
  if (!body?.domainLabel) {
    body.domainLabel = domainEntries[0].domainLabel;
  }
  if (!body?.zone) {
    body.zone = domainEntries[0].zone;
  }
  const requestSummary = buildRequestSummary(body, userEnv);

  if (domainEntries.length > 1) {
    const startedAt = Date.now();
    const results = [];
    const failures = [];
    const sslFollowUps = [];
    for (let i = 0; i < domainEntries.length; i += 1) {
      const entry = domainEntries[i];
      const oneBody = { ...body, domainLabel: entry.domainLabel, zone: entry.zone };
      const deployTarget = await resolveDeployTarget(oneBody, creds, session.userId);
      oneBody.hostIp = oneBody.hostIp || deployTarget.hostIp;
      const oneRequestSummary = buildRequestSummary(oneBody, userEnv);
      try {
        const oneResult = await automateDomainProvisioning(
          buildProvisioningOptions(oneBody, deployTarget, creds, userEnv, {
            sslAsync: (oneBody?.sslAsync ?? body?.sslAsync) !== false,
            onStep: buildDomainStepTelegramHandler(session.userId),
            onSslRetry: buildSslRetryTelegramHandler(session.userId),
          })
        );
        const sslTask = oneResult?.__sslAsyncTask;
        if (sslTask) {
          delete oneResult.__sslAsyncTask;
          sslFollowUps.push({
            sslTask,
            result: oneResult,
            deployTarget,
            oneRequestSummary,
          });
        }
        void sendUserDomainTelegramEvents({
          userId: session.userId,
          ok: true,
          result: oneResult,
          requestSummary: oneRequestSummary,
        }).catch(() => {});
        if (oneResult?.domain) {
          await registerDomainInSeoDashboard(session.userId, oneResult.domain);
        }
        results.push({
          index: i + 1,
          domainLabel: entry.domainLabel,
          zone: entry.zone,
          domain: oneResult?.domain || null,
          ok: true,
          result: oneResult,
        });
      } catch (error) {
        const partialResult = error?.partialResult || null;
        void sendUserDomainTelegramEvents({
          userId: session.userId,
          ok: false,
          result: partialResult,
          error,
          requestSummary: oneRequestSummary,
        }).catch(() => {});
        failures.push({
          index: i + 1,
          domainLabel: entry.domainLabel,
          zone: entry.zone,
          ok: false,
          details: error?.message || "Unknown error",
          partialResult,
        });
      }
    }
    for (const follow of sslFollowUps) {
      scheduleSslAsyncHostDeploy({
        sslTask: follow.sslTask,
        result: follow.result,
        deployTarget: follow.deployTarget,
        creds,
        userId: session.userId,
        userEnv,
        requestSummary: follow.oneRequestSummary,
      });
    }
    return NextResponse.json({
      ok: failures.length === 0,
      partial: failures.length > 0,
      mode: "batch",
      total: domainEntries.length,
      okCount: results.length,
      failCount: failures.length,
      elapsedMs: Date.now() - startedAt,
      results,
      failures,
    });
  }

  const useStream = wantsNdjsonStream(request, body);
  const run = createDomainAutomationRun({
    userId: session.userId,
    domains: domainEntries,
  });
  appendDomainAutomationLog(run.id, "Domain automation started", requestSummary);

  async function executeSingleDomainAutomation(streamPush = null) {
    try {
      const deployTarget = await resolveDeployTarget(body, creds, session.userId);
      body.hostIp = body.hostIp || deployTarget.hostIp;
      const result = await automateDomainProvisioning(
        buildProvisioningOptions(body, deployTarget, creds, userEnv, {
          sslAsync: body?.sslAsync ?? true,
          onStep: buildCombinedOnStepHandler(session.userId, run.id, streamPush),
          onSslRetry: buildSslRetryTelegramHandler(session.userId, run.id),
        })
      );
      const sslTask = result?.__sslAsyncTask || null;
      if (sslTask) {
        delete result.__sslAsyncTask;
      }

      if (result?.domain) {
        await registerDomainInSeoDashboard(session.userId, result.domain);
      }

      void sendUserDomainTelegramEvents({
        userId: session.userId,
        ok: true,
        result,
        requestSummary,
      }).catch((e) => console.error("[domain-automation][telegram]", e));

      if (sslTask) {
        scheduleSslAsyncHostDeploy({
          sslTask,
          result,
          deployTarget,
          creds,
          userId: session.userId,
          userEnv,
          requestSummary,
          runId: run.id,
        });
        patchDomainAutomationRunResult(run.id, result);
      } else {
        completeDomainAutomationRun(run.id, { ok: true, result });
      }

      return { ok: true, runId: run.id, ...result };
    } catch (error) {
      const partialResult = error?.partialResult || null;
      completeDomainAutomationRun(run.id, { ok: false, result: partialResult, error });
      void sendUserDomainTelegramEvents({
        userId: session.userId,
        ok: false,
        result: partialResult,
        error,
        requestSummary,
      }).catch((e) => console.error("[domain-automation][telegram] failure:", e));
      const errPayload = {
        ok: false,
        runId: run.id,
        error: "Domain automation failed",
        details: error?.message || "Unknown error",
        partialResult,
      };
      const wrapped = new Error(errPayload.details);
      wrapped.payload = errPayload;
      throw wrapped;
    }
  }

  if (useStream) {
    const ndjson = createNdjsonStreamWriter();
    ndjson.push({ type: "started", runId: run.id, requestSummary });

    void (async () => {
      try {
        const payload = await executeSingleDomainAutomation(ndjson.push);
        ndjson.push({ type: "done", ...payload });
      } catch (error) {
        ndjson.push({ type: "error", ...(error?.payload || { details: error?.message || "Unknown error" }) });
      } finally {
        ndjson.close();
      }
    })();

    return new Response(ndjson.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Domain-Automation-Run-Id": run.id,
      },
    });
  }

  try {
    const payload = await executeSingleDomainAutomation();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(error?.payload || { ok: false, error: error?.message }, { status: 500 });
  }
  });
}
