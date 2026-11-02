import { SocialPublisher } from '@/components/admin/social-publisher'
import { getInstagramOAuthConfig } from '@/lib/social/instagram'

export const dynamic = 'force-dynamic'

export default async function AdminSocialPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { connected, error } = await searchParams
  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Social publisher</h1>
      <SocialPublisher
        instagramConfigured={getInstagramOAuthConfig().configured}
        notice={connected ? 'Instagram account connected.' : error ? `Connect failed: ${error}` : null}
      />
    </main>
  )
}
