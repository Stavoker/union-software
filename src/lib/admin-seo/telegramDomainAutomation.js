import { getActiveTelegramSubscriberChatIds } from "./telegramSubscribers.js";
import { recordTelegramBotMessage } from "./telegramBotMessages.js";

const TG_API = "https://api.telegram.org";
const TG_MAX = 4000;

function splitTelegramText(text) {
  const s = String(text || "");
  if (s.length <= TG_MAX) {
    return [s];
  }
  const parts = [];
  for (let i = 0; i < s.length; i += TG_MAX) {
    parts.push(s.slice(i, i + TG_MAX));
  }
  return parts.map((chunk, idx, arr) =>
    arr.length > 1 ? `[${idx + 1}/${arr.length}]\n${chunk}` : chunk
  );
}

const STEP_TITLE_RU = {
  "zomro-auth-resolve": "Авторизация Zomro",
  "spaceship-availability": "Проверка доступности домена (Spaceship)",
  "spaceship-purchase": "Покупка домена (Spaceship)",
  "spaceship-nameservers": "Смена NS (Spaceship)",
  "spaceship-ssl-letsencrypt-dns01": "SSL Let's Encrypt (DNS-01)",
  "zomro-zone": "Создание DNS-зоны (Zomro)",
  "zomro-record": "DNS A-запись (Zomro)",
  "zomro-dnsmgr-panel-domain": "Панель Zomro (dnsmgr): domain.edit (master)",
  "host-project-dir-create": "Хост: создание папки проекта",
  "host-nginx-ssl-deploy": "Хост: nginx + SSL (PEM на сервер)",
  "zomro-vps-pricelist": "VPS: список тарифов (Zomro)",
  "zomro-vps-order-param": "VPS: параметры заказа (Zomro)",
  "zomro-vps-cart-add": "VPS: добавление в корзину (Zomro)",
  "zomro-vps-promocode": "VPS: промокод (Zomro)",
  "zomro-vps-confirm": "VPS: подтверждение заказа (Zomro)",
};

function stepTitleRu(id) {
  return STEP_TITLE_RU[id] || id || "шаг";
}

function stepTitleForStep(step) {
  if (step?.id === "spaceship-ssl-letsencrypt-dns01" && step?.provider === "zomro-dnsmgr") {
    return "SSL Let's Encrypt (DNS-01, Zomro dnsmgr)";
  }
  return stepTitleRu(step?.id);
}

function findStep(steps, id) {
  const list = Array.isArray(steps) ? steps : [];
  return list.find((s) => s?.id === id) || null;
}

function boolIcon(ok) {
  return ok ? "✅" : "❌";
}

function stepIcon(step) {
  return step?.pending ? "⏳" : boolIcon(!!step?.ok);
}

/** Сообщение 1 — старт (как 🚀 на скрине). */
function buildMessageStart({ requestSummary, result }) {
  const lines = [];
  lines.push("🚀 Старт автоматизации домена");
  lines.push("");
  lines.push("🧩 Spaceship API: https://spaceship.dev/api/v1");
  lines.push("🧩 Zomro API: https://api.zomro.com/ (зона, A, VPS)");
  if (requestSummary?.zomroDnsmgrEnabled) {
    lines.push(
      "🧩 Zomro панель dnsmgr (ZOMRO_DNSMGR_URL): master-домен через func=auth → domain.edit; не Spaceship; сессия панели ≠ auth на api.zomro.com"
    );
  }
  lines.push("");

  const domain =
    result?.domain ||
    (requestSummary?.domainLabel && requestSummary?.zone
      ? `${String(requestSummary.domainLabel).trim()}.${String(requestSummary.zone).trim()}`
      : null);
  if (domain) {
    lines.push(`📦 Домен: ${domain}`);
  }
  if (requestSummary?.zone) {
    lines.push(`🌍 Зона: ${requestSummary.zone}`);
  }
  if (requestSummary?.nameservers) {
    lines.push(`📡 NS: ${requestSummary.nameservers}`);
  }
  if (typeof requestSummary?.skipPurchase === "boolean") {
    lines.push(`⚡ Режим без покупки: ${requestSummary.skipPurchase ? "да" : "нет"}`);
  }
  if (requestSummary?.hostRecordName) {
    lines.push(`📝 Имя DNS-записи: ${requestSummary.hostRecordName}`);
  }
  if (requestSummary?.hostIpFromRequest) {
    lines.push(`🌐 IP хоста (A): ${requestSummary.hostIpFromRequest}`);
  }
  if (requestSummary?.zomroZoneFunc) {
    lines.push(`🔧 Zomro (зона): ${requestSummary.zomroZoneFunc}`);
  }
  if (requestSummary?.zomroRecordFunc) {
    lines.push(`🔧 Zomro (запись): ${requestSummary.zomroRecordFunc}`);
  }
  if (requestSummary?.zomroVpsEnabled) {
    lines.push("🖥 VPS (Zomro): да — выполняется после DNS-зоны и A-записи");
  }
  if (requestSummary?.zomroDnsmgrEnabled) {
    lines.push(
      `🗂 Панель dnsmgr (Zomro): да — после зоны/A; URL в .env: ${
        requestSummary.zomroDnsmgrUrlConfigured ? "задан" : "нет"
      }; email для domain.edit: ${requestSummary.zomroDnsmgrEmailConfigured ? "задан" : "нет"}`
    );
    lines.push(
      `🧾 TXT для ACME в dnsmgr: funcs в .env — ${
        requestSummary.zomroDnsmgrTxtFuncsConfigured ? "переопределены" : "по умолчанию (domain.record.edit/delete)"
      }`
    );
  }
  if (requestSummary?.sslLetsEncryptEmailConfigured) {
    const dnsmgrOn = !!requestSummary?.zomroDnsmgrEnabled;
    const dnsmgrUrlOk = !!requestSummary?.zomroDnsmgrUrlConfigured;
    const apiDnsOn = !!requestSummary?.zomroApiDnsEnabled;
    if (dnsmgrOn && dnsmgrUrlOk) {
      lines.push(
        "🔐 SSL (Let's Encrypt, DNS-01): да — если публичные NS уже на Zomro, запись _acme-challenge создаётся в панели dnsmgr; если NS ещё на Spaceship — через API Spaceship до смены NS (нужен SSL_LETSENCRYPT_EMAIL)."
      );
    } else if (!dnsmgrOn && apiDnsOn) {
      lines.push(
        "🔐 SSL (Let's Encrypt, DNS-01): да — для зоны/A на api.zomro.com нужен ZOMRO_AUTH_TOKEN или billmgr в .env. Без токена включите шаг dnsmgr (или ZOMRO_DNSMGR_ENABLED=1), иначе авторизация Zomro упадёт до SSL."
      );
    } else {
      lines.push(
        "🔐 SSL (Let's Encrypt, DNS-01): да — TXT в Spaceship до смены NS (SSL_LETSENCRYPT_EMAIL). Если делегирование уже на Zomro, включите dnsmgr и ZOMRO_DNSMGR_URL + логин/пароль панели."
      );
    }
  }
  if (typeof requestSummary?.hostSslDeployEnabled === "boolean") {
    lines.push(
      `🖧 Деплой SSL на хост (nginx, SUBDOMAIN_HOST_SSL_DEPLOY): ${requestSummary.hostSslDeployEnabled ? "да" : "нет"}`
    );
  }

  return lines.join("\n");
}

/** Сообщение 2 — итог (как ✅ блок на скрине). */
function buildMessageResult({ ok, result, error, requestSummary }) {
  const lines = [];
  const now = new Date().toISOString();
  const domain =
    result?.domain ||
    (requestSummary?.domainLabel && requestSummary?.zone
      ? `${String(requestSummary.domainLabel).trim()}.${String(requestSummary.zone).trim()}`
      : "—");
  const siteUrl = domain !== "—" ? `https://${domain}` : null;

  if (ok) {
    lines.push("✅ Автоматизация домена завершена");
    lines.push("");
    if (siteUrl) {
      lines.push(`🔗 Ссылка: ${siteUrl}`);
    }
    lines.push(`📦 Домен: ${domain}`);
    lines.push(`🌐 IP (A-запись): ${result?.hostIp || "—"}`);
    lines.push(`📡 NS: ${Array.isArray(result?.nameservers) ? result.nameservers.join(", ") : "—"}`);
    lines.push("");

    const steps = result?.steps || [];
    const purchased = findStep(steps, "spaceship-purchase");
    const skippedBuy = !!result?.skipPurchase;
    if (skippedBuy) {
      lines.push("⏭ Покупка домена: пропущена (режим без покупки).");
    } else {
      lines.push(`${boolIcon(!!purchased?.ok)} Покупка домена: ${purchased?.ok ? "выполнена." : "ошибка или не выполнялась."}`);
    }

    const nsStep = findStep(steps, "spaceship-nameservers");
    lines.push(`${boolIcon(!!nsStep?.ok)} Смена NS (Spaceship): ${nsStep?.ok ? "выполнена." : "ошибка."}`);

    const authStep = findStep(steps, "zomro-auth-resolve");
    lines.push(`${boolIcon(!!authStep?.ok)} Zomro — сессия (${authStep?.source || "—"}): ${authStep?.ok ? "ок." : "ошибка."}`);

    const zoneStep = findStep(steps, "zomro-zone");
    lines.push(`${boolIcon(!!zoneStep?.ok)} Zomro — DNS-зона: ${zoneStep?.ok ? "ок." : "ошибка."}`);

    const recStep = findStep(steps, "zomro-record");
    lines.push(`${boolIcon(!!recStep?.ok)} Zomro — A-запись: ${recStep?.ok ? "ок." : "ошибка."}`);

    const dnsmgrPanel = findStep(steps, "zomro-dnsmgr-panel-domain");
    if (dnsmgrPanel) {
      lines.push(
        `${boolIcon(!!dnsmgrPanel?.ok)} Zomro — панель dnsmgr (master, domain.edit): ${
          dnsmgrPanel?.ok ? "домен добавлен в панель." : "ошибка."
        }`
      );
    }
    const hostDirStep = findStep(steps, "host-project-dir-create");
    if (hostDirStep) {
      lines.push(
        `${boolIcon(!!hostDirStep?.ok)} Хост — папка проекта: ${
          hostDirStep?.ok
            ? `создана (${hostDirStep?.remoteProjectDir || "путь не указан"}).`
            : hostDirStep?.warning || "ошибка."
        }`
      );
    }
    const sslStep = findStep(steps, "spaceship-ssl-letsencrypt-dns01");
    if (sslStep) {
      lines.push("");
      if (sslStep.pending) {
        lines.push("⏳ SSL (Let's Encrypt): выполняется в фоне, ожидаем подтверждение DNS-01.");
      }
      const certOk = !!(sslStep.certificatePem && String(sslStep.certificatePem).trim());
      if (!sslStep.pending) {
        lines.push(
          `${boolIcon(certOk)} SSL (Let's Encrypt, ${sslStep?.provider || "auto"}): ${certOk ? "сертификат получен." : "не получен."}`
        );
      }
      if (sslStep.staging) {
        lines.push("🟡 ACME: тестовый (staging).");
      }
      lines.push("🔒 Полный PEM и приватный ключ — только в JSON-ответе панели (в Telegram не отправляются).");
    }

    const hostNginxSsl = findStep(steps, "host-nginx-ssl-deploy");
    if (hostNginxSsl) {
      const skipped = !!hostNginxSsl.skipped;
      const okLine = skipped
        ? "пропущено (в .env выключен SUBDOMAIN_HOST_SSL_DEPLOY)."
        : hostNginxSsl.ok
          ? `PEM в ${hostNginxSsl.sslDir || "ssl/"}, nginx reload: ${hostNginxSsl.nginxReloaded ? "да." : "нет."}`
          : hostNginxSsl.warning || "ошибка.";
      lines.push(`${boolIcon(!!hostNginxSsl?.ok)} Хост — nginx + SSL: ${okLine}`);
    }

    const vpsConfirm = findStep(steps, "zomro-vps-confirm");
    if (vpsConfirm) {
      lines.push("");
      lines.push(`${boolIcon(!!vpsConfirm?.ok)} VPS (Zomro) — подтверждение заказа: ${vpsConfirm?.ok ? "ок." : "ошибка."}`);
    }

    lines.push("");
    lines.push("— Краткий итог (рабочий статус) —");
    if (skippedBuy) {
      lines.push("⏭ Покупка: пропущена (режим без покупки).");
    } else {
      lines.push(`${boolIcon(!!purchased?.ok)} Покупка домена: ${purchased?.ok ? "успешно." : "ошибка."}`);
    }
    lines.push(`${boolIcon(!!nsStep?.ok)} NS в Spaceship: ${nsStep?.ok ? "обновлены." : "ошибка."}`);
    lines.push(
      `${boolIcon(!!zoneStep?.ok && !!recStep?.ok)} DNS в Zomro: ${
        zoneStep?.ok && recStep?.ok ? "зона и A-запись — ок." : "есть ошибки."
      }`
    );
    if (sslStep) {
      const certOkBrief = !!(sslStep.certificatePem && String(sslStep.certificatePem).trim());
      lines.push(
        `${sslStep.pending ? "⏳" : boolIcon(certOkBrief)} SSL: ${
          sslStep.pending
            ? "в процессе (DNS-01 в фоне)."
            : certOkBrief
              ? "сертификат выпущен и подтверждён (DNS-01)."
              : "не выпущен или пустой PEM."
        }`
      );
    }
    if (dnsmgrPanel) {
      lines.push(`${boolIcon(!!dnsmgrPanel?.ok)} Панель dnsmgr (Zomro): ${dnsmgrPanel?.ok ? "master-домен в панели — ок." : "ошибка."}`);
    }
    if (hostDirStep) {
      lines.push(`${boolIcon(!!hostDirStep?.ok)} Папка проекта на хосте: ${hostDirStep?.ok ? "создана." : "ошибка."}`);
    }
    if (hostNginxSsl) {
      lines.push(
        `${boolIcon(!!hostNginxSsl?.ok)} Nginx + SSL на хосте: ${
          hostNginxSsl.skipped ? "пропущено." : hostNginxSsl.ok ? "деплой и reload — ок." : "ошибка."
        }`
      );
    }

    lines.push("");
    lines.push("— Шаги —");
    const maxSteps = 25;
    const shown = steps.slice(0, maxSteps);
    for (let i = 0; i < shown.length; i += 1) {
      const s = shown[i];
      const title = stepTitleForStep(s);
      lines.push(`${stepIcon(s)} ${title}`);
    }
    if (steps.length > maxSteps) {
      lines.push(`… и ещё ${steps.length - maxSteps} шаг(ов) (см. ответ API).`);
    }
  } else {
    lines.push("❌ Ошибка автоматизации домена");
    lines.push("");
    lines.push(`🕐 Время (UTC): ${now}`);
    if (siteUrl) {
      lines.push(`🔗 Ссылка: ${siteUrl}`);
    }
    lines.push(`📦 Домен: ${domain}`);
    lines.push("");
    lines.push(`📛 Причина: ${String(error?.message || error || "неизвестная ошибка")}`);
    if (Array.isArray(result?.steps) && result.steps.length) {
      lines.push("");
      lines.push("— Частичный прогресс до ошибки —");
      for (const s of result.steps.slice(0, 20)) {
        const title = stepTitleForStep(s);
        const extra = s?.warning ? ` (${String(s.warning).slice(0, 180)})` : "";
        lines.push(`${boolIcon(!!s?.ok)} ${title}${extra}`);
      }
      const sslDiag = result.steps.find((s) => s?.id === "spaceship-ssl-letsencrypt-dns01")?.diagnostics;
      if (sslDiag) {
        lines.push("DNS precheck: " + JSON.stringify(sslDiag).slice(0, 900));
      }
    }
    if (requestSummary && Object.keys(requestSummary).length) {
      lines.push("");
      lines.push("— Параметры запроса (без секретов) —");
      lines.push(JSON.stringify(requestSummary, null, 0).slice(0, 1800));
    }
  }

  lines.push("");
  lines.push(`🕐 Время (UTC): ${now}`);

  return lines.join("\n");
}

/** Сообщение 3 — финальный статус SSL (успех или явный фейл шага). */
function buildMessageSslExtra({ result }) {
  const steps = result?.steps || [];
  const sslStep = findStep(steps, "spaceship-ssl-letsencrypt-dns01");
  if (!sslStep) {
    return null;
  }

  const domain = result?.domain || "—";
  const siteUrl = domain !== "—" ? `https://${domain}` : null;
  const certOk = !!(sslStep.certificatePem && String(sslStep.certificatePem).trim());

  if (!sslStep.ok || !certOk) {
    const lines = [];
    lines.push("🟠 Обновление статуса SSL");
    lines.push("");
    if (siteUrl) {
      lines.push(`🔗 Ссылка: ${siteUrl}`);
    }
    lines.push(`📦 Домен: ${domain}`);
    lines.push("");
    lines.push("❌ SSL (Let's Encrypt): шаг выполнен с ошибкой или сертификат не получен.");
    lines.push("📎 Детали — в JSON-ответе панели и в блоке «Шаги» выше.");
    return lines.join("\n");
  }

  const lines = [];
  lines.push("🟢 Обновление статуса SSL");
  lines.push("");
  if (siteUrl) {
    lines.push(`🔗 Ссылка: ${siteUrl}`);
  }
  lines.push(`📦 Домен: ${domain}`);
  lines.push("");
  lines.push("✅ Сертификат Let's Encrypt подтверждён (DNS-01).");
  lines.push("📎 Полный PEM и ключ — в ответе API панели.");

  return lines.join("\n");
}

function buildMessageDomainPurchased({ result, requestSummary }) {
  const domain =
    result?.domain ||
    (requestSummary?.domainLabel && requestSummary?.zone
      ? `${String(requestSummary.domainLabel).trim()}.${String(requestSummary.zone).trim().replace(/^\./, "")}`
      : "—");
  const purchased = !requestSummary?.skipPurchase;
  return [
    "🛒 Домен: запуск автоматизации",
    "",
    `📦 Домен: ${domain}`,
    `🧾 Режим: ${purchased ? "с покупкой" : "без покупки"}`,
    "ℹ️ Следующее сообщение будет только со статусом SSL.",
  ].join("\n");
}

function buildMessageSslStatus({ ok, result, error, requestSummary }) {
  const domain =
    result?.domain ||
    (requestSummary?.domainLabel && requestSummary?.zone
      ? `${String(requestSummary.domainLabel).trim()}.${String(requestSummary.zone).trim().replace(/^\./, "")}`
      : "—");
  const sslStep = findStep(result?.steps || [], "spaceship-ssl-letsencrypt-dns01");
  const certOk = !!(sslStep?.certificatePem && String(sslStep.certificatePem).trim());
  const provider = sslStep?.provider || "auto";

  if (ok && certOk) {
    return [
      "✅ Статус SSL",
      "",
      `📦 Домен: ${domain}`,
      `🔐 SSL выпущен (${provider}).`,
    ].join("\n");
  }

  const reason = String(
    sslStep?.warning || error?.message || "SSL не выпущен (см. серверные логи)."
  ).slice(0, 500);
  return [
    "❌ Статус SSL",
    "",
    `📦 Домен: ${domain}`,
    `⚠️ SSL не выпущен: ${reason}`,
  ].join("\n");
}

function buildAllMessages(payload) {
  const { ok, result, error, requestSummary } = payload;
  const isSslCompletion = !!requestSummary?.sslAsyncCompletion;
  const hasSslStep = !!findStep(result?.steps || [], "spaceship-ssl-letsencrypt-dns01");
  if (isSslCompletion || (!ok && hasSslStep) || (ok && hasSslStep && !findStep(result?.steps || [], "spaceship-ssl-letsencrypt-dns01")?.pending)) {
    return [buildMessageSslStatus({ ok, result, error, requestSummary })];
  }
  return [buildMessageDomainPurchased({ result, requestSummary })];
}

/** Сборка тех же строк, что уйдут в Telegram (для тестов / превью). */
export function buildDomainAutomationTelegramMessages(payload) {
  return buildAllMessages(payload);
}

export async function sendSslProgressTelegramUpdate({ domain, attempt, errorMessage, nextRetryMs }) {
  return {
    skipped: true,
    reason: "SSL progress notifications disabled by policy (only 2 messages: domain + ssl status)",
    domain: domain || null,
    attempt: attempt || 0,
    nextRetryMs: nextRetryMs || 0,
    lastError: String(errorMessage || ""),
  };
}

async function sendOneMessage(token, chatId, text) {
  const url = `${TG_API}/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    }),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram sendMessage failed (${res.status})`);
  }
  const messageId = payload?.result?.message_id;
  if (messageId == null) {
    throw new Error("Telegram sendMessage: missing message_id in response");
  }
  return Number(messageId);
}

/**
 * Отчёты в Telegram активным chat_id из public.telegram_subscribers.
 * TELEGRAM_BOT_TOKEN обязателен; TELEGRAM_CHAT_ID — опциональный доп. получатель.
 * Русский текст, несколько сообщений и оформление (эмодзи, пустые строки) — как на референс-скрине;
 * содержание только про этот пайплайн: Spaceship → SSL (опц.) → NS → Zomro DNS → VPS (опц.).
 */
export async function sendDomainAutomationTelegramReport({ ok, result, error, requestSummary }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    return { skipped: true, reason: "TELEGRAM_BOT_TOKEN missing" };
  }

  const fromDb = await getActiveTelegramSubscriberChatIds();
  const envChat = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  const merged = new Set([...(fromDb.chatIds || []), ...(envChat ? [envChat] : [])]);
  const chatIds = [...merged];

  if (!chatIds.length) {
    return {
      skipped: true,
      reason: "No recipients: telegram_subscribers (is_active) empty and TELEGRAM_CHAT_ID unset",
      subscribersQuery: fromDb.ok ? "ok" : "failed",
      dbError: fromDb.dbError || null,
    };
  }

  const messages = buildAllMessages({ ok, result, error, requestSummary });

  const perChat = [];
  for (const chatId of chatIds) {
    try {
      let sentCount = 0;
      for (let m = 0; m < messages.length; m += 1) {
        const pieces = splitTelegramText(messages[m]);
        for (let p = 0; p < pieces.length; p += 1) {
          const messageId = await sendOneMessage(token, chatId, pieces[p]);
          sentCount += 1;
          recordTelegramBotMessage(chatId, messageId).catch(() => {});
          if (p < pieces.length - 1) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
        if (m < messages.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      perChat.push({ chatId, ok: true, messagesSent: sentCount });
    } catch (e) {
      perChat.push({ chatId, ok: false, error: e?.message || String(e) });
    }
  }

  const failed = perChat.filter((r) => !r.ok);
  return {
    skipped: false,
    messagesPerRecipient: messages.length,
    recipientCount: chatIds.length,
    recipients: perChat,
    subscribersFromDb: fromDb.chatIds?.length ?? 0,
    envFallbackUsed: !!envChat,
    subscribersDbError: fromDb.ok ? null : fromDb.dbError || null,
    partialFailure: failed.length > 0,
  };
}
