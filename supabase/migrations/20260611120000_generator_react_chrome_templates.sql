-- React Lab: 50 sidebar + 50 header chrome style presets (seeded from app catalog on first build).

create table if not exists public.generator_react_chrome_templates (
  id text primary key,
  chrome_kind text not null check (chrome_kind in ('sidebar', 'header')),
  variant_number int not null check (variant_number >= 1 and variant_number <= 50),
  label text not null default '',
  style_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generator_react_chrome_templates_kind_variant_key unique (chrome_kind, variant_number)
);

comment on table public.generator_react_chrome_templates is
  'React SiteLayout chrome presets: sidebar-01..50, header-01..50. Rows upserted from react-chrome-templates-catalog.js.';

create index if not exists idx_generator_react_chrome_templates_kind
  on public.generator_react_chrome_templates (chrome_kind, variant_number)
  where is_active;

alter table public.generator_react_chrome_templates enable row level security;

drop policy if exists "generator_react_chrome_templates_select_authenticated"
  on public.generator_react_chrome_templates;

create policy "generator_react_chrome_templates_select_authenticated"
  on public.generator_react_chrome_templates for select to authenticated
  using (true);
