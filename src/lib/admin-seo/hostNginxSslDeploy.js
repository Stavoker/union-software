import SftpClient from "ssh2-sftp-client";
import { Client as SshClient } from "ssh2";
import { assertSafeHostForRemotePath } from "./hostProjectCleanup.js";

function envBool(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Увімкнено за замовчуванням; вимкнути: SUBDOMAIN_HOST_NGINX_PHP=0 */
function nginxPhpEnabled() {
  const v = String(process.env.SUBDOMAIN_HOST_NGINX_PHP ?? "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

/** Безпечне екранування для однолінійної команди в sh -c. */
function shellSingleQuote(path) {
  return `'${String(path).replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * Шаблони різні: лише HTML у корені або в html/, або PHP (index.php + fastcgi).
 * .htaccess nginx не читає — правила з Apache треба переносити вручну, якщо потрібні рерайти.
 */
function buildNginxSiteConfig(domain, rootDir, sslDir, { phpEnabled, phpFastcgiPass }) {
  const indexLine =
    phpEnabled === true
      ? `    index index.php index.html index.htm;`
      : `    index index.html index.htm;`;

  const tryFilesMain =
    phpEnabled === true
      ? [
          `    location / {`,
          `        try_files $uri $uri/ /html$uri /html$uri/ /index.php?$query_string;`,
          `    }`,
        ]
      : [`    location / {`, `        try_files $uri $uri/ /html$uri /html$uri/ =404;`, `    }`];

  const tryFilesRoot =
    phpEnabled === true
      ? [
          `    location = / {`,
          `        try_files /html/index.html /html/index.htm /html/index.php /index.html /index.htm /index.php;`,
          `    }`,
          ``,
        ]
      : [
          `    location = / {`,
          `        try_files /html/index.html /html/index.htm /index.html /index.htm =404;`,
          `    }`,
          ``,
        ];

  const phpBlock =
    phpEnabled === true && phpFastcgiPass
      ? [
          ``,
          `    location ~ \\.php$ {`,
          `        include snippets/fastcgi-php.conf;`,
          `        fastcgi_pass ${phpFastcgiPass};`,
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
    ...tryFilesRoot,
    ...tryFilesMain,
    ...phpBlock,
    `}`,
    ``,
  ].join("\n");
}

function sshExecCommand(host, user, password, command, port = 22) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("SSH exec timeout (60s)"));
    }, 60000);

    conn
      .on("ready", () => {
        conn.exec(command, { pty: false }, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }
          let stdout = "";
          let stderr = "";
          stream.on("data", (d) => {
            stdout += d.toString();
          });
          stream.stderr.on("data", (d) => {
            stderr += d.toString();
          });
          stream.on("close", (code) => {
            clearTimeout(timer);
            conn.end();
            if (code !== 0) {
              reject(new Error(`SSH exit ${code}: ${(stderr || stdout).trim().slice(0, 500)}`));
            } else {
              resolve({ stdout, stderr });
            }
          });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      })
      .connect({
        host,
        port: Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 22,
        username: user,
        password: String(password || ""),
        readyTimeout: 20000,
      });
  });
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
}) {
  if (!envBool("SUBDOMAIN_HOST_SSL_DEPLOY")) {
    return { skipped: true, ok: false, reason: "SUBDOMAIN_HOST_SSL_DEPLOY not set" };
  }

  const normalized = assertSafeHostForRemotePath(domain);
  const cert = String(certificatePem || "").trim();
  const key = String(privateKeyPem || "").trim();
  if (!cert || !key) {
    return { ok: false, skipped: false, warning: "Missing certificatePem or privateKeyPem" };
  }

  const sshHost = String(deployHostIp || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(sshUserInput || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(sshPasswordInput || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(sshPortInput || process.env.SUBDOMAIN_HOST_PORT || 22);
  const projectsBaseDir = String(process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";
  const sitesAvail = (String(process.env.SUBDOMAIN_HOST_NGINX_SITES_AVAILABLE || "").trim() || "/etc/nginx/sites-available").replace(
    /\/+$/,
    ""
  );
  const sitesEn = (String(process.env.SUBDOMAIN_HOST_NGINX_SITES_ENABLED || "").trim() || "/etc/nginx/sites-enabled").replace(/\/+$/, "");
  const reloadCmd =
    String(process.env.SUBDOMAIN_HOST_NGINX_RELOAD_CMD || "").trim() || "nginx -t && systemctl reload nginx";

  if (!sshHost || !sshUser || !sshPassword) {
    return { ok: false, skipped: false, warning: "SUBDOMAIN_HOST_IP / USER / PASSWORD missing" };
  }

  const remoteProjectDir = `${projectsBaseDir.replace(/\/+$/, "")}/${normalized}`;
  const sslDir = `${remoteProjectDir}/ssl`;
  const confName = `${normalized}.conf`;
  const confPath = `${sitesAvail}/${confName}`;
  const linkPath = `${sitesEn}/${confName}`;

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: sshHost,
      port: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 20000,
    });
    await sftp.mkdir(sslDir, true);
    await sftp.put(Buffer.from(cert, "utf8"), `${sslDir}/fullchain.pem`);
    await sftp.put(Buffer.from(key, "utf8"), `${sslDir}/privkey.pem`);
    await sftp.chmod(`${sslDir}/privkey.pem`, 0o600).catch(() => {});

    const phpOn = nginxPhpEnabled();
    const phpSock =
      String(process.env.SUBDOMAIN_HOST_PHP_FPM_SOCKET || "").trim() || "unix:/run/php/php8.1-fpm.sock";
    const nginxConf = buildNginxSiteConfig(normalized, remoteProjectDir, sslDir, {
      phpEnabled: phpOn,
      phpFastcgiPass: phpOn ? phpSock : "",
    });
    await sftp.put(Buffer.from(nginxConf, "utf8"), confPath);
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

  try {
    const ln = `ln -sf ${shellSingleQuote(confPath)} ${shellSingleQuote(linkPath)}`;
    await sshExecCommand(sshHost, sshUser, sshPassword, ln, sshPort);
    await sshExecCommand(sshHost, sshUser, sshPassword, reloadCmd, sshPort);
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      warning: `nginx symlink/reload failed: ${e?.message || String(e)}`,
      remoteProjectDir,
      sslDir,
      nginxConfPath: confPath,
      nginxLinkPath: linkPath,
    };
  }

  return {
    ok: true,
    skipped: false,
    remoteProjectDir,
    sslDir,
    nginxConfPath: confPath,
    nginxLinkPath: linkPath,
    nginxReloaded: true,
  };
}
