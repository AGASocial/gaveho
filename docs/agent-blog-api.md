# GAVEHO agent blog API

Lets AI assistants create and publish blog posts without the admin UI. Posts land in
`gaveho_posts` (same table as `/admin` drafts) and render as Markdown/MDX on `/blog`.

## Auth

Every request needs `Authorization: Bearer <key>`.

Use a scoped `gsk_…` key from `/admin/social` → **Agent API keys**. When creating the key,
enable the **`blog:write`** permission scope (optionally also pick social accounts on the same key).

| Scope | Access |
| --- | --- |
| `blog:write` | Create, update drafts, publish; also implies read |
| `blog:read` | `GET` post status only |

Without the header, with an unknown/revoked key → **401**.  
With a valid key that lacks the required scope → **403**.

The legacy `SOCIAL_AGENT_API_KEY` env var does **not** grant blog scopes.

```bash
export GAVEHO_BLOG_AGENT_KEY="$(cat ~/.config/gaveho/blog-agent-key)"   # or paste once from admin UI
export GAVEHO=https://gaveho.com
```

Never paste the key into chats or commits.

## Create a post

`POST /api/agent/blog/posts`

| field | type | notes |
| --- | --- | --- |
| `title` | string | required, ≤ 200 chars |
| `content` | string | required Markdown (same format the blog renders), ≤ 100 000 chars |
| `slug` | string | optional; auto-generated from title via slugify |
| `excerpt` | string | optional, ≤ 500 chars |
| `tags` | string[] | optional, ≤ 20 tags, each ≤ 40 chars |
| `cover_image` | string | optional `https://` URL only |
| `sources` | (string \| `{title,url}`)[] | optional; appended as a `## Fuentes` section when there is no dedicated column |
| `language` | `es` \| `en` | default `es` |
| `mode` | `draft` \| `publish_now` | default `draft` |

Raw HTML/JSX/MDX expressions are stripped from Markdown (fenced code blocks kept).
`javascript:` / `data:` URLs in links/images are neutralized. Cover images must be `https`.

```bash
# Draft
curl -s -X POST "$GAVEHO/api/agent/blog/posts" \
  -H "Authorization: Bearer $GAVEHO_BLOG_AGENT_KEY" -H 'content-type: application/json' \
  -d '{"title":"Building in public","content":"## Why\n\nWe ship weekly.","tags":["engineering"],"language":"en"}'

# Publish now with sources
curl -s -X POST "$GAVEHO/api/agent/blog/posts" \
  -H "Authorization: Bearer $GAVEHO_BLOG_AGENT_KEY" -H 'content-type: application/json' \
  -d '{
    "title":"Notas de release",
    "content":"Resumen del cambio…",
    "mode":"publish_now",
    "language":"es",
    "sources":[{"title":"PR","url":"https://github.com/AGASocial/gaveho/pull/1"}]
  }'
```

Responses:

- **201** create: `{ id, slug, status: "draft"|"published", url }`
- **200** idempotent replay (same slug + same agent key + identical content): same shape
- **409** slug already used by another post / different content
- **422** validation error
- **401** / **403** auth
- **429** rate limit (Upstash when configured; 60 req/key/hour)

`url` is the public absolute URL (`$NEXT_PUBLIC_SITE_URL/blog/<slug>`). Drafts are not listed publicly until published.

### Idempotency

If a post with the same `slug` already exists, was created by **this** agent key, and the
normalized content fingerprint matches (title, content after sanitize/Fuentes, excerpt, tags,
cover, language), the API returns that post with **200** instead of creating a duplicate.
Any other slug collision returns **409**.

## Get a post

`GET /api/agent/blog/posts/:id` — requires `blog:read` or `blog:write`.

```bash
curl -s "$GAVEHO/api/agent/blog/posts/$POST_ID" \
  -H "Authorization: Bearer $GAVEHO_BLOG_AGENT_KEY"
```

Returns `{ id, slug, title, status, url, created_at, updated_at }`.

## Update / publish

`PATCH /api/agent/blog/posts/:id` — requires `blog:write`.

| body | effect |
| --- | --- |
| `{ "action": "publish" }` or `{ "mode": "publish_now" }` | publish an existing draft |
| `{ "title", "content", "excerpt", "tags" }` | update a **draft** (published posts → 422) |

```bash
# Publish a draft
curl -s -X PATCH "$GAVEHO/api/agent/blog/posts/$POST_ID" \
  -H "Authorization: Bearer $GAVEHO_BLOG_AGENT_KEY" -H 'content-type: application/json' \
  -d '{"action":"publish"}'
```

After publish, the API revalidates `/blog`, `/blog/<slug>`, `/sitemap.xml`, and `/feed.xml`
so the post is live immediately. Published posts appear in the sitemap and RSS feed.

## Key management

In `/admin/social` → **Agent API keys**:

1. Label the key.
2. Optionally select social accounts.
3. Check **`blog:write`** (and/or `blog:read`).
4. Create — copy the `gsk_…` plaintext once.

Scopes and accounts can be combined on one key. Blog-only keys need no social accounts.

### Database migration

Apply `supabase/migrations/20261114020000_gaveho_agent_blog_scopes.sql` before using blog scopes in production:

- adds `scopes text[]` on `gaveho_social_agent_keys`
- adds `agent_key_id` on `gaveho_posts` (idempotency)

## Rate limit

When Upstash Redis env vars are set, blog agent routes share a per-key sliding window of
**60 requests / hour**. Responses include `X-RateLimit-*`; `429` includes `Retry-After`.
Without Upstash, rate limiting is skipped (same pattern as the blog chat route).
