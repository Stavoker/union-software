-- Verification status from auto-script-v2 (Yandex Webmaster / Google Search Console).

alter table public.seo_domains
  add column if not exists yandex_verification_state text,
  add column if not exists google_verification_state text,
  add column if not exists verification_checked_at timestamptz;

comment on column public.seo_domains.yandex_verification_state is
  'Last Yandex Webmaster verification_state (VERIFIED, IN_PROGRESS, …) from auto-script-v2.';
comment on column public.seo_domains.google_verification_state is
  'Last Google Search Console verification state from auto-script-v2.';
