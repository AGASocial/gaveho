-- Run this in your Supabase SQL editor

create table if not exists gaveho_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text not null unique,
  excerpt     text,
  content     text,
  tags        text[] default '{}',
  tiktok_script text,
  cover_image text,
  published   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for slug lookups
create index if not exists gaveho_posts_slug_idx on gaveho_posts(slug);
-- Index for published feed
create index if not exists gaveho_posts_published_idx on gaveho_posts(published, created_at desc);

-- RLS: public can read published posts
alter table gaveho_posts enable row level security;

create policy "Public can read published posts"
  on gaveho_posts for select
  using (published = true);

-- Service role can do everything (used by the AI agent via supabaseAdmin)
-- No additional policy needed — service role bypasses RLS
