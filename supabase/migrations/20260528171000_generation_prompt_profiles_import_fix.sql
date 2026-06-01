-- Імпорт з Google Sheets: у brand_scope часто потрапляє «Laki World» або текст з чужої колонки.
-- Нормалізуємо до laki | lakiworld | any | null перед CHECK.

create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then null::text
    when lower(btrim(raw)) in ('laki', 'lakiworld', 'any') then lower(btrim(raw))
    when lower(btrim(raw)) in (
      'laki world',
      'laki-world',
      'laki_world',
      'lakeworld',
      'laki world official',
      'лаки ворлд',
      'лаки world',
      'лаки ворлд official'
    ) then 'lakiworld'::text
    when lower(btrim(raw)) like '%lakiworld%' then 'lakiworld'::text
    when lower(btrim(raw)) like '%laki world%' then 'lakiworld'::text
    when lower(btrim(raw)) = 'лаки' then 'laki'::text
    when lower(btrim(raw)) like '%лаки%' and lower(btrim(raw)) like '%ворлд%' then 'lakiworld'::text
    else null::text
  end;
$$;

comment on function public.normalize_generation_prompt_brand_scope(text) is
  'Приводить brand_label/brand_scope до laki | lakiworld | any | null; невідоме → null (імпорт CSV).';

create or replace function public.sync_generation_prompt_profiles_brand_scope()
returns trigger
language plpgsql
as $$
declare
  from_label text;
  from_scope text;
begin
  from_label := public.normalize_generation_prompt_brand_scope(new.brand_label);
  from_scope := public.normalize_generation_prompt_brand_scope(new.brand_scope);

  -- Пріоритет: колонка «Бренд», потім явний brand_scope (якщо вже laki/lakiworld/any)
  new.brand_scope := coalesce(from_label, from_scope);
  return new;
end;
$$;

comment on function public.sync_generation_prompt_profiles_brand_scope() is
  'BEFORE INSERT/UPDATE: brand_scope ← normalize(brand_label), інакше normalize(brand_scope); сміття з CSV → null.';

-- Імпорт у Table Editor часто без тригерів — знімаємо CHECK (див. також 20260528172000)
alter table public.generation_prompt_profiles
  drop constraint if exists generation_prompt_profiles_brand_scope_check;
