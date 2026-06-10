-- Скелети згенерованих сайтів для порівняння структурної подібності (admin analytics).

create table if not exists public.generator_site_skeletons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null,
  project_name text not null default '',
  status text not null default 'done',
  stack text not null default 'react',
  site_layout text,
  chrome_template_id text,
  home_page_framework_id text,
  page_count int not null default 0,
  skeleton_json jsonb not null default '{}'::jsonb,
  skeleton_fingerprint text not null default '',
  created_at timestamptz not null default now(),
  constraint generator_site_skeletons_job_id_key unique (job_id)
);

comment on table public.generator_site_skeletons is
  'Структурний скелет збірки (chrome, frameworks, section orders) для admin similarity analytics.';

comment on column public.generator_site_skeletons.skeleton_json is
  'JSON: stack, siteLayout, pageFrameworks, pages[{file, componentIds}], registryPool, pageFiles.';

comment on column public.generator_site_skeletons.skeleton_fingerprint is
  'SHA-256 скорочений відбиток orders+chrome для швидкого групування.';

create index if not exists idx_generator_site_skeletons_user_created
  on public.generator_site_skeletons (user_id, created_at desc);

create index if not exists idx_generator_site_skeletons_created
  on public.generator_site_skeletons (created_at desc);

create index if not exists idx_generator_site_skeletons_fingerprint
  on public.generator_site_skeletons (skeleton_fingerprint)
  where skeleton_fingerprint <> '';

create index if not exists idx_generator_site_skeletons_chrome
  on public.generator_site_skeletons (chrome_template_id)
  where chrome_template_id is not null;

alter table public.generator_site_skeletons enable row level security;

drop policy if exists "generator_site_skeletons_select_own" on public.generator_site_skeletons;

create policy "generator_site_skeletons_select_own"
  on public.generator_site_skeletons for select to authenticated
  using (user_id = auth.uid());

-- Admin read-all (profiles.role = admin)
drop policy if exists "generator_site_skeletons_select_admin" on public.generator_site_skeletons;

create policy "generator_site_skeletons_select_admin"
  on public.generator_site_skeletons for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

-- Admin aggregate on token usage (cross-account analytics page)
drop policy if exists "generator_token_usage_select_admin" on public.generator_token_usage;

create policy "generator_token_usage_select_admin"
  on public.generator_token_usage for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
