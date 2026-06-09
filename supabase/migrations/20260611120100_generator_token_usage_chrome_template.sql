-- Track which React chrome preset was used per generation job.

alter table public.generator_token_usage
  add column if not exists chrome_template_id text;

create index if not exists idx_generator_token_usage_chrome_template
  on public.generator_token_usage (chrome_template_id)
  where chrome_template_id is not null;

comment on column public.generator_token_usage.chrome_template_id is
  'React Lab chrome preset id (sidebar-01..50 | header-01..50) from generator_react_chrome_templates.';
