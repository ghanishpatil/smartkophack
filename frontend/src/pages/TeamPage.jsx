import { motion } from 'framer-motion'
import { Mail, Phone } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP, COORDINATORS } from '@/utils/constants.js'

// Student team only — coordinators + core team leads (from constants).
const students = [
  ...COORDINATORS.coordinators.map((c) => ({ ...c, role: c.role || 'Student Coordinator' })),
  ...COORDINATORS.leaders.map((l) => ({ ...l, role: l.role || 'Core Team' })),
]

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export function TeamPage() {
  usePageSeo({ title: 'Student Team', description: `Meet the student team behind ${APP.name}.` })
  return (
    <div className="w-full px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <SectionHeading
        eyebrow="People"
        title="The Student Team"
        description="Students driving the Smart Kopargaon Hackathon — from coordination to on-ground operations."
      />
      <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {students.map((m, i) => (
          <motion.div
            key={m.name}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-cyan-500/10 font-display text-xl font-bold text-brand-700">
              {initials(m.name)}
            </div>
            <p className="mt-4 font-display font-semibold text-ink-900">{m.name}</p>
            <p className="mt-1 text-sm text-brand-600">{m.role}</p>
            {m.email && (
              <a href={`mailto:${m.email}`} className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-brand-600">
                <Mail className="h-3.5 w-3.5" /> {m.email}
              </a>
            )}
            {m.phone && (
              <a href={`tel:${m.phone}`} className="mt-3 inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-brand-600">
                <Phone className="h-3.5 w-3.5" /> {m.phone}
              </a>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
