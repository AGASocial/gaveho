import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/auth'
import { createIdea, getIdeas, updateIdeaStatus } from '@/lib/ideas'

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as 'new' | 'drafted' | 'discarded' | null

    const ideas = await getIdeas(status ?? undefined)
    return NextResponse.json({ ideas })
  } catch (err) {
    console.error('[admin/ideas GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard

  try {
    const { topic, sourceUrl, notes } = await req.json()

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const idea = await createIdea(topic, sourceUrl, notes)
    return NextResponse.json({ idea })
  } catch (err) {
    console.error('[admin/ideas POST] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminApi()
  if (guard instanceof NextResponse) return guard

  try {
    const { id, status, postIds } = await req.json()

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status are required' }, { status: 400 })
    }

    const idea = await updateIdeaStatus(id, status, postIds)
    return NextResponse.json({ idea })
  } catch (err) {
    console.error('[admin/ideas PATCH] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
