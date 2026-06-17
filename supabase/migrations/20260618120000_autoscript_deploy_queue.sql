-- Черга деплоїв для auto-script-v2 (Cron на Render читає pending без HTTP webhook).

create table if not exists public.autoscript_deploy_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  domain text not null,
  remote_path text not null,
  project_name text,
  host_id uuid references public.hosts (id) on delete set null,
  ssh_host text,
  ssh_port integer not null default 22,
  ssh_user text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_autoscript_deploy_queue_pending
  on public.autoscript_deploy_queue (created_at asc)
  where status = 'pending';

create index if not exists idx_autoscript_deploy_queue_user_domain
  on public.autoscript_deploy_queue (user_id, domain, created_at desc);

comment on table public.autoscript_deploy_queue is
  'Union після деплою на VPS; auto-script-v2 Cron забирає pending рядки.';

alter table public.autoscript_deploy_queue enable row level security;

grant all on table public.autoscript_deploy_queue to service_role;
