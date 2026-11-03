-- Per-key, per-account scoped API keys for the agent social API (/api/agent/social/*).
-- Only a SHA-256 hash of each key is stored; the plaintext is shown once at creation.
-- Additive only. RLS enabled with NO policies: only the service role (server) can read/write.
create table if not exists public.gaveho_social_agent_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  allowed_account_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.gaveho_social_agent_keys enable row level security;
revoke all on table public.gaveho_social_agent_keys from anon, authenticated;
