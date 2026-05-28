/** @typedef {'uk'|'en'|'ru'} TelegramLocale */

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
    alreadyLinked: "ℹ️ Акаунт уже підключено. /stop — вимкнути сповіщення.",
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
    alreadyLinked: "ℹ️ Already linked. /stop to disable.",
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
    alreadyLinked: "ℹ️ Уже подключено. /stop — отключить.",
    help: "Команды:\n/start — язык и привязка\n/stop — отключить\n/delete — очистить сообщения бота",
  },
};

const EVENTS = {
  generator_started: {
    uk: (d) => `🚀 Генерація стартувала\n📁 ${d.project}\n📄 сторінок: ${d.pages}`,
    en: (d) => `🚀 Generation started\n📁 ${d.project}\n📄 pages: ${d.pages}`,
    ru: (d) => `🚀 Генерация запущена\n📁 ${d.project}\n📄 страниц: ${d.pages}`,
  },
  generator_done: {
    uk: (d) => `✅ Сайт готовий\n📁 ${d.project}\n📄 ${d.pages} стор. · ${d.mode || "build"}`,
    en: (d) => `✅ Site ready\n📁 ${d.project}\n📄 ${d.pages} pg · ${d.mode || "build"}`,
    ru: (d) => `✅ Сайт готов\n📁 ${d.project}\n📄 ${d.pages} стр. · ${d.mode || "build"}`,
  },
  generator_error: {
    uk: (d) => `❌ Помилка генерації\n📁 ${d.project}\n⚠️ ${d.error}`,
    en: (d) => `❌ Generation failed\n📁 ${d.project}\n⚠️ ${d.error}`,
    ru: (d) => `❌ Ошибка генерации\n📁 ${d.project}\n⚠️ ${d.error}`,
  },
  generator_cancelled: {
    uk: (d) => `⏹ Генерацію скасовано\n📁 ${d.project}`,
    en: (d) => `⏹ Generation cancelled\n📁 ${d.project}`,
    ru: (d) => `⏹ Генерация отменена\n📁 ${d.project}`,
  },
  domain_started: {
    uk: (d) => `🌐 Домен: старт\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ без покупки" : ""}`,
    en: (d) => `🌐 Domain: started\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ skip purchase" : ""}`,
    ru: (d) => `🌐 Домен: старт\n🔗 ${d.domain}${d.skipPurchase ? "\n⏭ без покупки" : ""}`,
  },
  domain_ssl_ok: {
    uk: (d) => `🔒 SSL підтверджено\n🔗 ${d.domain}`,
    en: (d) => `🔒 SSL issued\n🔗 ${d.domain}`,
    ru: (d) => `🔒 SSL выпущен\n🔗 ${d.domain}`,
  },
  domain_ssl_fail: {
    uk: (d) => `🟠 SSL не вдалося\n🔗 ${d.domain}\n⚠️ ${d.reason}`,
    en: (d) => `🟠 SSL failed\n🔗 ${d.domain}\n⚠️ ${d.reason}`,
    ru: (d) => `🟠 SSL не удался\n🔗 ${d.domain}\n⚠️ ${d.reason}`,
  },
  domain_host_ok: {
    uk: (d) => `🖧 Деплой на хост\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
    en: (d) => `🖧 Deployed to host\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
    ru: (d) => `🖧 Деплой на хост\n🔗 ${d.domain}\n📂 ${d.dir || "ok"}`,
  },
  domain_done: {
    uk: (d) => `✅ Домен готовий\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
    en: (d) => `✅ Domain ready\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
    ru: (d) => `✅ Домен готов\n🔗 ${d.domain}\n🌐 IP: ${d.ip || "—"}`,
  },
  domain_error: {
    uk: (d) => `❌ Домен: помилка\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
    en: (d) => `❌ Domain error\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
    ru: (d) => `❌ Домен: ошибка\n🔗 ${d.domain || "—"}\n⚠️ ${d.error}`,
  },
};

export function normalizeLocale(raw) {
  const v = String(raw || "uk").trim().toLowerCase();
  if (v === "en" || v === "eng") return "en";
  if (v === "ru") return "ru";
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
  const fn = EVENTS[eventKey]?.[loc] || EVENTS[eventKey]?.uk;
  if (!fn) return "";
  return fn(data);
}
