-- Ліміти слів у Settings (генератор).

alter table public.account_integration_settings
  add column if not exists softgen_min_page_words text;

alter table public.account_integration_settings
  add column if not exists softgen_min_index_page_words text;

alter table public.account_integration_settings
  add column if not exists softgen_max_page_words text;
