import {
  getSubscriberByChatId,
  linkSubscriberToUser,
  upsertSubscriberRow,
  deactivateSubscriber,
} from "./telegramSubscribersRepository.js";
import { consumeLinkCode } from "./telegramLinkCodes.js";
import { botText, normalizeLocale } from "./telegramLocales.js";
import {
  languageKeyboard,
  telegramAnswerCallbackQuery,
  telegramSendMessage,
} from "./telegramApi.js";

function extractMessage(update) {
  return update?.message || update?.edited_message || null;
}

function extractCallback(update) {
  return update?.callback_query || null;
}

export async function handleTelegramUpdate(update) {
  const cb = extractCallback(update);
  if (cb?.data?.startsWith("lang:")) {
    const chatId = cb.message?.chat?.id;
    const locale = normalizeLocale(cb.data.split(":")[1]);
    await telegramAnswerCallbackQuery(cb.id);
    if (chatId == null) return { ok: true };

    const existing = await getSubscriberByChatId(chatId).catch(() => null);
    const alreadyLinked =
      existing?.onboarding_state === "linked" && Boolean(existing?.user_id);

    await upsertSubscriberRow(chatId, {
      username: cb.from?.username || null,
      first_name: cb.from?.first_name || null,
      locale,
      onboarding_state: alreadyLinked ? "linked" : "await_code",
      is_active: true,
      last_command: "lang",
      ...(alreadyLinked ? { user_id: existing.user_id } : {}),
    });

    if (alreadyLinked) {
      await telegramSendMessage(chatId, botText(locale, "languageUpdated"));
      return { ok: true };
    }
    await telegramSendMessage(chatId, botText(locale, "awaitCode"));
    return { ok: true };
  }

  const msg = extractMessage(update);
  if (!msg?.chat?.id) return { ok: true };

  const chatId = msg.chat.id;
  const text = String(msg.text || "").trim();
  const chatType = String(msg.chat?.type || "private");
  if (chatType !== "private") {
    return { ok: true };
  }

  const from = msg.from || {};
  let sub = await getSubscriberByChatId(chatId).catch(() => null);

  if (text.startsWith("/start")) {
    await upsertSubscriberRow(chatId, {
      username: from.username || null,
      first_name: from.first_name || null,
      onboarding_state: "choose_lang",
      is_active: true,
      last_command: "start",
    });
    const locale = normalizeLocale(sub?.locale);
    if (sub?.user_id && sub?.onboarding_state === "linked") {
      await telegramSendMessage(chatId, botText(locale, "alreadyLinked"), {
        reply_markup: languageKeyboard(),
      });
      return { ok: true };
    }
    await telegramSendMessage(chatId, botText(locale, "welcome"), {
      reply_markup: languageKeyboard(),
    });
    return { ok: true };
  }

  if (text.startsWith("/stop")) {
    await deactivateSubscriber(chatId);
    const locale = normalizeLocale(sub?.locale);
    await telegramSendMessage(chatId, botText(locale, "stopped"));
    return { ok: true };
  }

  if (text.startsWith("/help")) {
    const locale = normalizeLocale(sub?.locale);
    await telegramSendMessage(chatId, botText(locale, "help"));
    return { ok: true };
  }

  sub = sub || (await getSubscriberByChatId(chatId).catch(() => null));
  const locale = normalizeLocale(sub?.locale);

  if (sub?.onboarding_state === "linked" && sub?.user_id) {
    return { ok: true };
  }

  if (sub?.onboarding_state === "await_code" || !sub?.user_id) {
    const code = text.replace(/\s/g, "").toUpperCase();
    const linked = await consumeLinkCode(code);
    if (!linked.ok) {
      await telegramSendMessage(chatId, botText(locale, "badCode"));
      return { ok: true };
    }
    await linkSubscriberToUser(chatId, linked.userId, locale);
    await telegramSendMessage(chatId, botText(locale, "linked", linked.email));
    return { ok: true };
  }

  if (!sub || sub.onboarding_state === "choose_lang") {
    await telegramSendMessage(chatId, botText(locale, "welcome"), {
      reply_markup: languageKeyboard(),
    });
    return { ok: true };
  }

  return { ok: true };
}
