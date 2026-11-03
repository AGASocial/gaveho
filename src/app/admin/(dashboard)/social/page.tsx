import { AgentKeys } from '@/components/admin/agent-keys'
import { SocialPublisher } from '@/components/admin/social-publisher'

export const dynamic = 'force-dynamic'

export default function AdminSocialPage() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Social publisher</h1>
      <SocialPublisher encryptionConfigured={Boolean(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY)} />
      <AgentKeys />
    </main>
  )
}
