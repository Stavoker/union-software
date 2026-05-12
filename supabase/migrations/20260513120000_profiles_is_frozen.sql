/*
  Явний прапорець заморозки (для адмін-панелі та логіки доступу).
  Після застосування синхронізуйте з account_frozen_at існуючі рядки.
*/

alter table public.profiles
  add column if not exists is_frozen boolean not null default false;

comment on column public.profiles.is_frozen is 'true — акаунт заморожено (немає доступу); синхронізується з account_frozen_at при зміні з UI/білінгу';

update public.profiles
set is_frozen = true
where account_frozen_at is not null
  and is_frozen = false;

update public.profiles
set is_frozen = false
where account_frozen_at is null
  and is_frozen = true;

create index if not exists idx_profiles_is_frozen on public.profiles (is_frozen)
  where is_frozen = true;
