import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { NextRequest } from 'next/server'

// Rate limiting store (in-memory, resets on deploy)
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const MAX_REQUESTS_PER_HOUR = 20
const MAX_MESSAGE_LENGTH = 1000

function getRateLimitKey(req: NextRequest): string {
  // Use x-forwarded-for or x-real-ip for production
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         req.headers.get('x-real-ip') ||
         'unknown'
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const limit = rateLimits.get(key)
  
  if (!limit || now > limit.resetAt) {
    rateLimits.set(key, {
      count: 1,
      resetAt: now + 60 * 60 * 1000, // 1 hour
    })
    return true
  }
  
  if (limit.count >= MAX_REQUESTS_PER_HOUR) {
    return false
  }
  
  limit.count++
  return true
}

function detectLanguage(text: string): 'en' | 'es' {
  // Simple heuristic: check for common Spanish words
  const spanishWords = /\b(qué|cómo|cuál|dónde|cuándo|por qué|hola|gracias|trabajo|proyecto)\b/i
  return spanishWords.test(text) ? 'es' : 'en'
}

export async function POST(req: NextRequest) {
  try {
    // Check for required env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || 
        !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !process.env.OPENAI_API_KEY ||
        !process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'Service temporarily unavailable',
          fallback: true 
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const { message } = await req.json()
    
    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Rate limiting
    const clientKey = getRateLimitKey(req)
    if (!checkRateLimit(clientKey)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Detect language
    const language = detectLanguage(message)
    
    // Initialize clients
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
    
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
    
    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    })
    
    const queryEmbedding = embeddingResponse.data[0].embedding
    
    // Retrieve relevant chunks from knowledge base
    const { data: matches, error: matchError } = await supabase
      .rpc('match_gaveho_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.75,
        match_count: 8,
      })
    
    if (matchError) {
      console.error('Match error:', matchError)
      throw new Error('Failed to retrieve knowledge')
    }
    
    interface KnowledgeMatch {
      content: string
      source_type: string
      source_id: string
      source_title: string
      similarity: number
    }
    
    // Build context from matches
    const context = matches && matches.length > 0
      ? (matches as KnowledgeMatch[]).map(m => m.content).join('\n\n')
      : ''
    
    // System prompt
    const systemPrompt = language === 'es'
      ? `Eres Gabriel Vega, un ingeniero de software senior especializado en IA y desarrollo full-stack. Responde en primera persona basándote ÚNICAMENTE en el contexto proporcionado.

REGLAS IMPORTANTES:
- Si el contexto no contiene información relevante para responder la pregunta, di claramente que no tienes esa información y sugiere dejar un mensaje directo a Gabriel.
- NO inventes información ni hagas suposiciones sobre lo que Gabriel podría pensar o hacer.
- Sé conversacional pero profesional, como Gabriel hablaría.
- Mantén las respuestas concisas pero informativas.
- Si se pregunta sobre disponibilidad o contacto, menciona LinkedIn.

Contexto:
${context || 'No hay información relevante disponible.'}`
      : `You are Gabriel Vega, a senior software engineer specializing in AI and full-stack development. Respond in first person based ONLY on the provided context.

IMPORTANT RULES:
- If the context doesn't contain relevant information to answer the question, clearly say you don't have that information and suggest leaving Gabriel a direct message.
- DO NOT make up information or assume what Gabriel might think or do.
- Be conversational but professional, as Gabriel would speak.
- Keep responses concise but informative.
- If asked about availability or contact, mention LinkedIn.

Context:
${context || 'No relevant information available.'}`
    
    // Call Claude with streaming
    const stream = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      system: systemPrompt,
      stream: true,
    })
    
    // Stream response
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && 
                event.delta.type === 'text_delta') {
              const text = event.delta.text
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
      },
    })
    
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
    
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred. Please try again.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
