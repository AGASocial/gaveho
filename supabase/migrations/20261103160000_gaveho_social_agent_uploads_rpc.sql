-- Agent uploads hardening (supersedes the PostgREST-paginated logic from PR #19).
-- Additive and idempotent. Both functions are SECURITY DEFINER with an empty search_path and are
-- executable only by service_role.

-- 1) Every distinct post reference (media_urls + cover_url) that points into the agent/ prefix.
--    Returns ONE text[] value (not a set), so PostgREST max_rows cannot truncate it.
create or replace function public.gaveho_social_referenced_agent_urls()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ref), '{}'::text[])
  from (
    select unnest(p.media_urls) as ref from public.gaveho_social_posts p
    union all
    select p.cover_url from public.gaveho_social_posts p where p.cover_url is not null
  ) refs
  where ref like '%agent/%';
$$;

revoke all on function public.gaveho_social_referenced_agent_urls() from public, anon, authenticated;
grant execute on function public.gaveho_social_referenced_agent_urls() to service_role;

-- 2) Atomic per-key upload rate limit: lock the key's bucket, count the window, insert if allowed.
--    key_id null = legacy env key; all legacy-key callers share ONE bucket.
create or replace function public.gaveho_social_reserve_agent_upload(
  p_key_id uuid,
  p_account_id uuid,
  p_media_path text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count integer;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('gaveho_social_agent_uploads:' || coalesce(p_key_id::text, 'legacy'), 0));

  select count(*)::integer, min(u.created_at) into v_count, v_oldest
  from public.gaveho_social_agent_uploads u
  where u.created_at >= v_since
    and u.key_id is not distinct from p_key_id;

  if v_count >= p_limit then
    return jsonb_build_object('ok', false, 'count', v_count, 'oldest', v_oldest, 'now', now());
  end if;

  insert into public.gaveho_social_agent_uploads (key_id, account_id, media_path)
  values (p_key_id, p_account_id, p_media_path);

  return jsonb_build_object('ok', true, 'count', v_count + 1, 'remaining', p_limit - v_count - 1, 'now', now());
end;
$$;

revoke all on function public.gaveho_social_reserve_agent_upload(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.gaveho_social_reserve_agent_upload(uuid, uuid, text, integer, integer) to service_role;
