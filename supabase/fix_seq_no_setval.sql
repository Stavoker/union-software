/*
  Виправлення після помилки: setval: value 0 is out of bounds.
  Запустіть у SQL Editor, якщо міграція зупинилася на кроці setval; далі вручну
  довиконайте кроки 4 з повного файлу міграції (default, not null, index), якщо ще не застосовані.
*/
select setval(
  'public.profiles_seq_no_seq',
  greatest(coalesce((select max(seq_no) from public.profiles), 0), 1)::bigint,
  coalesce((select max(seq_no) from public.profiles), 0) > 0
);
