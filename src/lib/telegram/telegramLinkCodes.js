import { createHash, randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer.js";

const CODE_TTL_MS = 15 * 60 * 1000;

function hashCode(code) {
  return createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

function generatePlainCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export async function createLinkCodeForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("userId required");
  const supabase = getSupabaseServerClient();
  const code = generatePlainCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await supabase.from("telegram_link_codes").delete().eq("user_id", uid).is("used_at", null);

  const { error } = await supabase.from("telegram_link_codes").insert({
    user_id: uid,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  return { code, expiresAt, expiresInSec: Math.floor(CODE_TTL_MS / 1000) };
}

export async function consumeLinkCode(code) {
  const plain = String(code || "").trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(plain)) {
    return { ok: false, reason: "invalid_format" };
  }
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("telegram_link_codes")
    .select("id,user_id,expires_at,used_at")
    .eq("code_hash", hashCode(plain))
    .is("used_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = rows?.[0];
  if (!row?.user_id) return { ok: false, reason: "not_found" };

  await supabase
    .from("telegram_link_codes")
    .update({ used_at: now })
    .eq("id", row.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,display_name,is_frozen")
    .eq("id", row.user_id)
    .maybeSingle();

  if (!profile) return { ok: false, reason: "profile_missing" };
  if (profile.is_frozen) return { ok: false, reason: "frozen" };

  return { ok: true, userId: row.user_id, email: profile.email || null };
}
