# gaveho.com

Gabriel Vega's personal website featuring a dark terminal-inspired design and an AI-powered RAG chat agent.

## Features

- 🎨 Dark terminal theme with monospace aesthetics
- 💬 RAG-powered AI chat agent (answers as Gabriel, grounded in his knowledge)
- 📝 Blog with bilingual support (English/Spanish)
- 🌓 Theme toggle with humor
- 📱 Fully responsive design

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind 4
- **Backend**: Supabase (PostgreSQL + pgvector)
- **AI**: Claude 3.5 Sonnet (Anthropic), OpenAI Embeddings
- **Deployment**: Vercel

## Environment Variables

Create a `.env.local` file with the following variables:

### Required for Basic Site

```env
# Supabase (for blog and knowledge base)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Agent for authenticated API routes
AGENT_SECRET=your_random_secret_key
```

### Required for AI Chat Agent

```env
# Anthropic (for chat responses)
ANTHROPIC_API_KEY=your_anthropic_api_key

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_api_key
```

**Note**: The chat widget will show a "coming soon" message if AI environment variables are missing, so the site works without them.

## Database Setup

### 1. Run Supabase Migrations

Apply the migration to create the knowledge base table:

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or manually in Supabase SQL editor
# Copy and run: supabase/migrations/20261029_create_knowledge_table.sql
```

This creates:
- `gaveho_knowledge` table with pgvector embeddings
- `match_gaveho_knowledge()` function for semantic search
- Row-level security policies

### 2. Ingest Knowledge Base

After setting up environment variables:

```bash
npm run ingest
```

This chunks and embeds:
- Homepage content (bio, skills, projects, experience)
- Published blog posts from `gaveho_posts`
- Markdown files in the `knowledge/` folder

**Add custom knowledge**: Drop `.md` files in the `knowledge/` folder and re-run `npm run ingest`.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Production Deployment

### On Vercel

1. **Connect your repository** to Vercel
2. **Add environment variables** in Vercel dashboard (Settings > Environment Variables)
3. **Deploy**

### After First Deploy

1. **Apply database migration** in Supabase SQL editor
2. **Run ingestion locally** with production env vars:
   ```bash
   npm run ingest
   ```
3. **Verify chat widget** works on production

### Updating Knowledge Base

To update the AI agent's knowledge:

1. Edit content in `knowledge/` folder or publish new blog posts
2. Run `npm run ingest` locally with production credentials
3. Changes take effect immediately (no redeploy needed)

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/chat/        # RAG chat endpoint
│   │   ├── blog/            # Blog pages
│   │   └── page.tsx         # Homepage
│   ├── components/
│   │   ├── agent-chat-widget.tsx  # AI chat UI
│   │   └── ...
│   └── lib/
│       ├── chunking.ts      # Text chunking utilities
│       └── ...
├── scripts/
│   └── ingest.ts            # Knowledge base ingestion
├── supabase/
│   └── migrations/          # Database migrations
├── knowledge/               # Custom knowledge files
│   ├── README.md
│   └── faq.md
└── public/                  # Static assets
```

## RAG Chat Agent Details

### How It Works

1. User sends a message
2. Message is embedded using OpenAI's `text-embedding-3-small`
3. Top 8 semantically similar chunks retrieved from `gaveho_knowledge`
4. Context + message sent to Claude 3.5 Sonnet
5. Response streamed back in real-time

### Features

- **Language detection**: Responds in English or Spanish automatically
- **Strict grounding**: Only answers from knowledge base, never invents facts
- **Rate limiting**: 20 requests per hour per IP
- **Streaming responses**: Real-time text generation
- **Fallback mode**: Works without AI credentials (shows "coming soon")

### Customization

Edit system prompts in `src/app/api/chat/route.ts` to change the agent's personality or response style.

## License

Private project. © 2026 Gabriel Vega
