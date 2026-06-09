-- React Lab: curated page section-order frameworks.
-- 100 sidebar + 100 header variants PER page_kind (home, bonus, games, … + generic inner).
-- Full catalog: up to 200 rows × ~14 page_kinds ≈ 2800 presets (seeded from react-page-frameworks-catalog.js).
--
-- section_order examples:
--   home:   ["hero-gradient","prose-block","slot-grid","faq-accordion","cta-banner"]
--   bonus:  ["poster-slider","feature-cards","prose-block","faq-cards","cta-banner"]
--   games:  ["slot-showcase","prose-block","game-carousel","faq-accordion","cta-banner"]
-- Component ids must match REACT_COMPONENT_REGISTRY (react-component-registry.js).
--
-- UX rules enforced in catalog (not DB): home → hero first + one slot block; inner → no hero-gradient;
-- payments → payment-methods early; faq-page → faq block early; all → faq before cta-banner last.

create table if not exists public.generator_react_page_frameworks (
  id text primary key,
  layout_kind text not null check (layout_kind in ('sidebar', 'header')),
  page_kind text not null default 'home' check (page_kind in (
    'home',
    'bonus',
    'payments',
    'vip',
    'games',
    'slots',
    'mirror',
    'promo',
    'faq-page',
    'support',
    'about',
    'registration',
    'reviews',
    'inner'
  )),
  variant_number int not null check (variant_number >= 1 and variant_number <= 100),
  label text not null default '',
  section_order jsonb not null,
  meta_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generator_react_page_frameworks_layout_page_variant_key
    unique (layout_kind, page_kind, variant_number),
  constraint generator_react_page_frameworks_section_order_is_array
    check (jsonb_typeof(section_order) = 'array')
);

comment on table public.generator_react_page_frameworks is
  'React page section-order presets: sidebar-01..100 and header-01..100 for EACH page_kind (home + all inner archetypes + generic inner). Seeded from react-page-frameworks-catalog.js.';

comment on column public.generator_react_page_frameworks.layout_kind is
  'Site chrome layout: sidebar (SiteLayout sidebar-*) or header (top-nav-*). Pick frameworks matching SITE_LAYOUT.';

comment on column public.generator_react_page_frameworks.page_kind is
  'Page archetype: home | bonus | payments | vip | games | slots | mirror | promo | faq-page | support | about | registration | reviews | inner';

comment on column public.generator_react_page_frameworks.variant_number is
  '1..100 within (layout_kind, page_kind). Rotated per build via siteSeed/batchIndex.';

comment on column public.generator_react_page_frameworks.section_order is
  'Ordered registry component ids. home: hero first, one slot block, faq then cta-banner last. inner: no hero-gradient; page-specific hooks (payment-methods, slot-*, faq-*) per page_kind; cta-banner last.';

comment on column public.generator_react_page_frameworks.meta_json is
  'Optional hints: archetype label, gamesPresentation, faqPresentation, notes for prompts.';

create index if not exists idx_generator_react_page_frameworks_pick
  on public.generator_react_page_frameworks (layout_kind, page_kind, variant_number)
  where is_active;

create index if not exists idx_generator_react_page_frameworks_page_kind
  on public.generator_react_page_frameworks (page_kind)
  where is_active;

alter table public.generator_react_page_frameworks enable row level security;

drop policy if exists "generator_react_page_frameworks_select_authenticated"
  on public.generator_react_page_frameworks;

create policy "generator_react_page_frameworks_select_authenticated"
  on public.generator_react_page_frameworks for select to authenticated
  using (true);
