-- Універсальні профілі для всіх користувачів/брендів: brand_scope завжди any,
-- без прив'язки slug/name/brand_label/текстів до Laki / Laki World.

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

comment on function public.strip_legacy_brand_names_from_profile_text(text) is
  'Заміна застарілих Laki/Лаки в текстах профілю на плейсхолдер {brand} для будь-якого бренду збірки.';

create or replace function public.normalize_generation_prompt_brand_scope(raw text)
returns text
language sql
immutable
as $$
  select 'any'::text;
$$;

comment on function public.normalize_generation_prompt_brand_scope(text) is
  'Завжди any — профілі спільні для всіх брендів Union.';

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

comment on function public.repair_generation_prompt_profiles_brand_scope() is
  'brand_scope=any; прибрати Laki з name/brand_label і текстових колонок → {brand}.';

comment on column public.generation_prompt_profiles.brand_scope is
  'Завжди any — профіль для всіх брендів (не laki/lakiworld).';
comment on column public.generation_prompt_profiles.brand_label is
  'Метка набору промптів (не торгова марка): Универсальный, VIP-focus тощо.';
comment on column public.generation_prompt_profiles.name is
  'Назва профілю в адмінці; без прив''язки до Laki — бренд лише з теми збірки.';

alter table public.generation_prompt_profiles
  alter column brand_scope set default 'any';

select public.repair_generation_prompt_profiles_brand_scope();
