import SftpClient from "ssh2-sftp-client";

import { getProjectPath } from "@/src/lib/project-paths";
import { ensurePhpStackOnHost } from "./hostPhpStack.js";
import {
  fixDeployedSitePermissions,
  sslPemPresentOnHost,
  syncNginxVhostForDomain,
} from "./hostNginxSslDeploy.js";
import { notifyAutoscriptAfterDeploy } from "./autoscriptWebhook.js";
import { listRemoteProjectHostsOnServer, upsertSeoDomainForUser } from "./seoDomainsRepository.js";

/** Дозволені всередині порожньої папки домену (лише SSL / ACME). */
const EMPTY_FOLDER_ALLOWED_DIRS = new Set(["ssl", ".well-known"]);

function normalizeBaseDir(value) {
  const s = String(value || "/var/www").trim().replace(/\/+$/, "");
  return s || "/var/www";
}

function domainRemotePath(projectsBaseDir, domain) {
  const base = normalizeBaseDir(projectsBaseDir);
  const host = String(domain || "").trim().toLowerCase();
  return `${base}/${host}`;
}

/**
 * Папка домену «вільна» для деплою: порожня або лише ssl / .well-known.
 */
export function isDomainFolderAvailable(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return true;
  }
  for (const item of entries) {
    const name = String(item?.name || "").trim();
    if (!name || name === "." || name === "..") {
      continue;
    }
    const lower = name.toLowerCase();
    if (item.type === "d" && EMPTY_FOLDER_ALLOWED_DIRS.has(lower)) {
      continue;
    }
    return false;
  }
  return true;
}

async function withSftp(host, fn) {
  const sshHost = String(host?.hostIp || "").trim();
  const sshUser = String(host?.sshUser || "").trim();
  const sshPassword = String(host?.sshPassword || "");
  const sshPort = Number.isFinite(Number(host?.sshPort)) && Number(host.sshPort) > 0 ? Number(host.sshPort) : 22;

  if (!sshHost || !sshUser || !sshPassword) {
    throw new Error("SSH credentials incomplete for host");
  }

  const client = new SftpClient();
  try {
    await client.connect({
      host: sshHost,
      port: sshPort,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 25000,
    });
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Сканує projects_dir: які FQDN-папки вільні (без сайту, окрім ssl).
 */
export async function listDomainFolderAvailabilityOnHost(host) {
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const listed = await listRemoteProjectHostsOnServer({
    sshHost: host?.hostIp,
    sshUser: host?.sshUser,
    sshPassword: host?.sshPassword,
    sshPort: host?.sshPort,
    projectsBaseDir,
  });

  if (listed.warning && !listed.hosts.length) {
    return {
      available: [],
      occupied: [],
      projectsBaseDir: listed.projectsBaseDir,
      warning: listed.warning,
    };
  }

  const available = [];
  const occupied = [];

  await withSftp(host, async (sftp) => {
    for (const domain of listed.hosts) {
      const remotePath = domainRemotePath(projectsBaseDir, domain);
      const exists = await sftp.exists(remotePath);
      if (!exists) {
        available.push(domain);
        continue;
      }
      let entries = [];
      try {
        entries = await sftp.list(remotePath);
      } catch (e) {
        occupied.push(domain);
        continue;
      }
      if (isDomainFolderAvailable(entries)) {
        available.push(domain);
      } else {
        occupied.push(domain);
      }
    }
  });

  return {
    available,
    occupied,
    projectsBaseDir,
    warning: listed.warning,
  };
}

/**
 * Завантажує локальний згенерований проєкт у папку домену на VPS.
 * @param {object} opts
 * @param {object} opts.host
 * @param {string} opts.domain
 * @param {string} opts.projectName
 * @param {string} [opts.userId]
 * @param {(msg: string) => void} [opts.onLog]
 * @param {string} [opts.stack] php | react
 * @param {string} [opts.generationMode] standard | bot_gate
 * @param {string} [opts.vhostMode] php | spa | auto
 */
export async function deployGeneratedSiteToDomainFolder({
  host,
  domain,
  projectName,
  userId,
  onLog,
  stack,
  generationMode,
  vhostMode,
}) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const slug = String(projectName || "").trim();
  if (!normalizedDomain || !slug) {
    throw new Error("domain and projectName are required");
  }

  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const remotePath = domainRemotePath(projectsBaseDir, normalizedDomain);
  const localPath = await getProjectPath(slug);

  const log = (msg) => {
    if (typeof onLog === "function") {
      onLog(msg);
    }
  };

  await withSftp(host, async (sftp) => {
    const exists = await sftp.exists(remotePath);
    if (!exists) {
      await sftp.mkdir(remotePath, true);
      log(`[deploy] created ${remotePath}`);
    }
    const entries = exists ? await sftp.list(remotePath) : [];
    if (!isDomainFolderAvailable(entries)) {
      throw new Error(`Domain folder is not empty: ${normalizedDomain}`);
    }
    const { uploadProjectDirFiltered } = await import(
      "@/lib/generator-engine/multipage-postprocess.js"
    );
    await uploadProjectDirFiltered(sftp, localPath, remotePath);
    log(`[deploy] upload (filtered) ${localPath} -> ${remotePath}`);
  });

  let nginx = null;
  let stackWarning = undefined;
  try {
    let ensured = await ensureNginxForDeployedDomain({
      host,
      domain: normalizedDomain,
      stack,
      generationMode,
      vhostMode,
      onLog: log,
    });
    if (!ensured.stackReady) {
      log(`[deploy] nginx stack not ready — retry once`);
      ensured = await ensureNginxForDeployedDomain({
        host,
        domain: normalizedDomain,
        stack,
        generationMode,
        vhostMode,
        onLog: log,
      });
    }
    nginx = ensured.nginx || null;
    stackWarning = ensured.warning;
    if (nginx?.ok && nginx?.verified) {
      const modeLabel = nginx.vhostMode === "spa" ? "SPA static" : `PHP ${nginx.phpFpmSocket || "?"}`;
      log(
        `[deploy] nginx ok (${nginx.https ? "https" : "http-only"}, ${modeLabel}): ${nginx.smokeStatus || "smoke ok"} → ${nginx.nginxConfPath || "?"}`
      );
    } else if (nginx?.ok) {
      log(
        `[deploy] nginx vhost written (${nginx.https ? "https" : "http-only"})${nginx.relaxedVerify ? " — SSL vhost (smoke verify relaxed)" : ""} — ${nginx.verified ? "verified" : "перевірте в браузері"}`
      );
    } else if (nginx?.skipped) {
      log(
        `[deploy] nginx skipped: ${nginx.reason || nginx.warning || "unknown"} — покладіть ssl/fullchain.pem+privkey.pem у ssl/ або запустіть автоматизацію домену`
      );
    } else {
      log(
        `[deploy] nginx FAILED: ${nginx.warning || "unknown"} — сайт на диску, але в браузері може бути 403; виправте vhost вручну або повторіть «Завантажити на хост»`
      );
    }
  } catch (stackErr) {
    log(`[deploy] PHP/nginx error: ${String(stackErr?.message || stackErr).slice(0, 240)}`);
  }

  const nginxOk = Boolean(nginx?.ok && (nginx?.verified || nginx?.https));

  if (userId) {
    await upsertSeoDomainForUser(userId, normalizedDomain, {
      projectName: slug,
      setDeployedAt: true,
    });
  }

  try {
    const webhook = await notifyAutoscriptAfterDeploy({
      userId,
      domain: normalizedDomain,
      remotePath,
      projectName: slug,
      host,
    });
    if (webhook.ok) {
      if (webhook.mode === "queue" || String(webhook.mode || "").startsWith("queue")) {
        log("[deploy] auto-script-v2 queued for SEO verification (Supabase)");
      } else {
        log("[deploy] auto-script-v2 webhook queued verification");
      }
    } else if (!webhook.skipped) {
      log(`[deploy] auto-script-v2 webhook failed: ${webhook.reason || "unknown"}`);
    }
  } catch (webhookErr) {
    log(`[deploy] auto-script-v2 webhook error: ${String(webhookErr?.message || webhookErr).slice(0, 160)}`);
  }

  return {
    ok: true,
    domain: normalizedDomain,
    remotePath,
    projectName: slug,
    siteUrl: `https://${normalizedDomain}`,
    nginx: nginx || null,
    stackReady: nginxOk,
    warning:
      nginx && !nginxOk && !nginx.skipped
        ? String(nginx.warning || stackWarning || "nginx vhost not verified")
        : stackWarning,
  };
}

/** Домени в projectsDir, де є index.php (готові PHP-сайти). */
export async function listPhpSiteDomainsOnHost(host) {
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const domains = [];
  await withSftp(host, async (sftp) => {
    let list = [];
    try {
      list = await sftp.list(projectsBaseDir);
    } catch {
      return;
    }
    for (const item of list) {
      if (item.type !== "d") continue;
      const name = String(item.name || "").trim().toLowerCase();
      if (!name || name === "." || name === "..") continue;
      const indexPath = `${projectsBaseDir}/${name}/index.php`;
      if ((await sftp.exists(indexPath)) === "-") {
        domains.push(name);
      }
    }
  });
  return domains.sort();
}

/** Домени в projectsDir, де є index.html (React / static SPA). */
export async function listHtmlSiteDomainsOnHost(host) {
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const domains = [];
  await withSftp(host, async (sftp) => {
    let list = [];
    try {
      list = await sftp.list(projectsBaseDir);
    } catch {
      return;
    }
    for (const item of list) {
      if (item.type !== "d") continue;
      const name = String(item.name || "").trim().toLowerCase();
      if (!name || name === "." || name === "..") continue;
      const indexPath = `${projectsBaseDir}/${name}/index.html`;
      if ((await sftp.exists(indexPath)) === "-") {
        domains.push(name);
      }
    }
  });
  return domains.sort();
}

/** Домени з задеплоєним сайтом (index.php або index.html). */
export async function listDeployedSiteDomainsOnHost(host) {
  const php = await listPhpSiteDomainsOnHost(host);
  const html = await listHtmlSiteDomainsOnHost(host);
  return [...new Set([...php, ...html])].sort();
}
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const domains = [];
  await withSftp(host, async (sftp) => {
    let list = [];
    try {
      list = await sftp.list(projectsBaseDir);
    } catch {
      return;
    }
    for (const item of list) {
      if (item.type !== "d") continue;
      const name = String(item.name || "").trim().toLowerCase();
      if (!name || name === "." || name === "..") continue;
      if (/^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
        domains.push(name);
      }
    }
  });
  return domains.sort();
}

/**
 * Повне налаштування VPS: apt nginx+php-fpm (за потреби) + vhost для всіх сайтів з index.php.
 */
export async function provisionHostPhpStack({ host, onLog }) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const { nginxPhpEnabled } = await import("./hostNginxSslDeploy.js");
  const phpMode = nginxPhpEnabled();

  const { ensureWebPortsOpenOnHost } = await import("./hostPhpStack.js");
  await ensureWebPortsOpenOnHost({
    deployHostIp: host?.hostIp,
    sshUser: host?.sshUser,
    sshPassword: host?.sshPassword,
    sshPort: host?.sshPort,
    onLog: log,
  });

  const stack = phpMode
    ? await ensurePhpStackOnHost({
        deployHostIp: host?.hostIp,
        sshUser: host?.sshUser,
        sshPassword: host?.sshPassword,
        sshPort: host?.sshPort,
        onLog: log,
      })
    : await (async () => {
        const { ensureNginxOnHost } = await import("./hostPhpStack.js");
        return ensureNginxOnHost({
          deployHostIp: host?.hostIp,
          sshUser: host?.sshUser,
          sshPassword: host?.sshPassword,
          sshPort: host?.sshPort,
          onLog: log,
        });
      })();

  const phpDomains = phpMode ? await listPhpSiteDomainsOnHost(host) : [];
  const htmlDomains = phpMode ? await listHtmlSiteDomainsOnHost(host) : [];
  const allDomains = await listAllSiteDomainsOnHost(host);
  const domainSet = new Set(phpMode ? [...phpDomains, ...htmlDomains] : allDomains);

  if (phpMode) {
    for (const domain of allDomains) {
      const pem = await sslPemPresentOnHost({
        domain,
        deployHostIp: host?.hostIp,
        sshUser: host?.sshUser,
        sshPassword: host?.sshPassword,
        sshPort: host?.sshPort,
        projectsBaseDir,
      });
      if (pem) {
        domainSet.add(domain);
      }
    }
  }

  const domainList = [...domainSet].sort();
  log(
    `[provision] знайдено ${domainList.length} домен(ів) у ${projectsBaseDir} (${phpMode ? "PHP/HTML + SSL-only" : "nginx static"})`
  );

  const sites = [];
  for (const domain of domainList) {
    const repair = await repairDeployedSiteStack({ host, domain, onLog: log });
    const siteOk = Boolean(repair.stackReady);
    sites.push({ domain, ok: siteOk, nginx: repair.nginx });
    log(
      `[provision] ${domain}: ${siteOk ? "ok" : "failed"} ${repair.nginx?.smokeStatus || repair.warning || repair.nginx?.warning || ""}`
    );
  }

  const allOk =
    Boolean(stack.ok) && (sites.length === 0 || sites.every((s) => s.ok));
  return {
    ok: allOk,
    stack,
    sites,
    phpFpmSocket: stack.phpFpmSocket,
  };
}

/**
 * PHP-FPM + права + nginx vhost для задеплоєного домену.
 * @param {{ host: object, domain: string, onLog?: (msg: string) => void }} opts
 */
export async function ensurePhpNginxForDeployedDomain({ host, domain, onLog }) {
  return ensureNginxForDeployedDomain({
    host,
    domain,
    vhostMode: "php",
    onLog,
  });
}

/**
 * nginx vhost для задеплоєного домену (PHP або React SPA static).
 * @param {{ host: object, domain: string, stack?: string, generationMode?: string, vhostMode?: string, onLog?: (msg: string) => void }} opts
 */
export async function ensureNginxForDeployedDomain({
  host,
  domain,
  stack,
  generationMode,
  vhostMode,
  onLog,
}) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  const { resolveDeployVhostMode, normalizeVhostMode, VHOST_MODE_SPA } = await import(
    "@/src/lib/deploy-vhost.js"
  );
  const modeInput = normalizeVhostMode(vhostMode || "auto");
  const resolved =
    modeInput === "auto"
      ? resolveDeployVhostMode({ stack, generationMode })
      : modeInput;

  let phpStack = null;
  if (resolved !== VHOST_MODE_SPA) {
    phpStack = await ensurePhpStackOnHost({
      deployHostIp: host?.hostIp,
      sshUser: host?.sshUser,
      sshPassword: host?.sshPassword,
      sshPort: host?.sshPort,
      onLog: log,
    });
  } else {
    log("[deploy] React SPA — пропускаємо PHP-FPM install");
  }

  const repair = await repairDeployedSiteStack({
    host,
    domain,
    vhostMode: resolved,
    onLog: log,
  });
  return { ...repair, stack: phpStack, vhostMode: resolved };
}

/**
 * Лише права + nginx vhost (без повторного SFTP файлів) — коли на диску вже є сайт, а в браузері 403.
 * @param {{ host: object, domain: string, onLog?: (msg: string) => void }} opts
 */
export async function repairDeployedSiteStack({ host, domain, vhostMode, onLog }) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  if (!normalizedDomain) {
    throw new Error("domain is required");
  }
  const projectsBaseDir = normalizeBaseDir(host?.projectsDir);
  const remotePath = domainRemotePath(projectsBaseDir, normalizedDomain);
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  await fixDeployedSitePermissions({
    deployHostIp: host?.hostIp,
    sshUser: host?.sshUser,
    sshPassword: host?.sshPassword,
    sshPort: host?.sshPort,
    remoteProjectDir: remotePath,
  });
  log(`[nginx-repair] permissions 755/644 on ${remotePath}`);

  const hostSsh = {
    deployHostIp: host?.hostIp,
    sshUser: host?.sshUser,
    sshPassword: host?.sshPassword,
    sshPort: host?.sshPort,
    projectsBaseDir,
  };

  let nginx = await syncNginxVhostForDomain({
    domain: normalizedDomain,
    ...hostSsh,
    mode: "auto",
    vhostMode: vhostMode || "auto",
    onLog: log,
  });

  const sslPresent = await sslPemPresentOnHost({
    domain: normalizedDomain,
    ...hostSsh,
  });

  if (sslPresent && (!nginx?.ok || !nginx?.https)) {
    log(
      `[nginx] ssl/ PEM found (domain automation) — forcing HTTPS vhost after site upload`
    );
    nginx = await syncNginxVhostForDomain({
      domain: normalizedDomain,
      ...hostSsh,
      mode: "https",
      vhostMode: vhostMode || "auto",
      onLog: log,
    });
  }

  if (sslPresent && (!nginx?.ok || !nginx?.https)) {
    log(
      `[nginx] HTTPS smoke verify still incomplete — publishing SSL vhost anyway (fix browser cert mismatch)`
    );
    nginx = await syncNginxVhostForDomain({
      domain: normalizedDomain,
      ...hostSsh,
      mode: "https",
      vhostMode: vhostMode || "auto",
      relaxSmokeVerify: true,
      onLog: log,
    });
  }

  const nginxOk = Boolean(nginx?.ok && (nginx?.verified || nginx?.https));
  return {
    ok: nginxOk,
    domain: normalizedDomain,
    remotePath,
    nginx,
    stackReady: nginxOk,
    warning: nginxOk ? undefined : String(nginx?.warning || nginx?.reason || "nginx not verified"),
  };
}

/**
 * Після збірки: знайти першу вільну папку домену на хості і задеплоїти.
 */
export async function autoDeployBuildJobToHost(job, buildResult, { onLog } = {}) {
  const userId = String(job?.payload?.userId || "").trim();
  const hostId = String(job?.payload?.hostId || "").trim();
  const projectName = String(job?.payload?.projectName || buildResult?.projectName || "").trim();

  if (!hostId) {
    return {
      status: "skipped_no_host",
      message: "Host not selected",
    };
  }

  const { getHostById } = await import("./hostsRepository.js");
  const host = await getHostById(hostId, userId);
  if (!host) {
    return {
      status: "failed",
      message: "Selected host not found",
    };
  }

  const scan = await listDomainFolderAvailabilityOnHost(host);
  if (scan.warning && !scan.available.length) {
    return {
      status: "failed",
      message: scan.warning,
      projectsBaseDir: scan.projectsBaseDir,
    };
  }

  const planned = String(job?.payload?.plannedDeployDomain || "").trim().toLowerCase();
  let domain = planned && scan.available.includes(planned) ? planned : scan.available[0];
  if (!domain) {
    return {
      status: "pending_no_slot",
      message: "no_empty_domain_folders",
      projectsBaseDir: scan.projectsBaseDir,
      occupiedCount: scan.occupied.length,
    };
  }

  try {
    const deployed = await deployGeneratedSiteToDomainFolder({
      host,
      domain,
      projectName,
      userId,
      onLog,
      stack: job?.payload?.stack,
      generationMode: job?.payload?.generationMode,
    });
    return {
      status: "deployed",
      domain: deployed.domain,
      remotePath: deployed.remotePath,
      siteUrl: deployed.siteUrl,
      projectsBaseDir: scan.projectsBaseDir,
      nginx: deployed.nginx,
      stackReady: deployed.stackReady,
      warning: deployed.warning,
    };
  } catch (e) {
    return {
      status: "failed",
      message: e?.message || String(e),
      domain,
    };
  }
}
