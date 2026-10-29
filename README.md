# gaveho.com

Gabriel Vega's personal website featuring a dark terminal-inspired design and an AI-powered RAG chat agent.

## Features

- 🎨 Dark terminal theme with monospace aesthetics
- 💬 RAG-powered AI chat agent (answers as Gabriel, grounded in his knowledge)
- 📝 Blog with bilingual support (English/Spanish)
- ✍️ Admin dashboard for idea-to-blog-draft workflow
- 🔍 News discovery with AI-powered relevance scoring
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
# Anthropic (for chat responses and blog generation)
ANTHROPIC_API_KEY=your_anthropic_api_key

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_api_key
```

### Optional: News Search (Admin Dashboard)

```env
# Tavily (recommended): https://tavily.com
TAVILY_API_KEY=your_tavily_api_key

# OR Brave Search: https://brave.com/search/api/
BRAVE_SEARCH_API_KEY=your_brave_search_api_key

# Control which provider to use (default: tavily)
NEWS_SEARCH_PROVIDER=tavily
```

**Note**: The chat widget will show a "coming soon" message if AI environment variables are missing, so the site works without them. The admin dashboard works without news search APIs, but news discovery will be disabled.

## Database Setup

### 1. Run Supabase Migrations

Apply the migrations to create required tables:

```bash
# Via Supabase CLI (recommended)
supabase db push

# Or manually in Supabase SQL editor
# Copy and run: supabase/migrations/20261029_create_knowledge_table.sql
# Copy and run: supabase/ideas_table.sql (for admin dashboard)
```

This creates:
- `gaveho_knowledge` table with pgvector embeddings
- `match_gaveho_knowledge()` function for semantic search
- `gaveho_ideas` table for tracking blog ideas
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

## Admin Dashboard (`/admin/ideas`)

Private entry point for Gabriel (protected by `AGENT_SECRET`). Features:

### Idea Submission
- Paste a topic directly
- Provide a URL to an article (automatic server-side extraction)
- Add notes via typing or voice dictation (Web Speech API)

### News Discovery
- Search for relevant news aligned with Gabriel's profile:
  - AI, LLMs, agents
  - Web dev, Next.js, TypeScript
  - Developer tooling
  - Building products
- Returns 5-10 candidates with:
  - Title, source, published date
  - Snippet preview
  - AI-powered relevance analysis ("why it fits Gabriel")
- Click a result to auto-populate idea form with extracted article content

### Draft Generation
- Generates **both** English and Spanish blog posts
- Includes TikTok script (Spanish)
- Shows preview links with `?preview=AGENT_SECRET`
- Saves drafts as `published=false`

### Draft Management
- List all unpublished posts
- Language badges (🇬🇧 EN / 🇪🇸 ES)
- Preview links
- Manual "Publish" button with confirmation dialog

### Idea Tracking
All submissions stored in `gaveho_ideas` table with:
- Topic, source URL, notes
- Status: `new`, `drafted`, or `discarded`
- Linked post IDs

### API Endpoints

- `POST /api/agent` - Generate EN + ES blog drafts (existing, public API)
- `POST /api/admin/login` - Authenticate with AGENT_SECRET
- `GET /api/admin/login` - Check auth status
- `GET /api/admin/ideas?status=` - List ideas by status
- `POST /api/admin/ideas` - Create idea
- `PATCH /api/admin/ideas` - Update idea status
- `POST /api/admin/generate` - Generate drafts + save idea
- `POST /api/admin/search-news` - Search web for relevant news
- `POST /api/admin/extract-article` - Extract article text from URL
- `GET /api/admin/drafts` - List unpublished posts
- `POST /api/admin/publish` - Publish a draft

## Production Deployment

### On Vercel

1. **Connect your repository** to Vercel
2. **Add environment variables** in Vercel dashboard (Settings > Environment Variables)
3. **Deploy**

### After First Deploy

1. **Apply database migrations** in Supabase SQL editor
2. **Run ingestion locally** with production env vars:
   ```bash
   npm run ingest
   ```
3. **Verify chat widget** works on production
4. **Access admin dashboard** at `/admin/ideas` with `AGENT_SECRET`

### Updating Knowledge Base

To update the AI agent's knowledge:

1. Edit content in `knowledge/` folder or publish new blog posts
2. Run `npm run ingest` locally with production credentials
3. Changes take effect immediately (no redeploy needed)

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── admin/ideas/     # Admin dashboard
│   │   ├── api/
│   │   │   ├── admin/       # Admin API endpoints
│   │   │   ├── agent/       # Blog generation API
│   │   │   └── chat/        # RAG chat endpoint
│   │   ├── blog/            # Blog pages
│   │   └── page.tsx         # Homepage
│   ├── components/
│   │   ├── agent-chat-widget.tsx  # AI chat UI
│   │   └── ...
│   └── lib/
│       ├── admin-auth.ts    # Admin authentication
│       ├── chunking.ts      # Text chunking utilities
│       ├── generate.ts      # Blog generation logic
│       ├── ideas.ts         # Ideas CRUD
│       ├── drafts.ts        # Drafts management
│       └── ...
├── scripts/
│   └── ingest.ts            # Knowledge base ingestion
├── supabase/
│   ├── migrations/          # Database migrations
│   └── ideas_table.sql      # Ideas table migration
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
