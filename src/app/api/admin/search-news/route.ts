import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret } from '@/lib/admin-auth'

interface NewsResult {
  title: string
  url: string
  source: string
  publishedDate?: string
  snippet: string
  relevanceNote: string
}

async function searchWithTavily(query: string): Promise<NewsResult[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: false,
      max_results: 10,
      include_domains: [],
      exclude_domains: [],
    }),
  })

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.statusText}`)
  }

  const data = await response.json()

  return (data.results || []).map((result: { title: string; url: string; content: string; published_date?: string }) => ({
    title: result.title,
    url: result.url,
    source: new URL(result.url).hostname,
    publishedDate: result.published_date,
    snippet: result.content.slice(0, 200) + '...',
    relevanceNote: determineRelevance(result.title, result.content),
  }))
}

async function searchWithBrave(query: string): Promise<NewsResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY not configured')
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('freshness', 'pw') // past week

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.statusText}`)
  }

  const data = await response.json()

  return (data.web?.results || []).map((result: { title: string; url: string; description: string; age?: string }) => ({
    title: result.title,
    url: result.url,
    source: new URL(result.url).hostname,
    publishedDate: result.age,
    snippet: result.description,
    relevanceNote: determineRelevance(result.title, result.description),
  }))
}

function determineRelevance(title: string, content: string): string {
  const text = `${title} ${content}`.toLowerCase()

  if (text.includes('llm') || text.includes('claude') || text.includes('gpt') || text.includes('ai agent')) {
    return 'LLM/AI agent technology'
  }
  if (text.includes('next.js') || text.includes('nextjs') || text.includes('react') || text.includes('typescript')) {
    return 'Next.js/React/TypeScript development'
  }
  if (text.includes('developer') || text.includes('coding') || text.includes('engineering')) {
    return 'Developer tooling & practices'
  }
  if (text.includes('supabase') || text.includes('database') || text.includes('backend')) {
    return 'Backend/database technology'
  }
  if (text.includes('product') || text.includes('startup') || text.includes('building')) {
    return 'Product development'
  }

  return 'Industry news & insights'
}

export async function POST(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)
  if (!isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { query } = await req.json()

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const provider = process.env.NEWS_SEARCH_PROVIDER || 'tavily'

    let results: NewsResult[] = []

    if (provider === 'brave' && process.env.BRAVE_SEARCH_API_KEY) {
      results = await searchWithBrave(query)
    } else if (provider === 'tavily' && process.env.TAVILY_API_KEY) {
      results = await searchWithTavily(query)
    } else if (process.env.TAVILY_API_KEY) {
      results = await searchWithTavily(query)
    } else if (process.env.BRAVE_SEARCH_API_KEY) {
      results = await searchWithBrave(query)
    } else {
      return NextResponse.json({
        error: 'No search provider configured',
        message: 'Please set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY in your environment variables',
      }, { status: 503 })
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[admin/search-news] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
