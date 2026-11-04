import type { Metadata } from 'next'
import { LegalPage, Section, ContactEmail, ContactLink } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How gaveho.com and GAVEHO Social handle personal data.',
}

const ul = 'list-disc pl-6 space-y-1'

export default function PrivacyPage() {
  return (
    <LegalPage
      command="cat legal/privacy.md"
      title="Privacy Policy"
      intro="gaveho.com is the personal website of Gabriel Vega (AGA Social). It includes a blog, a public chat assistant on the blog, and GAVEHO Social, a private admin tool used to publish the operator's own videos and images to the operator's own Instagram and TikTok accounts. This policy describes what personal data is processed and why."
    >
      <Section title="Who we are">
        <p>gaveho.com and GAVEHO Social are operated by Gabriel Vega, who is responsible for the processing described here. Contact: <ContactEmail />.</p>
      </Section>

      <Section title="Data received from TikTok and Instagram">
        <p>When an account is connected to GAVEHO Social through TikTok Login Kit or the Instagram API, we receive and store:</p>
        <ul className={ul}>
          <li>Basic profile information: account ID, username and display name.</li>
          <li>Access and refresh tokens, with their expiry and granted scopes. Tokens are encrypted at rest.</li>
        </ul>
        <p>We do not receive or store passwords, direct messages or follower data.</p>
      </Section>

      <Section title="How this data is used">
        <p>Account data is used only to publish content that the account owner has chosen to publish, to check publishing status, and to keep the connection working (token refresh). It is not used for advertising or profiling, and it is not sold.</p>
      </Section>

      <Section title="Uploaded content">
        <p>Videos, images and covers uploaded in GAVEHO Social are stored in a Supabase Storage bucket. Captions, schedules and publishing status are stored in a Supabase database. The storage bucket is publicly readable by URL, because Instagram and TikTok fetch media from a public URL when publishing. Anyone who has a file&apos;s URL can view it. Temporary uploads that are not used by any post are removed automatically after about 24 hours.</p>
      </Section>

      <Section title="Blog chat assistant">
        <p>The blog has a public chat assistant that answers questions about the blog&apos;s content. When you use it:</p>
        <ul className={ul}>
          <li>Your message (up to 1,000 characters) is sent to AI model providers through Vercel AI Gateway to find relevant articles and generate an answer. We do not store chat messages in our database.</li>
          <li>Your IP address is used as a rate-limiting key and stored by Upstash (Redis). Rate-limit windows expire after about one hour, and Upstash rate-limit analytics may keep these records longer.</li>
        </ul>
        <p>Please do not enter personal or sensitive information in the chat.</p>
      </Section>

      <Section title="Service providers (processors)">
        <p>We use these providers to run the site, and they process data on our behalf:</p>
        <ul className={ul}>
          <li><strong>Vercel</strong>: hosting and request logs.</li>
          <li><strong>Supabase</strong>: database, authentication for the admin, and file storage.</li>
          <li><strong>Vercel AI Gateway</strong>, routing to <strong>Anthropic</strong> and <strong>OpenAI</strong>: generates captions from admin-uploaded images and caption context (account label, username, caption voice and notes), and processes blog chat messages.</li>
          <li><strong>Upstash</strong>: rate limiting for the blog chat, using visitors&apos; IP addresses.</li>
          <li><strong>TikTok</strong> and <strong>Meta (Instagram)</strong>: receive the content you choose to publish, together with the account&apos;s access token.</li>
        </ul>
        <p>We do not sell personal data or share it with anyone else, except where required by law.</p>
      </Section>

      <Section title="Retention, deletion and disconnecting">
        <ul className={ul}>
          <li><strong>Deleting</strong> an account in GAVEHO Social removes its stored tokens and its posts from the database, removes its agent upload files from storage, and asks TikTok to revoke the access token. The revocation and file removal are done on a best-effort basis.</li>
          <li><strong>Deactivating</strong> an account stops publishing but keeps its tokens and posts until it is deleted.</li>
          <li>Content that has already been published on TikTok or Instagram stays there. Remove it on those platforms.</li>
        </ul>
      </Section>

      <Section id="data-deletion" title="Data deletion instructions">
        <p>To stop access and have your data deleted:</p>
        <ol className="list-decimal pl-6 space-y-1">
          <li><strong>TikTok:</strong> open TikTok, go to Settings and privacy → Security and permissions → Apps and services, and remove GAVEHO Social.</li>
          <li><strong>Instagram:</strong> open Instagram, go to Settings → Apps and websites (or Accounts Center), and remove GAVEHO Social.</li>
          <li><strong>And/or by email:</strong> send a deletion request to <ContactEmail /> with the subject &quot;Data deletion&quot; and your TikTok or Instagram username.</li>
        </ol>
        <p>Revoking access stops the tokens from working. On an email request, we will make reasonable efforts to delete the related data within 30 days and confirm by email.</p>
      </Section>

      <Section title="Cookies and local storage">
        <p>We do not use tracking or advertising cookies. We use only:</p>
        <ul className={ul}>
          <li>Supabase Auth session cookies, for signing in to the admin.</li>
          <li><code className="font-mono text-sm">gaveho_tiktok_oauth_state</code>, a short-lived cookie that protects the TikTok connection flow.</li>
          <li>A <code className="font-mono text-sm">theme</code> value in your browser&apos;s localStorage that remembers light or dark mode.</li>
        </ul>
      </Section>

      <Section title="Children">
        <p>The site is not directed to children under 13, and we do not knowingly collect their personal data.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>We may update this policy. Changes will be posted on this page with a new &quot;Last updated&quot; date.</p>
      </Section>

      <Section title="Contact">
        <p>Email: <ContactEmail />. You can also reach Gabriel Vega on <ContactLink />.</p>
      </Section>
    </LegalPage>
  )
}
