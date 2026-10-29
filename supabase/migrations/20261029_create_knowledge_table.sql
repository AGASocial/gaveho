-- Enable pgvector extension for embeddings
create extension if not exists vector with schema extensions;

-- Knowledge base table for RAG
create table if not exists public.gaveho_knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  source_type text not null check (source_type in ('homepage', 'blog', 'knowledge')),
  source_id text,
  source_title text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index on embedding for fast similarity search
create index if not exists gaveho_knowledge_embedding_idx 
  on public.gaveho_knowledge 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index on source_type for filtering
create index if not exists gaveho_knowledge_source_type_idx 
  on public.gaveho_knowledge (source_type);

-- Function to match documents by semantic similarity
create or replace function public.match_gaveho_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.78,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  source_type text,
  source_id text,
  source_title text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    gaveho_knowledge.id,
    gaveho_knowledge.content,
    gaveho_knowledge.source_type,
    gaveho_knowledge.source_id,
    gaveho_knowledge.source_title,
    gaveho_knowledge.metadata,
    1 - (gaveho_knowledge.embedding <=> query_embedding) as similarity
  from gaveho_knowledge
  where 1 - (gaveho_knowledge.embedding <=> query_embedding) > match_threshold
  order by gaveho_knowledge.embedding <=> query_embedding
  limit match_count;
$$;

-- Enable RLS
alter table public.gaveho_knowledge enable row level security;

-- Public read access (for the chat widget)
create policy "Public read access"
  on public.gaveho_knowledge
  for select
  to anon, authenticated
  using (true);

-- Only service role can insert/update/delete
create policy "Service role full access"
  on public.gaveho_knowledge
  for all
  to service_role
  using (true)
  with check (true);
