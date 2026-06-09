import { motion } from 'framer-motion'
import { Shield, Heart, Users, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { Card } from '@/components/ui/Card.jsx'

export function CodeOfConductPage() {
  usePageSeo({
    title: 'Code of Conduct',
    description: 'Guidelines for respectful and professional behavior at Smart Kopargaon Hackathon.',
  })

  return (
    <div className="min-h-screen bg-[rgb(var(--page-bg))] py-20">
      <div className="mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center justify-center rounded-full bg-brand-500/10 p-3">
              <Shield className="h-8 w-8 text-brand-600" />
            </div>
            <h1 className="font-display text-4xl font-bold text-ink-900 sm:text-5xl">
              Code of Conduct
            </h1>
            <p className="mt-4 text-lg text-ink-600">
              Creating a safe, inclusive, and respectful environment for all participants
            </p>
          </div>

          {/* Our Commitment */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Heart className="h-6 w-6 text-rose-600" />
              Our Commitment
            </h2>
            <p className="text-ink-700">
              Smart Kopargaon Hackathon is dedicated to providing a harassment-free experience for everyone,
              regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics,
              gender identity and expression, level of experience, education, socio-economic status, nationality,
              personal appearance, race, caste, color, religion, or sexual identity and orientation.
            </p>
            <p className="mt-4 text-ink-700">
              We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive,
              and healthy community focused on innovation and collaboration.
            </p>
          </Card>

          {/* Expected Behavior */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              Expected Behavior
            </h2>
            <div className="space-y-4 text-ink-700">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Be Respectful:</span> Treat all participants, mentors, judges,
                  and organizers with respect and consideration
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Be Collaborative:</span> Work together constructively and support
                  other teams in their innovation journey
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Be Professional:</span> Use welcoming and inclusive language in
                  all communications and interactions
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Be Mindful:</span> Respect differing viewpoints and experiences,
                  and accept constructive criticism gracefully
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Focus on Innovation:</span> Direct your energy toward solving
                  problems and creating impactful solutions
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-semibold">Show Empathy:</span> Understand what is best for the community
                  and show compassion toward fellow participants
                </div>
              </div>
            </div>
          </Card>

          {/* Unacceptable Behavior */}
          <Card className="mb-8 border-red-500/30 bg-red-500/5">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              Unacceptable Behavior
            </h2>
            <p className="mb-4 text-ink-700">
              The following behaviors are considered harassment and will not be tolerated:
            </p>
            <div className="space-y-3 text-ink-700">
              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Violence, threats of violence, or violent language directed against another person
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Sexist, racist, homophobic, transphobic, ableist, or otherwise discriminatory jokes and language
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Posting or displaying sexually explicit or violent material
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Personal insults, particularly those related to gender, sexual orientation, race, religion, or disability
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Inappropriate physical contact or unwelcome sexual attention
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Deliberate intimidation, stalking, following, or harassing photography or recording
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Sustained disruption of talks, workshops, or other events
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Advocating for, or encouraging, any of the above behavior
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Plagiarism or claiming others' work as your own
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-red-600">✗</span>
                <div>
                  Sabotaging other teams' projects or equipment
                </div>
              </div>
            </div>
          </Card>

          {/* Consequences */}
          <Card className="mb-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Users className="h-6 w-6 text-brand-600" />
              Enforcement & Consequences
            </h2>
            <p className="mb-4 text-ink-700">
              Organizers will review all reports and determine appropriate action. Consequences may include:
            </p>
            <div className="space-y-3 text-ink-700">
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-600">
                  1
                </span>
                <div>
                  <span className="font-semibold">Warning:</span> A private, written warning providing clarity
                  around the violation and explanation of why the behavior was inappropriate
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-sm font-bold text-amber-600">
                  2
                </span>
                <div>
                  <span className="font-semibold">Temporary Suspension:</span> Temporary ban from the event or
                  specific activities
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-sm font-bold text-red-600">
                  3
                </span>
                <div>
                  <span className="font-semibold">Permanent Ban:</span> Permanent ban from the event and future
                  editions of Smart Kopargaon Hackathon
                </div>
              </div>
            </div>
          </Card>

          {/* Reporting */}
          <Card className="mb-8 border-brand-500/30 bg-brand-500/5">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-ink-900">
              <Shield className="h-6 w-6 text-brand-600" />
              Reporting Guidelines
            </h2>
            <p className="mb-4 text-ink-700">
              If you experience or witness unacceptable behavior, or have any other concerns, please report it as
              soon as possible:
            </p>
            <div className="space-y-3 text-ink-700">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  Contact any organizer or volunteer identified by their official badge
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  Email us at:{' '}
                  <a href="mailto:hackathon@sanjivani.edu.in" className="font-semibold text-brand-600 hover:underline">
                    hackathon@sanjivani.edu.in
                  </a>
                </div>
              </div>

              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  Call our helpline: <span className="font-semibold">+91 (2423) 000-000</span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-600">
              All reports will be handled with discretion and confidentiality. We are committed to taking appropriate
              action to ensure a safe environment for all.
            </p>
          </Card>

          {/* Acknowledgment */}
          <Card>
            <p className="text-sm text-ink-600">
              This Code of Conduct is adapted from the{' '}
              <a href="https://www.contributor-covenant.org/" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                Contributor Covenant
              </a>{' '}
              and various community codes of conduct. By participating in Smart Kopargaon Hackathon, you agree to
              abide by this Code of Conduct.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
