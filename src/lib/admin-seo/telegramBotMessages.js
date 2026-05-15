import { getSupabaseServerClient } from "./supabaseServer.js";

const TG_API = "https://api.telegram.org";

/** Скільки годин зберігаємо повідомлення в чаті/таблиці; при cleanup видаляються старіші записи і самі повідомлення в Telegram. */
function maxRetentionHours() {
  const raw = Number(process.env.TELEGRAM_BOT_MESSAGES_MAX_AGE_HOURS ?? 3);
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

function batchLimit() {
  const raw = Number(process.env.TELEGRAM_BOT_MESSAGES_CLEANUP_BATCH ?? 200);
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 500) : 200;
}

/**
 * Записати відправлене ботом повідомлення для подальшого deleteMessage.
 * chat_id у Telegram може бути великим — у БД bigint, у JS передаємо як рядок/число для supabase-js.
 */
export async function recordTelegramBotMessage(chatId, messageId) {
  const cid = chatId != null ? String(chatId).trim() : "";
  const mid = Number(messageId);
  if (!cid || !Number.isFinite(mid)) return { ok: false, skipped: true };

  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("telegram_bot_messages").upsert(
      {
        chat_id: cid,
        message_id: mid,
        created_at: new Date().toISOString(),
      },
      { onConflict: "chat_id,message_id" }
    );
    if (error) {
      console.warn("[telegram_bot_messages] upsert failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[telegram_bot_messages] upsert error:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

async function telegramDeleteMessage(token, chatId, messageId) {
  const url = `${TG_API}/bot${token}/deleteMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && !!payload?.ok, payload };
}

/** Де підтримується Telegram: супергрупи / канали, до 100 id за один запит. */
async function telegramDeleteMessagesBulk(token, chatId, messageIds) {
  if (!messageIds?.length) return { ok: true, skipped: true };
  const url = `${TG_API}/bot${token}/deleteMessages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_ids: messageIds,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && !!payload?.ok, payload };
}

/**
 * Видалити в Telegram усі повідомлення цього бота в чаті, що записані у `telegram_bot_messages`.
 * Інших повідомлень і чужих текстів бот «не бачить» через API Telegram.
 */
export async function deleteAllTrackedBotMessagesForChat(chatId, chatType = "private") {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const cidRaw = chatId != null ? String(chatId).trim() : "";
  if (!token || !cidRaw) {
    return { ok: false, deletedTelegram: 0, deletedRows: 0, reason: "missing token or chat_id" };
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return { ok: false, deletedTelegram: 0, deletedRows: 0, reason: e?.message || String(e) };
  }

  const maxRaw = Number(process.env.TELEGRAM_DELETE_COMMAND_MAX_MESSAGES ?? 2000);
  const maxDeletes = Number.isFinite(maxRaw) && maxRaw >= 1 ? Math.min(Math.floor(maxRaw), 5000) : 2000;

  const useBulkFirst =
    chatType === "channel" ||
    chatType === "supergroup" ||
    (chatType === "group" &&
      String(process.env.TELEGRAM_DELETE_TRY_BULK_IN_GROUPS || "").trim() === "1");

  const { data: rows, error: selErr } = await supabase
    .from("telegram_bot_messages")
    .select("message_id")
    .eq("chat_id", cidRaw)
    .order("created_at", { ascending: true })
    .limit(maxDeletes);

  if (selErr) {
    return { ok: false, deletedTelegram: 0, deletedRows: 0, reason: selErr.message };
  }

  const ids = (Array.isArray(rows) ? rows : [])
    .map((r) => Number(r?.message_id))
    .filter((n) => Number.isFinite(n));

  if (!ids.length) {
    return { ok: true, deletedTelegram: 0, deletedRows: 0, reason: "no_rows" };
  }

  let deletedTelegram = 0;
  const removeRow = async (messageId) => {
    await supabase.from("telegram_bot_messages").delete().eq("chat_id", cidRaw).eq("message_id", messageId);
  };

  if (useBulkFirst) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const bulk = await telegramDeleteMessagesBulk(token, cidRaw, chunk);
      if (bulk.ok) {
        deletedTelegram += chunk.length;
        for (const mid of chunk) {
          await removeRow(mid);
        }
      } else {
        for (const mid of chunk) {
          const one = await telegramDeleteMessage(token, cidRaw, mid);
          if (one.ok) deletedTelegram += 1;
          await removeRow(mid);
          await new Promise((r) => setTimeout(r, 35));
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  } else {
    for (const mid of ids) {
      const one = await telegramDeleteMessage(token, cidRaw, mid);
      if (one.ok) deletedTelegram += 1;
      await removeRow(mid);
      await new Promise((r) => setTimeout(r, 35));
    }
  }

  return { ok: true, deletedTelegram, deletedRows: ids.length, truncated: ids.length >= maxDeletes };
}

export async function sendTelegramWebhookReply(chatId, text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false };
  const url = `${TG_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text || "").slice(0, 3500),
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok && !!payload?.ok, payload };
}

/**
 * Видаляє в Telegram повідомлення старші за maxRetentionHours() і відповідні рядки в БД.
 * Викликати з cron кожні ~3 год (Render Scheduled Job) з секретом у заголовку.
 */
export async function cleanupTelegramBotMessages() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const hours = maxRetentionHours();
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const limit = batchLimit();

  if (!token) {
    return { ok: false, skipped: true, reason: "TELEGRAM_BOT_TOKEN missing", deletedRows: 0, telegramDeletes: 0 };
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (e) {
    return { ok: false, reason: "Supabase unavailable", deletedRows: 0, telegramDeletes: 0, error: e?.message };
  }

  const { data: rows, error: selErr } = await supabase
    .from("telegram_bot_messages")
    .select("chat_id, message_id")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selErr) {
    return { ok: false, reason: selErr.message, deletedRows: 0, telegramDeletes: 0 };
  }

  const list = Array.isArray(rows) ? rows : [];
  let telegramDeletes = 0;
  let deletedRows = 0;

  for (const row of list) {
    const chatId = row?.chat_id;
    const messageId = row?.message_id;
    if (chatId == null || messageId == null) continue;

    const tg = await telegramDeleteMessage(token, chatId, messageId);
    if (tg.ok) telegramDeletes += 1;

    const { error: delErr } = await supabase
      .from("telegram_bot_messages")
      .delete()
      .eq("chat_id", chatId)
      .eq("message_id", messageId);
    if (!delErr) deletedRows += 1;
    await new Promise((r) => setTimeout(r, 35));
  }

  return {
    ok: true,
    cutoffIso: cutoff,
    maxRetentionHours: hours,
    batchSize: list.length,
    telegramDeletesOk: telegramDeletes,
    rowsRemoved: deletedRows,
  };
}
