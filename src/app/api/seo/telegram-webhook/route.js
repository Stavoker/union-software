import { NextResponse } from "next/server";
import {
  deleteAllTrackedBotMessagesForChat,
  sendTelegramWebhookReply,
} from "@/lib/admin-seo/telegramBotMessages";

export const dynamic = "force-dynamic";

function telegramWebhookAuthorized(request) {
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!secret) return false;
  const got = request.headers.get("x-telegram-bot-api-secret-token") || "";
  return got === secret;
}

/**
 * В группах с несколькими ботами нужны /delete@YourBot и TELEGRAM_BOT_USERNAME.
 */
function matchesDeleteCommand(text, botUsername, chatType) {
  const raw = String(text || "").trim();
  const first = raw.split(/\s+/)[0]?.toLowerCase() || "";
  if (!first.startsWith("/delete")) return false;

  const uname = String(botUsername || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  const inGroup =
    chatType === "group" || chatType === "supergroup" || chatType === "channel";

  if (inGroup) {
    if (!uname) return false;
    return first === `/delete@${uname}`;
  }

  if (uname && first.includes("@")) {
    return first === `/delete@${uname}`;
  }
  return first === "/delete" || (first.startsWith("/delete@") && !uname);
}

export async function POST(request) {
  if (!telegramWebhookAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const msg = update?.message || update?.edited_message;
  const chatId = msg?.chat?.id;
  if (msg?.text == null || chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }

  const chatType = String(msg.chat?.type || "private");
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";

  if (!matchesDeleteCommand(msg.text, botUsername, chatType)) {
    return NextResponse.json({ ok: true });
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.info(`[telegram-webhook][${runId}] /delete for chat=${chatId} type=${chatType}`);

  void (async () => {
    try {
      const r = await deleteAllTrackedBotMessagesForChat(chatId, chatType);
      let text;
      if (r.reason === "no_rows") {
        text =
          "Записей сообщений бота для этого чата нет. Удаляются только сообщения, которые бот сохранил в журнале. Сообщения пользователя или старые без записи бот не может убрать через API Telegram.";
      } else if (!r.ok) {
        text = `Не удалось: ${r.reason || "неизвестная ошибка"}`;
      } else {
        text = `Удалено в Telegram: ${r.deletedTelegram}. Записей из журнала удалено: ${r.deletedRows}.`;
        if (r.truncated) {
          text +=
            "\n⚠️ Достигнут лимит за один вызов (TELEGRAM_DELETE_COMMAND_MAX_MESSAGES). Если сообщения остались — отправьте /delete ещё раз.";
        }
      }
      await sendTelegramWebhookReply(chatId, text);
    } catch (e) {
      console.error(`[telegram-webhook][${runId}]`, e);
      await sendTelegramWebhookReply(chatId, `Ошибка: ${e?.message || String(e)}`).catch(() => {});
    }
  })();

  return NextResponse.json({ ok: true });
}
