import { NextResponse } from "next/server";
import { getActiveTelegramSubscriberChatIds } from "@/lib/admin-seo/telegramSubscribers";
import { recordTelegramBotMessage } from "@/lib/admin-seo/telegramBotMessages";

export const dynamic = "force-dynamic";

const TG_API = "https://api.telegram.org";

function nowIso() {
  return new Date().toISOString();
}

function logEntry(level, message, meta = null) {
  const row = { at: nowIso(), level, message, ...(meta ? { meta } : {}) };
  const line = `[${row.at}] [${level.toUpperCase()}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`;
  console.log(line);
  return row;
}

function buildTestMessage({ recipientCount, dryRun }) {
  const lines = [];
  lines.push("🧪 Тест админ-панели (автоматизация доменов)");
  lines.push("");
  lines.push(`📋 Получателей в рассылке: ${recipientCount}`);
  lines.push(dryRun ? "⚡ Режим: dry-run (сообщение не отправлялось)." : "📡 Режим: отправка в Telegram.");
  lines.push("");
  lines.push("✅ Если вы видите это сообщение — бот и получатели настроены верно.");
  lines.push("");
  lines.push(`🕐 Время (UTC): ${nowIso()}`);
  lines.push("");
  lines.push("🧩 Spaceship API: https://spaceship.dev/api/v1");
  lines.push("🧩 Zomro API: https://api.zomro.com/");
  return lines.join("\n");
}

async function telegramSendMessage(token, chatId, text) {
  const url = `${TG_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && !!payload?.ok, status: res.status, payload };
}

async function runTest({ dryRun }) {
  const logs = [];

  logs.push(logEntry("info", "Старт теста Telegram"));

  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    logs.push(logEntry("error", "TELEGRAM_BOT_TOKEN не задан в .env.local"));
    return { ok: false, logs, dryRun };
  }
  logs.push(logEntry("info", "TELEGRAM_BOT_TOKEN найден", { length: token.length }));

  const fromDb = await getActiveTelegramSubscriberChatIds();
  const envChat = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  const merged = new Set([...(fromDb.chatIds || []), ...(envChat ? [envChat] : [])]);
  const chatIds = [...merged];

  logs.push(
    logEntry("info", "Загрузка получателей", {
      supabaseOk: fromDb.ok,
      fromDbCount: fromDb.chatIds?.length ?? 0,
      envChatSet: !!envChat,
      totalRecipients: chatIds.length,
      dbError: fromDb.dbError || null,
    })
  );

  if (!chatIds.length) {
    logs.push(
      logEntry("error", "Нет получателей: пустая telegram_subscribers (is_active) и нет TELEGRAM_CHAT_ID")
    );
    return { ok: false, logs, dryRun, recipients: [] };
  }

  const text = buildTestMessage({ recipientCount: chatIds.length, dryRun });

  if (dryRun) {
    logs.push(logEntry("warn", "Dry-run: пропускаем sendMessage", { previewChars: text.length }));
    return { ok: true, logs, dryRun, recipients: chatIds.map((id) => ({ chatId: id, skipped: true })) };
  }

  const recipients = [];
  for (const chatId of chatIds) {
    logs.push(logEntry("info", "Отправка в chat", { chatId }));
    const send = await telegramSendMessage(token, chatId, text);
    if (send.ok) {
      const mid = send.payload?.result?.message_id;
      logs.push(
        logEntry("info", "sendMessage OK", {
          chatId,
          telegramMessageId: mid,
        })
      );
      recordTelegramBotMessage(chatId, mid).catch(() => {});
      recipients.push({ chatId, ok: true, messageId: mid });
    } else {
      logs.push(
        logEntry("error", "sendMessage failed", {
          chatId,
          httpStatus: send.status,
          description: send.payload?.description,
        })
      );
      recipients.push({ chatId, ok: false, error: send.payload?.description || `HTTP ${send.status}` });
    }
  }

  const allOk = recipients.every((r) => r.ok);
  logs.push(logEntry(allOk ? "info" : "warn", "Тест завершён", { allOk, sent: recipients.filter((r) => r.ok).length }));

  return { ok: allOk, logs, dryRun, recipients };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dry") === "1" || searchParams.get("dry") === "true";

  try {
    const result = await runTest({ dryRun });
    return NextResponse.json(
      {
        ok: result.ok,
        dryRun: result.dryRun,
        logs: result.logs,
        recipients: result.recipients ?? [],
        hint: dryRun
          ? "Убери ?dry=1 чтобы реально отправить сообщение."
          : "Добавь ?dry=1 чтобы проверить конфиг без отправки.",
      },
      { status: result.ok ? 200 : 422 }
    );
  } catch (e) {
    const errLog = logEntry("error", "Исключение при тесте", { message: e?.message });
    return NextResponse.json(
      {
        ok: false,
        logs: [errLog],
        details: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let dryRun = false;
  try {
    const body = await request.json().catch(() => ({}));
    dryRun = !!body?.dryRun;
  } catch {
    dryRun = false;
  }
  try {
    const result = await runTest({ dryRun });
    return NextResponse.json(
      {
        ok: result.ok,
        dryRun: result.dryRun,
        logs: result.logs,
        recipients: result.recipients ?? [],
      },
      { status: result.ok ? 200 : 422 }
    );
  } catch (e) {
    const errLog = logEntry("error", "Исключение при тесте", { message: e?.message });
    return NextResponse.json({ ok: false, logs: [errLog], details: e?.message || String(e) }, { status: 500 });
  }
}
