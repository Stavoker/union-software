-- Каталог сайтів на VPS (напр. /var/www) — окремо для кожного SSH-хоста.
alter table public.hosts
  add column if not exists projects_dir text;

comment on column public.hosts.projects_dir is 'Remote web root for domain deploy (e.g. /var/www).';
