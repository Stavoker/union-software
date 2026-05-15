/*
  Інтеграційні змінні (Spaceship, Zomro, SSL, хост) — окремий набір на кожного користувача.
*/

create table if not exists public.account_integration_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.account_integration_settings is
  'Per-user integration env (базова таблиця; колонки на кожну змінну — міграція 20260516140000)';

create index if not exists idx_account_integration_settings_updated
  on public.account_integration_settings (updated_at desc);

alter table public.account_integration_settings enable row level security;

drop policy if exists "account_integration_settings_select_own" on public.account_integration_settings;
drop policy if exists "account_integration_settings_insert_own" on public.account_integration_settings;
drop policy if exists "account_integration_settings_update_own" on public.account_integration_settings;

create policy "account_integration_settings_select_own"
  on public.account_integration_settings for select to authenticated
  using (user_id = auth.uid());

create policy "account_integration_settings_insert_own"
  on public.account_integration_settings for insert to authenticated
  with check (user_id = auth.uid());

create policy "account_integration_settings_update_own"
  on public.account_integration_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
