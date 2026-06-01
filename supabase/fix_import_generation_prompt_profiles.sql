-- Універсальні профілі для всіх брендів. Виконай у SQL Editor, потім repair.

alter table public.generation_prompt_profiles
  drop constraint if exists generation_prompt_profiles_brand_scope_check;

-- Далі той самий вміст, що migrations/20260528180000_generation_prompt_profiles_universal.sql

create or replace function public.strip_legacy_brand_names_from_profile_text(t text)
returns text
language sql
immutable
as $$
  select trim(both from regexp_replace(
    regexp_replace(
      regexp_replace(
        coalesce(t, ''),
        '(?i)\m(laki\s*world|lakiworld|лаки\s*ворлд|лаки\s*world)\M',
        '{brand}',
        'g'
      ),
      '(?i)\m(laki|лаки)\M',
      '{brand}',
      'g'
    ),
    '\s{2,}',
    ' ',
    'g'
  ));
$$;

create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select 'any'::text;
$$;

create or replace function public.sync_generation_prompt_profiles_brand_scope()
returns trigger
language plpgsql
as $$
begin
  new.brand_scope := 'any';
  return new;
end;
$$;

drop trigger if exists trg_generation_prompt_profiles_brand_scope
  on public.generation_prompt_profiles;
create trigger trg_generation_prompt_profiles_brand_scope
  before insert or update on public.generation_prompt_profiles
  for each row
  execute function public.sync_generation_prompt_profiles_brand_scope();

alter table public.generation_prompt_profiles
  alter column brand_scope set default 'any';

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
  set
    brand_scope = 'any',
    brand_label = case
      when g.brand_label is null or btrim(g.brand_label) = '' then 'Универсальный'
      when g.brand_label ~* '(laki|лаки)' then 'Универсальный'
      else g.brand_label
    end,
    name = public.strip_legacy_brand_names_from_profile_text(
      regexp_replace(coalesce(g.name, ''), '(?i)\s*[-—]\s*profile\s*\d+\s*$', '', 'g')
    ),
    main_keyword = public.strip_legacy_brand_names_from_profile_text(g.main_keyword),
    concept = public.strip_legacy_brand_names_from_profile_text(g.concept),
    target_audience = public.strip_legacy_brand_names_from_profile_text(g.target_audience),
    tone = public.strip_legacy_brand_names_from_profile_text(g.tone),
    mandatory_fourth_subpage = public.strip_legacy_brand_names_from_profile_text(g.mandatory_fourth_subpage),
    full_generation_prompt = public.strip_legacy_brand_names_from_profile_text(g.full_generation_prompt);

  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.generation_prompt_profiles
  drop constraint if exists generation_prompt_profiles_slug_unique;

alter table public.generation_prompt_profiles
  drop column if exists slug;

select public.repair_generation_prompt_profiles_brand_scope();
