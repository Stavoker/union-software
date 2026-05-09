/*
  Union — профілі користувачів (розширення auth.users).
  Застосуйте через Supabase SQL Editor або: supabase db push / migrate.
*/

-- Таблиця профілів -----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid not null references auth.users (id) on delete cascade,
  email text null,
  display_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_email_format check (
    email is null
    or email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

comment on table public.profiles is 'Публічні поля користувача; id = auth.users.id';

-- Оновлення updated_at
create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_profiles_updated_at();

-- Новий користувач у auth → рядок у profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists trg_auth_users_after_insert_profiles on auth.users;
create trigger trg_auth_users_after_insert_profiles
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Існуючі користувачі (до міграції)
insert into public.profiles (id, email)
select id, email
from auth.users
on conflict (id) do update
  set email = excluded.email;

-- RLS ------------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Доступи
grant select on table public.profiles to authenticated;
grant update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create index if not exists idx_profiles_email on public.profiles using btree (lower(email));
