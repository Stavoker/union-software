/*
  Додає публічний порядковий номер профілю (1, 2, 3…).

  ВАЖЛИВО:
  - Пароль НЕ зберігається в public.profiles — лише в Supabase Auth (auth.users), хешований.
  - Первинний ключ для звʼязку з акаунтом лишається id uuid = auth.users.id.
  - seq_no — лише для відображення / звітів / людиночитних посилань.

  Застосуйте після міграції 20260509230000_profiles.sql
*/

-- 1) Колонка + послідовність
alter table public.profiles
  add column if not exists seq_no bigint;

create sequence if not exists public.profiles_seq_no_seq;

-- 2) Проставити номери існуючим рядкам (за датою створення)
update public.profiles p
set seq_no = n.rn
from (
  select
    id,
    row_number() over (
      order by created_at asc nulls last, id asc
    ) as rn
  from public.profiles
) n
where p.id = n.id
  and (p.seq_no is null);

-- 3) Синхронізувати лічильник послідовності
select setval(
  'public.profiles_seq_no_seq',
  coalesce((select max(seq_no) from public.profiles), 0)::bigint,
  true
);

-- 4) Автоприсвоєння для нових рядків (у т.ч. з тригера handle_new_user)
alter table public.profiles
  alter column seq_no set default nextval('public.profiles_seq_no_seq');

alter table public.profiles
  alter column seq_no set not null;

alter sequence public.profiles_seq_no_seq owned by public.profiles.seq_no;

create unique index if not exists profiles_seq_no_uidx on public.profiles (seq_no);

comment on column public.profiles.seq_no is 'Публічний порядковий № (1,2,…); не замінює uuid звʼязку з auth.users';
