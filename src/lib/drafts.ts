import { supabaseAdmin } from './supabase'
import type { Post } from '@/types'

export async function getDrafts(): Promise<Post[]> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_posts')
    .select('*')
    .eq('published', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getPostsByIds(ids: string[]): Promise<Post[]> {
  if (ids.length === 0) return []

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_posts')
    .select('*')
    .in('id', ids)

  if (error) throw error
  return data ?? []
}

export async function publishPost(id: string): Promise<Post> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_posts')
    .update({
      published: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
