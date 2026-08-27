import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, Building2, Lightbulb, Users, Award, Globe, Zap, Shield, X } from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP } from '@/utils/constants.js'

const pillars = [
  { icon: Target, title: 'Problem-first', body: 'Curated civic and industrial challenges sourced with departments and MSME partners.' },
  { icon: Building2, title: 'Institutional backbone', body: `${APP.university} hosts infrastructure, mentorship, and governance for a trusted event.` },
  { icon: Lightbulb, title: 'Ship-ready mindset', body: 'Submissions emphasize feasibility, measurable impact, and pathways beyond the weekend.' },
]

const values = [
  { icon: Users, title: 'Inclusive participation', body: 'Open to students across India. Cross-disciplinary teams encouraged.' },
  { icon: Award, title: 'Merit-driven evaluation', body: 'Structured rubric scoring by domain-expert jury panels.' },
  { icon: Globe, title: 'Regional relevance', body: 'Problems grounded in Kopargaon Taluka realities and district needs.' },
  { icon: Zap, title: 'Rapid prototyping', body: '48-hour build sprints with mentors, resources, and structured milestones.' },
  { icon: Shield, title: 'Data integrity', body: 'Audit trails, role-based access, and transparent evaluation workflows.' },
  { icon: Building2, title: 'Government alignment', body: 'Aligned with Smart Cities Mission, Digital India, and state innovation policies.' },
]

/* ─── UN SDG Goals ─── */
const SDG_GOALS = [
  { id: 1, title: 'No Poverty', color: '#E5243B', desc: 'End poverty in all its forms everywhere.' },
  { id: 2, title: 'Zero Hunger', color: '#DDA63A', desc: 'End hunger, achieve food security and improved nutrition.', skh: 'Agriculture' },
  { id: 3, title: 'Good Health & Well-being', color: '#4C9F38', desc: 'Ensure healthy lives and promote well-being for all.', skh: 'Health' },
  { id: 4, title: 'Quality Education', color: '#C5192D', desc: 'Ensure inclusive and equitable quality education.', skh: 'Education' },
  { id: 5, title: 'Gender Equality', color: '#FF3A21', desc: 'Achieve gender equality and empower all women and girls.' },
  { id: 6, title: 'Clean Water & Sanitation', color: '#26BDE2', desc: 'Ensure availability and sustainable management of water.', skh: 'Waste Management' },
  { id: 7, title: 'Affordable & Clean Energy', color: '#FCC30B', desc: 'Ensure access to affordable, reliable, sustainable energy.' },
  { id: 8, title: 'Decent Work & Economic Growth', color: '#A21942', desc: 'Promote sustained, inclusive economic growth.', skh: 'Industry & MSME' },
  { id: 9, title: 'Industry, Innovation & Infrastructure', color: '#FD6925', desc: 'Build resilient infrastructure, promote innovation.', skh: 'Industry & MSME' },
  { id: 10, title: 'Reduced Inequalities', color: '#DD1367', desc: 'Reduce inequality within and among countries.' },
  { id: 11, title: 'Sustainable Cities & Communities', color: '#FD9D24', desc: 'Make cities inclusive, safe, resilient and sustainable.', skh: 'Open Innovation' },
  { id: 12, title: 'Responsible Consumption & Production', color: '#BF8B2E', desc: 'Ensure sustainable consumption and production patterns.', skh: 'Food Safety & Security' },
  { id: 13, title: 'Climate Action', color: '#3F7E44', desc: 'Take urgent action to combat climate change.' },
  { id: 14, title: 'Life Below Water', color: '#0A97D9', desc: 'Conserve and sustainably use the oceans and marine resources.' },
  { id: 15, title: 'Life on Land', color: '#56C02B', desc: 'Protect, restore and promote sustainable use of terrestrial ecosystems.' },
  { id: 16, title: 'Peace, Justice & Strong Institutions', color: '#00689D', desc: 'Promote peaceful, inclusive societies and strong institutions.' },
  { id: 17, title: 'Partnerships for the Goals', color: '#19486A', desc: 'Strengthen the means of implementation and revitalize global partnerships.', skh: 'SKH Core Mission' },
]

export function AboutPage() {
  usePageSeo({
    title: 'About',
    description: `Learn about ${APP.name} and the innovation mission for ${APP.region}.`,
  })
  return (
    <div className="relative">
      {/* Hero banner */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="/skh-banner.png" alt="Smart Kopargaon Hackathon 2026" className="h-full w-full object-cover" draggable={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 via-ink-950/65 to-ink-950/85" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/95 via-transparent to-ink-950/40" />
        </div>
        <div className="relative w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              {APP.shortName} 2026 · About
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              About the Hackathon
            </h1>
            <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
              {APP.name} is modeled on national hackathon best practices — refined for {APP.region} with
              clearer UX, faster operations, and stronger collaboration between students, departments, and industry.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-16 sm:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {pillars.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-brand-500/5 blur-2xl transition-all group-hover:bg-brand-500/15" />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                    <b.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{b.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values grid */}
      <section className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 py-16 sm:py-24">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Values"
            title="What drives the platform"
            description="Core principles that shape every aspect of the SKH ecosystem."
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="flex items-start gap-4 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                  <v.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold text-ink-900">{v.title}</h3>
                  <p className="mt-1 text-sm text-ink-500">{v.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* UN SDG Goals */}
      <SDGSection />
    </div>
  )
}

/* ─── SDG Section ─── */
const sdgImg = (id) => `/sdg/goal-${String(id).padStart(2, '0')}.png`

function SDGSection() {
  const [active, setActive] = useState(null)
  const selected = active !== null ? SDG_GOALS[active] : null

  return (
    <section className="relative overflow-hidden border-t border-[rgb(var(--border))]/60 bg-gradient-to-b from-[rgb(var(--surface-muted))]/40 to-[rgb(var(--page-bg))] py-20 sm:py-28">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-brand-500/5 blur-[110px]" />
        <div className="absolute -right-32 bottom-1/4 h-72 w-72 rounded-full bg-emerald-500/5 blur-[110px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Global Goals"
          title="SKH and the UN Sustainable Development Goals"
          description="The United Nations' 17 Sustainable Development Goals are a shared global blueprint for peace and prosperity by 2030. Tap any goal to learn more about it."
        />

        {/* Goal grid — official UN icons */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 md:gap-4">
          {SDG_GOALS.map((g, i) => {
            const isActive = active === i
            return (
              <motion.button
                key={g.id}
                type="button"
                onClick={() => setActive(isActive ? null : i)}
                initial={{ opacity: 0, y: 14, scale: 0.92 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.025, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                aria-label={`Goal ${g.id}: ${g.title}`}
                className={[
                  'group relative aspect-square overflow-hidden rounded-2xl shadow-card outline-none transition-all duration-300',
                  'hover:-translate-y-1 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                  isActive ? '-translate-y-1 shadow-xl ring-2 ring-offset-2 ring-offset-[rgb(var(--page-bg))]' : '',
                ].join(' ')}
                style={isActive ? { '--tw-ring-color': g.color } : undefined}
              >
                <img
                  src={sdgImg(g.id)}
                  alt={`UN SDG ${g.id}: ${g.title}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {/* hover sheen */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </motion.button>
            )
          })}
        </div>

        {/* Attribution */}
        <div className="mt-6 flex justify-center text-xs text-ink-500 sm:justify-end">
          <a
            href="https://www.un.org/sustainabledevelopment/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-400 underline-offset-2 hover:text-brand-600 hover:underline"
          >
            SDG icons © United Nations
          </a>
        </div>

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-card-hover"
            >
              <div className="h-1.5" style={{ background: selected.color }} />
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <img
                  src={sdgImg(selected.id)}
                  alt={`UN SDG ${selected.id}: ${selected.title}`}
                  className="h-16 w-16 shrink-0 rounded-xl shadow-md ring-1 ring-black/5 sm:h-20 sm:w-20"
                />
                <div className="flex-1">
                  <p className="font-display text-xs font-bold uppercase tracking-wide" style={{ color: selected.color }}>Goal {selected.id}</p>
                  <h4 className="mt-0.5 font-display text-lg font-bold text-ink-900">{selected.title}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{selected.desc}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-[rgb(var(--surface-muted))] hover:text-ink-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
