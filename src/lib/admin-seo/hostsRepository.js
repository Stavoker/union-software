import { getSupabaseServerClient } from "./supabaseServer.js";

function mapHostRow(row) {
  return {
    id: row?.id,
    name: String(row?.name || "").trim() || null,
    hostIp: String(row?.host_ip || "").trim() || null,
    sshUser: String(row?.ssh_user || "").trim() || null,
    sshPassword: String(row?.ssh_password || ""),
    sshPort: Number(row?.ssh_port || 22),
    isActive: row?.is_active !== false,
  };
}

export async function listActiveHosts() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("hosts")
    .select("id,name,host_ip,ssh_user,ssh_port,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(error.message || "Failed to load hosts");
  }
  return (data || []).map((row) => mapHostRow(row));
}

export async function getHostById(hostId) {
  const id = String(hostId || "").trim();
  if (!id) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("hosts")
    .select("id,name,host_ip,ssh_user,ssh_password,ssh_port,is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Failed to resolve selected host");
  }
  if (!data || data.is_active === false) {
    return null;
  }
  return mapHostRow(data);
}
