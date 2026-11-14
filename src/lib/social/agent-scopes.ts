/** Capability scopes beyond social account allow-lists. Safe to import from client components. */
export const AGENT_PERMISSION_SCOPES = ['blog:read', 'blog:write'] as const
export type AgentPermissionScope = (typeof AGENT_PERMISSION_SCOPES)[number]

export function parseAgentPermissionScopes(value: unknown): { ok: true; scopes: AgentPermissionScope[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, scopes: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'scopes must be an array.' }
  const allowed = new Set<string>(AGENT_PERMISSION_SCOPES)
  const out: AgentPermissionScope[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) {
      return { ok: false, error: `scopes must be one or more of ${AGENT_PERMISSION_SCOPES.join(', ')}.` }
    }
    if (!out.includes(item as AgentPermissionScope)) out.push(item as AgentPermissionScope)
  }
  return { ok: true, scopes: out }
}
