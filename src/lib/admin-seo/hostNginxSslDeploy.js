import SftpClient from "ssh2-sftp-client";
import { assertSafeHostForRemotePath } from "./hostProjectCleanup.js";
import { ensurePhpStackOnHost } from "./hostPhpStack.js";
import { shellSingleQuote, sshExecCommand, sshUsesSudo } from "./hostSsh.js";
import {
  normalizeVhostMode,
  resolveDeployVhostMode,
  VHOST_MODE_PHP,
  VHOST_MODE_SPA,
  VHOST_MODE_AUTO,
} from "@/src/lib/deploy-vhost.js";

function envBool(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Увімкнено за замовчуванням; вимкнути лише статику: SUBDOMAIN_HOST_NGINX_PHP=0 */
export function nginxPhpEnabled() {
  const v = String(process.env.SUBDOMAIN_HOST_NGINX_PHP ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function nginxPhpEnabledLocal() {
  return nginxPhpEnabled();
}

/**
 * vhostMode: php | spa (React static SPA fallback → index.html)
 * .htaccess nginx не читає — SPA rewrite має бути у vhost.
 */
function buildNginxSiteConfig(domain, rootDir, sslDir, { vhostMode, phpFastcgiPass }) {
  const spa = vhostMode === VHOST_MODE_SPA;
  const php = vhostMode === VHOST_MODE_PHP;

  const indexLine = spa
    ? `    index index.html index.htm;`
    : php
      ? `    index index.php index.html index.htm;`
      : `    index index.html index.htm;`;

  const tryFilesMain = spa
    ? [
        `    location / {`,
        `        try_files $uri $uri/ /index.html;`,
        `    }`,
      ]
    : php
      ? [
          `    location / {`,
          `        try_files $uri $uri/ /index.php?$query_string;`,
          `    }`,
        ]
      : [`    location / {`, `        try_files $uri $uri/ =404;`, `    }`];

  const phpBlock =
    php && phpFastcgiPass
      ? [
          ``,
          `    location ~ \\.php$ {`,
          `        include snippets/fastcgi-php.conf;`,
          `        fastcgi_pass ${phpFastcgiPass};`,
          `        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;`,
          `    }`,
        ]
      : [];

  return [
    `server {`,
    `    listen 80;`,
    `    listen [::]:80;`,
    `    server_name ${domain};`,
    `    return 301 https://$host$request_uri;`,
    `}`,
    ``,
    `server {`,
    `    listen 443 ssl;`,
    `    listen [::]:443 ssl;`,
    `    server_name ${domain};`,
    `    root ${rootDir};`,
    indexLine,
    ``,
    `    ssl_certificate ${sslDir}/fullchain.pem;`,
    `    ssl_certificate_key ${sslDir}/privkey.pem;`,
    ``,
    ...tryFilesMain,
    ...phpBlock,
    `}`,
    ``,
  ].join("\n");
}

/** HTTP-only vhost (поки немає SSL у ssl/). */
function buildNginxHttpOnlySiteConfig(domain, rootDir, { vhostMode, phpFastcgiPass }) {
  const spa = vhostMode === VHOST_MODE_SPA;
  const php = vhostMode === VHOST_MODE_PHP;
  const indexLine = spa
    ? `    index index.html index.htm;`
    : php
      ? `    index index.php index.html index.htm;`
      : `    index index.html index.htm;`;
  const tryFilesMain = spa
    ? [
        `    location / {`,
        `        try_files $uri $uri/ /index.html;`,
        `    }`,
      ]
    : php
      ? [
          `    location / {`,
          `        try_files $uri $uri/ /index.php?$query_string;`,
          `    }`,
        ]
      : [`    location / {`, `        try_files $uri $uri/ =404;`, `    }`];
  const phpBlock =
    php && phpFastcgiPass
      ? [
          ``,
          `    location ~ \\.php$ {`,
          `        include snippets/fastcgi-php.conf;`,
          `        fastcgi_pass ${phpFastcgiPass};`,
          `        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;`,
          `    }`,
        ]
      : [];
  return [
    `server {`,
    `    listen 80;`,
    `    listen [::]:80;`,
    `    server_name ${domain};`,
    `    root ${rootDir};`,
    indexLine,
    ``,
    ...tryFilesMain,
    ...phpBlock,
    `}`,
    ``,
  ].join("\n");
}

function nginxConfigHasPhpBlock(nginxConf) {
  const t = String(nginxConf || "");
  return (
    /location\s+~\s+\\?\.php\$/.test(t) &&
    /fastcgi_pass\s+/.test(t) &&
    /try_files\s+\$uri/.test(t) &&
    /index\s+index\.php/.test(t)
  );
}

function nginxConfigHasSpaBlock(nginxConf) {
  const t = String(nginxConf || "");
  return (
    /try_files\s+\$uri\s+\$uri\/\s+\/index\.html/.test(t) &&
    /index\s+index\.html/.test(t)
  );
}

/** Сокет PHP-FPM на VPS (env або перший /run/php/php*-fpm.sock). */
async function detectPhpFpmSocketOnHost({ sshHost, sshUser, sshPassword, sshPort, onLog }) {
  const fromEnv = String(process.env.SUBDOMAIN_HOST_PHP_FPM_SOCKET || "").trim();
  if (fromEnv) {
    const sock = fromEnv.startsWith("unix:") ? fromEnv : `unix:${fromEnv}`;
    onLog?.(`[nginx] PHP-FPM socket from env: ${sock}`);
    return sock;
  }
  const cmd =
    "ls /run/php/php*-fpm.sock 2>/dev/null | head -n 1 || ls /var/run/php/php*-fpm.sock 2>/dev/null | head -n 1";
  try {
    const { stdout } = await sshExecCommand(sshHost, sshUser, sshPassword, cmd, sshPort);
    const p = String(stdout || "")
      .trim()
      .split("\n")[0]
      .trim();
    if (p) {
      const sock = p.startsWith("unix:") ? p : `unix:${p}`;
      onLog?.(`[nginx] PHP-FPM socket detected: ${sock}`);
      return sock;
    }
  } catch (e) {
    onLog?.(`[nginx] PHP-FPM detect warning: ${String(e?.message || e).slice(0, 120)}`);
  }
  const fallback = "unix:/run/php/php8.1-fpm.sock";
  onLog?.(`[nginx] PHP-FPM socket fallback: ${fallback}`);
  return fallback;
}

async function verifyNginxVhostOnHost({
  sshHost,
  sshUser,
  sshPassword,
  sshPort,
  confPath,
  domain,
  useHttps,
}) {
  const q = shellSingleQuote(confPath);
  const { stdout } = await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    `grep -E 'fastcgi_pass|location ~ \\\\.php|try_files|index index.php' ${q} | wc -l`,
    sshPort
  );
  const hits = parseInt(String(stdout || "").trim(), 10);
  if (!Number.isFinite(hits) || hits < 4) {
    throw new Error(`nginx vhost incomplete (grep hits=${hits || 0}, need PHP block)`);
  }

  const scheme = useHttps ? "https" : "http";
  const port = useHttps ? "443" : "80";
  const curlCmd = `curl -sI -k --resolve ${shellSingleQuote(`${domain}:${port}:127.0.0.1`)} ${scheme}://${domain}/ | head -n 1`;
  const { stdout: curlOut } = await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    curlCmd,
    sshPort
  );
  const statusLine = String(curlOut || "").trim();
  if (/ 403 /.test(statusLine)) {
    throw new Error(`smoke test got 403 — PHP likely not wired (${statusLine})`);
  }
  if (!/^HTTP\/\d/i.test(statusLine)) {
    throw new Error(`smoke test failed: ${statusLine || "empty response"}`);
  }

  const curlPhpCmd = `curl -sI -k --resolve ${shellSingleQuote(`${domain}:${port}:127.0.0.1`)} ${scheme}://${domain}/index.php | head -n 15`;
  const { stdout: phpHead } = await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    curlPhpCmd,
    sshPort
  );
  const phpHeaders = String(phpHead || "").toLowerCase();
  if (/content-type:\s*application\/octet-stream/.test(phpHeaders)) {
    throw new Error(
      "index.php served as static file (octet-stream) — PHP-FPM not connected to nginx"
    );
  }
  if (!/content-type:\s*text\/html/.test(phpHeaders) && !/x-powered-by:\s*php/.test(phpHeaders)) {
    throw new Error(`index.php response not HTML/PHP (${phpHead.trim().slice(0, 200)})`);
  }

  return { smokeStatus: statusLine };
}

async function verifyNginxStaticVhostOnHost({
  sshHost,
  sshUser,
  sshPassword,
  sshPort,
  domain,
  useHttps,
}) {
  const scheme = useHttps ? "https" : "http";
  const port = useHttps ? "443" : "80";
  const curlCmd = `curl -sI -k --resolve ${shellSingleQuote(`${domain}:${port}:127.0.0.1`)} ${scheme}://${domain}/ | head -n 1`;
  const { stdout: curlOut } = await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    curlCmd,
    sshPort
  );
  const statusLine = String(curlOut || "").trim();
  if (!/^HTTP\/\d/i.test(statusLine)) {
    throw new Error(`static smoke test failed: ${statusLine || "empty response"}`);
  }
  if (/ 502 | 503 | 500 /.test(statusLine)) {
    throw new Error(`static smoke test bad gateway: ${statusLine}`);
  }
  return { smokeStatus: statusLine };
}

/** Перевірка, що nginx на :443 віддає сертифікат з правильним CN (без контенту сайту). */
async function verifySslCertServedForDomain({
  sshHost,
  sshUser,
  sshPassword,
  sshPort,
  domain,
}) {
  const sni = shellSingleQuote(domain);
  const cmd = `echo | openssl s_client -connect 127.0.0.1:443 -servername ${sni} 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null`;
  const { stdout } = await sshExecCommand(sshHost, sshUser, sshPassword, cmd, sshPort);
  const subject = String(stdout || "").trim();
  if (!subject) {
    throw new Error("openssl s_client returned no certificate");
  }
  const domainLc = String(domain || "").trim().toLowerCase();
  if (!new RegExp(`(CN\\s*=\\s*${domainLc.replace(/\./g, "\\.")}|CN\\s*=\\s*\\*\\.[^,]+)`).test(subject)) {
    throw new Error(`certificate subject mismatch: ${subject.slice(0, 200)}`);
  }
  return { certSubject: subject.split("\n")[0] || subject };
}

async function verifyNginxSpaVhostOnHost({
  sshHost,
  sshUser,
  sshPassword,
  sshPort,
  confPath,
  domain,
  useHttps,
}) {
  const q = shellSingleQuote(confPath);
  const { stdout } = await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    `grep -E 'try_files|index index.html' ${q} | wc -l`,
    sshPort
  );
  const hits = parseInt(String(stdout || "").trim(), 10);
  if (!Number.isFinite(hits) || hits < +2) {
    throw new Error(`nginx SPA vhost incomplete (grep hits=${hits || 0})`);
  }

  const scheme = useHttps ? "https" : "http";
  const port = useHttps ? "443" : "80";
  const resolve = shellSingleQuote(`${domain}:${port}:127.0.0.1`);
  for (const path of ["/", "/games"]) {
    const curlCmd = `curl -sI -k --resolve ${resolve} ${scheme}://${domain}${path} | head -n 1`;
    const { stdout: curlOut } = await sshExecCommand(
      sshHost,
      sshUser,
      sshPassword,
      curlCmd,
      sshPort
    );
    const statusLine = String(curlOut || "").trim();
    if (/ 403 /.test(statusLine)) {
      throw new Error(`SPA smoke ${path} got 403`);
    }
    if (!/^HTTP\/\d/i.test(statusLine)) {
      throw new Error(`SPA smoke ${path} failed: ${statusLine || "empty"}`);
    }
  }
  return { smokeStatus: "SPA ok" };
}

function resolveNginxDeployPaths(projectsBaseDir, domain) {
  const normalized = assertSafeHostForRemotePath(domain);
  const base = String(projectsBaseDir || "/var/www").trim().replace(/\/+$/, "") || "/var/www";
  const remoteProjectDir = `${base}/${normalized}`;
  const sslDir = `${remoteProjectDir}/ssl`;
  const confName = `${normalized}.conf`;
  const sitesAvail = (
    String(process.env.SUBDOMAIN_HOST_NGINX_SITES_AVAILABLE || "").trim() ||
    "/etc/nginx/sites-available"
  ).replace(/\/+$/, "");
  const sitesEn = (
    String(process.env.SUBDOMAIN_HOST_NGINX_SITES_ENABLED || "").trim() ||
    "/etc/nginx/sites-enabled"
  ).replace(/\/+$/, "");
  const reloadCmd =
    String(process.env.SUBDOMAIN_HOST_NGINX_RELOAD_CMD || "").trim() ||
    "nginx -t && systemctl reload nginx";
  return {
    normalized,
    remoteProjectDir,
    sslDir,
    confPath: `${sitesAvail}/${confName}`,
    linkPath: `${sitesEn}/${confName}`,
    reloadCmd,
  };
}


/** Чи є fullchain.pem + privkey.pem у /var/www/<domain>/ssl/ (після domain automation). */
export async function sslPemPresentOnHost({
  domain,
  deployHostIp,
  sshUser: sshUserInput,
  sshPassword: sshPasswordInput,
  sshPort: sshPortInput,
  projectsBaseDir: projectsBaseDirInput,
}) {
  const sshHost = String(deployHostIp || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(sshUserInput || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(sshPasswordInput || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(sshPortInput || process.env.SUBDOMAIN_HOST_PORT || 22);
  const projectsBaseDir =
    String(projectsBaseDirInput || process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";
  if (!sshHost || !sshUser || !sshPassword || !domain) {
    return false;
  }
  const { sslDir } = resolveNginxDeployPaths(projectsBaseDir, domain);
  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: sshHost,
      port: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 20000,
    });
    const hasCert = (await sftp.exists(`${sslDir}/fullchain.pem`)) === "-";
    const hasKey = (await sftp.exists(`${sslDir}/privkey.pem`)) === "-";
    return hasCert && hasKey;
  } catch {
    return false;
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function publishNginxConfigOnHost({
  sshHost,
  sshUser,
  sshPassword,
  sshPort,
  nginxConf,
  confPath,
  linkPath,
  reloadCmd,
}) {
  const body = String(nginxConf || "");
  const b64 = Buffer.from(body, "utf8").toString("base64");
  const prefix = sshUsesSudo() ? "sudo " : "";
  const writeCmd = `echo ${shellSingleQuote(b64)} | base64 -d | ${prefix}tee ${shellSingleQuote(confPath)} > /dev/null`;
  const lnCmd = `${prefix}ln -sf ${shellSingleQuote(confPath)} ${shellSingleQuote(linkPath)}`;
  const reload = String(reloadCmd || "nginx -t && systemctl reload nginx").trim();
  const reloadParts = reload.split("&&").map((p) => p.trim()).filter(Boolean);
  const reloadCmdFinal = reloadParts.map((p) => `${prefix}${p}`).join(" && ");
  await sshExecCommand(
    sshHost,
    sshUser,
    sshPassword,
    `${writeCmd} && ${lnCmd} && ${reloadCmdFinal}`,
    sshPort
  );
}

/**
 * Після успішного SSL: запис fullchain/privkey у /var/www/<domain>/ssl/,
 * vhost у sites-available, symlink у sites-enabled, nginx -t && reload (SSH).
 * Увімкнення: SUBDOMAIN_HOST_SSL_DEPLOY=1 у .env.
 *
 * Шаблон nginx підтримує статику (зокрема файли в підпапці html/) і PHP (index.php + fastcgi).
 * За замовчуванням PHP увімкнено; вимкнути лише статику: SUBDOMAIN_HOST_NGINX_PHP=0.
 * Сокет FPM: SUBDOMAIN_HOST_PHP_FPM_SOCKET (типово unix:/run/php/php8.1-fpm.sock).
 */
export async function deploySslCertificateToHost({
  domain,
  certificatePem,
  privateKeyPem,
  deployHostIp,
  sshUser: sshUserInput,
  sshPassword: sshPasswordInput,
  sshPort: sshPortInput,
  projectsBaseDir: projectsBaseDirInput,
}) {
  if (!envBool("SUBDOMAIN_HOST_SSL_DEPLOY")) {
    return { skipped: true, ok: false, reason: "SUBDOMAIN_HOST_SSL_DEPLOY not set" };
  }

  const cert = String(certificatePem || "").trim();
  const key = String(privateKeyPem || "").trim();
  if (!cert || !key) {
    return { ok: false, skipped: false, warning: "Missing certificatePem or privateKeyPem" };
  }

  const sshHost = String(deployHostIp || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(sshUserInput || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(sshPasswordInput || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(sshPortInput || process.env.SUBDOMAIN_HOST_PORT || 22);
  const projectsBaseDir =
    String(projectsBaseDirInput || process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";

  if (!sshHost || !sshUser || !sshPassword) {
    return { ok: false, skipped: false, warning: "SUBDOMAIN_HOST_IP / USER / PASSWORD missing" };
  }

  const { normalized, remoteProjectDir, sslDir, confPath, linkPath, reloadCmd } =
    resolveNginxDeployPaths(projectsBaseDir, domain);

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: sshHost,
      port: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 20000,
    });
    await sftp.mkdir(remoteProjectDir, true);
    const sslExists = await sftp.exists(sslDir);
    if (sslExists) {
      try {
        await sftp.rmdir(sslDir, true);
      } catch {
        /* best-effort: overwrite files below if rmdir fails */
      }
    }
    await sftp.mkdir(sslDir, true);
    await sftp.put(Buffer.from(cert, "utf8"), `${sslDir}/fullchain.pem`);
    await sftp.put(Buffer.from(key, "utf8"), `${sslDir}/privkey.pem`);
    await sftp.chmod(`${sslDir}/privkey.pem`, 0o600).catch(() => {});
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      warning: `SFTP deploy failed: ${e?.message || String(e)}`,
      remoteProjectDir,
      sslDir,
      nginxConfPath: confPath,
    };
  } finally {
    await sftp.end().catch(() => {});
  }

  return syncNginxVhostForDomain({
    domain,
    deployHostIp: sshHost,
    sshUser,
    sshPassword,
    sshPort,
    projectsBaseDir,
    mode: "https",
    relaxSmokeVerify: true,
    sslProvisionOnly: true,
  });
}

/**
 * Після SFTP-деплою генератора: vhost nginx для домену (SSL з ssl/ або HTTP-only).
 * Не вимагає SUBDOMAIN_HOST_SSL_DEPLOY — потрібно, щоб index.php відкривався в браузері.
 */
export async function syncNginxVhostForDomain({
  domain,
  deployHostIp,
  sshUser: sshUserInput,
  sshPassword: sshPasswordInput,
  sshPort: sshPortInput,
  projectsBaseDir: projectsBaseDirInput,
  mode = "auto",
  vhostMode: vhostModeInput = VHOST_MODE_AUTO,
  relaxSmokeVerify = false,
  sslProvisionOnly = false,
  onLog,
}) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  const sshHost = String(deployHostIp || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(sshUserInput || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(sshPasswordInput || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(sshPortInput || process.env.SUBDOMAIN_HOST_PORT || 22);
  const projectsBaseDir =
    String(projectsBaseDirInput || process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";

  if (!sshHost || !sshUser || !sshPassword) {
    return {
      ok: false,
      skipped: true,
      reason: "ssh_credentials_missing",
      warning: "SSH host/user/password missing for nginx sync",
    };
  }

  const { normalized, remoteProjectDir, sslDir, confPath, linkPath, reloadCmd } =
    resolveNginxDeployPaths(projectsBaseDir, domain);

  let useHttps = mode === "https";
  let resolvedVhostMode = normalizeVhostMode(vhostModeInput);
  let hasIndexPhp = false;
  let hasIndexHtml = false;

  if (!sslProvisionOnly) {
    const sftp = new SftpClient();
    try {
      await sftp.connect({
        host: sshHost,
        port: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
        username: sshUser,
        password: sshPassword,
        readyTimeout: 20000,
      });
      if (mode === "auto" || mode === "http") {
        const hasCert = (await sftp.exists(`${sslDir}/fullchain.pem`)) === "-";
        const hasKey = (await sftp.exists(`${sslDir}/privkey.pem`)) === "-";
        useHttps = hasCert && hasKey;
      }
      hasIndexPhp = (await sftp.exists(`${remoteProjectDir}/index.php`)) === "-";
      hasIndexHtml = (await sftp.exists(`${remoteProjectDir}/index.html`)) === "-";
      if (resolvedVhostMode === VHOST_MODE_AUTO) {
        resolvedVhostMode = resolveDeployVhostMode({ hasIndexPhp, hasIndexHtml });
        log(
          `[nginx] vhost auto-detect: ${resolvedVhostMode} (index.php=${hasIndexPhp}, index.html=${hasIndexHtml})`
        );
      }
    } catch (e) {
      return {
        ok: false,
        skipped: false,
        warning: `nginx precheck failed: ${e?.message || String(e)}`,
        remoteProjectDir,
      };
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  const spaMode = sslProvisionOnly ? false : resolvedVhostMode === VHOST_MODE_SPA;
  const phpOn =
    !sslProvisionOnly &&
    !spaMode &&
    (resolvedVhostMode === VHOST_MODE_PHP || nginxPhpEnabledLocal());
  let phpSock = "";
  if (phpOn) {
    const stack = await ensurePhpStackOnHost({
      deployHostIp: sshHost,
      sshUser,
      sshPassword,
      sshPort,
      onLog: log,
    });
    if (!stack.ok && !stack.skipped) {
      return {
        ok: false,
        skipped: false,
        warning: stack.warning || "PHP stack setup failed on host",
        remoteProjectDir,
      };
    }
    phpSock =
      String(stack.phpFpmSocket || "").trim() ||
      (await detectPhpFpmSocketOnHost({
        sshHost,
        sshUser,
        sshPassword,
        sshPort,
        onLog: log,
      }));
  } else if (!spaMode) {
    const { ensureNginxOnHost } = await import("./hostPhpStack.js");
    const nginxStack = await ensureNginxOnHost({
      deployHostIp: sshHost,
      sshUser,
      sshPassword,
      sshPort,
      onLog: log,
    });
    if (!nginxStack.ok && !nginxStack.skipped) {
      return {
        ok: false,
        skipped: false,
        warning: nginxStack.warning || "nginx setup failed on host",
        remoteProjectDir,
      };
    }
    log("[nginx] static vhost (no PHP-FPM in nginx config)");
  }
  const vhostOpts = sslProvisionOnly
    ? { vhostMode: "static", phpFastcgiPass: "" }
    : {
        vhostMode: spaMode ? VHOST_MODE_SPA : VHOST_MODE_PHP,
        phpFastcgiPass: phpOn ? phpSock : "",
      };
  if (spaMode) {
    log(`[nginx] SPA static vhost (try_files → /index.html, no PHP-FPM)`);
  } else if (sslProvisionOnly) {
    log(`[nginx] SSL-only static vhost (empty site folder, HTTPS ready for domain purchase)`);
  }

  if (mode === "https" && !useHttps) {
    return {
      ok: false,
      skipped: true,
      reason: "ssl_certs_missing",
      warning: `No fullchain.pem/privkey.pem in ${sslDir}`,
      remoteProjectDir,
      sslDir,
    };
  }

  const nginxConf = useHttps
    ? buildNginxSiteConfig(normalized, remoteProjectDir, sslDir, vhostOpts)
    : buildNginxHttpOnlySiteConfig(normalized, remoteProjectDir, vhostOpts);

  if (spaMode && !nginxConfigHasSpaBlock(nginxConf)) {
    return {
      ok: false,
      skipped: false,
      warning: "Generated nginx config is missing SPA try_files block",
      remoteProjectDir,
    };
  }
  if (phpOn && !nginxConfigHasPhpBlock(nginxConf)) {
    return {
      ok: false,
      skipped: false,
      warning: "Generated nginx config is missing PHP fastcgi block",
      remoteProjectDir,
    };
  }

  try {
    const { ensureWebPortsOpenOnHost } = await import("./hostPhpStack.js");
    await ensureWebPortsOpenOnHost({
      deployHostIp: sshHost,
      sshUser,
      sshPassword: sshPassword,
      sshPort,
      onLog: log,
    });
    await publishNginxConfigOnHost({
      sshHost,
      sshUser,
      sshPassword,
      sshPort,
      nginxConf,
      confPath,
      linkPath,
      reloadCmd,
    });
    log(
      `[nginx] ${normalized}: vhost ${useHttps ? "https" : "http-only"} → ${confPath}, reload ok`
    );
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      warning: `nginx publish failed: ${e?.message || String(e)}`,
      remoteProjectDir,
      sslDir,
      nginxConfPath: confPath,
      nginxLinkPath: linkPath,
    };
  }

  if (relaxSmokeVerify) {
    log(
      `[nginx] ${normalized}: smoke verify relaxed (pre-provisioned SSL / empty site folder)`
    );
    let certCnOk = false;
    let certSubject = "";
    if (sslProvisionOnly && useHttps) {
      try {
        const certCheck = await verifySslCertServedForDomain({
          sshHost,
          sshUser,
          sshPassword,
          sshPort,
          domain: normalized,
        });
        certCnOk = true;
        certSubject = certCheck.certSubject || "";
        log(`[nginx] ${normalized}: SSL cert CN ok — ${certSubject}`);
      } catch (e) {
        log(`[nginx] ${normalized}: SSL cert CN check failed: ${e?.message || e}`);
      }
    }
    return {
      ok: true,
      skipped: false,
      https: useHttps,
      remoteProjectDir,
      sslDir,
      nginxConfPath: confPath,
      nginxLinkPath: linkPath,
      nginxReloaded: true,
      phpFpmSocket: phpSock,
      vhostMode: sslProvisionOnly ? "static" : spaMode ? VHOST_MODE_SPA : VHOST_MODE_PHP,
      smokeStatus: "relaxed",
      verified: certCnOk,
      certCnOk,
      certSubject,
      relaxedVerify: !certCnOk,
      sslProvisionOnly,
    };
  }

  let smokeStatus = "";
  try {
    const smoke = spaMode
      ? await verifyNginxSpaVhostOnHost({
          sshHost,
          sshUser,
          sshPassword,
          sshPort,
          confPath,
          domain: normalized,
          useHttps,
        })
      : phpOn
        ? await verifyNginxVhostOnHost({
            sshHost,
            sshUser,
            sshPassword,
            sshPort,
            confPath,
            domain: normalized,
            useHttps,
          })
        : await verifyNginxStaticVhostOnHost({
            sshHost,
            sshUser,
            sshPassword,
            sshPort,
            domain: normalized,
            useHttps,
          });
    smokeStatus = smoke.smokeStatus || "";
    log(
      `[nginx] smoke test ${normalized} (${spaMode ? "SPA" : phpOn ? "PHP" : "static"}): ${smokeStatus}`
    );
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      warning: `nginx verify failed: ${e?.message || String(e)}`,
      remoteProjectDir,
      sslDir,
      nginxConfPath: confPath,
      nginxLinkPath: linkPath,
      phpFpmSocket: phpSock,
    };
  }

  return {
    ok: true,
    skipped: false,
    https: useHttps,
    remoteProjectDir,
    sslDir,
    nginxConfPath: confPath,
    nginxLinkPath: linkPath,
    nginxReloaded: true,
    phpFpmSocket: phpSock,
    vhostMode: spaMode ? VHOST_MODE_SPA : VHOST_MODE_PHP,
    smokeStatus,
    verified: true,
  };
}

/** Каталоги 755, файли 644 — інакше www-data/nginx не читає дерево після SFTP. */
export async function fixDeployedSitePermissions(opts) {
  const { fixRemoteTreePermissions } = await import("./hostPhpStack.js");
  return fixRemoteTreePermissions({
    deployHostIp: opts.deployHostIp,
    sshUser: opts.sshUser,
    sshPassword: opts.sshPassword,
    sshPort: opts.sshPort,
    remoteProjectDir: opts.remoteProjectDir,
  });
}
