import { motion } from 'framer-motion'
import { ShieldCheck, FileText, AlertTriangle } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { Card } from '@/components/ui/Card.jsx'
import { APP } from '@/utils/constants.js'

const LAST_UPDATED = 'July 2026'

function LegalLayout({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[rgb(var(--page-bg))] py-20">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-full bg-brand-500/10 p-3">
              <Icon className="h-8 w-8 text-brand-600" />
            </div>
            <h1 className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">{title}</h1>
            <p className="mt-4 text-lg text-ink-600">{subtitle}</p>
            <p className="mt-2 text-sm text-ink-500">Last updated: {LAST_UPDATED}</p>
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <Card className="mb-8">
      <h2 className="mb-4 text-2xl font-bold text-ink-900">{title}</h2>
      <div className="space-y-4 text-ink-700">{children}</div>
    </Card>
  )
}

function Bullet({ children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
      <div>{children}</div>
    </div>
  )
}

const mailLink = (
  <a href={`mailto:${APP.contactEmail}`} className="font-semibold text-brand-600 hover:underline">
    {APP.contactEmail}
  </a>
)

/* ─────────────────────────── Privacy Policy ─────────────────────────── */
export function PrivacyPolicyPage() {
  usePageSeo({
    title: 'Privacy Policy',
    description: `How ${APP.name} collects, uses, and protects your personal information.`,
  })

  return (
    <LegalLayout
      icon={ShieldCheck}
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information"
    >
      <Section title="Information We Collect">
        <p>When you register and participate, we collect the information you provide, including:</p>
        <Bullet>Account details — name, email address, and mobile number.</Bullet>
        <Bullet>Team information — team name, members, institute, and department.</Bullet>
        <Bullet>Submissions — project files, links, and related metadata you upload.</Bullet>
        <Bullet>Technical data — basic device and access logs used to keep the platform secure.</Bullet>
      </Section>

      <Section title="How We Use Your Information">
        <Bullet>To create and manage your account, team, and event registration.</Bullet>
        <Bullet>To process submissions and enable jury evaluation.</Bullet>
        <Bullet>To send you important updates, credentials, and announcements by email.</Bullet>
        <Bullet>To protect the platform against fraud, abuse, and unauthorized access.</Bullet>
      </Section>

      <Section title="Data Storage & Security">
        <p>
          Your data is stored on Google Firebase (Authentication, Firestore, and Storage) with access controlled
          by security rules and server-side checks. We apply reasonable technical and organizational measures to
          protect your information, but no method of transmission or storage is completely secure.
        </p>
      </Section>

      <Section title="Sharing of Information">
        <p>
          We do not sell your personal information. Data is shared only with organizers, mentors, and jury members
          strictly as needed to run the hackathon, and with service providers (such as email and payment
          processors) that help us operate the platform.
        </p>
      </Section>

      <Section title="Your Rights">
        <Bullet>You may request access to, correction of, or deletion of your personal data.</Bullet>
        <Bullet>You may opt out of non-essential communications at any time.</Bullet>
        <p className="pt-2">
          To exercise any of these rights, contact us at {mailLink}.
        </p>
      </Section>
    </LegalLayout>
  )
}

/* ─────────────────────────── Terms of Use ─────────────────────────── */
export function TermsOfUsePage() {
  usePageSeo({
    title: 'Terms of Use',
    description: `The terms governing your use of the ${APP.name} platform.`,
  })

  return (
    <LegalLayout
      icon={FileText}
      title="Terms of Use"
      subtitle={`The rules for using the ${APP.shortName} platform`}
    >
      <Section title="Acceptance of Terms">
        <p>
          By accessing or using the {APP.name} platform, you agree to these Terms of Use. If you do not agree,
          please do not use the platform.
        </p>
      </Section>

      <Section title="Eligibility & Accounts">
        <Bullet>You must provide accurate, complete registration information and keep it up to date.</Bullet>
        <Bullet>You are responsible for maintaining the confidentiality of your login credentials.</Bullet>
        <Bullet>You are responsible for all activity that occurs under your account.</Bullet>
      </Section>

      <Section title="Acceptable Use">
        <Bullet>Do not attempt to gain unauthorized access to the platform, other accounts, or systems.</Bullet>
        <Bullet>Do not upload malicious code, spam, or unlawful, infringing, or harmful content.</Bullet>
        <Bullet>Do not disrupt, overload, or interfere with the platform or other participants.</Bullet>
      </Section>

      <Section title="Submissions & Intellectual Property">
        <p>
          You retain ownership of the work your team submits. By submitting, you grant the organizers a limited
          license to review, evaluate, and showcase your submission for the purposes of the hackathon. You confirm
          that your submission does not infringe the rights of any third party.
        </p>
      </Section>

      <Section title="Disqualification">
        <p>
          The organizers may suspend or remove any participant or team that violates these terms, the Code of
          Conduct, or the event rules. Decisions of the organizers and jury are final.
        </p>
      </Section>

      <Section title="Changes to These Terms">
        <p>
          We may update these terms from time to time. Continued use of the platform after changes take effect
          constitutes acceptance of the revised terms. Questions? Contact us at {mailLink}.
        </p>
      </Section>
    </LegalLayout>
  )
}

/* ─────────────────────────── Disclaimer ─────────────────────────── */
export function DisclaimerPage() {
  usePageSeo({
    title: 'Disclaimer',
    description: `Important disclaimers regarding the ${APP.name} platform and event.`,
  })

  return (
    <LegalLayout
      icon={AlertTriangle}
      title="Disclaimer"
      subtitle="Important information about the platform and event"
    >
      <Section title="General Information">
        <p>
          The {APP.name} platform and its content are provided on an “as is” and “as available” basis. While we
          strive to keep information accurate and up to date, we make no warranties of any kind about the
          completeness, accuracy, or reliability of the content.
        </p>
      </Section>

      <Section title="Event Changes">
        <p>
          Dates, rules, prizes, problem statements, and other event details may change at the organizers’
          discretion. We will communicate material changes through the platform and by email where possible.
        </p>
      </Section>

      <Section title="External Links">
        <p>
          The platform may contain links to third-party websites (such as the university UMS registration portal
          and payment providers). We are not responsible for the content, policies, or practices of those external
          sites.
        </p>
      </Section>

      <Section title="Limitation of Liability">
        <p>
          To the fullest extent permitted by law, {APP.university} and the organizers shall not be liable for any
          indirect, incidental, or consequential damages arising from your use of the platform or participation in
          the event.
        </p>
      </Section>

      <Section title="Contact">
        <p>For any questions about this disclaimer, reach us at {mailLink}.</p>
      </Section>
    </LegalLayout>
  )
}
