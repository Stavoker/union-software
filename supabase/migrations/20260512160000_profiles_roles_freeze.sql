/*
  Ролі (admin / client) та заморозка акаунту через неоплату місячної підписки.
  Застосуйте після 20260510120000_profiles_seq_no.sql
*/

-- Роль користувача в Union
alter table public.profiles
  add column if not exists role text not null default 'client';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role = any (array['admin', 'client']::text[]));

comment on column public.profiles.role is 'admin — керування користувачами/підписками; client — клієнтський доступ';

-- Заморозка: не null = акаунт обмежено (типово через неоплату підписки)
alter table public.profiles
  add column if not exists account_frozen_at timestamptz null;

alter table public.profiles
  add column if not exists account_frozen_reason text null;

comment on column public.profiles.account_frozen_at is 'Час увімкнення заморозки; null — акаунт активний';
comment on column public.profiles.account_frozen_reason is 'Причина заморозки, напр. monthly_subscription_unpaid';

create index if not exists idx_profiles_role on public.profiles using btree (role);
create index if not exists idx_profiles_frozen on public.profiles using btree (account_frozen_at)
  where account_frozen_at is not null;

-- Адмін може оновлювати будь-який профіль (роль, заморозка тощо); клієнт — лише свій (існуюча політика)
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

/*
  Перший адмін: після деплою один раз у SQL Editor:
  update public.profiles set role = 'admin' where email = 'you@example.com';
*/
