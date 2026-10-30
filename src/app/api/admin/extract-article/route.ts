import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)
  if (!isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { url } = await req.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; gaveho.com/1.0)',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status }
      )
    }

    const html = await response.text()

    const text = extractArticleText(html)

    return NextResponse.json({ text })
  } catch (err) {
    console.error('[admin/extract-article] error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function extractArticleText(html: string): string {
  let text = html

  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&[a-z]+;/gi, ' ')
  text = text.replace(/\s+/g, ' ')
  text = text.trim()

  const maxLength = 4000
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...'
  }

  return text
}
