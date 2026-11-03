-- Accounts are now added by pasting an access token. Tokens can belong to the
-- Instagram API with Instagram Login (graph.instagram.com) or with Facebook Login
-- (graph.facebook.com); publishing must use the matching host.
alter table public.gaveho_social_accounts
  add column if not exists api_host text not null default 'instagram'
  check (api_host in ('instagram', 'facebook'));
