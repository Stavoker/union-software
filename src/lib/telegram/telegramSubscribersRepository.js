import { getSupabaseServerClient } from "@/lib/admin-seo/supabaseServer.js";
import { normalizeLocale } from "./telegramLocales.js";

export async function getSubscriberByChatId(chatId) {
  const cid = String(chatId ?? "").trim();
  if (!cid) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("telegram_subscribers")
    .select(
      "chat_id,user_id,username,first_name,locale,onboarding_state,is_active,created_at,updated_at"
    )
    .eq("chat_id", cid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertSubscriberRow(chatId, patch = {}) {
  const cid = String(chatId ?? "").trim();
  if (!cid) throw new Error("chatId required");
  const supabase = getSupabaseServerClient();
  const row = {
    chat_id: Number(cid),
    updated_at: new Date().toISOString(),
    ...patch,
  };
  const { data, error } = await supabase
    .from("telegram_subscribers")
    .upsert(row, { onConflict: "chat_id" })
    .select(
      "chat_id,user_id,username,first_name,locale,onboarding_state,is_active"
    )
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActiveChatIdsForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("telegram_subscribers")
    .select("chat_id,locale")
    .eq("user_id", uid)
    .eq("is_active", true)
    .eq("onboarding_state", "linked");
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    chatId: String(r.chat_id),
    locale: normalizeLocale(r.locale),
  }));
}

export async function linkSubscriberToUser(chatId, userId, locale) {
  return upsertSubscriberRow(chatId, {
    user_id: userId,
    locale: normalizeLocale(locale),
    onboarding_state: "linked",
    is_active: true,
    last_command: "linked",
  });
}

export async function deactivateSubscriber(chatId) {
  return upsertSubscriberRow(chatId, {
    is_active: false,
    last_command: "stop",
  });
}
