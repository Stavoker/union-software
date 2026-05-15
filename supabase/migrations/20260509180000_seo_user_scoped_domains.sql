/*
  User-scoped SEO data for Union /dashboard/seo:
  - public.seo_domains — домени користувача (замість застарілого глобального subdomains для цього застосунку).
  - public.seo_keywords, public.seo_positions — колонка user_id та унікальність по користувачу.

  Якщо були старі рядки без user_id, вони видаляються (глобальний список ключів/позицій більше не підтримується).
*/

-- 1) seo_domains
create table if not exists public.seo_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  host text not null,
  root_domain text,
  project_name text,
  deployed_at timestamptz,
  is_indexed boolean default false,
  indexed_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_domains_user_host_unique unique (user_id, host)
);

create index if not exists idx_seo_domains_user_id on public.seo_domains (user_id);

comment on table public.seo_domains is 'Domains per user for SEO dashboard (hosts, index status).';

-- 2) seo_keywords — або створення з нуля, або міграція з legacy
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'seo_keywords'
  ) then
    create table public.seo_keywords (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      keyword text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_seo_keywords_user_id on public.seo_keywords (user_id);
  else
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seo_keywords'
        and column_name = 'user_id'
    ) then
      alter table public.seo_keywords
        add column user_id uuid references auth.users (id) on delete cascade;
      delete from public.seo_keywords;
      alter table public.seo_keywords
        alter column user_id set not null;
    end if;
  end if;
end $$;

alter table public.seo_keywords drop constraint if exists seo_keywords_keyword_key;
alter table public.seo_keywords drop constraint if exists seo_keywords_user_keyword_uq;

drop index if exists seo_keywords_user_keyword_unique;
create unique index if not exists seo_keywords_user_keyword_unique on public.seo_keywords (user_id, keyword);

-- 3) seo_positions
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'seo_positions'
  ) then
    create table public.seo_positions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      keyword text not null,
      domain text not null,
      position integer,
      indexed boolean default false,
      search_frequency integer,
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_seo_positions_user_id on public.seo_positions (user_id);
    create index if not exists idx_seo_positions_kw_dom on public.seo_positions (keyword, domain);
  else
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'seo_positions'
        and column_name = 'user_id'
    ) then
      alter table public.seo_positions
        add column user_id uuid references auth.users (id) on delete cascade;
      delete from public.seo_positions;
      alter table public.seo_positions
        alter column user_id set not null;
    end if;
  end if;
end $$;

alter table public.seo_positions drop constraint if exists seo_positions_keyword_domain_key;
alter table public.seo_positions drop constraint if exists seo_positions_user_kw_dom_uq;

drop index if exists seo_positions_user_kw_dom_unique;
create unique index if not exists seo_positions_user_kw_dom_unique
  on public.seo_positions (user_id, keyword, domain);

-- RLS (прямі запити з клієнта з anon-ключем; API з service role і так обходить RLS)
alter table public.seo_domains enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_positions enable row level security;

drop policy if exists "seo_domains_select_own" on public.seo_domains;
drop policy if exists "seo_domains_insert_own" on public.seo_domains;
drop policy if exists "seo_domains_update_own" on public.seo_domains;
drop policy if exists "seo_domains_delete_own" on public.seo_domains;

create policy "seo_domains_select_own"
  on public.seo_domains for select to authenticated
  using (user_id = auth.uid());

create policy "seo_domains_insert_own"
  on public.seo_domains for insert to authenticated
  with check (user_id = auth.uid());

create policy "seo_domains_update_own"
  on public.seo_domains for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "seo_domains_delete_own"
  on public.seo_domains for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "seo_keywords_own" on public.seo_keywords;
create policy "seo_keywords_own"
  on public.seo_keywords for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "seo_positions_own" on public.seo_positions;
create policy "seo_positions_own"
  on public.seo_positions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
