import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const ADMIN_COOKIE_NAME = 'gaveho_admin_auth'
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const authCookie = cookieStore.get(ADMIN_COOKIE_NAME)

  if (!authCookie) return false

  return authCookie.value === process.env.AGENT_SECRET
}

export async function setAdminAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, process.env.AGENT_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function clearAdminAuthCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}

export function getAdminSecretFromRequest(req: NextRequest): string | null {
  const cookie = req.cookies.get(ADMIN_COOKIE_NAME)
  return cookie?.value ?? null
}

export function isValidAdminSecret(secret: string | null): boolean {
  return secret === process.env.AGENT_SECRET
}
