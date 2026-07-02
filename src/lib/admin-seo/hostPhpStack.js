import { sshExecCommand, shellSingleQuote, sudoPrefix } from "./hostSsh.js";

function phpAutoInstallEnabled() {
  const v = String(process.env.SUBDOMAIN_HOST_PHP_AUTO_INSTALL ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function detectSocketFromStdout(stdout) {
  const p = String(stdout || "")
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!p) return "";
  return p.startsWith("unix:") ? p : `unix:${p}`;
}

/**
 * Відкриває 80/443 у ufw або firewalld (SSH працює, а HTTP/HTTPS з інтернету — ні).
 */
export async function ensureWebPortsOpenOnHost({
  deployHostIp,
  sshUser,
  sshPassword,
  sshPort = 22,
  onLog,
}) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  const sshHost = String(deployHostIp || "").trim();
  const user = String(sshUser || "").trim();
  const pass = String(sshPassword || "");
  const port = Number(sshPort) || 22;

  if (!sshHost || !user || !pass) {
    return { ok: false, skipped: true, reason: "ssh_credentials_missing" };
  }

  const sp = sudoPrefix();
  const script = [
    "set +e",
    "opened=none",
    "if command -v ufw >/dev/null 2>&1; then",
    "  ufw status 2>/dev/null | grep -qi 'Status: active'",
    "  if [ $? -eq 0 ]; then",
    `    ${sp}ufw allow 80/tcp >/dev/null 2>&1`,
    `    ${sp}ufw allow 443/tcp >/dev/null 2>&1`,
    "    opened=ufw",
    "  fi",
    "fi",
    "if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then",
    `  ${sp}firewall-cmd --permanent --add-service=http >/dev/null 2>&1`,
    `  ${sp}firewall-cmd --permanent --add-service=https >/dev/null 2>&1`,
    `  ${sp}firewall-cmd --reload >/dev/null 2>&1`,
    "  opened=firewalld",
    "fi",
    "listen80=$(ss -tln 2>/dev/null | grep -c ':80 ' || echo 0)",
    "listen443=$(ss -tln 2>/dev/null | grep -c ':443 ' || echo 0)",
    'echo "result opened=$opened listen80=$listen80 listen443=$listen443"',
  ].join("\n");

  try {
    const scriptB64 = Buffer.from(script, "utf8").toString("base64");
    const { stdout } = await sshExecCommand(
      sshHost,
      user,
      pass,
      `echo ${shellSingleQuote(scriptB64)} | base64 -d | bash`,
      port,
      60000
    );
    const out = String(stdout || "").trim();
    if (out.includes("opened=ufw")) {
      log("[firewall] ufw: дозволено 80/tcp та 443/tcp");
    } else if (out.includes("opened=firewalld")) {
      log("[firewall] firewalld: дозволено http/https");
    } else {
      log(
        "[firewall] ufw/firewalld не активні — якщо сайт недоступний, відкрийте 80/443 у панелі VPS"
      );
    }
    const listen80 = /listen80=([0-9]+)/.exec(out)?.[1];
    const listen443 = /listen443=([0-9]+)/.exec(out)?.[1];
    if (listen80 === "0") {
      log("[firewall] попередження: ніхто не слухає порт 80");
    }
    if (listen443 === "0") {
      log("[firewall] попередження: ніхто не слухає порт 443");
    }
    return { ok: true, detail: out };
  } catch (e) {
    log(`[firewall] warning: ${String(e?.message || e).slice(0, 120)}`);
    return { ok: false, warning: String(e?.message || e) };
  }
}

/**
 * Перевіряє nginx + PHP-FPM на VPS; за потреби встановлює пакети (Ubuntu/Debian apt).
 */
export async function ensurePhpStackOnHost({
  deployHostIp,
  sshUser,
  sshPassword,
  sshPort = 22,
  onLog,
  installIfMissing = true,
}) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  const sshHost = String(deployHostIp || "").trim();
  const user = String(sshUser || "").trim();
  const pass = String(sshPassword || "");
  const port = Number(sshPort) || 22;

  if (!sshHost || !user || !pass) {
    return { ok: false, skipped: true, reason: "ssh_credentials_missing" };
  }

  const sp = sudoPrefix();
  const sockCmd =
    "ls /run/php/php*-fpm.sock 2>/dev/null | head -n 1 || ls /var/run/php/php*-fpm.sock 2>/dev/null | head -n 1";

  let socket = "";
  try {
    const { stdout } = await sshExecCommand(sshHost, user, pass, sockCmd, port, 30000);
    socket = detectSocketFromStdout(stdout);
  } catch {
    /* ще немає сокета */
  }

  let nginxOk = false;
  try {
    const nginxCheck = await sshExecCommand(
      sshHost,
      user,
      pass,
      "command -v nginx >/dev/null && echo nginx_ok || echo nginx_missing",
      port,
      30000
    );
    nginxOk = String(nginxCheck.stdout || "").includes("nginx_ok");
  } catch {
    nginxOk = false;
  }
  const phpOk = Boolean(socket);

  if (nginxOk && phpOk) {
    log(`[php-stack] OK: nginx + PHP-FPM (${socket})`);
    await ensureWebPortsOpenOnHost({
      deployHostIp: sshHost,
      sshUser: user,
      sshPassword: pass,
      sshPort: port,
      onLog: log,
    });
    return { ok: true, nginx: true, phpFpm: true, phpFpmSocket: socket, installed: false };
  }

  const shouldInstall = installIfMissing && phpAutoInstallEnabled();
  if (!shouldInstall) {
    const warning = !nginxOk
      ? "nginx not installed (set SUBDOMAIN_HOST_PHP_AUTO_INSTALL=1)"
      : "PHP-FPM socket not found";
    log(`[php-stack] ${warning}`);
    return {
      ok: false,
      nginx: nginxOk,
      phpFpm: phpOk,
      phpFpmSocket: socket,
      warning,
    };
  }

  log("[php-stack] Встановлення nginx + PHP-FPM (apt)…");
  const installScript = [
    "set -e",
    "export DEBIAN_FRONTEND=noninteractive",
    `${sp}apt-get update -qq`,
    `${sp}apt-get install -y nginx`,
    `(${sp}apt-get install -y php-fpm php-cli php-mbstring php-xml php-curl || ${sp}apt-get install -y php8.1-fpm php8.1-cli php8.1-mbstring php8.1-xml php8.1-curl)`,
    `${sp}systemctl enable nginx`,
    `${sp}systemctl start nginx || true`,
    `for u in $(systemctl list-unit-files 'php*-fpm.service' 2>/dev/null | awk '/php.*fpm\\.service/{print $1}'); do ${sp}systemctl enable "$u" || true; ${sp}systemctl start "$u" || true; done`,
    "test -f /etc/nginx/snippets/fastcgi-php.conf && echo fastcgi_snippet_ok || echo fastcgi_snippet_missing",
    sockCmd,
  ].join("\n");

  const installB64 = Buffer.from(installScript, "utf8").toString("base64");
  const { stdout: installOut } = await sshExecCommand(
    sshHost,
    user,
    pass,
    `echo ${shellSingleQuote(installB64)} | base64 -d | bash`,
    port,
    300000
  );

  socket = detectSocketFromStdout(installOut);
  if (!socket) {
    try {
      const { stdout } = await sshExecCommand(sshHost, user, pass, sockCmd, port, 30000);
      socket = detectSocketFromStdout(stdout);
    } catch {
      /* */
    }
  }

  const fromEnv = String(process.env.SUBDOMAIN_HOST_PHP_FPM_SOCKET || "").trim();
  if (!socket && fromEnv) {
    socket = fromEnv.startsWith("unix:") ? fromEnv : `unix:${fromEnv}`;
  }
  if (!socket) {
    socket = "unix:/run/php/php8.1-fpm.sock";
    log(`[php-stack] сокет не знайдено після apt — fallback ${socket}`);
  }

  const snippetOk = String(installOut || "").includes("fastcgi_snippet_ok");
  if (!snippetOk) {
    log("[php-stack] попередження: /etc/nginx/snippets/fastcgi-php.conf відсутній");
  }

  log(`[php-stack] готово: nginx + PHP-FPM (${socket})`);
  await ensureWebPortsOpenOnHost({
    deployHostIp: sshHost,
    sshUser: user,
    sshPassword: pass,
    sshPort: port,
    onLog: log,
  });
  return {
    ok: true,
    nginx: true,
    phpFpm: true,
    phpFpmSocket: socket,
    installed: true,
    fastcgiSnippet: snippetOk,
  };
}

function nginxAutoInstallEnabled() {
  const v = String(process.env.SUBDOMAIN_HOST_PHP_AUTO_INSTALL ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

async function detectNginxInstalled(sshHost, user, pass, port) {
  try {
    const nginxCheck = await sshExecCommand(
      sshHost,
      user,
      pass,
      "command -v nginx >/dev/null && echo nginx_ok || echo nginx_missing",
      port,
      30000
    );
    return String(nginxCheck.stdout || "").includes("nginx_ok");
  } catch {
    return false;
  }
}

/** Лише nginx (без PHP-FPM) — для SUBDOMAIN_HOST_NGINX_PHP=0. */
export async function ensureNginxOnHost({
  deployHostIp,
  sshUser,
  sshPassword,
  sshPort = 22,
  onLog,
  installIfMissing = true,
}) {
  const log = (msg) => {
    if (typeof onLog === "function") onLog(msg);
  };

  const sshHost = String(deployHostIp || "").trim();
  const user = String(sshUser || "").trim();
  const pass = String(sshPassword || "");
  const port = Number(sshPort) || 22;

  if (!sshHost || !user || !pass) {
    return { ok: false, skipped: true, reason: "ssh_credentials_missing" };
  }

  let nginxOk = await detectNginxInstalled(sshHost, user, pass, port);
  if (nginxOk) {
    log("[nginx-stack] OK: nginx already installed");
    await ensureWebPortsOpenOnHost({
      deployHostIp: sshHost,
      sshUser: user,
      sshPassword: pass,
      sshPort: port,
      onLog: log,
    });
    return { ok: true, nginx: true, installed: false };
  }

  const shouldInstall = installIfMissing && nginxAutoInstallEnabled();
  if (!shouldInstall) {
    const warning = "nginx not installed (set SUBDOMAIN_HOST_PHP_AUTO_INSTALL=1 or install nginx on host)";
    log(`[nginx-stack] ${warning}`);
    return { ok: false, nginx: false, warning };
  }

  log("[nginx-stack] Встановлення nginx (apt, без PHP)…");
  const sp = sudoPrefix();
  const installScript = [
    "set -e",
    "export DEBIAN_FRONTEND=noninteractive",
    `${sp}apt-get update -qq`,
    `${sp}apt-get install -y nginx`,
    `${sp}systemctl enable nginx`,
    `${sp}systemctl start nginx || true`,
    "command -v nginx >/dev/null && echo nginx_ok || echo nginx_missing",
  ].join("\n");
  const installB64 = Buffer.from(installScript, "utf8").toString("base64");
  const { stdout: installOut } = await sshExecCommand(
    sshHost,
    user,
    pass,
    `echo ${shellSingleQuote(installB64)} | base64 -d | bash`,
    port,
    300000
  );
  nginxOk = String(installOut || "").includes("nginx_ok");
  if (!nginxOk) {
    return { ok: false, nginx: false, warning: "nginx install finished but binary not found" };
  }
  log("[nginx-stack] готово: nginx");
  await ensureWebPortsOpenOnHost({
    deployHostIp: sshHost,
    sshUser: user,
    sshPassword: pass,
    sshPort: port,
    onLog: log,
  });
  return { ok: true, nginx: true, installed: true };
}

/** Права на дерево сайту (sudo find/chmod для /var/www). */
export async function fixRemoteTreePermissions({
  deployHostIp,
  sshUser,
  sshPassword,
  sshPort = 22,
  remoteProjectDir,
}) {
  const sshHost = String(deployHostIp || "").trim();
  const user = String(sshUser || "").trim();
  const pass = String(sshPassword || "");
  const root = String(remoteProjectDir || "").trim();
  if (!sshHost || !user || !pass || !root) {
    return { ok: false, skipped: true };
  }
  const sp = sudoPrefix();
  const cmd = [
    `${sp}find ${shellSingleQuote(root)} -type d -exec chmod 755 {} +`,
    `${sp}find ${shellSingleQuote(root)} -type f -exec chmod 644 {} +`,
    `test -f ${shellSingleQuote(`${root}/ssl/privkey.pem`)} && ${sp}chmod 600 ${shellSingleQuote(`${root}/ssl/privkey.pem`)} || true`,
  ].join(" && ");
  await sshExecCommand(sshHost, user, pass, cmd, Number(sshPort) || 22, 120000);
  return { ok: true };
}
