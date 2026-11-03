import { supabaseAdmin } from '@/lib/supabase'
import { AGENT_UPLOAD_WINDOW_MS, orphanAgentObjects, type StoredAgentObject } from './agent-uploads'
import { SOCIAL_BUCKET } from './store'

const PAGE = 1000

/** Lists every object under agent/<account_id>/ in the social bucket. */
async function listAgentObjects(): Promise<StoredAgentObject[]> {
  const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
  const folders: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list('agent', { limit: PAGE, offset })
    if (error) throw new Error(`list agent/: ${error.message}`)
    for (const f of data ?? []) if (!f.id) folders.push(f.name) // folders have no id
    if (!data || data.length < PAGE) break
  }
  const objects: StoredAgentObject[] = []
  for (const folder of folders) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(`agent/${folder}`, { limit: PAGE, offset })
      if (error) throw new Error(`list agent/${folder}: ${error.message}`)
      for (const f of data ?? []) if (f.id) objects.push({ path: `agent/${folder}/${f.name}`, createdAt: f.created_at ?? null })
      if (!data || data.length < PAGE) break
    }
  }
  return objects
}

/** agent/ URLs referenced by any post's media_urls or cover_url (all posts are scanned). */
async function referencedAgentMedia(): Promise<string[]> {
  const refs: string[] = []
  const db = supabaseAdmin()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('gaveho_social_posts')
      .select('media_urls,cover_url')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`load posts: ${error.message}`)
    for (const p of (data ?? []) as { media_urls: string[] | null; cover_url: string | null }[]) {
      for (const u of p.media_urls ?? []) if (u.includes('/agent/')) refs.push(u)
      if (p.cover_url?.includes('/agent/')) refs.push(p.cover_url)
    }
    if (!data || data.length < PAGE) break
  }
  return refs
}

/** Deletes agent/ uploads older than 24 h that no post references, and prunes the upload log. */
export async function cleanupAgentUploads(now = Date.now()) {
  const [objects, refs] = await Promise.all([listAgentObjects(), referencedAgentMedia()])
  const orphans = orphanAgentObjects(objects, refs, now)
  const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
  let deleted = 0
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100)
    const { error } = await storage.remove(batch)
    if (error) console.error('[agent-cleanup] remove failed:', error.message)
    else deleted += batch.length
  }
  // The upload log only feeds the hourly rate limit: keep a day of history.
  const { error: logError } = await supabaseAdmin()
    .from('gaveho_social_agent_uploads')
    .delete()
    .lt('created_at', new Date(now - 24 * AGENT_UPLOAD_WINDOW_MS).toISOString())
  if (logError) console.error('[agent-cleanup] prune upload log failed:', logError.message)
  return { scanned: objects.length, orphans: orphans.length, deleted }
}
