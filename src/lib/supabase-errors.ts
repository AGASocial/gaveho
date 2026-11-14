/** True when Postgres/PostgREST reports a missing/unknown column (migration not applied). */
export function isUndefinedColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  const msg = (error.message ?? '').toLowerCase()
  return (
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find') && msg.includes('column') && msg.includes('schema cache'))
  )
}
