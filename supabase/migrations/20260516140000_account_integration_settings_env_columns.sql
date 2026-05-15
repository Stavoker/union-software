/*
  account_integration_settings: одна text-колонка на env-змінну (lowercase імена).
  Якщо є jsonb values — переносить дані і видаляє values.
*/

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_integration_settings'
      and column_name = 'values'
  ) then
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_01 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_02 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_03 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_04 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_05 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_06 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_07 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_08 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_09 text';
    execute 'alter table public.account_integration_settings add column if not exists claude_api_key_10 text';
    execute 'alter table public.account_integration_settings add column if not exists anthropic_model text';
    execute 'alter table public.account_integration_settings add column if not exists aurora_generation_temperature text';
    execute 'alter table public.account_integration_settings add column if not exists anthropic_max_tokens_page text';
    execute 'alter table public.account_integration_settings add column if not exists anthropic_max_tokens_architect text';
    execute 'alter table public.account_integration_settings add column if not exists anthropic_max_tokens_jsfix text';
    execute 'alter table public.account_integration_settings add column if not exists aurora_claude_site_output_budget text';
    execute 'alter table public.account_integration_settings add column if not exists anthropic_fetch_timeout_ms text';
    execute 'alter table public.account_integration_settings add column if not exists aurora_gateway_url text';
    execute 'alter table public.account_integration_settings add column if not exists aurora_gateway_diversify text';
    execute 'alter table public.account_integration_settings add column if not exists soft_subfolder_root_dir text';
    execute 'alter table public.account_integration_settings add column if not exists soft_subfolder_templates_dir text';
    execute 'alter table public.account_integration_settings add column if not exists soft_subfolder_projects_dir text';
    execute 'alter table public.account_integration_settings add column if not exists php_binary text';
    execute 'alter table public.account_integration_settings add column if not exists soft_subfolder_php text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_require_reference_structure text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_template_mode text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_prompt_regen_enabled text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_prompt_regen_max_tokens text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_enabled text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_page_on_retry text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_max_tokens text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_similarity_threshold text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_section_order_min text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_similarity_check_index_only text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_text_fill_max_attempts text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_fetch_timeout_ms text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_template_main_max_chars text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_template_chrome_max_chars text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_reference_document_context_max_chars text';
    execute 'alter table public.account_integration_settings add column if not exists softgen_strict_placeholder_fill text';
    execute 'alter table public.account_integration_settings add column if not exists spaceship_api_key text';
    execute 'alter table public.account_integration_settings add column if not exists spaceship_api_secret text';
    execute 'alter table public.account_integration_settings add column if not exists spaceship_contact_id text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_auth_token text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_auth_through_key text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_authinfo text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_username text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_password text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_billmgr_url text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_billmgr_host text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_billmgr_port text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_billmgr_use_http text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_dnsmgr_url text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_dnsmgr_domain_email text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_dnsmgr_enabled text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_api_dns_enabled text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_dnsmgr_txt_create_func text';
    execute 'alter table public.account_integration_settings add column if not exists zomro_dnsmgr_txt_delete_func text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_letsencrypt_email text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_letsencrypt_staging text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_letsencrypt_skip_verify text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_async_retry_ms text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_async_progress_every_attempts text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_min_authoritative_ns_ready text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_dns_challenge_remove_delay_ms text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_delegation_wait_timeout_ms text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_delegation_wait_poll_ms text';
    execute 'alter table public.account_integration_settings add column if not exists ssl_zomro_dns_post_delay_ms text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_ip text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_user text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_password text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_port text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_ssl_deploy text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_projects_dir text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_nginx_php text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_nginx_sites_available text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_nginx_sites_enabled text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_nginx_reload_cmd text';
    execute 'alter table public.account_integration_settings add column if not exists subdomain_host_php_fpm_socket text';
    execute 'alter table public.account_integration_settings add column if not exists yandex_xml_stock_base_url text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_bot_token text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_chat_id text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_webhook_secret text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_bot_username text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_bot_messages_max_age_hours text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_bot_messages_cleanup_batch text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_delete_command_max_messages text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_delete_try_bulk_in_groups text';
    execute 'alter table public.account_integration_settings add column if not exists cron_secret text';
    execute 'alter table public.account_integration_settings add column if not exists telegram_bot_cleanup_cron_secret text';
    execute 'alter table public.account_integration_settings add column if not exists autoscript_webhook_url text';
    execute 'alter table public.account_integration_settings add column if not exists autoscript_webhook_secret text';
    execute $migrate$
      update public.account_integration_settings set
        claude_api_key_01 = nullif(trim(values->>'CLAUDE_API_KEY_01'), ''),
        claude_api_key_02 = nullif(trim(values->>'CLAUDE_API_KEY_02'), ''),
        claude_api_key_03 = nullif(trim(values->>'CLAUDE_API_KEY_03'), ''),
        claude_api_key_04 = nullif(trim(values->>'CLAUDE_API_KEY_04'), ''),
        claude_api_key_05 = nullif(trim(values->>'CLAUDE_API_KEY_05'), ''),
        claude_api_key_06 = nullif(trim(values->>'CLAUDE_API_KEY_06'), ''),
        claude_api_key_07 = nullif(trim(values->>'CLAUDE_API_KEY_07'), ''),
        claude_api_key_08 = nullif(trim(values->>'CLAUDE_API_KEY_08'), ''),
        claude_api_key_09 = nullif(trim(values->>'CLAUDE_API_KEY_09'), ''),
        claude_api_key_10 = nullif(trim(values->>'CLAUDE_API_KEY_10'), ''),
        anthropic_model = nullif(trim(values->>'ANTHROPIC_MODEL'), ''),
        aurora_generation_temperature = nullif(trim(values->>'AURORA_GENERATION_TEMPERATURE'), ''),
        anthropic_max_tokens_page = nullif(trim(values->>'ANTHROPIC_MAX_TOKENS_PAGE'), ''),
        anthropic_max_tokens_architect = nullif(trim(values->>'ANTHROPIC_MAX_TOKENS_ARCHITECT'), ''),
        anthropic_max_tokens_jsfix = nullif(trim(values->>'ANTHROPIC_MAX_TOKENS_JSFIX'), ''),
        aurora_claude_site_output_budget = nullif(trim(values->>'AURORA_CLAUDE_SITE_OUTPUT_BUDGET'), ''),
        anthropic_fetch_timeout_ms = nullif(trim(values->>'ANTHROPIC_FETCH_TIMEOUT_MS'), ''),
        aurora_gateway_url = nullif(trim(values->>'AURORA_GATEWAY_URL'), ''),
        aurora_gateway_diversify = nullif(trim(values->>'AURORA_GATEWAY_DIVERSIFY'), ''),
        soft_subfolder_root_dir = nullif(trim(values->>'SOFT_SUBFOLDER_ROOT_DIR'), ''),
        soft_subfolder_templates_dir = nullif(trim(values->>'SOFT_SUBFOLDER_TEMPLATES_DIR'), ''),
        soft_subfolder_projects_dir = nullif(trim(values->>'SOFT_SUBFOLDER_PROJECTS_DIR'), ''),
        php_binary = nullif(trim(values->>'PHP_BINARY'), ''),
        soft_subfolder_php = nullif(trim(values->>'SOFT_SUBFOLDER_PHP'), ''),
        softgen_require_reference_structure = nullif(trim(values->>'SOFTGEN_REQUIRE_REFERENCE_STRUCTURE'), ''),
        softgen_reference_template_mode = nullif(trim(values->>'SOFTGEN_REFERENCE_TEMPLATE_MODE'), ''),
        softgen_prompt_regen_enabled = nullif(trim(values->>'SOFTGEN_PROMPT_REGEN_ENABLED'), ''),
        softgen_prompt_regen_max_tokens = nullif(trim(values->>'SOFTGEN_PROMPT_REGEN_MAX_TOKENS'), ''),
        softgen_prompt_rewrite_enabled = nullif(trim(values->>'SOFTGEN_PROMPT_REWRITE_ENABLED'), ''),
        softgen_prompt_rewrite_page_on_retry = nullif(trim(values->>'SOFTGEN_PROMPT_REWRITE_PAGE_ON_RETRY'), ''),
        softgen_prompt_rewrite_max_tokens = nullif(trim(values->>'SOFTGEN_PROMPT_REWRITE_MAX_TOKENS'), ''),
        softgen_reference_similarity_threshold = nullif(trim(values->>'SOFTGEN_REFERENCE_SIMILARITY_THRESHOLD'), ''),
        softgen_reference_section_order_min = nullif(trim(values->>'SOFTGEN_REFERENCE_SECTION_ORDER_MIN'), ''),
        softgen_reference_similarity_check_index_only = nullif(trim(values->>'SOFTGEN_REFERENCE_SIMILARITY_CHECK_INDEX_ONLY'), ''),
        softgen_text_fill_max_attempts = nullif(trim(values->>'SOFTGEN_TEXT_FILL_MAX_ATTEMPTS'), ''),
        softgen_reference_fetch_timeout_ms = nullif(trim(values->>'SOFTGEN_REFERENCE_FETCH_TIMEOUT_MS'), ''),
        softgen_reference_template_main_max_chars = nullif(trim(values->>'SOFTGEN_REFERENCE_TEMPLATE_MAIN_MAX_CHARS'), ''),
        softgen_reference_template_chrome_max_chars = nullif(trim(values->>'SOFTGEN_REFERENCE_TEMPLATE_CHROME_MAX_CHARS'), ''),
        softgen_reference_document_context_max_chars = nullif(trim(values->>'SOFTGEN_REFERENCE_DOCUMENT_CONTEXT_MAX_CHARS'), ''),
        softgen_strict_placeholder_fill = nullif(trim(values->>'SOFTGEN_STRICT_PLACEHOLDER_FILL'), ''),
        spaceship_api_key = nullif(trim(values->>'SPACESHIP_API_KEY'), ''),
        spaceship_api_secret = nullif(trim(values->>'SPACESHIP_API_SECRET'), ''),
        spaceship_contact_id = nullif(trim(values->>'SPACESHIP_CONTACT_ID'), ''),
        zomro_auth_token = nullif(trim(values->>'ZOMRO_AUTH_TOKEN'), ''),
        zomro_auth_through_key = nullif(trim(values->>'ZOMRO_AUTH_THROUGH_KEY'), ''),
        zomro_authinfo = nullif(trim(values->>'ZOMRO_AUTHINFO'), ''),
        zomro_username = nullif(trim(values->>'ZOMRO_USERNAME'), ''),
        zomro_password = nullif(trim(values->>'ZOMRO_PASSWORD'), ''),
        zomro_billmgr_url = nullif(trim(values->>'ZOMRO_BILLMGR_URL'), ''),
        zomro_billmgr_host = nullif(trim(values->>'ZOMRO_BILLMGR_HOST'), ''),
        zomro_billmgr_port = nullif(trim(values->>'ZOMRO_BILLMGR_PORT'), ''),
        zomro_billmgr_use_http = nullif(trim(values->>'ZOMRO_BILLMGR_USE_HTTP'), ''),
        zomro_dnsmgr_url = nullif(trim(values->>'ZOMRO_DNSMGR_URL'), ''),
        zomro_dnsmgr_domain_email = nullif(trim(values->>'ZOMRO_DNSMGR_DOMAIN_EMAIL'), ''),
        zomro_dnsmgr_enabled = nullif(trim(values->>'ZOMRO_DNSMGR_ENABLED'), ''),
        zomro_api_dns_enabled = nullif(trim(values->>'ZOMRO_API_DNS_ENABLED'), ''),
        zomro_dnsmgr_txt_create_func = nullif(trim(values->>'ZOMRO_DNSMGR_TXT_CREATE_FUNC'), ''),
        zomro_dnsmgr_txt_delete_func = nullif(trim(values->>'ZOMRO_DNSMGR_TXT_DELETE_FUNC'), ''),
        ssl_letsencrypt_email = nullif(trim(values->>'SSL_LETSENCRYPT_EMAIL'), ''),
        ssl_letsencrypt_staging = nullif(trim(values->>'SSL_LETSENCRYPT_STAGING'), ''),
        ssl_letsencrypt_skip_verify = nullif(trim(values->>'SSL_LETSENCRYPT_SKIP_VERIFY'), ''),
        ssl_async_retry_ms = nullif(trim(values->>'SSL_ASYNC_RETRY_MS'), ''),
        ssl_async_progress_every_attempts = nullif(trim(values->>'SSL_ASYNC_PROGRESS_EVERY_ATTEMPTS'), ''),
        ssl_min_authoritative_ns_ready = nullif(trim(values->>'SSL_MIN_AUTHORITATIVE_NS_READY'), ''),
        ssl_dns_challenge_remove_delay_ms = nullif(trim(values->>'SSL_DNS_CHALLENGE_REMOVE_DELAY_MS'), ''),
        ssl_delegation_wait_timeout_ms = nullif(trim(values->>'SSL_DELEGATION_WAIT_TIMEOUT_MS'), ''),
        ssl_delegation_wait_poll_ms = nullif(trim(values->>'SSL_DELEGATION_WAIT_POLL_MS'), ''),
        ssl_zomro_dns_post_delay_ms = nullif(trim(values->>'SSL_ZOMRO_DNS_POST_DELAY_MS'), ''),
        subdomain_host_ip = nullif(trim(values->>'SUBDOMAIN_HOST_IP'), ''),
        subdomain_host_user = nullif(trim(values->>'SUBDOMAIN_HOST_USER'), ''),
        subdomain_host_password = nullif(trim(values->>'SUBDOMAIN_HOST_PASSWORD'), ''),
        subdomain_host_port = nullif(trim(values->>'SUBDOMAIN_HOST_PORT'), ''),
        subdomain_host_ssl_deploy = nullif(trim(values->>'SUBDOMAIN_HOST_SSL_DEPLOY'), ''),
        subdomain_host_projects_dir = nullif(trim(values->>'SUBDOMAIN_HOST_PROJECTS_DIR'), ''),
        subdomain_host_nginx_php = nullif(trim(values->>'SUBDOMAIN_HOST_NGINX_PHP'), ''),
        subdomain_host_nginx_sites_available = nullif(trim(values->>'SUBDOMAIN_HOST_NGINX_SITES_AVAILABLE'), ''),
        subdomain_host_nginx_sites_enabled = nullif(trim(values->>'SUBDOMAIN_HOST_NGINX_SITES_ENABLED'), ''),
        subdomain_host_nginx_reload_cmd = nullif(trim(values->>'SUBDOMAIN_HOST_NGINX_RELOAD_CMD'), ''),
        subdomain_host_php_fpm_socket = nullif(trim(values->>'SUBDOMAIN_HOST_PHP_FPM_SOCKET'), ''),
        yandex_xml_stock_base_url = nullif(trim(values->>'YANDEX_XML_STOCK_BASE_URL'), ''),
        telegram_bot_token = nullif(trim(values->>'TELEGRAM_BOT_TOKEN'), ''),
        telegram_chat_id = nullif(trim(values->>'TELEGRAM_CHAT_ID'), ''),
        telegram_webhook_secret = nullif(trim(values->>'TELEGRAM_WEBHOOK_SECRET'), ''),
        telegram_bot_username = nullif(trim(values->>'TELEGRAM_BOT_USERNAME'), ''),
        telegram_bot_messages_max_age_hours = nullif(trim(values->>'TELEGRAM_BOT_MESSAGES_MAX_AGE_HOURS'), ''),
        telegram_bot_messages_cleanup_batch = nullif(trim(values->>'TELEGRAM_BOT_MESSAGES_CLEANUP_BATCH'), ''),
        telegram_delete_command_max_messages = nullif(trim(values->>'TELEGRAM_DELETE_COMMAND_MAX_MESSAGES'), ''),
        telegram_delete_try_bulk_in_groups = nullif(trim(values->>'TELEGRAM_DELETE_TRY_BULK_IN_GROUPS'), ''),
        cron_secret = nullif(trim(values->>'CRON_SECRET'), ''),
        telegram_bot_cleanup_cron_secret = nullif(trim(values->>'TELEGRAM_BOT_CLEANUP_CRON_SECRET'), ''),
        autoscript_webhook_url = nullif(trim(values->>'AUTOSCRIPT_WEBHOOK_URL'), ''),
        autoscript_webhook_secret = nullif(trim(values->>'AUTOSCRIPT_WEBHOOK_SECRET'), '')
    $migrate$;
    alter table public.account_integration_settings drop column values;
  end if;
end $$;

alter table public.account_integration_settings add column if not exists claude_api_key_01 text;
alter table public.account_integration_settings add column if not exists claude_api_key_02 text;
alter table public.account_integration_settings add column if not exists claude_api_key_03 text;
alter table public.account_integration_settings add column if not exists claude_api_key_04 text;
alter table public.account_integration_settings add column if not exists claude_api_key_05 text;
alter table public.account_integration_settings add column if not exists claude_api_key_06 text;
alter table public.account_integration_settings add column if not exists claude_api_key_07 text;
alter table public.account_integration_settings add column if not exists claude_api_key_08 text;
alter table public.account_integration_settings add column if not exists claude_api_key_09 text;
alter table public.account_integration_settings add column if not exists claude_api_key_10 text;
alter table public.account_integration_settings add column if not exists anthropic_model text;
alter table public.account_integration_settings add column if not exists aurora_generation_temperature text;
alter table public.account_integration_settings add column if not exists anthropic_max_tokens_page text;
alter table public.account_integration_settings add column if not exists anthropic_max_tokens_architect text;
alter table public.account_integration_settings add column if not exists anthropic_max_tokens_jsfix text;
alter table public.account_integration_settings add column if not exists aurora_claude_site_output_budget text;
alter table public.account_integration_settings add column if not exists anthropic_fetch_timeout_ms text;
alter table public.account_integration_settings add column if not exists aurora_gateway_url text;
alter table public.account_integration_settings add column if not exists aurora_gateway_diversify text;
alter table public.account_integration_settings add column if not exists soft_subfolder_root_dir text;
alter table public.account_integration_settings add column if not exists soft_subfolder_templates_dir text;
alter table public.account_integration_settings add column if not exists soft_subfolder_projects_dir text;
alter table public.account_integration_settings add column if not exists php_binary text;
alter table public.account_integration_settings add column if not exists soft_subfolder_php text;
alter table public.account_integration_settings add column if not exists softgen_require_reference_structure text;
alter table public.account_integration_settings add column if not exists softgen_reference_template_mode text;
alter table public.account_integration_settings add column if not exists softgen_prompt_regen_enabled text;
alter table public.account_integration_settings add column if not exists softgen_prompt_regen_max_tokens text;
alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_enabled text;
alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_page_on_retry text;
alter table public.account_integration_settings add column if not exists softgen_prompt_rewrite_max_tokens text;
alter table public.account_integration_settings add column if not exists softgen_reference_similarity_threshold text;
alter table public.account_integration_settings add column if not exists softgen_reference_section_order_min text;
alter table public.account_integration_settings add column if not exists softgen_reference_similarity_check_index_only text;
alter table public.account_integration_settings add column if not exists softgen_text_fill_max_attempts text;
alter table public.account_integration_settings add column if not exists softgen_reference_fetch_timeout_ms text;
alter table public.account_integration_settings add column if not exists softgen_reference_template_main_max_chars text;
alter table public.account_integration_settings add column if not exists softgen_reference_template_chrome_max_chars text;
alter table public.account_integration_settings add column if not exists softgen_reference_document_context_max_chars text;
alter table public.account_integration_settings add column if not exists softgen_strict_placeholder_fill text;
alter table public.account_integration_settings add column if not exists spaceship_api_key text;
alter table public.account_integration_settings add column if not exists spaceship_api_secret text;
alter table public.account_integration_settings add column if not exists spaceship_contact_id text;
alter table public.account_integration_settings add column if not exists zomro_auth_token text;
alter table public.account_integration_settings add column if not exists zomro_auth_through_key text;
alter table public.account_integration_settings add column if not exists zomro_authinfo text;
alter table public.account_integration_settings add column if not exists zomro_username text;
alter table public.account_integration_settings add column if not exists zomro_password text;
alter table public.account_integration_settings add column if not exists zomro_billmgr_url text;
alter table public.account_integration_settings add column if not exists zomro_billmgr_host text;
alter table public.account_integration_settings add column if not exists zomro_billmgr_port text;
alter table public.account_integration_settings add column if not exists zomro_billmgr_use_http text;
alter table public.account_integration_settings add column if not exists zomro_dnsmgr_url text;
alter table public.account_integration_settings add column if not exists zomro_dnsmgr_domain_email text;
alter table public.account_integration_settings add column if not exists zomro_dnsmgr_enabled text;
alter table public.account_integration_settings add column if not exists zomro_api_dns_enabled text;
alter table public.account_integration_settings add column if not exists zomro_dnsmgr_txt_create_func text;
alter table public.account_integration_settings add column if not exists zomro_dnsmgr_txt_delete_func text;
alter table public.account_integration_settings add column if not exists ssl_letsencrypt_email text;
alter table public.account_integration_settings add column if not exists ssl_letsencrypt_staging text;
alter table public.account_integration_settings add column if not exists ssl_letsencrypt_skip_verify text;
alter table public.account_integration_settings add column if not exists ssl_async_retry_ms text;
alter table public.account_integration_settings add column if not exists ssl_async_progress_every_attempts text;
alter table public.account_integration_settings add column if not exists ssl_min_authoritative_ns_ready text;
alter table public.account_integration_settings add column if not exists ssl_dns_challenge_remove_delay_ms text;
alter table public.account_integration_settings add column if not exists ssl_delegation_wait_timeout_ms text;
alter table public.account_integration_settings add column if not exists ssl_delegation_wait_poll_ms text;
alter table public.account_integration_settings add column if not exists ssl_zomro_dns_post_delay_ms text;
alter table public.account_integration_settings add column if not exists subdomain_host_ip text;
alter table public.account_integration_settings add column if not exists subdomain_host_user text;
alter table public.account_integration_settings add column if not exists subdomain_host_password text;
alter table public.account_integration_settings add column if not exists subdomain_host_port text;
alter table public.account_integration_settings add column if not exists subdomain_host_ssl_deploy text;
alter table public.account_integration_settings add column if not exists subdomain_host_projects_dir text;
alter table public.account_integration_settings add column if not exists subdomain_host_nginx_php text;
alter table public.account_integration_settings add column if not exists subdomain_host_nginx_sites_available text;
alter table public.account_integration_settings add column if not exists subdomain_host_nginx_sites_enabled text;
alter table public.account_integration_settings add column if not exists subdomain_host_nginx_reload_cmd text;
alter table public.account_integration_settings add column if not exists subdomain_host_php_fpm_socket text;
alter table public.account_integration_settings add column if not exists yandex_xml_stock_base_url text;
alter table public.account_integration_settings add column if not exists telegram_bot_token text;
alter table public.account_integration_settings add column if not exists telegram_chat_id text;
alter table public.account_integration_settings add column if not exists telegram_webhook_secret text;
alter table public.account_integration_settings add column if not exists telegram_bot_username text;
alter table public.account_integration_settings add column if not exists telegram_bot_messages_max_age_hours text;
alter table public.account_integration_settings add column if not exists telegram_bot_messages_cleanup_batch text;
alter table public.account_integration_settings add column if not exists telegram_delete_command_max_messages text;
alter table public.account_integration_settings add column if not exists telegram_delete_try_bulk_in_groups text;
alter table public.account_integration_settings add column if not exists cron_secret text;
alter table public.account_integration_settings add column if not exists telegram_bot_cleanup_cron_secret text;
alter table public.account_integration_settings add column if not exists autoscript_webhook_url text;
alter table public.account_integration_settings add column if not exists autoscript_webhook_secret text;

comment on table public.account_integration_settings is
  'Per-user integration env: one text column per variable (see integration-setting-definitions.js)';
