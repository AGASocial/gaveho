#!/usr/bin/env tsx

/**
 * Knowledge base ingestion script
 * Chunks and embeds content from homepage, blog posts, and knowledge files
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'
import { chunkText, chunkHomepageContent } from '../src/lib/chunking'

// Check required env vars
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`)
    process.exit(1)
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

interface KnowledgeEntry {
  content: string
  source_type: 'homepage' | 'blog' | 'knowledge'
  source_id?: string
  source_title?: string
  metadata: Record<string, unknown>
}

/**
 * Generate embeddings for an array of texts
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 100
  const embeddings: number[][] = []
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    console.log(`  Generating embeddings ${i + 1}-${Math.min(i + batchSize, texts.length)} of ${texts.length}...`)
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    })
    
    embeddings.push(...response.data.map(d => d.embedding))
  }
  
  return embeddings
}

/**
 * Ingest homepage content
 */
async function ingestHomepage(): Promise<number> {
  console.log('📄 Ingesting homepage content...')
  
  const homepageContent = {
    bio: "I build robust, scalable software systems with a focus on clean architecture and minimal design. Previously at Snapchat and Backbase. Passionate about conversational AI and developer tooling.",
    skills: [
      { label: 'Frontend', skills: ['TypeScript', 'Next.js', 'Angular', 'React', 'Tailwind CSS'] },
      { label: 'Backend', skills: ['Node.js', 'Supabase', 'PostgreSQL', 'Docker', 'GCP', 'Azure'] },
      { label: 'AI & Cloud', skills: ['OpenAI', 'Claude', 'RAG', 'LangChain', 'Vercel'] },
    ],
    projects: [
      {
        name: 'CCTV Magic',
        description: 'AI SaaS that transforms security camera photos into hyperrealistic videos using OpenAI Sora.',
        tags: ['Next.js', 'OpenAI Sora', 'Supabase', 'Stripe'],
      },
      {
        name: 'NeuraliticaBot',
        description: 'Chat with your files (PDF, DOCX, CSV, images) using RAG and OpenAI models.',
        tags: ['Next.js', 'RAG', 'OpenAI', 'Supabase'],
      },
    ],
    experience: [
      { company: 'Aequilibrium', role: 'Senior Frontend Developer', period: '09/2025 – Present' },
      { company: 'Snapchat', role: 'Senior Software Engineer', period: '10/2024 – 06/2025' },
      { company: '84.51°', role: 'Senior Software Engineer', period: '05/2024 – 10/2024' },
      { company: 'Backbase', role: 'Senior Frontend Engineer', period: '06/2021 – 04/2024' },
      { company: 'Lexicon Networks', role: 'Software Consultant', period: '05/2018 – 05/2021' },
    ],
  }
  
  const chunks = chunkHomepageContent(homepageContent)
  
  const entries: KnowledgeEntry[] = chunks.map(chunk => ({
    content: chunk.content,
    source_type: 'homepage',
    source_id: 'main',
    source_title: 'Homepage',
    metadata: chunk.metadata,
  }))
  
  const embeddings = await generateEmbeddings(entries.map(e => e.content))
  
  const records = entries.map((entry, i) => ({
    ...entry,
    embedding: embeddings[i],
  }))
  
  const { error } = await supabase
    .from('gaveho_knowledge')
    .insert(records)
  
  if (error) throw error
  
  console.log(`  ✅ Ingested ${records.length} chunks from homepage`)
  return records.length
}

/**
 * Ingest published blog posts
 */
async function ingestBlogPosts(): Promise<number> {
  console.log('📝 Ingesting blog posts...')
  
  const { data: posts, error } = await supabase
    .from('gaveho_posts')
    .select('id, slug, title, content, excerpt, language')
    .eq('published', true)
  
  if (error) throw error
  
  if (!posts || posts.length === 0) {
    console.log('  ℹ️  No published posts found')
    return 0
  }
  
  const entries: KnowledgeEntry[] = []
  
  for (const post of posts) {
    // Chunk the post content
    const contentChunks = chunkText(post.content, 800, 200)
    
    for (const chunk of contentChunks) {
      entries.push({
        content: `From blog post "${post.title}": ${chunk}`,
        source_type: 'blog',
        source_id: post.id,
        source_title: post.title,
        metadata: {
          slug: post.slug,
          language: post.language,
          excerpt: post.excerpt,
        },
      })
    }
  }
  
  if (entries.length === 0) return 0
  
  const embeddings = await generateEmbeddings(entries.map(e => e.content))
  
  const records = entries.map((entry, i) => ({
    ...entry,
    embedding: embeddings[i],
  }))
  
  const { error: insertError } = await supabase
    .from('gaveho_knowledge')
    .insert(records)
  
  if (insertError) throw insertError
  
  console.log(`  ✅ Ingested ${records.length} chunks from ${posts.length} blog posts`)
  return records.length
}

/**
 * Ingest markdown files from knowledge folder
 */
async function ingestKnowledgeFiles(): Promise<number> {
  console.log('📚 Ingesting knowledge files...')
  
  const knowledgePath = path.join(process.cwd(), 'knowledge')
  
  let files: string[]
  try {
    files = await fs.readdir(knowledgePath)
  } catch {
    console.log('  ℹ️  No knowledge folder found')
    return 0
  }
  
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'README.md')
  
  if (mdFiles.length === 0) {
    console.log('  ℹ️  No markdown files found')
    return 0
  }
  
  const entries: KnowledgeEntry[] = []
  
  for (const file of mdFiles) {
    const filePath = path.join(knowledgePath, file)
    const content = await fs.readFile(filePath, 'utf-8')
    
    // Remove markdown headers for title
    const title = file.replace('.md', '').replace(/-/g, ' ')
    
    // Chunk the file content
    const chunks = chunkText(content, 800, 200)
    
    for (const chunk of chunks) {
      entries.push({
        content: chunk,
        source_type: 'knowledge',
        source_id: file,
        source_title: title,
        metadata: {
          filename: file,
        },
      })
    }
  }
  
  if (entries.length === 0) return 0
  
  const embeddings = await generateEmbeddings(entries.map(e => e.content))
  
  const records = entries.map((entry, i) => ({
    ...entry,
    embedding: embeddings[i],
  }))
  
  const { error } = await supabase
    .from('gaveho_knowledge')
    .insert(records)
  
  if (error) throw error
  
  console.log(`  ✅ Ingested ${records.length} chunks from ${mdFiles.length} knowledge files`)
  return records.length
}

/**
 * Main ingestion function
 */
async function main() {
  console.log('🚀 Starting knowledge base ingestion...\n')
  
  try {
    // Clear existing knowledge
    console.log('🗑️  Clearing existing knowledge...')
    const { error: deleteError } = await supabase
      .from('gaveho_knowledge')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
    
    if (deleteError) throw deleteError
    console.log('  ✅ Cleared\n')
    
    // Ingest all sources
    const homepageCount = await ingestHomepage()
    console.log()
    
    const blogCount = await ingestBlogPosts()
    console.log()
    
    const knowledgeCount = await ingestKnowledgeFiles()
    console.log()
    
    const total = homepageCount + blogCount + knowledgeCount
    console.log(`✨ Ingestion complete! Total chunks: ${total}`)
    
  } catch (caughtError) {
    console.error('❌ Error during ingestion:', caughtError)
    process.exit(1)
  }
}

main()
