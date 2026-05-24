alter table public.account_integration_settings
  add column if not exists softgen_quality_regen_enabled text,
  add column if not exists softgen_cross_build_memory_enabled text;

comment on column public.account_integration_settings.softgen_quality_regen_enabled is
  '1 = dom-sim / brand / word-count page regen; 0 = accept first model output';
comment on column public.account_integration_settings.softgen_cross_build_memory_enabled is
  '1 = remember layouts across builds; 0 = each site independent';
