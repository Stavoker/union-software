/*
  Бренд генератора: 1 користувач = 1 бренд (налаштовує admin).
  Зображення — Supabase Storage bucket generator-assets.
*/

-- Бренд клієнта (admin → user)
create table if not exists public.generator_user_brands (
  user_id uuid primary key references auth.users (id) on delete cascade,
  brand_name text not null default '',
  notes text not null default '',
  palette jsonb not null default '{}'::jsonb,
  logo_storage_path text null,
  favicon_storage_path text null,
  default_theme_text text not null default '',
  prompt_overlay text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users (id) on delete set null
);

comment on table public.generator_user_brands is
  'Бренд сайту для генератора; один рядок на користувача, редагує admin';

create index if not exists idx_generator_user_brands_updated
  on public.generator_user_brands (updated_at desc);

-- Додаткові зображення бренду
create table if not exists public.generator_brand_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'misc',
  storage_path text not null,
  file_name text not null default '',
  mime_type text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint generator_brand_assets_kind_check check (
    kind in ('logo', 'favicon', 'hero', 'game', 'misc')
  )
);

create index if not exists idx_generator_brand_assets_user_sort
  on public.generator_brand_assets (user_id, sort_order, created_at);

-- Збережені теми (брифи) для користувача — admin
create table if not exists public.generator_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  theme_text text not null,
  page_count smallint null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generator_themes_user_sort
  on public.generator_themes (user_id, sort_order, created_at);

-- updated_at
create or replace function public.touch_generator_themes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generator_themes_updated_at on public.generator_themes;
create trigger trg_generator_themes_updated_at
  before update on public.generator_themes
  for each row execute function public.touch_generator_themes_updated_at();

create or replace function public.touch_generator_user_brands_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generator_user_brands_updated_at on public.generator_user_brands;
create trigger trg_generator_user_brands_updated_at
  before update on public.generator_user_brands
  for each row execute function public.touch_generator_user_brands_updated_at();

-- RLS
alter table public.generator_user_brands enable row level security;
alter table public.generator_brand_assets enable row level security;
alter table public.generator_themes enable row level security;

create or replace function public.is_union_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- brands
drop policy if exists "generator_user_brands_select_own" on public.generator_user_brands;
create policy "generator_user_brands_select_own"
  on public.generator_user_brands for select to authenticated
  using (user_id = auth.uid() or public.is_union_admin());

drop policy if exists "generator_user_brands_admin_write" on public.generator_user_brands;
create policy "generator_user_brands_admin_write"
  on public.generator_user_brands for all to authenticated
  using (public.is_union_admin())
  with check (public.is_union_admin());

-- assets
drop policy if exists "generator_brand_assets_select_own" on public.generator_brand_assets;
create policy "generator_brand_assets_select_own"
  on public.generator_brand_assets for select to authenticated
  using (user_id = auth.uid() or public.is_union_admin());

drop policy if exists "generator_brand_assets_admin_write" on public.generator_brand_assets;
create policy "generator_brand_assets_admin_write"
  on public.generator_brand_assets for all to authenticated
  using (public.is_union_admin())
  with check (public.is_union_admin());

-- themes
drop policy if exists "generator_themes_select_own" on public.generator_themes;
create policy "generator_themes_select_own"
  on public.generator_themes for select to authenticated
  using (user_id = auth.uid() or public.is_union_admin());

drop policy if exists "generator_themes_admin_write" on public.generator_themes;
create policy "generator_themes_admin_write"
  on public.generator_themes for all to authenticated
  using (public.is_union_admin())
  with check (public.is_union_admin());

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generator-assets',
  'generator-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "generator_assets_select_own" on storage.objects;
create policy "generator_assets_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'generator-assets'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_union_admin()
    )
  );

drop policy if exists "generator_assets_admin_insert" on storage.objects;
create policy "generator_assets_admin_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'generator-assets'
    and public.is_union_admin()
  );

drop policy if exists "generator_assets_admin_update" on storage.objects;
create policy "generator_assets_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'generator-assets' and public.is_union_admin())
  with check (bucket_id = 'generator-assets' and public.is_union_admin());

drop policy if exists "generator_assets_admin_delete" on storage.objects;
create policy "generator_assets_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'generator-assets' and public.is_union_admin());
