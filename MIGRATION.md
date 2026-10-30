# AI SDK Migration Summary

This PR migrates the gaveho.com visitor chat from hand-rolled SSE with direct SDK calls to the Vercel AI SDK with AI Gateway routing.

## What Changed

### 1. Chat API Route (`/api/chat`)
**Before**: Direct Anthropic SDK with hand-rolled SSE streaming  
**After**: AI SDK `streamText` with AI Gateway routing

- **Model**: `anthropic/claude-3-5-sonnet-20241022` with fallback to `openai/gpt-4o`
- **Embeddings**: Routed through AI Gateway (`openai/text-embedding-3-small`)
- **RAG**: Supabase vector search via `match_gaveho_knowledge` function
- **Rate Limiting**: Migrated to Upstash Redis (gracefully degrades if not configured)
- **Auth**: Accepts `AI_GATEWAY_API_KEY` (local) or `VERCEL_OIDC_TOKEN` (Vercel)

### 2. Ingest Script (`scripts/ingest.ts`)
**Before**: Direct OpenAI SDK for embeddings  
**After**: AI SDK `embedMany` with AI Gateway routing

- **Embeddings**: All routed through AI Gateway
- **No OpenAI SDK**: Removed dependency on `openai` package
- **Auth**: Uses same AI Gateway credentials

### 3. Chat Widget (`src/components/agent-chat-widget.tsx`)
**Before**: Custom fetch with hand-rolled streaming  
**After**: AI SDK React `useChat` hook with `DefaultChatTransport`

- **UI**: Preserved terminal styling and cyan/green color scheme
- **Features**: Initial greeting, streaming, error handling, loading states
- **Transport**: Uses AI SDK transport layer for proper message handling

## Key Benefits

✅ **Single Authentication**: Only AI Gateway credentials needed (no per-provider keys)  
✅ **Automatic Fallback**: Primary model failures automatically failover to secondary  
✅ **Provider Agnostic**: Easy to switch models without code changes  
✅ **Cost Tracking**: Centralized usage monitoring through AI Gateway  
✅ **Production Ready**: Proper streaming, error handling, rate limiting

## Environment Variables

### Required

```bash
# AI Gateway (choose ONE)
AI_GATEWAY_API_KEY=xxx              # For local/external deployments
VERCEL_OIDC_TOKEN=xxx               # Automatically injected in Vercel

# Supabase
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Optional (Rate Limiting)

```bash
# Without these, rate limiting is gracefully disabled
UPSTASH_REDIS_REST_URL=xxx
UPSTASH_REDIS_REST_TOKEN=xxx
```

### Removed (No Longer Needed)

```bash
# ❌ Not needed - AI Gateway handles provider routing
OPENAI_API_KEY
ANTHROPIC_API_KEY  # Still needed for /api/agent (post generator)
```

## Dependencies

### Added
- `ai@7.0.157` - Vercel AI SDK core
- `@ai-sdk/react@4.0.161` - React hooks
- `@upstash/ratelimit@2.2.0` - Rate limiting
- `@upstash/redis@1.40.0` - Redis client

### Removed
- `openai` - Replaced by AI SDK with gateway routing
- `@anthropic-ai/sdk` - Only used in `/api/agent` (post generator) now

## Files Changed

```
modified: package.json
modified: package-lock.json
modified: src/app/api/chat/route.ts
modified: scripts/ingest.ts
modified: src/components/agent-chat-widget.tsx
new:      MIGRATION.md
```

## AI Gateway Configuration

### Authentication Setup

**Local Development**:
```bash
# Create API key
vercel ai-gateway api-keys create --name gaveho-chat

# Set in .env.local
AI_GATEWAY_API_KEY=your_key_here
```

**Vercel Deployments**:
- `VERCEL_OIDC_TOKEN` is automatically injected
- No manual configuration needed

### Model Routing

**Primary**: `anthropic/claude-3-5-sonnet-20241022`  
**Fallback**: `openai/gpt-4o` (automatic on Anthropic failure)

Embeddings: `openai/text-embedding-3-small` (1536 dimensions)

## Deployment Checklist

- [ ] Run Supabase migration: `supabase/migrations/20261029_create_knowledge_table.sql`
- [ ] Set up AI Gateway API key (local) or ensure OIDC is enabled (Vercel)
- [ ] Run knowledge ingestion: `npm run ingest`
- [ ] (Optional) Configure Upstash Redis for rate limiting
- [ ] Test chat in both English and Spanish
- [ ] Verify RAG retrieval with sample questions
- [ ] Check error handling (missing env vars, API failures)

## Build Status

✅ **Build**: Passing  
✅ **Lint**: Passing  
✅ **TypeScript**: No errors

## Migration Notes

### Breaking Changes
- **Environment Variables**: Must set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`
- **No Direct Provider Keys**: `OPENAI_API_KEY` no longer used for chat (still needed for `/api/agent`)

### Non-Breaking
- **Database Schema**: No changes to `gaveho_knowledge` table
- **UI/UX**: Terminal styling and behavior preserved
- **API Contract**: `/api/chat` endpoint unchanged from client perspective

### Backward Compatibility
- Rate limiting gracefully degrades if Upstash not configured
- Service returns 503 fallback message if AI Gateway not configured
- Existing knowledge vectors remain compatible (same embedding model/dimension)

## Testing

```bash
# Install dependencies
npm install

# Run ingestion (requires AI Gateway + Supabase)
npm run ingest

# Build
npm run build

# Lint
npm run lint

# Dev
npm run dev
```

## Troubleshooting

### "Service temporarily unavailable"
- Check `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is set
- Verify Supabase credentials are correct

### Ingestion fails
- Ensure `knowledge/` directory exists with `.md` files
- Check AI Gateway credentials
- Verify Supabase service role key has write access

### Rate limiting not working
- Optional feature - requires Upstash Redis configuration
- Check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

## Additional Resources

- [Vercel AI SDK Docs](https://ai-sdk.dev/)
- [AI Gateway Setup](https://vercel.com/docs/ai-gateway/getting-started)
- [Supabase Vector Search](https://supabase.com/docs/guides/ai)
