import { NextResponse } from 'next/server'
import { noStoreHeaders } from '@/lib/admin/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAgentApi } from '@/lib/social/agent-auth'

export const dynamic = 'force-dynamic'

// Connected accounts (never includes tokens).
export async function GET(request: Request) {
  const denied = requireAgentApi(request)
  if (denied) return denied
  const { data, error } = await supabaseAdmin()
    .from('gaveho_social_accounts')
    .select('id,platform,api_host,label,username,ig_user_id,is_active,caption_voice,token_expires_at,created_at')
    .order('created_at')
  if (error) return NextResponse.json({ error: 'Could not load accounts.' }, { status: 500, headers: noStoreHeaders })
  return NextResponse.json({ accounts: data }, { headers: noStoreHeaders })
}
