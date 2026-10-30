import { NextRequest, NextResponse } from 'next/server'
import { getAdminSecretFromRequest, isValidAdminSecret } from '@/lib/admin-auth'
import { generateBlogDrafts } from '@/lib/generate'
import { createIdea, updateIdeaStatus } from '@/lib/ideas'

export async function POST(req: NextRequest) {
  const secret = getAdminSecretFromRequest(req)
  if (!isValidAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { topic, context, sourceUrl, notes, ideaId } = await req.json()

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const drafts = await generateBlogDrafts(topic, context)

    let savedIdeaId = ideaId

    if (!savedIdeaId) {
      const idea = await createIdea(topic, sourceUrl, notes)
      savedIdeaId = idea.id
    }

    await updateIdeaStatus(savedIdeaId, 'drafted', [drafts.en.id, drafts.es.id])

    return NextResponse.json({
      success: true,
      ideaId: savedIdeaId,
      drafts,
    })
  } catch (err) {
    console.error('[admin/generate] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
