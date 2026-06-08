-- SEO keywords and layout variant per user brand (/brand admin).

alter table public.generator_user_brands
  add column if not exists seo_keywords text not null default '',
  add column if not exists layout_variant text not null default 'auto';

alter table public.generator_user_brands
  drop constraint if exists generator_user_brands_layout_variant_check;

alter table public.generator_user_brands
  add constraint generator_user_brands_layout_variant_check
  check (layout_variant in ('auto', 'sidebar-left', 'top-nav'));

comment on column public.generator_user_brands.seo_keywords is
  'SEO: бренд, гео, типові запити (через кому або з нового рядка). Потрапляють у <head> і промпти architect.';

comment on column public.generator_user_brands.layout_variant is
  'Айдентика сайту: auto (чергування), sidebar-left, top-nav.';
