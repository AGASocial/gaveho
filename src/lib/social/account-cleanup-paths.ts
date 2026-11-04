import { agentUploadPrefix, referencedStoragePath } from './agent-uploads'

/**
 * Paths under agent/<accountId>/ that are safe to delete: those not referenced by any remaining post
 * (media_urls or cover_url of any account's post, including posts that list this account in also_accounts).
 */
export function deletableAccountAgentPaths(accountId: string, objectPaths: string[], referenced: Iterable<string>, bucket = 'gaveho-social'): string[] {
  const prefix = agentUploadPrefix(accountId)
  const refs = new Set<string>()
  for (const r of referenced) {
    const p = referencedStoragePath(r, bucket)
    if (p) refs.add(p)
  }
  return [...new Set(objectPaths)].filter((p) => p.startsWith(prefix) && p.length > prefix.length && !refs.has(p))
}
