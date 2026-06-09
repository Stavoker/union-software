-- React Lab: per-account налаштування в /dashboard/settings (розділ generator).

alter table public.account_integration_settings
  add column if not exists softgen_react_build text;

alter table public.account_integration_settings
  add column if not exists softgen_react_node_max_mb text;

alter table public.account_integration_settings
  add column if not exists softgen_react_min_page_words text;

comment on column public.account_integration_settings.softgen_react_build is
  '1/0 — React Lab (Vite SPA) збірка на Union. Порожньо = увімкнено.';
comment on column public.account_integration_settings.softgen_react_node_max_mb is
  'NODE_OPTIONS --max-old-space-size для npm run build (MB). 2GB RAM: 1024; 512MB: 280.';
comment on column public.account_integration_settings.softgen_react_min_page_words is
  'Мінімум слів на сторінку React Lab (за замовч. 2000).';
