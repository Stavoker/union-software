-- Додаткова категорія payment для іконок оплат у generator_brand_assets.

alter table public.generator_brand_assets
  drop constraint if exists generator_brand_assets_kind_check;

alter table public.generator_brand_assets
  add constraint generator_brand_assets_kind_check
  check (kind in ('logo', 'favicon', 'hero', 'game', 'payment', 'misc'));

comment on column public.generator_brand_assets.kind is
  'logo|favicon — окремі слоти; hero=банери; game=слоти; payment=оплати; misc=прочее';
