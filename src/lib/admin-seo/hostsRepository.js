import { getSupabaseServerClient } from "./supabaseServer.js";

function normalizeProjectsDir(value) {
  const s = String(value || "").trim().replace(/\/+$/, "");
  return s || null;
}

function mapHostRow(row) {
  return {
    id: row?.id,
    name: String(row?.name || "").trim() || null,
    hostIp: String(row?.host_ip || "").trim() || null,
    sshUser: String(row?.ssh_user || "").trim() || null,
    sshPassword: String(row?.ssh_password || ""),
    sshPort: Number(row?.ssh_port || 22),
    projectsDir: normalizeProjectsDir(row?.projects_dir),
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function requireUserId(userId) {
  const id = String(userId || "").trim();
  if (!id) {
    throw new Error("userId is required");
  }
  return id;
}

const HOST_PUBLIC_COLUMNS =
  "id,name,host_ip,ssh_user,ssh_port,projects_dir,is_active,created_at,updated_at";
const HOST_INTERNAL_COLUMNS = `${HOST_PUBLIC_COLUMNS},ssh_password`;

/** Для UI/API — без пароля в відповіді. */
export async function listActiveHosts(userId) {
  const uid = requireUserId(userId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("hosts")
    .select(`${HOST_PUBLIC_COLUMNS},ssh_password`)
    .eq("user_id", uid)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(error.message || "Failed to load hosts");
  }
  return (data || []).map((row) => {
    const mapped = mapHostRow(row);
    return {
      id: mapped.id,
      name: mapped.name,
      hostIp: mapped.hostIp,
      sshUser: mapped.sshUser,
      sshPort: mapped.sshPort,
      projectsDir: mapped.projectsDir,
      isActive: mapped.isActive,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
      hasPassword: !!String(row?.ssh_password || "").trim(),
    };
  });
}

/** Для серверного SFTP (domain automation, seo sync) — з паролем. */
export async function listActiveHostsWithCredentials(userId) {
  const uid = requireUserId(userId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("hosts")
    .select(HOST_INTERNAL_COLUMNS)
    .eq("user_id", uid)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(error.message || "Failed to load hosts");
  }
  return (data || []).map((row) => mapHostRow(row));
}

export async function getHostById(hostId, userId) {
  const id = String(hostId || "").trim();
  if (!id) return null;
  const uid = requireUserId(userId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("hosts")
    .select("id,name,host_ip,ssh_user,ssh_password,ssh_port,projects_dir,is_active,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Failed to resolve selected host");
  }
  if (!data || data.is_active === false) {
    return null;
  }
  return mapHostRow(data);
}

async function resolveAvailableHostName(supabase, userId, preferredName) {
  const base = String(preferredName || "").trim() || "Server";
  let candidate = base;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { data, error } = await supabase
      .from("hosts")
      .select("id")
      .eq("user_id", userId)
      .eq("name", candidate)
      .maybeSingle();
    if (error) {
      throw new Error(error.message || "Failed to validate host name");
    }
    if (!data) return candidate;
    candidate = `${base} (${attempt + 2})`;
  }
  return `${base}-${Date.now()}`;
}

export async function createUserHost(userId, payload = {}) {
  const uid = requireUserId(userId);
  const hostIp = String(payload?.hostIp || payload?.host_ip || "").trim();
  const sshUser = String(payload?.sshUser || payload?.ssh_user || "").trim();
  const sshPassword = String(payload?.sshPassword || payload?.ssh_password || "");
  const sshPort = Number(payload?.sshPort || payload?.ssh_port || 22) || 22;
  const preferredName = String(payload?.name || "").trim() || hostIp || "Server";
  const projectsDir = normalizeProjectsDir(payload?.projectsDir ?? payload?.projects_dir);

  if (!hostIp || !sshUser || !sshPassword) {
    throw new Error("hostIp, sshUser and sshPassword are required");
  }

  const supabase = getSupabaseServerClient();
  const name = await resolveAvailableHostName(supabase, uid, preferredName);
  const { data, error } = await supabase
    .from("hosts")
    .insert({
      user_id: uid,
      name,
      host_ip: hostIp,
      ssh_user: sshUser,
      ssh_password: sshPassword,
      ssh_port: sshPort,
      projects_dir: projectsDir,
      is_active: true,
    })
    .select("id,name,host_ip,ssh_user,ssh_port,projects_dir,is_active,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create host");
  }
  return mapHostRow(data);
}

export async function deleteUserHost(userId, hostId) {
  const uid = requireUserId(userId);
  const id = String(hostId || "").trim();
  if (!id) {
    throw new Error("hostId is required");
  }
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("hosts")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);
  if (error) {
    throw new Error(error.message || "Failed to delete host");
  }
}
