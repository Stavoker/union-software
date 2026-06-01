-- Table Editor / CSV import у Supabase часто вставляє рядки БЕЗ BEFORE-тригерів.
-- CHECK на brand_scope тоді падає на «Laki World» або зміщених колонках.
-- Нормалізація лишається в тригері + одноразовий UPDATE після імпорту.

-- 1) Функції (ідемпотентно, якщо 281710 ще не застосовували)
create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null::text
    when lower(btrim(raw)) in ('laki', 'lakiworld', 'any') then lower(btrim(raw))
    when lower(btrim(raw)) in (
      'laki world', 'laki-world', 'laki_world', 'lakeworld',
      'лаки ворлд', 'лаки world'
    ) then 'lakiworld'::text
    when lower(btrim(raw)) like '%lakiworld%' then 'lakiworld'::text
    when lower(btrim(raw)) like '%laki world%' then 'lakiworld'::text
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

-- 2) Прибрати CHECK — імпорт більше не блокується
alter table public.generation_prompt_profiles
  drop constraint if exists generation_prompt_profiles_brand_scope_check;

comment on column public.generation_prompt_profiles.brand_scope is
  'laki | lakiworld | any | null. Нормалізується тригером; після масового імпорту: select public.repair_generation_prompt_profiles_brand_scope();';

-- 3) Почистити вже імпортовані / зіпсовані рядки
create or replace function public.repair_generation_prompt_profiles_brand_scope()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.generation_prompt_profiles g
  set brand_scope = coalesce(
    public.normalize_generation_prompt_brand_scope(g.brand_label),
    public.normalize_generation_prompt_brand_scope(g.brand_scope)
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.repair_generation_prompt_profiles_brand_scope() is
  'Після CSV-імпорту: brand_scope з brand_label (Laki World → lakiworld), сміття → null.';
