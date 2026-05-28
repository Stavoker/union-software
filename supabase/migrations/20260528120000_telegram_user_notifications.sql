/*
  Telegram-бот Union: персональні сповіщення по user_id (profiles).
  Онбординг: мова → код з /dashboard/settings → привʼязка chat_id.
*/

-- Підписники (оновлення існуючої таблиці або створення)
create table if not exists public.telegram_subscribers (
  chat_id bigint primary key,
  username text,
  first_name text,
  is_active boolean not null default true,
  last_command text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_subscribers
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

alter table public.telegram_subscribers
  add column if not exists locale text not null default 'uk';

alter table public.telegram_subscribers
  add column if not exists onboarding_state text not null default 'choose_lang';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'telegram_subscribers_locale_check'
  ) then
    alter table public.telegram_subscribers
      add constraint telegram_subscribers_locale_check
      check (locale in ('uk', 'en', 'ru'));
  end if;
exception
  when others then
    null;
end $$;

create index if not exists idx_telegram_subscribers_user_active
  on public.telegram_subscribers (user_id)
  where user_id is not null and is_active = true;

create index if not exists telegram_subscribers_active_idx
  on public.telegram_subscribers (is_active);

comment on column public.telegram_subscribers.user_id is 'profiles.id — власник акаунта Union';
comment on column public.telegram_subscribers.locale is 'Мова сповіщень: uk | en | ru';
comment on column public.telegram_subscribers.onboarding_state is 'choose_lang | await_code | linked';

-- Коди привʼязки з Settings
create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_link_codes_user_open
  on public.telegram_link_codes (user_id, expires_at)
  where used_at is null;

-- Журнал message_id для /delete
create table if not exists public.telegram_bot_messages (
  chat_id text not null,
  message_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);

create index if not exists idx_telegram_bot_messages_created
  on public.telegram_bot_messages (created_at);

alter table public.telegram_subscribers enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_bot_messages enable row level security;

-- API використовує service_role; RLS — для майбутніх прямих запитів
drop policy if exists "telegram_link_codes_select_own" on public.telegram_link_codes;
create policy "telegram_link_codes_select_own"
  on public.telegram_link_codes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "telegram_link_codes_insert_own" on public.telegram_link_codes;
create policy "telegram_link_codes_insert_own"
  on public.telegram_link_codes for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert on table public.telegram_link_codes to authenticated;
grant all on table public.telegram_subscribers to service_role;
grant all on table public.telegram_link_codes to service_role;
grant all on table public.telegram_bot_messages to service_role;
