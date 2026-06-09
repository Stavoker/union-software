-- PHP generator: conversion templates + etalon clone toggle (per-account /dashboard/settings).

alter table public.account_integration_settings
  add column if not exists softgen_php_conversion_templates text;

alter table public.account_integration_settings
  add column if not exists softgen_php_etalon_clone text;

comment on column public.account_integration_settings.softgen_php_conversion_templates is
  '1/0 — PHP conversion section templates (aligned with React). Empty = enabled.';
comment on column public.account_integration_settings.softgen_php_etalon_clone is
  '1/0 — clone u-bet162/u-spot064 HTML. Empty/0 = AI generation like React Lab.';
