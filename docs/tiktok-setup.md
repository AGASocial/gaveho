# TikTok publishing (GAVEHO social publisher)

Videos (reels) can be posted to TikTok through TikTok's **Content Posting API — Direct Post**, either on
their own or together with Instagram (one upload, one post row per account).

## 1. TikTok developer app

1. https://developers.tiktok.com → *Manage apps* → create an app (owner: AGASocial).
2. **Products**: add **Login Kit** and **Content Posting API**. In Content Posting API enable **Direct Post**.
3. **Scopes**: `user.info.basic`, `video.publish`, `video.upload`.
4. **Login Kit → Web → Redirect URI** (https, exact match, no query/fragment):
   - `https://gaveho.com/api/admin/social/tiktok/callback`
   - optional, only if you connect from another host: `https://<host>/api/admin/social/tiktok/callback`
     and set `TIKTOK_REDIRECT_URI` to the same value there.
5. **Web/Desktop URL, Terms of Service URL, Privacy Policy URL**: `https://gaveho.com`, and gaveho.com's terms/privacy pages.
6. **URL properties → Verify URL prefix** (needed for `PULL_FROM_URL`):
   `https://lrnhrzpwgyhkruwxeppw.supabase.co/storage/v1/object/public/gaveho-social/`
   TikTok gives a signature file; upload it to the `gaveho-social` bucket root with the exact file name, then verify.
   Without verification TikTok answers `url_ownership_unverified` and the publisher falls back to `FILE_UPLOAD`
   (the server streams the video to TikTok in 10 MB chunks) — slower, but it works.
7. While the app is in sandbox, add the TikTok account(s) as **target users**.
8. **Audit**: unaudited apps can only post `SELF_ONLY` (private) videos and have a low daily creator cap. Submit the
   app for audit (Content Posting API → *Apply for audit*) with a screen recording of /admin/social: connecting the
   account, the privacy selector (populated from `creator_info`), the interaction toggles and the publish confirmation.
   After approval set `TIKTOK_DEFAULT_PRIVACY_LEVEL` or choose the privacy per post.

## 2. Environment variables (Vercel, team agasocial)

| Name | Required | Notes |
| --- | --- | --- |
| `TIKTOK_CLIENT_KEY` | yes | App client key |
| `TIKTOK_CLIENT_SECRET` | yes | App client secret (server only) |
| `TIKTOK_REDIRECT_URI` | no | Defaults to `${NEXT_PUBLIC_SITE_URL}/api/admin/social/tiktok/callback` |
| `TIKTOK_DEFAULT_PRIVACY_LEVEL` | no | Default `SELF_ONLY` |
| `TIKTOK_UPLOAD_MODE` | no | `auto` (default) / `pull` / `file` |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | yes (existing) | Encrypts TikTok access and refresh tokens too |

The "Connect TikTok" button only appears when the client key and secret are set.

## 3. Database

Apply `supabase/migrations/20261104090000_gaveho_social_tiktok.sql` **before** deploying this code. It adds
`refresh_token_encrypted`, `refresh_token_expires_at`, `token_scope` to `gaveho_social_accounts`, allows
`api_host = 'tiktok'`, adds `gaveho_social_posts.tiktok_options`, and makes the publisher claim TikTok posts.

## 4. How it works

- **OAuth**: `/api/admin/social/tiktok/connect` (admin only) sets a random `state` in an httpOnly, SameSite=Lax cookie
  (10 min) and redirects to `https://www.tiktok.com/v2/auth/authorize/`. The callback (admin only) checks the state
  (timing-safe), exchanges the code at `https://open.tiktokapis.com/v2/oauth/token/`, requires the `video.publish`
  scope, and upserts the account (`platform = 'tiktok'`, TikTok `open_id` stored in `ig_user_id`). PKCE is not used:
  TikTok's web flow doesn't require it and the code is exchanged server-side with the client secret.
- **Tokens**: access tokens last ~2 h and are refreshed on demand (10 min before expiry). Refresh tokens (~180 days)
  rotate on each refresh; the update is compare-and-swap so concurrent refreshes don't lose the new token. The daily
  `social-token-refresh` cron refreshes every active TikTok account so refresh tokens never lapse.
- **Publishing**: `creator_info/query` → `post_info` (privacy must be one of `privacy_level_options`;
  interactions the creator disabled stay disabled; branded content can't be `SELF_ONLY`) → `video/init`
  (`PULL_FROM_URL`, falling back to `FILE_UPLOAD`) → `status/fetch` polling. The `publish_id` is stored in
  `container_id`; if TikTok is still processing, the 15-minute publisher cron resumes polling.
  On `PUBLISH_COMPLETE` the post id (only returned for public posts after moderation) and
  `https://www.tiktok.com/@<username>/video/<id>` are saved; private posts keep the `publish_id` as media id and no permalink.
- Thumbnail: `thumb_offset` (ms) becomes `video_cover_timestamp_ms`. Cover images are Instagram-only.

## 5. Limits

Rate limits per user token: `video/init` 6/min, `status/fetch` 30/min, `creator_info` 20/min. Videos longer than the
creator's `max_video_post_duration_sec` are rejected by TikTok (not prechecked).

## Reliability notes (v2)

- **Migration order:** deploy the code, then apply `20261104090000_gaveho_social_tiktok.sql`, then connect TikTok accounts. Instagram create/list/publish never reads or writes `tiktok_options`, so it keeps working before the migration is applied.
- **Inline publishing:** admin "Publish now" publishes the primary Instagram account inline (reel wait 20 s). TikTok and every extra account are queued (`scheduled`, `scheduled_at = now()`), and the publisher cron publishes them within about 15 minutes.
- **Stuck rows:** the publisher cron marks a post `failed` (and retryable) when it has sat in `publishing` with no container or publish_id for 15 minutes. The admin publish endpoint can also re-claim a `publishing` row after 15 minutes, and it keeps its container or publish_id so it resumes instead of posting again.
- **Status polling:** a 429, 5xx or network error while checking status leaves the post `publishing` and keeps its publish_id. Only TikTok `FAILED` marks it failed.
- **Token refresh:** refreshes are serialized by `gaveho_try_lock_social_token_refresh`, a SECURITY DEFINER function that only service_role can execute, with a 30 s lease. The token is then written with a compare-and-swap update. The process that loses the race re-reads the row and uses the winner's token. The daily cron refreshes only accounts whose refresh token expires within 7 days. Access tokens (about 2 h) are refreshed on demand.
- **Duration:** when the video length is known, it is checked against the creator's `max_video_post_duration_sec`.
- **Reconnect** never re-activates an account an admin disabled.
