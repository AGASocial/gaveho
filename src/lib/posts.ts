import { supabase, supabaseAdmin } from './supabase'
import type { Post } from '@/types'

export async function getPublishedPosts(): Promise<Post[]> {
  const { data, error } = await supabase()
    .from('gaveho_posts')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getPostBySlug(slug: string, preview = false): Promise<Post | null> {
  let query = supabase()
    .from('gaveho_posts')
    .select('*')
    .eq('slug', slug)

  if (!preview) query = query.eq('published', true)

  const { data, error } = await query.single()
  if (error) return null
  return data
}

export async function savePost(post: Omit<Post, 'id' | 'created_at' | 'updated_at'>): Promise<Post> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_posts')
    .insert(post)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updatePost(id: string, updates: Partial<Post>): Promise<Post> {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('gaveho_posts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
