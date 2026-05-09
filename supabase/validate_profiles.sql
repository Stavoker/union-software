/*
  Скрипт перевірки цілісності profiles ↔ auth.users.
  Запустіть у Supabase SQL Editor після міграції (або в CI).

  Очікування: усі блоки повертають 0 рядків «проблем».
*/

-- 1) Профілі без відповідного користувача в auth (не повинно траплятися при FK)
select
  'orphan_profiles_no_auth_user' as check_name,
  p.id,
  p.email
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null;

-- 2) Користувачі auth без профілю (після міграції має бути порожньо)
select
  'auth_users_missing_profile' as check_name,
  u.id,
  u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 3) Email у profiles не відповідає regex (констрейнт має ловити при записі)
select
  'invalid_email_format_in_profiles' as check_name,
  id,
  email
from public.profiles
where
  email is not null
  and email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

-- 4) Дублікати email у profiles (якщо логіка допускає один акаунт = один email — ок)
select
  'duplicate_emails_in_profiles' as check_name,
  lower(trim(email)) as email_norm,
  count(*)::bigint as cnt
from public.profiles
where email is not null
group by lower(trim(email))
having count(*) > 1;

-- 5) Дублікати seq_no (має бути порожньо, якщо колонка існує)
select
  'duplicate_seq_no' as check_name,
  seq_no,
  count(*)::bigint as cnt
from public.profiles
where seq_no is not null
group by seq_no
having count(*) > 1;

-- 6) Зведення (інформаційно)
select
  (select count(*) from auth.users) as auth_users_count,
  (select count(*) from public.profiles) as profiles_count;
