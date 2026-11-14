-- Permission scopes for agent API keys (blog:read, blog:write).
-- Social account access remains via allowed_account_ids; blog access requires an explicit scope.
-- Additive only. Do NOT run against production from the agent — apply via the usual migration path.
alter table public.gaveho_social_agent_keys
  add column if not exists scopes text[] not null default '{}';

alter table public.gaveho_social_agent_keys
  drop constraint if exists gaveho_social_agent_keys_scopes_check;

alter table public.gaveho_social_agent_keys
  add constraint gaveho_social_agent_keys_scopes_check
  check (scopes <@ array['blog:read', 'blog:write']::text[]);

comment on column public.gaveho_social_agent_keys.scopes is
  'Permission scopes for non-account capabilities (e.g. blog:read, blog:write). Empty = social-only key.';

-- Track which agent key created a blog post (idempotency on slug + same key + identical content).
alter table public.gaveho_posts
  add column if not exists agent_key_id uuid references public.gaveho_social_agent_keys (id) on delete set null;

create index if not exists gaveho_posts_agent_key_id_idx on public.gaveho_posts (agent_key_id);
