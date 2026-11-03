import { supabaseAdmin } from '@/lib/supabase'
import { AGENT_UPLOAD_WINDOW_MS, orphanAgentObjects, referencedStoragePath, type StoredAgentObject } from './agent-uploads'
import { SOCIAL_BUCKET } from './store'

const PAGE = 1000
const REMOVE_BATCH = 100

/**
 * Lists every object under agent/<account_id>/ in the social bucket. Pagination stops only on an
 * empty page, so a server-side cap lower than PAGE cannot end the scan early.
 */
async function listAgentObjects(): Promise<StoredAgentObject[]> {
  const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
  const folders: string[] = []
  for (let offset = 0; ; ) {
    const { data, error } = await storage.list('agent', { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list agent/: ${error.message}`)
    if (!data?.length) break
    for (const f of data) if (!f.id) folders.push(f.name) // folders have no id
    offset += data.length
  }
  const objects: StoredAgentObject[] = []
  for (const folder of folders) {
    for (let offset = 0; ; ) {
      const { data, error } = await storage.list(`agent/${folder}`, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`list agent/${folder}: ${error.message}`)
      if (!data?.length) break
      for (const f of data) if (f.id) objects.push({ path: `agent/${folder}/${f.name}`, createdAt: f.created_at ?? null })
      offset += data.length
    }
  }
  return objects
}

/**
 * Every agent/ reference in any post's media_urls or cover_url, from the
 * gaveho_social_referenced_agent_urls() RPC: one text[] value computed in SQL (distinct over unnest),
 * so PostgREST max_rows cannot truncate it. Throws on error so the cron never deletes on partial data.
 */
export async function referencedAgentMedia(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().rpc('gaveho_social_referenced_agent_urls')
  if (error) throw new Error(`load referenced agent media: ${error.message}`)
  if (!Array.isArray(data)) throw new Error('load referenced agent media: unexpected RPC result')
  return data as string[]
}

/** Deletes agent/ uploads older than 24 h that no post references, and prunes the upload log. */
export async function cleanupAgentUploads(now = Date.now()) {
  const [objects, refs] = await Promise.all([listAgentObjects(), referencedAgentMedia()])
  const orphans = orphanAgentObjects(objects, refs, now)
  const storage = supabaseAdmin().storage.from(SOCIAL_BUCKET)
  let deleted = 0
  let skipped = 0
  for (let i = 0; i < orphans.length; i += REMOVE_BATCH) {
    // Re-check references right before each remove: a post may have attached one of these meanwhile.
    const fresh = new Set((await referencedAgentMedia()).map((r) => referencedStoragePath(r, SOCIAL_BUCKET)))
    const batch = orphans.slice(i, i + REMOVE_BATCH).filter((p) => !fresh.has(p))
    skipped += Math.min(REMOVE_BATCH, orphans.length - i) - batch.length
    if (!batch.length) continue
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
  return { scanned: objects.length, orphans: orphans.length, skipped, deleted }
}
