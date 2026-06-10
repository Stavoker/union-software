-- Мова контенту згенерованого сайту (окремо від мови референсів source_articles).

alter table public.account_integration_settings
  add column if not exists softgen_site_content_language text;

comment on column public.account_integration_settings.softgen_site_content_language is
  'Мова тексту на згенерованому сайті: ru або uk (за замовч. ru). Референси source_articles можуть бути en.';
