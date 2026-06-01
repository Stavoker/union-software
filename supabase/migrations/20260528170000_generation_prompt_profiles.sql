-- Профілі додаткових промптів для multipage-генератора (шар поверх architect/page у коді).
-- Читання: service_role (генератор); authenticated — лише active; write — admin.
-- Колонки узгоджені з Google Sheets: brand_label, main_keyword, concept, …, full_generation_prompt.

create table if not exists public.generation_prompt_profiles (
  id uuid not null default gen_random_uuid(),
  name text not null,
  brand_label text null,
  brand_scope text null,
  main_keyword text null,
  concept text null,
  target_audience text null,
  tone text null,
  mandatory_fourth_subpage text null,
  full_generation_prompt text not null,
  meta jsonb not null default '{}'::jsonb,
  active_status boolean not null default true,
  weight smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_prompt_profiles_pkey primary key (id),
  -- brand_scope: завжди any (див. 281800); CHECK знято в 281710/281720
  constraint generation_prompt_profiles_weight_check check (
    weight >= 1 and weight <= 100
  )
);

comment on table public.generation_prompt_profiles is
  'Профілі промптів для урізноманітнення генерації; full_generation_prompt додається поверх жорсткого JSON/HTML пайплайну.';
comment on column public.generation_prompt_profiles.brand_label is
  'Колонка «Бренд» (Laki, Laki World …); тригер нормалізує brand_scope.';
comment on column public.generation_prompt_profiles.brand_scope is
  'Фільтр пакета: laki | lakiworld | any | null; підбирається з теми в коді.';
comment on column public.generation_prompt_profiles.full_generation_prompt is
  'Повний додатковий текст інструкцій для architect/page промптів.';

create index if not exists idx_generation_prompt_profiles_active_brand
  on public.generation_prompt_profiles using btree (active_status, brand_scope)
  where active_status = true;

create or replace function public.touch_generation_prompt_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generation_prompt_profiles_updated_at
  on public.generation_prompt_profiles;

create trigger trg_generation_prompt_profiles_updated_at
  before update on public.generation_prompt_profiles
  for each row
  execute function public.touch_generation_prompt_profiles_updated_at();

-- brand_label / brand_scope → laki | lakiworld | any | null (див. 20260528171000 для normalize)
create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null::text
    when lower(btrim(raw)) in ('laki', 'lakiworld', 'any') then lower(btrim(raw))
    when lower(btrim(raw)) in ('laki world', 'laki-world', 'laki_world', 'lakeworld') then 'lakiworld'::text
    when lower(btrim(raw)) like '%lakiworld%' or lower(btrim(raw)) like '%laki world%' then 'lakiworld'::text
    when lower(btrim(raw)) = 'лаки' then 'laki'::text
    when lower(btrim(raw)) like '%лаки%' and lower(btrim(raw)) like '%ворлд%' then 'lakiworld'::text
    else null::text
  end;
$$;

create or replace function public.sync_generation_prompt_profiles_brand_scope()
returns trigger
language plpgsql
as $$
begin
  new.brand_scope := coalesce(
    public.normalize_generation_prompt_brand_scope(new.brand_label),
    public.normalize_generation_prompt_brand_scope(new.brand_scope)
  );
  return new;
end;
$$;

drop trigger if exists trg_generation_prompt_profiles_brand_scope
  on public.generation_prompt_profiles;

create trigger trg_generation_prompt_profiles_brand_scope
  before insert or update on public.generation_prompt_profiles
  for each row
  execute function public.sync_generation_prompt_profiles_brand_scope();

create or replace function public.is_union_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

alter table public.generation_prompt_profiles enable row level security;

drop policy if exists generation_prompt_profiles_select_active
  on public.generation_prompt_profiles;
create policy generation_prompt_profiles_select_active
  on public.generation_prompt_profiles
  for select
  to authenticated
  using (active_status = true);

drop policy if exists generation_prompt_profiles_admin_write
  on public.generation_prompt_profiles;
create policy generation_prompt_profiles_admin_write
  on public.generation_prompt_profiles
  for all
  to authenticated
  using (public.is_union_admin())
  with check (public.is_union_admin());

-- service_role (генератор) обходить RLS
