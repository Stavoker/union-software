alter table public.generator_user_brands
  add column if not exists bot_gate_redirect_url text not null default '';

comment on column public.generator_user_brands.bot_gate_redirect_url is
  'Redirect URL for human visitors when site is generated in bot_gate (Bots only) mode';
