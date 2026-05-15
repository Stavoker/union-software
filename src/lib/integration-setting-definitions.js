/** Усі ключі налаштувань акаунта (як process.env). hint — підказка в UI. */

function def(key, section, opts = {}) {
  return {
    key,
    section,
    secret: !!opts.secret,
    kind: opts.kind || "text",
    hint: opts.hint || "",
  };
}

function bool(key, section, hint) {
  return def(key, section, { kind: "bool", hint });
}

function claudeKeySlots(max = 10) {
  return Array.from({ length: max }, (_, i) => {
    const suffix = String(i + 1).padStart(2, "0");
    return def(`CLAUDE_API_KEY_${suffix}`, "generator", {
      secret: true,
      hint: `Anthropic API (sk-ant-…), слот ${suffix} для паралельних збірок`,
    });
  });
}

/** Ім'я колонки в Postgres (lowercase env key). */
export function envKeyToColumn(envKey) {
  return String(envKey || "").toLowerCase();
}

export const INTEGRATION_SETTING_DB_COLUMNS = [];

export const INTEGRATION_SETTING_DEFINITIONS = [
  ...claudeKeySlots(10),

  def("ANTHROPIC_MODEL", "generator", { hint: "Модель Claude (напр. claude-sonnet-4-6)" }),
  def("AURORA_GENERATION_TEMPERATURE", "generator", { hint: "Температура генерації (0–1)" }),
  def("ANTHROPIC_MAX_TOKENS_PAGE", "generator", { hint: "Max output tokens на сторінку" }),
  def("ANTHROPIC_MAX_TOKENS_ARCHITECT", "generator", { hint: "Max tokens архітектора" }),
  def("ANTHROPIC_MAX_TOKENS_JSFIX", "generator", { hint: "Max tokens JS-fix" }),
  def("AURORA_CLAUDE_SITE_OUTPUT_BUDGET", "generator", { hint: "Бюджет output-токенів на 1 сайт" }),
  def("ANTHROPIC_FETCH_TIMEOUT_MS", "generator", { hint: "Таймаут запиту до Anthropic (мс)" }),
  def("AURORA_GATEWAY_URL", "generator", { hint: "URL Aurora gateway (опційно)" }),
  bool("AURORA_GATEWAY_DIVERSIFY", "generator", "Різноманітність через gateway (1/0)"),

  def("SOFT_SUBFOLDER_ROOT_DIR", "generator", { hint: "Корінь soft-subfolder" }),
  def("SOFT_SUBFOLDER_TEMPLATES_DIR", "generator", { hint: "Каталог шаблонів" }),
  def("SOFT_SUBFOLDER_PROJECTS_DIR", "generator", { hint: "Каталог зібраних проєктів" }),
  def("PHP_BINARY", "generator", { hint: "Шлях до php (локально)" }),
  def("SOFT_SUBFOLDER_PHP", "generator", { hint: "PHP для subfolder (пріоритет над PHP_BINARY)" }),

  bool("SOFTGEN_REQUIRE_REFERENCE_STRUCTURE", "generator", "Вимагати структуру референсу (1/0)"),
  bool("SOFTGEN_REFERENCE_TEMPLATE_MODE", "generator", "Режим шаблону з референсу (1/0)"),
  bool("SOFTGEN_PROMPT_REGEN_ENABLED", "generator", "Регенерація промптів (1/0)"),
  def("SOFTGEN_PROMPT_REGEN_MAX_TOKENS", "generator", { hint: "Max tokens регенерації промпту" }),
  bool("SOFTGEN_PROMPT_REWRITE_ENABLED", "generator", "Перепис промптів (1/0)"),
  bool("SOFTGEN_PROMPT_REWRITE_PAGE_ON_RETRY", "generator", "Rewrite сторінки при retry (1/0)"),
  def("SOFTGEN_PROMPT_REWRITE_MAX_TOKENS", "generator", { hint: "Max tokens rewrite" }),
  def("SOFTGEN_REFERENCE_SIMILARITY_THRESHOLD", "generator", { hint: "Поріг схожості референсу (0–1)" }),
  def("SOFTGEN_REFERENCE_SECTION_ORDER_MIN", "generator", { hint: "Мін. порядок секцій референсу" }),
  bool("SOFTGEN_REFERENCE_SIMILARITY_CHECK_INDEX_ONLY", "generator", "Similarity лише index (1/0)"),
  def("SOFTGEN_TEXT_FILL_MAX_ATTEMPTS", "generator", { hint: "Спроби заповнення тексту" }),
  def("SOFTGEN_REFERENCE_FETCH_TIMEOUT_MS", "generator", { hint: "Таймаут завантаження референсу (мс)" }),
  def("SOFTGEN_REFERENCE_TEMPLATE_MAIN_MAX_CHARS", "generator", { hint: "Max символів main шаблону" }),
  def("SOFTGEN_REFERENCE_TEMPLATE_CHROME_MAX_CHARS", "generator", { hint: "Max символів chrome шаблону" }),
  def("SOFTGEN_REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS", "generator", { hint: "Max символів document context" }),
  bool("SOFTGEN_STRICT_PLACEHOLDER_FILL", "generator", "Строге заповнення placeholder (1/0)"),

  def("SPACESHIP_API_KEY", "spaceship", { secret: true, hint: "Spaceship API key" }),
  def("SPACESHIP_API_SECRET", "spaceship", { secret: true, hint: "Spaceship API secret" }),
  def("SPACESHIP_CONTACT_ID", "spaceship", { hint: "Contact ID для реєстрації домену" }),

  def("ZOMRO_AUTH_TOKEN", "zomro", { secret: true, hint: "Готова сесія api.zomro.com" }),
  def("ZOMRO_AUTH_THROUGH_KEY", "zomro", { secret: true, hint: "Сквозний ключ auth" }),
  def("ZOMRO_AUTHINFO", "zomro", { secret: true, hint: "func=auth через API" }),
  def("ZOMRO_USERNAME", "zomro", { hint: "Логін панелі / billmgr" }),
  def("ZOMRO_PASSWORD", "zomro", { secret: true, hint: "Пароль панелі" }),
  def("ZOMRO_BILLMGR_URL", "zomro", { hint: "URL Billmgr" }),
  def("ZOMRO_BILLMGR_HOST", "zomro", { hint: "Host Billmgr" }),
  def("ZOMRO_BILLMGR_PORT", "zomro", { hint: "Порт Billmgr" }),
  bool("ZOMRO_BILLMGR_USE_HTTP", "zomro", "HTTP замість HTTPS (1 = http)"),
  def("ZOMRO_DNSMGR_URL", "zomro", { hint: "URL dnsmgr (напр. https://ns…/dnsmgr)" }),
  def("ZOMRO_DNSMGR_DOMAIN_EMAIL", "zomro", { hint: "Email для domain.edit" }),
  bool("ZOMRO_DNSMGR_ENABLED", "zomro", "Викликати dnsmgr (1/0)"),
  bool("ZOMRO_API_DNS_ENABLED", "zomro", "API DNS на api.zomro.com (1/0)"),
  def("ZOMRO_DNSMGR_TXT_CREATE_FUNC", "zomro", { hint: "func створення TXT" }),
  def("ZOMRO_DNSMGR_TXT_DELETE_FUNC", "zomro", { hint: "func видалення TXT" }),

  def("SSL_LETSENCRYPT_EMAIL", "ssl", { hint: "Email для ACME / Let's Encrypt" }),
  bool("SSL_LETSENCRYPT_STAGING", "ssl", "Staging ACME (1/0)"),
  bool("SSL_LETSENCRYPT_SKIP_VERIFY", "ssl", "Пропустити TLS verify ACME (1/0)"),
  def("SSL_ASYNC_RETRY_MS", "ssl", { hint: "Інтервал повтору SSL у фоні (мс)" }),
  def("SSL_ASYNC_PROGRESS_EVERY_ATTEMPTS", "ssl", { hint: "Telegram кожні N спроб SSL" }),
  def("SSL_MIN_AUTHORITATIVE_NS_READY", "ssl", { hint: "Мін. авторитетних NS" }),
  def("SSL_DNS_CHALLENGE_REMOVE_DELAY_MS", "ssl", { hint: "Затримка перед видаленням TXT (мс)" }),
  def("SSL_DELEGATION_WAIT_TIMEOUT_MS", "ssl", { hint: "Таймаут делегування (мс)" }),
  def("SSL_DELEGATION_WAIT_POLL_MS", "ssl", { hint: "Poll делегування (мс)" }),
  def("SSL_ZOMRO_DNS_POST_DELAY_MS", "ssl", { hint: "Пауза після DNS Zomro (мс)" }),

  def("SUBDOMAIN_HOST_IP", "host", { hint: "IP сервера (A-запис, SSH)" }),
  def("SUBDOMAIN_HOST_USER", "host", { hint: "SSH користувач" }),
  def("SUBDOMAIN_HOST_PASSWORD", "host", { secret: true, hint: "SSH пароль" }),
  def("SUBDOMAIN_HOST_PORT", "host", { hint: "SSH порт" }),
  bool("SUBDOMAIN_HOST_SSL_DEPLOY", "host", "Деплой nginx + сертифікат (1/0)"),
  def("SUBDOMAIN_HOST_PROJECTS_DIR", "host", { hint: "Каталог сайтів (напр. /var/www)" }),
  bool("SUBDOMAIN_HOST_NGINX_PHP", "host", "PHP у vhost (1/0)"),
  def("SUBDOMAIN_HOST_NGINX_SITES_AVAILABLE", "host", { hint: "Шлях sites-available" }),
  def("SUBDOMAIN_HOST_NGINX_SITES_ENABLED", "host", { hint: "Шлях sites-enabled" }),
  def("SUBDOMAIN_HOST_NGINX_RELOAD_CMD", "host", { hint: "Команда reload nginx" }),
  def("SUBDOMAIN_HOST_PHP_FPM_SOCKET", "host", { hint: "Сокет PHP-FPM" }),

  def("YANDEX_XML_STOCK_BASE_URL", "seo", { hint: "Базовий URL Yandex XML (позиції)" }),

  def("TELEGRAM_BOT_TOKEN", "telegram", { secret: true, hint: "Токен бота Telegram" }),
  def("TELEGRAM_CHAT_ID", "telegram", { hint: "Chat ID для звітів" }),
  def("TELEGRAM_WEBHOOK_SECRET", "telegram", { secret: true, hint: "Секрет webhook" }),
  def("TELEGRAM_BOT_USERNAME", "telegram", { hint: "Username бота (@…)" }),
  def("TELEGRAM_BOT_MESSAGES_MAX_AGE_HOURS", "telegram", { hint: "Вік повідомлень для cleanup (год)" }),
  def("TELEGRAM_BOT_MESSAGES_CLEANUP_BATCH", "telegram", { hint: "Batch cleanup" }),
  def("TELEGRAM_DELETE_COMMAND_MAX_MESSAGES", "telegram", { hint: "Макс. повідомлень /delete" }),
  bool("TELEGRAM_DELETE_TRY_BULK_IN_GROUPS", "telegram", "Bulk delete у групах (1/0)"),
  def("CRON_SECRET", "telegram", { secret: true, hint: "Секрет для cron cleanup API" }),
  def("TELEGRAM_BOT_CLEANUP_CRON_SECRET", "telegram", { secret: true, hint: "Альтернатива CRON_SECRET" }),

  def("AUTOSCRIPT_WEBHOOK_URL", "autoscript", { hint: "Webhook auto-script-v2 після генерації" }),
  def("AUTOSCRIPT_WEBHOOK_SECRET", "autoscript", { secret: true, hint: "Секрет webhook" }),
];

for (const defEntry of INTEGRATION_SETTING_DEFINITIONS) {
  INTEGRATION_SETTING_DB_COLUMNS.push(envKeyToColumn(defEntry.key));
}
