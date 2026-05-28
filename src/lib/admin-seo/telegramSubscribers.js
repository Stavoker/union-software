import { getSupabaseServerClient } from "./supabaseServer.js";
import { getActiveChatIdsForUser } from "@/lib/telegram/telegramSubscribersRepository.js";

/**
 * Активні chat_id для конкретного користувача (привʼязка через бота).
 */
export async function getTelegramChatIdsForUser(userId) {
  try {
    const list = await getActiveChatIdsForUser(userId);
    return { ok: true, chatIds: list.map((r) => r.chatId) };
  } catch (e) {
    return { ok: false, chatIds: [], dbError: e?.message || String(e) };
  }
}

/**
 * @deprecated Глобальна розсилка — лише fallback, якщо userId не передано.
 */
export async function getActiveTelegramSubscriberChatIds() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("telegram_subscribers")
      .select("chat_id")
      .eq("is_active", true)
      .not("user_id", "is", null);

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
