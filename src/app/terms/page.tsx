import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, Section, ContactLink } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for gaveho.com and GAVEHO Social.',
}

export default function TermsPage() {
  return (
    <LegalPage
      command="cat legal/terms.md"
      title="Terms of Service"
      intro="These terms apply to gaveho.com and GAVEHO Social. By using them you agree to these terms. If you don't, that's fine too — just close the tab, no hard feelings."
    >
      <Section title="Who operates the service">
        <p>gaveho.com and GAVEHO Social are operated by Gabriel Vega (AGA Social). GAVEHO Social is a personal publishing tool used to post the operator&apos;s own videos and images to his own Instagram and TikTok accounts.</p>
      </Section>
      <Section title="Acceptable use">
        <p>You agree not to misuse the site or the service, including attempting unauthorized access to the admin area, interfering with its operation, scraping it abusively, or using it to publish unlawful, infringing or harmful content.</p>
      </Section>
      <Section title="Your content and platform terms">
        <p>You keep all rights to content you publish through GAVEHO Social and are responsible for it. You must have the rights to anything you publish. Publishing to third-party platforms is also subject to their terms, including the TikTok Terms of Service and Community Guidelines and the Meta / Instagram Terms of Use and Platform Terms. GAVEHO Social is not affiliated with or endorsed by TikTok or Meta.</p>
      </Section>
      <Section title="No warranty">
        <p>The site and the service are provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, express or implied. Bugs may exist; we try to squash them.</p>
      </Section>
      <Section title="Limitation of liability">
        <p>To the maximum extent permitted by law, the operator is not liable for any indirect, incidental, special or consequential damages, or for any loss of data, content or profits, arising from the use of or inability to use the site or the service, including actions taken by third-party platforms.</p>
      </Section>
      <Section title="Changes">
        <p>We may update these terms. Changes are posted here with a new &quot;Last updated&quot; date, and continued use means you accept them.</p>
      </Section>
      <Section title="Privacy">
        <p>See our <Link href="/privacy" className="text-emerald-600 dark:text-emerald-400 underline">Privacy Policy</Link> for how data is handled.</p>
      </Section>
      <Section title="Contact">
        <p>Questions? Reach <ContactLink />.</p>
      </Section>
    </LegalPage>
  )
}
