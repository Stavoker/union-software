import SftpClient from "ssh2-sftp-client";

/**
 * Дозволені символи для FQDN піддомена (без шляхових трюків).
 * @param {string} host
 */
export function assertSafeHostForRemotePath(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h || h.length > 200) {
    throw new Error("Invalid host");
  }
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/.test(h)) {
    throw new Error("Invalid host format");
  }
  if (h.includes("..") || h.startsWith(".") || h.endsWith(".")) {
    throw new Error("Invalid host");
  }
  return h;
}

/**
 * Видаляє каталог проєкту на хості через SFTP (без змін у Supabase).
 * @param {string} host нормалізований FQDN (піддомен.корінь)
 * @returns {Promise<{ hostRemoved: boolean, hostWarning: string | null }>}
 */
export async function removeHostProjectDirectory(host) {
  const normalized = assertSafeHostForRemotePath(host);
  const sshHost = String(process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const projectsBaseDir =
    String(process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";

  if (!sshHost || !sshUser || !sshPassword) {
    return {
      hostRemoved: false,
      hostWarning: "Host credentials are not configured in env",
    };
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: sshHost,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 15000,
    });
    const remoteProjectDir = `${projectsBaseDir.replace(/\/+$/, "")}/${normalized}`;
    const exists = await sftp.exists(remoteProjectDir);
    if (exists) {
      await sftp.rmdir(remoteProjectDir, true);
      return { hostRemoved: true, hostWarning: null };
    }
    return {
      hostRemoved: false,
      hostWarning: `Project dir not found on host: ${remoteProjectDir}`,
    };
  } catch (error) {
    return {
      hostRemoved: false,
      hostWarning: `Host cleanup failed: ${error?.message || "unknown error"}`,
    };
  } finally {
    await sftp.end().catch(() => {});
  }
}

/**
 * Створює каталог проєкту на хості через SFTP.
 * @param {string} host нормалізований FQDN (піддомен.корінь)
 * @returns {Promise<{ hostCreated: boolean, hostWarning: string | null, remoteProjectDir: string | null }>}
 */
export async function createHostProjectDirectory(host, options = {}) {
  const normalized = assertSafeHostForRemotePath(host);
  const sshHost = String(options?.sshHost || process.env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(options?.sshUser || process.env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(options?.sshPassword || process.env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(options?.sshPort || process.env.SUBDOMAIN_HOST_PORT || 22);
  const projectsBaseDir = String(process.env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";

  if (!sshHost || !sshUser || !sshPassword) {
    return {
      hostCreated: false,
      hostWarning: "Host credentials are not configured in env",
      remoteProjectDir: null,
    };
  }

  const sftp = new SftpClient();
  const remoteProjectDir = `${projectsBaseDir.replace(/\/+$/, "")}/${normalized}`;
  try {
    await sftp.connect({
      host: sshHost,
      port: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
      username: sshUser,
      password: sshPassword,
      readyTimeout: 15000,
    });
    const exists = await sftp.exists(remoteProjectDir);
    if (!exists) {
      await sftp.mkdir(remoteProjectDir, true);
    }
    return { hostCreated: true, hostWarning: null, remoteProjectDir };
  } catch (error) {
    return {
      hostCreated: false,
      hostWarning: `Host mkdir failed: ${error?.message || "unknown error"}`,
      remoteProjectDir,
    };
  } finally {
    await sftp.end().catch(() => {});
  }
}
