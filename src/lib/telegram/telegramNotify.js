import { eventText, normalizeLocale } from "./telegramLocales.js";
import { getActiveChatIdsForUser } from "./telegramSubscribersRepository.js";
import { telegramSendMessage } from "./telegramApi.js";

/**
 * Надіслати коротке сповіщення всім привʼязаним Telegram-чатам користувача.
 * @param {string} userId profiles.id
 * @param {string} eventKey ключ з telegramLocales EVENTS
 * @param {Record<string, unknown>} data
 */
export async function notifyUserTelegram(userId, eventKey, data = {}) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { skipped: true, reason: "no_user_id" };
  }

  const recipients = await getActiveChatIdsForUser(uid);
  if (!recipients.length) {
    return { skipped: true, reason: "no_linked_telegram", userId: uid };
  }

  const results = [];
  for (const { chatId, locale } of recipients) {
    const loc = normalizeLocale(locale);
    const text = eventText(loc, eventKey, data);
    if (!text) continue;
    try {
      const sent = await telegramSendMessage(chatId, text);
      results.push({ chatId, ok: sent.ok, error: sent.error || null });
    } catch (e) {
      results.push({ chatId, ok: false, error: e?.message || String(e) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  return {
    skipped: false,
    userId: uid,
    eventKey,
    recipientCount: recipients.length,
    results,
    partialFailure: failed.length > 0,
  };
}

/** Повідомлення одному chat (бот-відповіді). */
export async function notifyChatTelegram(chatId, locale, eventKey, data = {}) {
  const text = eventText(normalizeLocale(locale), eventKey, data);
  if (!text) return { ok: false };
  return telegramSendMessage(chatId, text);
}
