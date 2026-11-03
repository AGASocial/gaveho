-- TikTok publishing (Login Kit OAuth v2 + Content Posting API Direct Post).
-- Additive and idempotent. NOT applied automatically.
--
-- Accounts: TikTok rows use platform = 'tiktok', api_host = 'tiktok' and store the TikTok open_id in
-- ig_user_id (keeps the existing unique (platform, ig_user_id) constraint for upserts on reconnect).
-- Access tokens (~2 h) are refreshed on demand; refresh tokens (~180 days, rotated on every refresh)
-- are stored encrypted (AES-256-GCM, SOCIAL_TOKEN_ENCRYPTION_KEY) next to the access token.
alter table public.gaveho_social_accounts
  add column if not exists refresh_token_encrypted text,
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists token_scope text;

alter table public.gaveho_social_accounts drop constraint if exists gaveho_social_accounts_api_host_check;
alter table public.gaveho_social_accounts
  add constraint gaveho_social_accounts_api_host_check check (api_host in ('instagram', 'facebook', 'tiktok'));

-- Posts: per-post TikTok settings (privacy_level, disable_comment/duet/stitch, is_aigc, brand toggles).
-- TikTok's publish_id is stored in container_id (same resume-from-cron mechanics as Instagram reels).
alter table public.gaveho_social_posts
  add column if not exists tiktok_options jsonb
  check (tiktok_options is null or jsonb_typeof(tiktok_options) = 'object');

alter table public.gaveho_social_posts drop constraint if exists gaveho_social_posts_tiktok_video_check;
alter table public.gaveho_social_posts
  add constraint gaveho_social_posts_tiktok_video_check check (platform <> 'tiktok' or media_type = 'reel');

-- Claim due scheduled posts for both platforms, plus videos still processing
-- (Instagram reel container / TikTok publish_id created, not yet published).
drop function if exists public.gaveho_claim_due_social_posts(integer);
create function public.gaveho_claim_due_social_posts(batch_size integer default 3)
returns table (
  id uuid, account_id uuid, caption text, media_urls text[], media_type text,
  cover_url text, thumb_offset integer, share_to_feed boolean, container_id text, container_created_at timestamptz,
  platform text, tiktok_options jsonb
)
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select post.id
    from public.gaveho_social_posts as post
    where post.platform in ('instagram', 'tiktok')
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
            post.cover_url, post.thumb_offset, post.share_to_feed, post.container_id, post.container_created_at,
            post.platform, post.tiktok_options;
$$;
revoke all on function public.gaveho_claim_due_social_posts(integer) from public, anon, authenticated;
grant execute on function public.gaveho_claim_due_social_posts(integer) to service_role;
