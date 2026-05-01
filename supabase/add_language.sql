-- Run this in your Supabase SQL editor

alter table gaveho_posts
  add column if not exists language text not null default 'en'
  check (language in ('en', 'es'));

create index if not exists gaveho_posts_language_idx on gaveho_posts(language, published, created_at desc);
