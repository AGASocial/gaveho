-- gaveho admin auth + multi-account social publishing (Instagram now; platform column leaves room for TikTok).
-- Additive only. RLS enabled with NO policies: only the service role (server) can read/write.

create or replace function public.gaveho_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.gaveho_admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gaveho_admin_profiles enable row level security;
create trigger gaveho_admin_profiles_updated_at before update on public.gaveho_admin_profiles
  for each row execute function public.gaveho_set_updated_at();

create table public.gaveho_social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram' check (platform in ('instagram', 'tiktok')),
  label text not null,
  ig_user_id text,
  username text,
  access_token_encrypted text not null, -- AES-256-GCM, key in SOCIAL_TOKEN_ENCRYPTION_KEY (server env)
  token_expires_at timestamptz,
  token_refreshed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gaveho_social_accounts_platform_user_key unique (platform, ig_user_id)
);
alter table public.gaveho_social_accounts enable row level security;
create trigger gaveho_social_accounts_updated_at before update on public.gaveho_social_accounts
  for each row execute function public.gaveho_set_updated_at();

create table public.gaveho_social_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.gaveho_social_accounts(id) on delete restrict,
  platform text not null default 'instagram' check (platform in ('instagram', 'tiktok')),
  caption text not null default '' check (char_length(caption) <= 2200),
  media_urls text[] not null check (cardinality(media_urls) between 1 and 10),
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at timestamptz,
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  last_attempt_at timestamptz,
  published_media_id text,
  published_permalink text,
  published_at timestamptz,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gaveho_social_posts_schedule_check check (status <> 'scheduled' or scheduled_at is not null)
);
alter table public.gaveho_social_posts enable row level security;
create index gaveho_social_posts_due_idx on public.gaveho_social_posts (scheduled_at) where status = 'scheduled';
create index gaveho_social_posts_account_idx on public.gaveho_social_posts (account_id, created_at desc);
create trigger gaveho_social_posts_updated_at before update on public.gaveho_social_posts
  for each row execute function public.gaveho_set_updated_at();

-- Atomically claims due scheduled posts (skip locked => safe with overlapping cron runs).
create or replace function public.gaveho_claim_due_social_posts(batch_size integer default 3)
returns table (id uuid, account_id uuid, caption text, media_urls text[])
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select post.id
    from public.gaveho_social_posts as post
    where post.platform = 'instagram'
      and post.status = 'scheduled'
      and post.scheduled_at <= now()
    order by post.scheduled_at, post.id
    for update skip locked
    limit greatest(1, least(batch_size, 10))
  )
  update public.gaveho_social_posts as post
  set status = 'publishing',
      publish_attempts = post.publish_attempts + 1,
      last_attempt_at = now(),
      error = null
  from due
  where post.id = due.id
  returning post.id, post.account_id, post.caption, post.media_urls;
$$;
revoke all on function public.gaveho_claim_due_social_posts(integer) from public, anon, authenticated;
grant execute on function public.gaveho_claim_due_social_posts(integer) to service_role;
revoke all on function public.gaveho_set_updated_at() from public, anon, authenticated;

-- Public-read bucket: Instagram must fetch image_url without auth. Writes only via service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gaveho-social', 'gaveho-social', true, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
