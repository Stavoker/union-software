-- Эталонные шаблоны генератора (u-bet162, u-spot064): PHP/CSS/JS отдельными строками.

create table if not exists public.generation_site_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  chrome_mode text not null default 'top-header'
    check (chrome_mode in ('top-header', 'rail-rich-footer')),
  description text,
  source_project text,
  is_active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_site_template_assets (
  id uuid primary key default gen_random_uuid(),
  template_slug text not null
    references public.generation_site_templates (slug)
    on update cascade
    on delete cascade,
  asset_path text not null,
  asset_kind text not null
    check (asset_kind in ('page', 'partial', 'css', 'js', 'other')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_slug, asset_path)
);

create index if not exists generation_site_template_assets_slug_kind_idx
  on public.generation_site_template_assets (template_slug, asset_kind);

create index if not exists generation_site_template_assets_slug_path_idx
  on public.generation_site_template_assets (template_slug, asset_path);

comment on table public.generation_site_templates is
  'Реестр эталонов верстки для Union (bet162 = шапка сверху, spot064 = левый rail).';
comment on table public.generation_site_template_assets is
  'Фрагменты эталона: страницы PHP, partials, CSS, JS — content в БД, отдача через API.';

insert into public.generation_site_templates (slug, label, chrome_mode, description, source_project)
values
  (
    'bet162',
    'u-bet162',
    'top-header',
    'Классическая шапка сверху, igaming.css, премиум iGaming-секции',
    'u-bet162'
  ),
  (
    'spot064',
    'u-spot064',
    'rail-rich-footer',
    'Левый сайдбар lw-site-rail, богатый footer, site-shell.css',
    'u-spot064'
  )
on conflict (slug) do update set
  label = excluded.label,
  chrome_mode = excluded.chrome_mode,
  description = excluded.description,
  source_project = excluded.source_project,
  updated_at = now();

alter table public.generation_site_templates enable row level security;
alter table public.generation_site_template_assets enable row level security;

drop policy if exists generation_site_templates_select_authenticated
  on public.generation_site_templates;
create policy generation_site_templates_select_authenticated
  on public.generation_site_templates
  for select
  to authenticated
  using (is_active = true);

drop policy if exists generation_site_template_assets_select_authenticated
  on public.generation_site_template_assets;
create policy generation_site_template_assets_select_authenticated
  on public.generation_site_template_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.generation_site_templates t
      where t.slug = template_slug
        and t.is_active = true
    )
  );

-- service_role (сервер, seed-скрипт) обходит RLS
