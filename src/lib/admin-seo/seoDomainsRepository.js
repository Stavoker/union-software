import SftpClient from "ssh2-sftp-client";

import { assertSafeHostForRemotePath } from "./hostProjectCleanup.js";
import { listActiveHostsWithCredentials } from "./hostsRepository.js";
import { getSupabaseServerClient } from "./supabaseServer.js";

const SKIP_DIR_NAMES = new Set(["html", "ssl", "cgi-bin", "logs", "tmp", ".well-known"]);

function guessRootDomain(host) {
  const parts = String(host || "").split(".").filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return null;
}

function parseDomainDirName(name) {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw || raw.startsWith(".") || SKIP_DIR_NAMES.has(raw)) {
    return null;
  }
  try {
    return assertSafeHostForRemotePath(raw);
  } catch {
    return null;
  }
}

/**
 * Список імен каталогів у projects_dir на SSH-сервері (кожен каталог = FQDN сайту).
 */
export async function listRemoteProjectHostsOnServer({
  sshHost,
  sshUser,
  sshPassword,
  sshPort = 22,
  projectsBaseDir = "/var/www",
}) {
  const host = String(sshHost || "").trim();
  const user = String(sshUser || "").trim();
  const password = String(sshPassword || "");
  const base = String(projectsBaseDir || "/var/www").trim().replace(/\/+$/, "") || "/var/www";

  if (!host || !user || !password) {
    const missing = [
      !host ? "host IP" : null,
      !user ? "SSH user" : null,
      !password ? "SSH password" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return { hosts: [], projectsBaseDir: base, warning: `SSH credentials incomplete (missing: ${missing})` };
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host,
      port: Number.isFinite(Number(sshPort)) && Number(sshPort) > 0 ? Number(sshPort) : 22,
      username: user,
      password,
      readyTimeout: 20000,
    });
    const exists = await sftp.exists(base);
    if (!exists) {
      return { hosts: [], projectsBaseDir: base, warning: `Projects dir not found: ${base}` };
    }
    const listing = await sftp.list(base);
    const hosts = [];
    for (const item of listing || []) {
      if (!item || item.type !== "d") {
        continue;
      }
      const domain = parseDomainDirName(item.name);
      if (domain) {
        hosts.push(domain);
      }
    }
    return { hosts: [...new Set(hosts)].sort(), projectsBaseDir: base, warning: null };
  } catch (e) {
    return {
      hosts: [],
      projectsBaseDir: base,
      warning: `SFTP list failed (${host}): ${e?.message || String(e)}`,
    };
  } finally {
    await sftp.end().catch(() => {});
  }
}

export async function upsertSeoDomainForUser(userId, host, extra = {}) {
  const uid = String(userId || "").trim();
  const normalized = assertSafeHostForRemotePath(host);
  if (!uid) {
    throw new Error("userId is required");
  }

  const supabase = getSupabaseServerClient();
  const row = {
    user_id: uid,
    host: normalized,
    root_domain: extra.rootDomain ? String(extra.rootDomain).trim().toLowerCase() : guessRootDomain(normalized),
    project_name: extra.projectName ? String(extra.projectName).trim() : null,
    updated_at: new Date().toISOString(),
  };
  if (extra.deployedAt) {
    row.deployed_at = extra.deployedAt;
  } else if (extra.setDeployedAt !== false) {
    row.deployed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("seo_domains").upsert(row, {
    onConflict: "user_id,host",
  });
  if (error) {
    throw new Error(error.message || "Failed to upsert seo_domains");
  }
  return row;
}

function buildLegacyHostTarget(integrationEnv = {}) {
  const env = integrationEnv || {};
  const hostIp = String(env.SUBDOMAIN_HOST_IP || "").trim();
  const sshUser = String(env.SUBDOMAIN_HOST_USER || "").trim();
  const sshPassword = String(env.SUBDOMAIN_HOST_PASSWORD || "");
  const sshPort = Number(env.SUBDOMAIN_HOST_PORT || 22) || 22;
  const projectsDir = String(env.SUBDOMAIN_HOST_PROJECTS_DIR || "").trim() || "/var/www";
  if (!hostIp || !sshUser || !sshPassword) {
    return null;
  }
  return {
    id: null,
    name: "Legacy env host",
    hostIp,
    sshUser,
    sshPassword,
    sshPort,
    projectsDir,
  };
}

/**
 * Для кожного SSH-хоста користувача (таблиця hosts + fallback SUBDOMAIN_HOST_*)
 * читає /var/www/* і upsert у seo_domains.
 */
export async function syncSeoDomainsFromUserHosts(userId, { integrationEnv } = {}) {
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("userId is required");
  }

  const servers = await listActiveHostsWithCredentials(uid);
  const legacy = buildLegacyHostTarget(integrationEnv);
  if (legacy && !servers.some((s) => s.hostIp === legacy.hostIp)) {
    servers.push(legacy);
  }

  if (!servers.length) {
    return {
      ok: false,
      servers: 0,
      discovered: 0,
      upserted: 0,
      hosts: [],
      warnings: ["No SSH hosts configured. Add a server in Settings → SSH hosts."],
    };
  }

  const allHosts = new Set();
  const warnings = [];

  for (const server of servers) {
    const listed = await listRemoteProjectHostsOnServer({
      sshHost: server.hostIp,
      sshUser: server.sshUser,
      sshPassword: server.sshPassword,
      sshPort: server.sshPort,
      projectsBaseDir: server.projectsDir || "/var/www",
    });
    if (listed.warning) {
      warnings.push(`${server.name || server.hostIp}: ${listed.warning}`);
    }
    for (const h of listed.hosts) {
      allHosts.add(h);
    }
  }

  let upserted = 0;
  for (const host of allHosts) {
    await upsertSeoDomainForUser(uid, host, { setDeployedAt: false });
    upserted += 1;
  }

  return {
    ok: true,
    servers: servers.length,
    discovered: allHosts.size,
    upserted,
    hosts: [...allHosts].sort(),
    warnings,
  };
}

export async function listSeoDomainsForUser(userId) {
  const uid = String(userId || "").trim();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("seo_domains")
    .select("host, root_domain, project_name, deployed_at, is_indexed, indexed_checked_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return data || [];
}
