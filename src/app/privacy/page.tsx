import type { Metadata } from 'next'
import { LegalPage, Section, ContactLink } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How gaveho.com and GAVEHO Social handle your data.',
}

export default function PrivacyPage() {
  return (
    <LegalPage
      command="cat legal/privacy.md"
      title="Privacy Policy"
      intro="gaveho.com is the personal site of Gabriel Vega (AGA Social). It hosts a blog and GAVEHO Social, an admin tool Gabriel uses to publish his own videos and images to his own Instagram and TikTok accounts. This policy explains what data that involves. Short version: very little, and it stays put."
    >
      <Section title="Who is responsible">
        <p>The site and GAVEHO Social are operated by Gabriel Vega (AGA Social), who is the data controller for the information described here.</p>
      </Section>
      <Section title="Data we receive from TikTok and Instagram">
        <p>When an account is connected to GAVEHO Social through TikTok Login Kit or the Instagram API, we receive only what those platforms provide for the permissions granted:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Basic profile information (such as account ID, username, display name and avatar).</li>
          <li>Access tokens and refresh tokens that allow publishing on the account&apos;s behalf.</li>
        </ul>
        <p>Tokens are encrypted at rest. We do not request or store your password, direct messages, followers&apos; data or analytics beyond what is needed to publish.</p>
      </Section>
      <Section title="Why we use it">
        <p>Solely to publish content that the account owner has explicitly chosen to publish, and to show the connection status in the admin tool. No profiling, no advertising, no training of models on your data. The robots get nothing.</p>
      </Section>
      <Section title="No selling or sharing">
        <p>We do not sell, rent or share your personal data with third parties. Data is only sent to TikTok or Meta when you publish to those platforms, and to the service providers below that run the site.</p>
      </Section>
      <Section title="Where data is stored">
        <p>Data is stored in a database hosted by Supabase and the site is hosted by Vercel. These providers process data on our behalf under their own security and privacy commitments.</p>
      </Section>
      <Section title="Retention and deletion">
        <p>We keep tokens and profile info only while the account is connected. Disconnecting an account in GAVEHO Social deletes its stored tokens. You can also request deletion of any data related to you by contacting us (see below); we will handle it within 30 days.</p>
      </Section>
      <Section title="Revoking access">
        <p>You can revoke GAVEHO Social&apos;s access at any time from your TikTok settings (Security and permissions → Apps and services) or your Instagram/Meta settings (Apps and websites). Once revoked, the stored tokens stop working.</p>
      </Section>
      <Section title="Cookies">
        <p>We only use cookies needed to keep the admin session signed in. No tracking or advertising cookies. Not even the chocolate-chip kind.</p>
      </Section>
      <Section title="Children">
        <p>GAVEHO Social is not directed to children under 13 (or the minimum age in your country), and we do not knowingly collect their data.</p>
      </Section>
      <Section title="Changes to this policy">
        <p>We may update this policy from time to time. Changes will be posted on this page with a new &quot;Last updated&quot; date.</p>
      </Section>
      <Section title="Contact">
        <p>For questions or deletion requests, contact <ContactLink />.</p>
      </Section>
    </LegalPage>
  )
}
