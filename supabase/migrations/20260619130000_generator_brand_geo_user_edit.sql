-- Geo target per user brand + allow users to edit own brand/themes/assets.

alter table public.generator_user_brands
  add column if not exists geo text not null default '';

comment on column public.generator_user_brands.geo is
  'Target geo code for SEO/content (ru, ua, kz, …). Set on /dashboard/brand.';

-- Users may write own brand row (admins still use is_union_admin policies).
drop policy if exists "generator_user_brands_user_insert" on public.generator_user_brands;
create policy "generator_user_brands_user_insert"
  on public.generator_user_brands for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "generator_user_brands_user_update" on public.generator_user_brands;
create policy "generator_user_brands_user_update"
  on public.generator_user_brands for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "generator_themes_user_write" on public.generator_themes;
create policy "generator_themes_user_insert"
  on public.generator_themes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "generator_themes_user_update" on public.generator_themes;
create policy "generator_themes_user_update"
  on public.generator_themes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "generator_themes_user_delete" on public.generator_themes;
create policy "generator_themes_user_delete"
  on public.generator_themes for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "generator_brand_assets_user_insert" on public.generator_brand_assets;
create policy "generator_brand_assets_user_insert"
  on public.generator_brand_assets for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "generator_brand_assets_user_delete" on public.generator_brand_assets;
create policy "generator_brand_assets_user_delete"
  on public.generator_brand_assets for delete to authenticated
  using (user_id = auth.uid());

-- Storage: users upload into own folder generator-assets/{user_id}/...
drop policy if exists "generator_assets_user_insert" on storage.objects;
create policy "generator_assets_user_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'generator-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generator_assets_user_update" on storage.objects;
create policy "generator_assets_user_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'generator-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generator-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generator_assets_user_delete" on storage.objects;
create policy "generator_assets_user_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'generator-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
