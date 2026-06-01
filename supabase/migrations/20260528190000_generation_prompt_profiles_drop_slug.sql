-- slug більше не потрібен: ідентифікація за id / name.

alter table public.generation_prompt_profiles
  drop constraint if exists generation_prompt_profiles_slug_unique;

alter table public.generation_prompt_profiles
  drop column if exists slug;

comment on column public.generation_prompt_profiles.name is
  'Назва профілю в адмінці та для логів генератора; унікальність не обов''язкова.';
