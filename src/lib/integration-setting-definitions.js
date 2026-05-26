/** Усі ключі налаштувань акаунта (як process.env). Підказки UI — integrationSettings.fields.* у messages/{uk,en,ru}.json */

function def(key, section, opts = {}) {
  return {
    key,
    section,
    secret: !!opts.secret,
    kind: opts.kind || "text",
    hint: opts.hint || "",
  };
}

function bool(key, section) {
  return def(key, section, { kind: "bool" });
}

function claudeKeySlots(max = 10) {
  return Array.from({ length: max }, (_, i) => {
    const suffix = String(i + 1).padStart(2, "0");
    return def(`CLAUDE_API_KEY_${suffix}`, "generator", { secret: true });
  });
}

/** Ім'я колонки в Postgres (lowercase env key). */
export function envKeyToColumn(envKey) {
  return String(envKey || "").toLowerCase();
}

export const INTEGRATION_SETTING_DB_COLUMNS = [];

export const INTEGRATION_SETTING_DEFINITIONS = [
  ...claudeKeySlots(10),

  def("ANTHROPIC_MODEL", "generator"),
  def("ANTHROPIC_BASE_URL", "generator"),
  def("ANTHROPIC_MAX_TOKENS_PAGE", "generator"),
  def("ANTHROPIC_MAX_TOKENS_ARCHITECT", "generator"),
  def("AURORA_CLAUDE_SITE_OUTPUT_BUDGET", "generator"),
  def("SOFTGEN_MIN_PAGE_WORDS", "generator"),
  def("SOFTGEN_MIN_INDEX_PAGE_WORDS", "generator"),
  def("SOFTGEN_MAX_PAGE_WORDS", "generator"),
  def("AURORA_GENERATION_TEMPERATURE", "generator"),
  bool("SOFTGEN_QUALITY_REGEN_ENABLED", "generator"),

  def("SPACESHIP_API_KEY", "spaceship", { secret: true }),
  def("SPACESHIP_API_SECRET", "spaceship", { secret: true }),
  def("SPACESHIP_CONTACT_ID", "spaceship"),

  def("ZOMRO_AUTH_TOKEN", "zomro", { secret: true }),
  def("ZOMRO_AUTH_THROUGH_KEY", "zomro", { secret: true }),
  def("ZOMRO_AUTHINFO", "zomro", { secret: true }),
  def("ZOMRO_USERNAME", "zomro"),
  def("ZOMRO_PASSWORD", "zomro", { secret: true }),
  def("ZOMRO_BILLMGR_URL", "zomro"),
  def("ZOMRO_BILLMGR_HOST", "zomro"),
  def("ZOMRO_BILLMGR_PORT", "zomro"),
  bool("ZOMRO_BILLMGR_USE_HTTP", "zomro"),
  def("ZOMRO_DNSMGR_URL", "zomro"),
  def("ZOMRO_DNSMGR_DOMAIN_EMAIL", "zomro"),
  bool("ZOMRO_DNSMGR_ENABLED", "zomro"),
  bool("ZOMRO_API_DNS_ENABLED", "zomro"),
  def("ZOMRO_DNSMGR_TXT_CREATE_FUNC", "zomro"),
  def("ZOMRO_DNSMGR_TXT_DELETE_FUNC", "zomro"),

  def("SSL_LETSENCRYPT_EMAIL", "ssl"),
  bool("SSL_LETSENCRYPT_STAGING", "ssl"),
  bool("SSL_LETSENCRYPT_SKIP_VERIFY", "ssl"),
  def("SSL_ASYNC_RETRY_MS", "ssl"),
  def("SSL_ASYNC_PROGRESS_EVERY_ATTEMPTS", "ssl"),
  def("SSL_MIN_AUTHORITATIVE_NS_READY", "ssl"),
  def("SSL_DNS_CHALLENGE_REMOVE_DELAY_MS", "ssl"),
  def("SSL_DELEGATION_WAIT_TIMEOUT_MS", "ssl"),
  def("SSL_DELEGATION_WAIT_POLL_MS", "ssl"),
  def("SSL_ZOMRO_DNS_POST_DELAY_MS", "ssl"),

  def("SUBDOMAIN_HOST_IP", "host"),
  def("SUBDOMAIN_HOST_USER", "host"),
  def("SUBDOMAIN_HOST_PASSWORD", "host", { secret: true }),
  def("SUBDOMAIN_HOST_PORT", "host"),
  bool("SUBDOMAIN_HOST_SSL_DEPLOY", "host"),
  def("SUBDOMAIN_HOST_PROJECTS_DIR", "host"),
  bool("SUBDOMAIN_HOST_NGINX_PHP", "host"),
  def("SUBDOMAIN_HOST_NGINX_SITES_AVAILABLE", "host"),
  def("SUBDOMAIN_HOST_NGINX_SITES_ENABLED", "host"),
  def("SUBDOMAIN_HOST_NGINX_RELOAD_CMD", "host"),
  def("SUBDOMAIN_HOST_PHP_FPM_SOCKET", "host"),

  def("YANDEX_XML_STOCK_BASE_URL", "seo"),

  def("TELEGRAM_BOT_TOKEN", "telegram", { secret: true }),
  def("TELEGRAM_CHAT_ID", "telegram"),
  def("TELEGRAM_WEBHOOK_SECRET", "telegram", { secret: true }),
  def("TELEGRAM_BOT_USERNAME", "telegram"),
  def("TELEGRAM_BOT_MESSAGES_MAX_AGE_HOURS", "telegram"),
  def("TELEGRAM_BOT_MESSAGES_CLEANUP_BATCH", "telegram"),
  def("TELEGRAM_DELETE_COMMAND_MAX_MESSAGES", "telegram"),
  bool("TELEGRAM_DELETE_TRY_BULK_IN_GROUPS", "telegram"),
  def("CRON_SECRET", "telegram", { secret: true }),
  def("TELEGRAM_BOT_CLEANUP_CRON_SECRET", "telegram", { secret: true }),

  def("AUTOSCRIPT_WEBHOOK_URL", "autoscript"),
  def("AUTOSCRIPT_WEBHOOK_SECRET", "autoscript", { secret: true }),
];

for (const defEntry of INTEGRATION_SETTING_DEFINITIONS) {
  INTEGRATION_SETTING_DB_COLUMNS.push(envKeyToColumn(defEntry.key));
}
