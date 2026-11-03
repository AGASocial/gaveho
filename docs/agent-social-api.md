# GAVEHO agent social API

Lets AI assistants create Instagram posts without the admin UI. The API uses the same validation,
image normalization (JPEG, ≤ 2160 px, < 4 MB) and publisher as `/admin/social`.

## Auth

Every request needs `Authorization: Bearer <key>`.

### Scoped API keys (recommended)

Create keys in `/admin/social` → **Agent API keys**: give the key a label and pick the accounts it may use.
The key (`gsk_` + 43 base64url chars) is shown **once** with a copy button; only its SHA-256 hash and an
8-char display prefix are stored (`gaveho_social_agent_keys`). Revoke a key there at any time; the list shows
each key's accounts, last use and status.

A scoped key only sees its allowed accounts:

- `GET /accounts` returns only the allowed accounts.
- `GET /posts` returns only posts for allowed accounts; `?account=` for another account returns `403`.
- `POST /posts` to an account the key is not allowed to use returns `403`.

Without the header, with an unknown key, or with a revoked key, you get `401`.

### Legacy `SOCIAL_AGENT_API_KEY` (deprecated)

The single env-var key still works and grants **all accounts**. It is deprecated: move agents to scoped keys,
then remove `SOCIAL_AGENT_API_KEY` from Vercel.

On Gabriel's Mac the key is stored in `~/.config/gaveho/social-agent-key` (chmod 600). Never paste it in chats or commits.

```bash
export GAVEHO_KEY="$(cat ~/.config/gaveho/social-agent-key)"
export GAVEHO=https://gaveho.com
```

## List accounts

```bash
curl -s "$GAVEHO/api/agent/social/accounts" -H "Authorization: Bearer $GAVEHO_KEY"
```

Returns `id, label, username, platform, api_host, is_active, caption_voice, ...`. Tokens are never returned.

## Create a post

`POST /api/agent/social/posts`

| field | type | notes |
| --- | --- | --- |
| `account` | string | username (`gaveho_ai`, `cadenza.ops`, `@` optional), label, or account id |
| `caption` | string | ≤ 2200 chars; required unless `mode` is `draft` |
| `images` | array (1–10) | each item is a public `https://` URL (string or `{ "url" }`) or `{ "data": "<base64>", "contentType": "image/png" }`. 2 or more images make a carousel. |
| `mode` | `draft` \| `schedule` \| `publish_now` | default `draft` |
| `scheduled_at` | ISO 8601 | required for `schedule`; must be at least 1 minute in the future |

```bash
# Draft from a URL
curl -s -X POST "$GAVEHO/api/agent/social/posts" \
  -H "Authorization: Bearer $GAVEHO_KEY" -H 'content-type: application/json' \
  -d '{"account":"gaveho_ai","caption":"Building in public…","images":["https://example.com/image.jpg"]}'

# Schedule
curl -s -X POST "$GAVEHO/api/agent/social/posts" \
  -H "Authorization: Bearer $GAVEHO_KEY" -H 'content-type: application/json' \
  -d '{"account":"cadenza.ops","caption":"…","images":["https://example.com/a.jpg","https://example.com/b.jpg"],"mode":"schedule","scheduled_at":"2026-11-05T15:00:00Z"}'

# Publish now with a local file (base64)
jq -n --arg data "$(base64 < post.png | tr -d '\n')" \
  '{account:"gaveho_ai",caption:"…",mode:"publish_now",images:[{data:$data,contentType:"image/png"}]}' |
curl -s -X POST "$GAVEHO/api/agent/social/posts" \
  -H "Authorization: Bearer $GAVEHO_KEY" -H 'content-type: application/json' --data-binary @-
```

Responses:

- `201`: `{ id, account, status, scheduled_at, media_urls }`. When the post is published, the response also has `permalink` and `media_id`.
- `502`: publishing failed. The response has `status: "failed"` and `error`.
- `422`: validation error.
- `403`: the API key is not allowed to use that account.
- `404`: unknown account.

Vercel limits request bodies to about 4.5 MB. For large or multiple images, send URLs instead of base64.
Scheduled posts are published by the `/api/internal/social-publisher` cron, which runs every 15 minutes.

## Reels

Same endpoint, `POST /api/agent/social/posts`, with `"type": "reel"` (alias `media_type`).

| field | |
|---|---|
| `video` / `video_url` | **required**. Public https URL, or `{ "data": "<base64>", "contentType": "video/mp4" \| "video/quicktime" }` (base64 only for small files: Vercel caps request bodies at ~4.5 MB) |
| `cover` / `cover_url` | optional cover image (same formats as `images[]`, stored as JPEG) |
| `thumb_offset` | optional, milliseconds into the video for the thumbnail (ignored when `cover` is set) |
| `share_to_feed` | optional, default `true` |

The video is validated and stored as-is (no transcoding): MP4 or MOV, 3 s–15 min, ≤ 300 MB, must contain a video track. Non-9:16 videos are accepted with a `warnings` entry. Invalid videos return `422` with a clear message.

```bash
curl -sS -X POST "$BASE/api/agent/social/posts" -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"account":"gaveho","type":"reel","video_url":"https://example.com/clip.mp4","caption":"…","thumb_offset":2000,"mode":"publish_now"}'
```

Publishing a reel: we create a `REELS` container, then poll Meta's `status_code` for up to ~60 s.

- `201` + `permalink`: published.
- `202` + `status: "publishing"`: Meta is still processing the video. The post keeps its `container_id`; the publisher cron (every 15 min) resumes polling and publishes it. Check with `GET /api/agent/social/posts`.
- `502` + `error`: Meta returned `ERROR`/`EXPIRED` (or another failure). The post is `failed`; containers older than ~23 h are treated as expired.

## List posts

```bash
curl -s "$GAVEHO/api/agent/social/posts?status=published&account=gaveho_ai&limit=10" -H "Authorization: Bearer $GAVEHO_KEY"
```

`status` can be one of `draft, scheduled, publishing, published, failed`. `limit` defaults to 20 (max 100).

## Caption voice

Each account has an optional `caption_voice` you can edit in `/admin/social` (**set/edit voice**). The admin AI
caption generator always writes as the account owner, using that voice.
