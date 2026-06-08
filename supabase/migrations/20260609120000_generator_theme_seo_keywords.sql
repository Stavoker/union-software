-- SEO keywords per theme preset (generator_themes).

alter table public.generator_themes
  add column if not exists seo_keywords text not null default '';

comment on column public.generator_themes.seo_keywords is
  'SEO-ключі для цієї теми генерації. Підставляються в <head> і промпти при виборі відповідного theme_text.';

comment on column public.generator_user_brands.seo_keywords is
  'Fallback SEO-ключі бренду: якщо у пресету теми поле порожнє або тема введена вручну.';
