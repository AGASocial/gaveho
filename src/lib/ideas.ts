import { supabaseAdmin } from './supabase'

export type IdeaStatus = 'new' | 'drafted' | 'discarded'

export interface Idea {
  id: string
  topic: string
  source_url?: string
  notes?: string
  status: IdeaStatus
  post_ids: string[]
  created_at: string
  updated_at: string
}

export async function createIdea(
  topic: string,
  sourceUrl?: string,
  notes?: string
): Promise<Idea> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_ideas')
    .insert({
      topic,
      source_url: sourceUrl,
      notes,
      status: 'new',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateIdeaStatus(
  id: string,
  status: IdeaStatus,
  postIds?: string[]
): Promise<Idea> {
  const admin = supabaseAdmin()
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (postIds) {
    updates.post_ids = postIds
  }

  const { data, error } = await admin
    .from('gaveho_ideas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getIdeas(status?: IdeaStatus): Promise<Idea[]> {
  const admin = supabaseAdmin()
  let query = admin
    .from('gaveho_ideas')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getIdeaById(id: string): Promise<Idea | null> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_ideas')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}
