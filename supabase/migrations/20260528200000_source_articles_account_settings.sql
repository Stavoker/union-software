-- source_articles: per-account налаштування в /dashboard/settings (розділ generator).

alter table public.account_integration_settings
  add column if not exists softgen_source_articles_enabled text;

alter table public.account_integration_settings
  add column if not exists softgen_source_articles_language text;

alter table public.account_integration_settings
  add column if not exists softgen_source_articles_count text;

alter table public.account_integration_settings
  add column if not exists softgen_source_articles_pool_limit text;

comment on column public.account_integration_settings.softgen_source_articles_enabled is
  '1/0 — референс-тексти з source_articles у промпті LLM (за замовч. увімкнено, якщо порожньо).';
comment on column public.account_integration_settings.softgen_source_articles_language is
  'Мова фільтра source_articles (напр. ru, uk, en).';
comment on column public.account_integration_settings.softgen_source_articles_count is
  'Скільки прикладів статей на сторінку (0–4, за замовч. 2).';
comment on column public.account_integration_settings.softgen_source_articles_pool_limit is
  'Розмір пулу статей з Supabase (5–120, за замовч. 40).';
