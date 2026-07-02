alter table public.account_integration_settings
  add column if not exists subdomain_host_php_auto_install text;
