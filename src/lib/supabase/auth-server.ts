import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Cookie-based Supabase Auth client (anon key). Used only to read/establish the
// admin's auth session; data access for admin features uses supabaseAdmin().
export async function createSupabaseAuthServerClient() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
          }
        },
      },
    }
  )
}
