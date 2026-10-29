-- Ideas table for storing Gabriel's content ideas and sources
-- DO NOT apply this directly to the live database — for version control only

create table if not exists gaveho_ideas (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,
  source_url  text,
  notes       text,
  status      text not null default 'new' check (status in ('new', 'drafted', 'discarded')),
  post_ids    uuid[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for status filtering
create index if not exists gaveho_ideas_status_idx on gaveho_ideas(status, created_at desc);

-- RLS: admin-only table (service role bypasses RLS)
alter table gaveho_ideas enable row level security;

-- No public policies — service role only
