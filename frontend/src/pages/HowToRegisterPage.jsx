import { motion } from 'framer-motion'
import {
  ExternalLink,
  UserPlus,
  Users,
  Building2,
  ListChecks,
  Mail,
  ShieldCheck,
  Clock,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP, REGISTRATION_URL } from '@/utils/constants.js'

const steps = [
  {
    icon: ExternalLink,
    title: 'Open the UMS registration portal',
    detail:
      'Click "Register on the UMS portal" below. On the portal, choose "New Registration" to start, or "Check Registration" to review an application you already submitted.',
  },
  {
    icon: UserPlus,
    title: 'Enter the team leader\u2019s details',
    detail:
      'Fill in your Name, Mobile No., and a valid Email address. Then select how you participate: Participant, Volunteer, or Viewer.',
  },
  {
    icon: Users,
    title: 'Set up your group',
    detail:
      'Under Group Selection, choose "Create New Group" to start a fresh team, or "Join Existing Group" to join one. Enter the Group Name and the total No. of Members.',
  },
  {
    icon: Building2,
    title: 'Choose your institute',
    detail:
      'Select your Institute from the list (Sanjivani colleges and schools). If you are from outside, pick "External Institute" or enter your Organization, then add the Department and Year (FY / SY / TY / Final).',
  },
  {
    icon: ListChecks,
    title: 'Add your group members',
    detail:
      'For every member row, enter their Name, Mobile No., and Email. Double-check each entry — the leader\u2019s email is where login credentials will be sent.',
  },
  {
    icon: Mail,
    title: 'Submit & receive credentials',
    detail:
      'Submit the form. After verification, the team leader receives dashboard login credentials by email within 24 to 48 hours. Use those to sign in on this platform.',
  },
]

const checklist = [
  'A valid email address for the team leader (credentials are sent here)',
  'Mobile numbers for every team member',
  'Your institute / organization and department details',
  'Full names of all members as per college records',
]

export function HowToRegisterPage() {
  usePageSeo({
    title: 'How to Register',
    description: `Step-by-step guide to registering your team for ${APP.name} on the Sanjivani University UMS portal.`,
  })

  return (
    <>
      {/* ═══════ HERO BANNER ═══════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/skh-banner.png"
            alt="Smart Kopargaon Hackathon 2026"
            className="h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/65 to-ink-950/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-transparent to-ink-950/40" />
        </div>
        <div className="relative w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              {APP.shortName} 2026 · Team Registration
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              How to Register Your Team
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              Registration is handled on the Sanjivani University UMS portal. Follow the steps below —
              dashboard access is enabled only after your team is registered.
            </p>
            <a
              href={REGISTRATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block"
            >
              <Button size="lg" className="gap-2 shadow-glow-brand">
                Register on the UMS portal
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* ═══════ CONTENT ═══════ */}
      <section className="py-12 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-3 lg:gap-12">
            {/* Steps */}
            <div className="lg:col-span-2">
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900">
                Registration steps
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Complete these on the UMS portal to register your team.
              </p>

              <ol className="mt-8 space-y-5">
                {steps.map((s, i) => (
                  <motion.li
                    key={s.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className="flex gap-4 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-sm"
                  >
                    <div className="relative flex shrink-0 flex-col items-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <span className="mt-2 text-xs font-bold text-ink-400">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-ink-900">{s.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-600">{s.detail}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6">
              {/* Access rule */}
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-5">
                <div className="flex items-center gap-2 text-brand-700">
                  <ShieldCheck className="h-5 w-5" />
                  <h3 className="font-display text-base font-semibold">Access rule</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  You can sign in to the dashboard only after your team is registered on the UMS portal.
                  Credentials are issued to the team leader after verification.
                </p>
              </div>

              {/* OTP note */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                <div className="flex items-center gap-2 text-amber-700">
                  <Info className="h-5 w-5" />
                  <h3 className="font-display text-base font-semibold">OTP tip on the UMS portal</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  On the UMS portal, you may <span className="font-semibold text-ink-900">not receive the OTP on your
                  first attempt</span>. If that happens, click <span className="font-semibold text-ink-900">
                  &ldquo;Resend OTP&rdquo;</span> — the code will be sent to you on the second try.
                </p>
              </div>

              {/* Credential timing */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Clock className="h-5 w-5" />
                  <h3 className="font-display text-base font-semibold">When do I get login details?</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">
                  The team leader receives dashboard login credentials by email within{' '}
                  <span className="font-semibold text-ink-900">24 to 48 hours</span> of registration.
                  Check your inbox and spam folder.
                </p>
              </div>

              {/* Checklist */}
              <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-sm">
                <div className="flex items-center gap-2 text-ink-900">
                  <Info className="h-5 w-5 text-brand-600" />
                  <h3 className="font-display text-base font-semibold">What you'll need</h3>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {checklist.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-ink-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <a
                href={REGISTRATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full gap-2">
                  Go to UMS portal
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
