/*
  Облік токенів Claude по завершених генераціях (на користувача).
*/

create table if not exists public.generator_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  project_name text not null default '',
  status text not null default 'done',
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  dry_run boolean not null default false,
  created_at timestamptz not null default now(),
  constraint generator_token_usage_job_id_key unique (job_id)
);

comment on table public.generator_token_usage is
  'Сумарні токени Claude на одну збірку (job_id з generator build jobs)';

create index if not exists idx_generator_token_usage_user_created
  on public.generator_token_usage (user_id, created_at desc);

alter table public.generator_token_usage enable row level security;

drop policy if exists "generator_token_usage_select_own" on public.generator_token_usage;

create policy "generator_token_usage_select_own"
  on public.generator_token_usage for select to authenticated
  using (user_id = auth.uid());
