-- Agent API direct uploads log: per-key rate limiting of POST /api/agent/social/uploads.
create table if not exists public.gaveho_social_agent_uploads (
  id bigint generated always as identity primary key,
  key_id uuid references public.gaveho_social_agent_keys (id) on delete cascade, -- null = legacy env key
  account_id uuid not null,
  media_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists gaveho_social_agent_uploads_key_created_idx
  on public.gaveho_social_agent_uploads (key_id, created_at desc);

alter table public.gaveho_social_agent_uploads enable row level security;
revoke all on table public.gaveho_social_agent_uploads from anon, authenticated;
