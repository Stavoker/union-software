-- Track React page section-order frameworks per generation (home + inner page_kinds).

alter table public.generator_token_usage
  add column if not exists home_page_framework_id text,
  add column if not exists page_frameworks_json jsonb;

create index if not exists idx_generator_token_usage_home_framework
  on public.generator_token_usage (home_page_framework_id)
  where home_page_framework_id is not null;

comment on column public.generator_token_usage.home_page_framework_id is
  'React home framework id (e.g. sidebar-home-042) from generator_react_page_frameworks.';

comment on column public.generator_token_usage.page_frameworks_json is
  'React page frameworks snapshot: { home, byPageKind: { promo: id, … }, orders: { home: [...], promo: [...] } }.';
