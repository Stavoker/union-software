import { recordTelegramBotMessage } from "@/lib/admin-seo/telegramBotMessages";

const TG_API = "https://api.telegram.org";

export function getTelegramBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export async function telegramSendMessage(chatId, text, extra = {}) {
  const token = getTelegramBotToken();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN missing" };
  }
  const url = `${TG_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || "").slice(0, 4000),
      disable_web_page_preview: true,
      ...extra,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    return { ok: false, error: payload?.description || `HTTP ${res.status}` };
  }
  const messageId = payload?.result?.message_id;
  if (messageId != null) {
    recordTelegramBotMessage(chatId, messageId).catch(() => {});
  }
  return { ok: true, messageId };
}

export async function telegramAnswerCallbackQuery(callbackQueryId, text = "") {
  const token = getTelegramBotToken();
  if (!token || !callbackQueryId) return { ok: false };
  const url = `${TG_API}/bot${token}/answerCallbackQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: String(text || "").slice(0, 200),
      show_alert: false,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && !!payload?.ok };
}

export function languageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🇺🇦 UA", callback_data: "lang:uk" },
        { text: "🇬🇧 Eng", callback_data: "lang:en" },
        { text: "🇷🇺 Ru", callback_data: "lang:ru" },
      ],
    ],
  };
}
