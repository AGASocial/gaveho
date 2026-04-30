import { createClient } from '@supabase/supabase-js'

// Lazy getters — clients are only created at runtime, not at module evaluation time.
// This prevents build failures when env vars are absent during `next build`.

export const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Server-side only — bypasses RLS for agent/admin writes
export const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
