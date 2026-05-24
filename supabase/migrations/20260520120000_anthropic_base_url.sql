alter table public.account_integration_settings
  add column if not exists anthropic_base_url text;

comment on column public.account_integration_settings.anthropic_base_url is
  'LLM API base URL (default api.anthropic.com; e.g. http://localhost:3001 for local proxy)';
