-- Per-user Yandex Webmaster + Google Search Console credentials for shared auto-script-v2 worker.

alter table public.account_integration_settings
  add column if not exists yandex_access_token text,
  add column if not exists yandex_verification_method text,
  add column if not exists google_service_account_json text,
  add column if not exists google_verification_method text;

comment on column public.account_integration_settings.yandex_access_token is
  'OAuth token for Yandex Webmaster API (per user; used by auto-script-v2).';
comment on column public.account_integration_settings.yandex_verification_method is
  'html_file | meta — how auto-script deploys Yandex verification proof.';
comment on column public.account_integration_settings.google_service_account_json is
  'Google service account JSON for Site Verification + Search Console + Indexing API.';
comment on column public.account_integration_settings.google_verification_method is
  'meta | html_file — how auto-script deploys Google verification proof.';
