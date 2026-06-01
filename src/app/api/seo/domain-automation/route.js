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
import { sendSslProgressTelegramUpdate } from "@/lib/admin-seo/telegramDomainAutomation";
import { sendUserDomainTelegramEvents } from "@/lib/telegram/telegramDomainNotify";
import { getHostById } from "@/lib/admin-seo/hostsRepository";
import { upsertSeoDomainForUser } from "@/lib/admin-seo/seoDomainsRepository";

async function registerDomainInSeoDashboard(userId, domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) {
    return;
  }
  try {
    await upsertSeoDomainForUser(userId, d);
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
            onSslRetry: async ({ attempt, errorMessage, nextRetryMs, domain }) => {
              const raw = Number(process.env.SSL_ASYNC_PROGRESS_EVERY_ATTEMPTS);
              const notifyEvery = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
              const shouldNotify = attempt === 1 || attempt % notifyEvery === 0;
              if (shouldNotify) {
                await sendSslProgressTelegramUpdate({ domain, attempt, errorMessage, nextRetryMs }).catch(() => {});
              }
            },
          })
        );
        if (oneResult?.__sslAsyncTask) {
          delete oneResult.__sslAsyncTask;
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

  try {
    const deployTarget = await resolveDeployTarget(body, creds, session.userId);
    body.hostIp = body.hostIp || deployTarget.hostIp;
    const result = await automateDomainProvisioning(
      buildProvisioningOptions(body, deployTarget, creds, userEnv, {
        sslAsync: body?.sslAsync ?? true,
        onSslRetry: async ({ attempt, errorMessage, nextRetryMs, domain }) => {
          const raw = Number(process.env.SSL_ASYNC_PROGRESS_EVERY_ATTEMPTS);
          const notifyEvery = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
          const shouldNotify = attempt === 1 || attempt % notifyEvery === 0;
          if (shouldNotify) {
            await sendSslProgressTelegramUpdate({ domain, attempt, errorMessage, nextRetryMs }).catch(() => {});
          }
        },
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
      const sslDomain = result?.domain || requestSummary?.domainLabel || "domain";
      console.info(`[domain-automation] SSL background task scheduled for ${sslDomain}`);
      sslTask
        .then(async (sslResult) =>
          withUserIntegrationEnv(userEnv, async () => {
          console.info(`[domain-automation] SSL background task completed for ${sslDomain}`);
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
                  deployTarget.projectsDir ||
                  creds.projectsDirFallback ||
                  "/var/www",
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
                `[domain-automation] host nginx/ssl deploy: ${deploy.skipped ? "skipped" : deploy.ok ? "ok" : "failed"}`
              );
            } catch (e) {
              steps.push({
                id: "host-nginx-ssl-deploy",
                ok: false,
                warning: e?.message || String(e),
              });
              console.warn(`[domain-automation] host nginx/ssl deploy error:`, e?.message || e);
            }
          }
          const completedResult = { ...result, steps };
          if (result?.domain) {
            await registerDomainInSeoDashboard(session.userId, result.domain);
          }
          void sendUserDomainTelegramEvents({
            userId: session.userId,
            ok: true,
            result: completedResult,
            requestSummary: { ...requestSummary, sslAsyncCompletion: true },
          }).catch((e) => console.error("[domain-automation][telegram] ssl-complete:", e));
          })
        )
        .catch((e) => console.error("[domain-automation][ssl-async] worker failed:", e));
    }

    return NextResponse.json(result);
  } catch (error) {
    const partialResult = error?.partialResult || null;
    void sendUserDomainTelegramEvents({
      userId: session.userId,
      ok: false,
      result: partialResult,
      error,
      requestSummary,
    }).catch((e) => console.error("[domain-automation][telegram] failure:", e));

    return NextResponse.json(
      {
        ok: false,
        error: "Domain automation failed",
        details: error?.message || "Unknown error",
        partialResult,
      },
      { status: 500 }
    );
  }
  });
}
