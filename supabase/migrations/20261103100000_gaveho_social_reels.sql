-- Instagram Reels: one video per post (media_urls[1]), optional cover image / thumb offset,
-- share_to_feed, and the Meta container id so slow video processing can resume from the cron.
alter table public.gaveho_social_posts
  add column if not exists media_type text not null default 'image',
  add column if not exists cover_url text,
  add column if not exists thumb_offset integer,
  add column if not exists share_to_feed boolean not null default true,
  add column if not exists container_id text,
  add column if not exists container_created_at timestamptz;

alter table public.gaveho_social_posts
  add constraint gaveho_social_posts_media_type_check check (media_type in ('image', 'reel')),
  add constraint gaveho_social_posts_reel_single_check check (media_type <> 'reel' or cardinality(media_urls) = 1),
  add constraint gaveho_social_posts_thumb_offset_check check (thumb_offset is null or thumb_offset >= 0);

-- Videos (MP4/MOV, up to Meta's 300 MB Reels limit) live in the same public bucket.
-- Note: the project-wide Storage upload limit (Dashboard → Storage → Settings) must also be ≥ 300 MB.
update storage.buckets
set file_size_limit = 314572800,
    allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime']
where id = 'gaveho-social';

-- Claims due scheduled posts, plus reels still processing at Meta (container created, not yet published).
drop function if exists public.gaveho_claim_due_social_posts(integer);
create function public.gaveho_claim_due_social_posts(batch_size integer default 3)
returns table (
  id uuid, account_id uuid, caption text, media_urls text[], media_type text,
  cover_url text, thumb_offset integer, share_to_feed boolean, container_id text, container_created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select post.id
    from public.gaveho_social_posts as post
    where post.platform = 'instagram'
      and (
        (post.status = 'scheduled' and post.scheduled_at <= now())
        or (post.status = 'publishing' and post.media_type = 'reel' and post.container_id is not null
            and post.last_attempt_at < now() - interval '2 minutes')
      )
    order by coalesce(post.scheduled_at, post.created_at), post.id
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
  returning post.id, post.account_id, post.caption, post.media_urls, post.media_type,
            post.cover_url, post.thumb_offset, post.share_to_feed, post.container_id, post.container_created_at;
$$;
revoke all on function public.gaveho_claim_due_social_posts(integer) from public, anon, authenticated;
grant execute on function public.gaveho_claim_due_social_posts(integer) to service_role;
