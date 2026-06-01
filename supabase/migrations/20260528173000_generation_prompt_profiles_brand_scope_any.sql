-- За замовчуванням brand_scope = any (універсальні профілі); laki/lakiworld лише з явного brand_label.

create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null or btrim(raw) = '' then 'any'::text
    when lower(btrim(raw)) in ('laki', 'lakiworld', 'any') then lower(btrim(raw))
    when lower(btrim(raw)) in (
      'laki world', 'laki-world', 'laki_world', 'lakeworld',
      'лаки ворлд', 'лаки world'
    ) then 'lakiworld'::text
    when lower(btrim(raw)) like '%lakiworld%' then 'lakiworld'::text
    when lower(btrim(raw)) like '%laki world%' then 'lakiworld'::text
    when lower(btrim(raw)) = 'лаки' then 'laki'::text
    when lower(btrim(raw)) like '%лаки%' and lower(btrim(raw)) like '%ворлд%' then 'lakiworld'::text
    else 'any'::text
  end;
$$;

comment on function public.normalize_generation_prompt_brand_scope(text) is
  'laki | lakiworld з Laki/Laki World; усе інше (порожнє, сміття CSV) → any.';

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

  if from_label in ('laki', 'lakiworld') then
    new.brand_scope := from_label;
  elsif from_scope in ('laki', 'lakiworld') then
    new.brand_scope := from_scope;
  else
    new.brand_scope := 'any';
  end if;
  return new;
end;
$$;

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
  set brand_scope = case
    when public.normalize_generation_prompt_brand_scope(g.brand_label) in ('laki', 'lakiworld')
      then public.normalize_generation_prompt_brand_scope(g.brand_label)
    when public.normalize_generation_prompt_brand_scope(g.brand_scope) in ('laki', 'lakiworld')
      then public.normalize_generation_prompt_brand_scope(g.brand_scope)
    else 'any'
  end;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.repair_generation_prompt_profiles_brand_scope() is
  'Після імпорту: Laki/Laki World → laki/lakiworld, решта рядків → any.';

alter table public.generation_prompt_profiles
  alter column brand_scope set default 'any';

update public.generation_prompt_profiles
set brand_scope = 'any'
where brand_scope is null
   or btrim(brand_scope) = ''
   or lower(btrim(brand_scope)) not in ('laki', 'lakiworld', 'any');
