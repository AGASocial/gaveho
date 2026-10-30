import { createClient } from '@supabase/supabase-js'
import { embed, streamText } from 'ai'
import { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const MAX_MESSAGE_LENGTH = 1000

// Rate limiting with Upstash (gracefully degrades if not configured)
let ratelimit: Ratelimit | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 m'),
      analytics: true,
      prefix: 'ratelimit:chat',
    })
  }
} catch (err) {
  console.warn('[chat] Rate limiting not configured:', err)
}

function getRateLimitKey(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function detectLanguage(text: string): 'en' | 'es' {
  const spanishWords = /\b(qué|cómo|cuál|dónde|cuándo|por qué|hola|gracias|trabajo|proyecto)\b/i
  return spanishWords.test(text) ? 'es' : 'en'
}

export async function POST(req: NextRequest) {
  try {
    // Check for required env vars (AI Gateway + Supabase)
    const hasGateway = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || 
        !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !hasGateway) {
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
    if (ratelimit) {
      const clientKey = getRateLimitKey(req)
      const { success, limit, remaining, reset } = await ratelimit.limit(clientKey)

      if (!success) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded. Please try again later.',
            limit,
            remaining,
            reset,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': limit.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': reset.toString(),
            },
          }
        )
      }
    }
    
    // Detect language
    const language = detectLanguage(message)
    
    // Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    // Generate embedding via AI Gateway
    const { embedding: queryEmbedding } = await embed({
      model: 'openai/text-embedding-3-small',
      value: message,
    })
    
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
    
    // Stream response via AI Gateway with fallback
    const result = streamText({
      model: 'anthropic/claude-3-5-sonnet-20241022',
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      maxOutputTokens: 1024,
      temperature: 0.7,
      providerOptions: {
        gateway: {
          models: ['openai/gpt-4o'], // Fallback model
        },
      },
    })
    
    return result.toTextStreamResponse()
    
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
