/*
  SSH/VPS хости для /dashboard/domain — один рядок на сервер, привʼязка до auth.users.
  API фільтрує по user_id (service role); RLS — для прямих запитів з authenticated.
*/

create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  host_ip text not null,
  ssh_user text not null,
  ssh_password text not null,
  ssh_port int not null default 22,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hosts_user_name_unique unique (user_id, name)
);

-- Якщо таблиця вже існувала без user_id (глобальні рядки)
alter table public.hosts
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

delete from public.hosts where user_id is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'hosts'
      and column_name = 'user_id'
      and is_nullable = 'YES'
  ) then
    alter table public.hosts alter column user_id set not null;
  end if;
exception
  when others then
    null;
end $$;

create index if not exists idx_hosts_user_id on public.hosts (user_id);
create index if not exists idx_hosts_user_active on public.hosts (user_id, is_active);

comment on table public.hosts is 'Per-user deploy hosts (SSH) for domain automation.';

create or replace function public.touch_hosts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_hosts_updated_at on public.hosts;
create trigger trg_hosts_updated_at
  before update on public.hosts
  for each row
  execute function public.touch_hosts_updated_at();

alter table public.hosts enable row level security;

drop policy if exists "hosts_select_own" on public.hosts;
drop policy if exists "hosts_insert_own" on public.hosts;
drop policy if exists "hosts_update_own" on public.hosts;
drop policy if exists "hosts_delete_own" on public.hosts;

create policy "hosts_select_own"
  on public.hosts for select to authenticated
  using (user_id = auth.uid());

create policy "hosts_insert_own"
  on public.hosts for insert to authenticated
  with check (user_id = auth.uid());

create policy "hosts_update_own"
  on public.hosts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "hosts_delete_own"
  on public.hosts for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.hosts to authenticated;
grant all on table public.hosts to service_role;
