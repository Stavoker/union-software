import { getSupabaseServerClient } from "./supabaseServer.js";

/**
 * Активні отримувачі з public.telegram_subscribers (is_active = true).
 */
export async function getActiveTelegramSubscriberChatIds() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("telegram_subscribers")
      .select("chat_id")
      .eq("is_active", true);

    if (error) {
      return { ok: false, chatIds: [], dbError: error.message };
    }

    const raw = (data || []).map((row) => row?.chat_id).filter((id) => id != null && id !== "");
    const unique = [...new Set(raw.map((id) => String(id).trim()))];

    return { ok: true, chatIds: unique };
  } catch (e) {
    return { ok: false, chatIds: [], dbError: e?.message || String(e) };
  }
}
