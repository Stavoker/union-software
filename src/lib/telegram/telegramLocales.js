/** @typedef {'uk'|'en'|'ru'} TelegramLocale */

export const TELEGRAM_LOCALES = /** @type {const} */ (["uk", "en", "ru"]);

const BOT = {
  uk: {
    welcome: "👋 Вітаємо в Union Bot!\nОберіть мову сповіщень:",
    chooseLang: "🌐 Оберіть мову:",
    awaitCode:
      "🔐 Увійдіть у Union → Налаштування → Telegram.\nСкопіюйте код і надішліть його сюди (6 символів).",
    linked: (email) =>
      `Акаунт підключено${email ? `\n📧 ${email}` : ""}\n\nТепер ви отримуватимете сповіщення про генерацію, SSL і деплой.`,
    badCode: "❌ Код недійсний або прострочений. Отримайте новий у Налаштуваннях Union.",
    stopped: "🔕 Сповіщення вимкнено. /start — знову увімкнути.",
    alreadyLinked:
      "ℹ️ Акаунт уже підключено.\n🌐 Натисніть кнопку нижче, щоб змінити мову сповіщень.\n/stop — вимкнути.",
    languageUpdated: "✅ Мову сповіщень оновлено.",
    help: "Команди:\n/start — мова та підключення\n/stop — вимкнути\n/delete — очистити повідомлення бота",
  },
  en: {
    welcome: "👋 Welcome to Union Bot!\nChoose notification language:",
    chooseLang: "🌐 Choose language:",
    awaitCode:
      "🔐 Open Union → Settings → Telegram.\nCopy the code and send it here (6 characters).",
    linked: (email) =>
      `Account linked${email ? `\n📧 ${email}` : ""}\n\nYou'll get alerts for generation, SSL, and deploy.`,
    badCode: "❌ Invalid or expired code. Generate a new one in Union Settings.",
    stopped: "🔕 Notifications off. /start to enable again.",
    alreadyLinked:
      "ℹ️ Already linked.\n🌐 Tap a button below to change notification language.\n/stop to disable.",
    languageUpdated: "✅ Notification language updated.",
    help: "Commands:\n/start — language & link\n/stop — disable\n/delete — clear bot messages",
  },
  ru: {
    welcome: "👋 Добро пожаловать в Union Bot!\nВыберите язык уведомлений:",
    chooseLang: "🌐 Выберите язык:",
    awaitCode:
      "🔐 Откройте Union → Настройки → Telegram.\nСкопируйте код и отправьте сюда (6 символов).",
    linked: (email) =>
      `Аккаунт подключён${email ? `\n📧 ${email}` : ""}\n\nВы будете получать уведомления о генерации, SSL и деплое.`,
    badCode: "❌ Код недействителен или истёк. Получите новый в Настройках Union.",
    stopped: "🔕 Уведомления выключены. /start — включить снова.",
    alreadyLinked:
      "ℹ️ Уже подключено.\n🌐 Нажмите кнопку ниже, чтобы сменить язык уведомлений.\n/stop — отключить.",
    languageUpdated: "✅ Язык уведомлений обновлён.",
    help: "Команды:\n/start — язык и привязка\n/stop — отключить\n/delete — очистить сообщения бота",
  },
};

/** @param {TelegramLocale} loc */
function L(loc, triple) {
  const key = normalizeLocale(loc);
  return triple[key] ?? triple.uk;
}

const DEPLOY_NOTE = {
  deploy_no_slot: {
    uk: "деплой: немає вільної папки домену на хості",
    en: "deploy: no free domain folder on host",
    ru: "деплой: нет свободной папки домена на хосте",
  },
  deploy_no_host: {
    uk: "деплой: SSH-хост не обрано",
    en: "deploy: host not selected",
    ru: "деплой: хост не выбран",
  },
  deploy_failed: {
    uk: (d) => `деплой: помилка — ${d.deployFailMessage || "?"}`,
    en: (d) => `deploy failed: ${d.deployFailMessage || "?"}`,
    ru: (d) => `деплой: ошибка — ${d.deployFailMessage || "?"}`,
  },
  deploy_other: {
    uk: (d) => `деплой: ${d.deployFailMessage || "?"}`,
    en: (d) => `deploy: ${d.deployFailMessage || "?"}`,
    ru: (d) => `деплой: ${d.deployFailMessage || "?"}`,
  },
};

function deployNoteLine(locale, d) {
  const key = String(d.deployNoteKey || "").trim();
  if (!key) return "";
  const pack = DEPLOY_NOTE[key];
  if (!pack) return "";
  const val = L(locale, pack);
  return typeof val === "function" ? val(d) : val;
}

/** Локалізує технічні SSL-помилки для Telegram (uk / en / ru). */
export function formatSslNotifyReason(loc, rawReason) {
  const raw = String(rawReason || "").trim();
  if (!raw) {
    return L(loc, {
      uk: "невідома помилка",
      en: "unknown error",
      ru: "неизвестная ошибка",
    });
  }

  const codeMatch = raw.match(
    /^SSL_DNS_ZONE_NOT_PUBLIC\|zone=([^|]+)\|timeoutSec=(\d+)\|detail=(.*)$/
  );
  if (codeMatch) {
    const [, zone, timeoutSec, detail] = codeMatch;
    return L(loc, {
      uk: `зона ${zone} ще не видна в публічному DNS після ${timeoutSec} с (${detail}). Дочекайтесь NS у реєстраторі (dig NS ${zone} +short).`,
      ru: `зона ${zone} ещё не видна в публичном DNS после ${timeoutSec} с (${detail}). Дождитесь NS у регистратора (dig NS ${zone} +short).`,
      en: `zone ${zone} not visible in public DNS after ${timeoutSec}s (${detail}). Wait for NS at registrar (dig NS ${zone} +short).`,
    });
  }

  const legacyUk = raw.match(
    /SSL:\s*зона\s+(\S+)\s+ще не видна в публічному DNS після (\d+)s \(([^)]*)\)/
  );
  if (legacyUk) {
    return formatSslNotifyReason(
      loc,
      `SSL_DNS_ZONE_NOT_PUBLIC|zone=${legacyUk[1]}|timeoutSec=${legacyUk[2]}|detail=${legacyUk[3]}`
    );
  }

  const txtNs = raw.match(
    /SSL:\s*TXT did not appear on required authoritative NS in time for (.+)/i
  );
  if (txtNs) {
    const fqdn = txtNs[1].trim();
    return L(loc, {
      uk: `TXT для ${fqdn} не з'явився на NS у відведений час. Зачекайте поширення DNS.`,
      ru: `TXT для ${fqdn} не появился на NS вовремя. Дождитесь распространения DNS.`,
      en: `TXT for ${fqdn} did not appear on authoritative NS in time. Wait for DNS propagation.`,
    });
  }

  const txtProp = raw.match(/SSL:\s*TXT record did not propagate in time for (.+)/i);
  if (txtProp) {
    const fqdn = txtProp[1].trim();
    return L(loc, {
      uk: `TXT для ${fqdn} не поширився вчасно. Зачекайте DNS.`,
      ru: `TXT для ${fqdn} не распространился вовремя. Дождитесь DNS.`,
      en: `TXT for ${fqdn} did not propagate in time. Wait for DNS.`,
    });
  }

  return raw.replace(/^SSL:\s*/i, "").trim() || raw;
}

function formatGeneratorDone(loc, d) {
  const lines = [
    L(loc, {
      uk: "✅ Сайт готовий",
      en: "✅ Site ready",
      ru: "✅ Сайт готов",
    }),
    L(loc, {
      uk: `📄 ${d.pages} стор. · ${d.mode || "build"}`,
      en: `📄 ${d.pages} pg · ${d.mode || "build"}`,
      ru: `📄 ${d.pages} стр. · ${d.mode || "build"}`,
    }),
  ];
  if (d.domain) {
    lines.push(`📁 ${d.project} → 🔗 ${d.domain}`);
    if (d.siteUrl) lines.push(`🌐 ${d.siteUrl}`);
  } else {
    lines.push(`📁 ${d.project}`);
    const note = deployNoteLine(loc, d);
    if (note) lines.push(`🖧 ${note}`);
  }
  return lines.join("\n");
}

const EVENT_BUILDERS = {
  generator_started: (loc, d) => {
    const lines = [
      L(loc, {
        uk: "🚀 Генерація стартувала",
        en: "🚀 Generation started",
        ru: "🚀 Генерация запущена",
      }),
      `📁 ${d.project}`,
      L(loc, {
        uk: `📄 сторінок: ${d.pages}`,
        en: `📄 pages: ${d.pages}`,
        ru: `📄 страниц: ${d.pages}`,
      }),
    ];
    if (d.plannedDomain) {
      lines.push(
        L(loc, {
          uk: `🎯 домен (план): ${d.plannedDomain}`,
          en: `🎯 domain (planned): ${d.plannedDomain}`,
          ru: `🎯 домен (план): ${d.plannedDomain}`,
        })
      );
    }
    return lines.join("\n");
  },
  generator_done: (loc, d) => formatGeneratorDone(loc, d),
  generator_error: (loc, d) =>
    L(loc, {
      uk: `❌ Помилка генерації\n📁 ${d.project}\n⚠️ ${d.error}`,
      en: `❌ Generation failed\n📁 ${d.project}\n⚠️ ${d.error}`,
      ru: `❌ Ошибка генерации\n📁 ${d.project}\n⚠️ ${d.error}`,
    }),
  generator_cancelled: (loc, d) =>
    L(loc, {
      uk: `⏹ Генерацію скасовано\n📁 ${d.project}`,
      en: `⏹ Generation cancelled\n📁 ${d.project}`,
      ru: `⏹ Генерация отменена\n📁 ${d.project}`,
    }),
  domain_started: (loc, d) =>
    L(loc, {
      uk: `🌐 Домен: старт\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ без купівлі" : ""}`,
      en: `🌐 Domain: started\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ skip purchase" : ""}`,
      ru: `🌐 Домен: запуск\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ без покупки" : ""}`,
    }),
  domain_purchased: (loc, d) =>
    L(loc, {
      uk: `✅ Домен придбано\n🔗 ${d.domain}`,
      en: `✅ Domain purchased\n🔗 ${d.domain}`,
      ru: `✅ Домен куплен\n🔗 ${d.domain}`,
    }),
  domain_dns_ns: (loc, d) =>
    L(loc, {
      uk: `📡 NS оновлено (Spaceship)\n🔗 ${d.domain}`,
      en: `📡 Nameservers updated\n🔗 ${d.domain}`,
      ru: `📡 NS обновлены (Spaceship)\n🔗 ${d.domain}`,
    }),
  domain_dns_ready: (loc, d) =>
    L(loc, {
      uk: `🧩 DNS Zomro (dnsmgr)\n🔗 ${d.domain}`,
      en: `🧩 Zomro DNS ready\n🔗 ${d.domain}`,
      ru: `🧩 DNS Zomro настроен\n🔗 ${d.domain}`,
    }),
  domain_ssl_pending: (loc, d) =>
    L(loc, {
      uk: `⏳ SSL у фоні\n🔗 ${d.domain}\n(делегування DNS → Let's Encrypt)`,
      en: `⏳ SSL in background\n🔗 ${d.domain}\n(DNS delegation → Let's Encrypt)`,
      ru: `⏳ SSL в фоне\n🔗 ${d.domain}\n(делегирование DNS → Let's Encrypt)`,
    }),
  domain_ssl_retry: (loc, d) =>
    L(loc, {
      uk: `🔄 SSL повтор #${d.attempt}\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
      en: `🔄 SSL retry #${d.attempt}\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
      ru: `🔄 SSL повтор #${d.attempt}\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
    }),
  domain_ssl_ok: (loc, d) =>
    L(loc, {
      uk: `🔒 SSL підтверджено\n🔗 ${d.domain}`,
      en: `🔒 SSL issued\n🔗 ${d.domain}`,
      ru: `🔒 SSL выпущен\n🔗 ${d.domain}`,
    }),
  domain_ssl_fail: (loc, d) =>
    L(loc, {
      uk: `🟠 SSL не вдалося\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
      en: `🟠 SSL failed\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
      ru: `🟠 SSL не удался\n🔗 ${d.domain}\n⚠️ ${formatSslNotifyReason(loc, d.reason)}`,
    }),
  domain_host_ok: (loc, d) =>
    L(loc, {
      uk: `🖧 Деплой на хост\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
      en: `🖧 Deployed to host\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
      ru: `🖧 Развёрнуто на сервере\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
    }),
  domain_done: (loc, d) =>
    L(loc, {
      uk: `✅ Домен готовий\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
      en: `✅ Domain ready\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
      ru: `✅ Домен готов\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
    }),
  domain_error: (loc, d) =>
    L(loc, {
      uk: `❌ Домен: помилка\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
      en: `❌ Domain error\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
      ru: `❌ Домен: ошибка\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
    }),
  seo_verify_queued: (loc, d) => {
    const pos = Number(d.position);
    const total = Number(d.totalPending);
    const posLine =
      Number.isFinite(pos) && pos > 0 && Number.isFinite(total) && total > 0
        ? L(loc, {
            uk: `📊 Черга: #${pos} з ${total} (спільна для всіх користувачів)`,
            en: `📊 Queue: #${pos} of ${total} (shared global queue)`,
            ru: `📊 Очередь: #${pos} из ${total} (общая для всех пользователей)`,
          })
        : L(loc, {
            uk: "📊 Додано в спільну чергу SEO",
            en: "📊 Added to the shared SEO queue",
            ru: "📊 Добавлено в общую очередь SEO",
          });
    return L(loc, {
      uk: `🔎 SEO у черзі\n🔗 ${d.domain}\n📦 ${d.project || d.domain}\n${posLine}\n\nВерифікація Яндекс / Google — незабаром.`,
      en: `🔎 SEO queued\n🔗 ${d.domain}\n📦 ${d.project || d.domain}\n${posLine}\n\nYandex / Google verification coming soon.`,
      ru: `🔎 SEO в очереди\n🔗 ${d.domain}\n📦 ${d.project || d.domain}\n${posLine}\n\nВерификация Яндекс / Google — скоро.`,
    });
  },
  seo_verify_started: (loc, d) =>
    L(loc, {
      uk: `🔎 SEO: старт\n🔗 ${d.domain}\n📦 ${d.project || d.domain}`,
      en: `🔎 SEO: started\n🔗 ${d.domain}\n📦 ${d.project || d.domain}`,
      ru: `🔎 SEO: старт\n🔗 ${d.domain}\n📦 ${d.project || d.domain}`,
    }),
  seo_yandex_verified: (loc, d) =>
    L(loc, {
      uk: `🟢 Яндекс Вебмайстер\n🔗 ${d.domain}\n✅ Права підтверджено\n🔄 Переобхід у черзі`,
      en: `🟢 Yandex Webmaster\n🔗 ${d.domain}\n✅ Ownership verified\n🔄 Recrawl queued`,
      ru: `🟢 Яндекс Вебмастер\n🔗 ${d.domain}\n✅ Права подтверждены\n🔄 Переобход в очереди`,
    }),
  seo_yandex_pending: (loc, d) =>
    L(loc, {
      uk: `🟡 Яндекс Вебмайстер\n🔗 ${d.domain}\n⏳ Очікуємо підтвердження (${d.state || "…"})`,
      en: `🟡 Yandex Webmaster\n🔗 ${d.domain}\n⏳ Waiting for verification (${d.state || "…"})`,
      ru: `🟡 Яндекс Вебмастер\n🔗 ${d.domain}\n⏳ Ожидаем подтверждения (${d.state || "…"})`,
    }),
  seo_google_verified: (loc, d) =>
    L(loc, {
      uk: `🟢 Google Search Console\n🔗 ${d.domain}\n✅ Сайт підтверджено\n📨 Запит на індексацію надіслано`,
      en: `🟢 Google Search Console\n🔗 ${d.domain}\n✅ Site verified\n📨 Indexing request sent`,
      ru: `🟢 Google Search Console\n🔗 ${d.domain}\n✅ Сайт подтверждён\n📨 Запрос на индексацию отправлен`,
    }),
  seo_google_pending: (loc, d) =>
    L(loc, {
      uk: `🟡 Google Search Console\n🔗 ${d.domain}\n⏳ Очікуємо підтвердження (${d.state || "…"})`,
      en: `🟡 Google Search Console\n🔗 ${d.domain}\n⏳ Waiting for verification (${d.state || "…"})`,
      ru: `🟡 Google Search Console\n🔗 ${d.domain}\n⏳ Ожидаем подтверждения (${d.state || "…"})`,
    }),
  seo_verify_error: (loc, d) =>
    L(loc, {
      uk: `❌ SEO: помилка\n🔗 ${d.domain || "—"}\n📦 ${d.project || "—"}\n⚠️ ${d.error}`,
      en: `❌ SEO error\n🔗 ${d.domain || "—"}\n📦 ${d.project || "—"}\n⚠️ ${d.error}`,
      ru: `❌ SEO: ошибка\n🔗 ${d.domain || "—"}\n📦 ${d.project || "—"}\n⚠️ ${d.error}`,
    }),
};

/** @type {Record<string, Record<TelegramLocale, (d: Record<string, unknown>) => string>>} */
const EVENTS = Object.fromEntries(
  Object.entries(EVENT_BUILDERS).map(([key, build]) => [
    key,
    {
      uk: (d) => build("uk", d),
      en: (d) => build("en", d),
      ru: (d) => build("ru", d),
    },
  ])
);

export function normalizeLocale(raw) {
  const v = String(raw || "uk").trim().toLowerCase();
  if (v === "en" || v === "eng" || v === "english") return "en";
  if (v === "ru" || v === "rus" || v === "russian") return "ru";
  if (v === "uk" || v === "ua" || v === "ukr" || v === "ukrainian") return "uk";
  return "uk";
}

export function botText(locale, key, ...args) {
  const loc = normalizeLocale(locale);
  const pack = BOT[loc] || BOT.uk;
  const val = pack[key];
  return typeof val === "function" ? val(...args) : val || "";
}

export function eventText(locale, eventKey, data = {}) {
  const loc = normalizeLocale(locale);
  const pack = EVENTS[eventKey];
  if (!pack) {
    console.warn(`[telegram] unknown event key: ${eventKey}`);
    return "";
  }
  const fn = pack[loc];
  if (!fn) {
    console.warn(`[telegram] missing locale "${loc}" for event "${eventKey}", using uk`);
    return pack.uk ? pack.uk(data) : "";
  }
  return fn(data);
}

/** Перевірка повноти перекладів (для тестів / діагностики). */
export function assertTelegramLocalesComplete() {
  const missing = [];
  for (const [eventKey, pack] of Object.entries(EVENTS)) {
    for (const loc of TELEGRAM_LOCALES) {
      if (typeof pack[loc] !== "function") {
        missing.push(`${eventKey}.${loc}`);
      }
    }
  }
  for (const loc of TELEGRAM_LOCALES) {
    for (const key of ["welcome", "linked", "languageUpdated"]) {
      if (!BOT[loc]?.[key]) missing.push(`BOT.${loc}.${key}`);
    }
  }
  return missing;
}
