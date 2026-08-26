import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  Clock, Users, Layers, Scale, Trophy, Medal, Award, Rocket,
  Lightbulb, Sprout, Bus, GraduationCap, ShieldCheck, Factory, HeartPulse, Recycle,
  ArrowDown, CalendarDays, MapPin, Utensils, Moon, CheckCircle2, Gauge, Sparkles,
  Cpu, ClipboardCheck, FileCheck, ShieldAlert, Flag, Timer, Zap, Target,
} from 'lucide-react'
import { SectionHeading } from '@/components/ui/SectionHeading.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'

/* ═══════════════════════════  DATA  ═══════════════════════════ */

const GLANCE = [
  { icon: Clock, value: '24', unit: 'Hours', note: 'Round-the-clock development' },
  { icon: Users, value: '100', unit: 'Teams', note: 'Selected finalists competing' },
  { icon: Layers, value: '8', unit: 'Domains', note: 'Innovation categories' },
  { icon: Scale, value: '50:50', unit: 'Evaluation', note: 'Existing + New Challenge' },
]

const WORKS = [
  { n: '01', title: 'Existing Project', body: 'Teams enter with the project that qualified them for the Grand Finale.', icon: Target },
  { n: '02', title: 'New Challenge', body: 'New problem statements or simultaneous challenges are introduced during the hackathon.', icon: Zap },
  { n: '03', title: 'Adapt & Build', body: 'Understand the new challenge, adapt your solution, develop additional functionality and integrate meaningfully.', icon: Rocket },
  { n: '04', title: 'Final Submission', body: 'Complete and submit your solution within the given deadline.', icon: FileCheck },
  { n: '05', title: 'Online Evaluation', body: 'Judges evaluate submissions through the official online evaluation platform.', icon: ClipboardCheck },
  { n: '06', title: 'Ranking & Awards', body: 'Final scores determine overall ranking and domain-specific award winners.', icon: Trophy },
]

const CRITERIA = [
  { icon: Sparkles, label: 'Innovation & Uniqueness' },
  { icon: Cpu, label: 'Technical Soundness & Feasibility' },
  { icon: Rocket, label: 'Prototype Development & Functionality' },
  { icon: ClipboardCheck, label: 'Problem Relevance & Effectiveness' },
  { icon: Layers, label: 'Integration & Scalability' },
  { icon: Gauge, label: 'Usability & User Experience' },
  { icon: Trophy, label: 'Impact & Market Readiness' },
  { icon: FileCheck, label: 'Presentation & Final Demonstration' },
]

const DAYS = {
  'Day 1 · 29 Aug': {
    rows: [
      ['7:00 AM', 'Participant Reporting'],
      ['8:30 AM', 'Hackathon Begins'],
      ['10:00 AM', 'ID Checking & Goodie Distribution'],
      ['8:30 AM onwards', '24-Hour Round-the-Clock Development, Mentoring & Challenges'],
    ],
    meals: [
      { icon: Utensils, label: 'Lunch', time: '1:30 PM' },
      { icon: Moon, label: 'Dinner', time: '7:30 PM' },
    ],
  },
  'Day 2 · 30 Aug': {
    rows: [
      ['10:00 AM', 'Hackathon Ends & Final Submission'],
      ['11:00 AM – 1:30 PM', 'Online Evaluation'],
      ['1:30 PM', 'Lunch'],
      ['2:00 PM onwards', 'Result Finalization & Ranking'],
      ['By 4:00 PM', 'Result Declaration & Award Announcements'],
    ],
    meals: [],
  },
}

const DOMAINS = [
  { icon: Lightbulb, title: 'Open Innovation', body: 'Open-ended solutions addressing impactful real-world problems.', color: 'from-amber-500 to-orange-600' },
  { icon: Sprout, title: 'Agriculture', body: 'Technology-driven solutions for agriculture challenges.', color: 'from-emerald-500 to-green-600' },
  { icon: Bus, title: 'Transportation', body: 'Innovations focused on transportation and mobility.', color: 'from-blue-500 to-indigo-600' },
  { icon: GraduationCap, title: 'Education', body: 'Solutions improving learning and educational systems.', color: 'from-violet-500 to-purple-600' },
  { icon: ShieldCheck, title: 'Food Safety & Security', body: 'Technology addressing food safety challenges.', color: 'from-rose-500 to-red-600' },
  { icon: Factory, title: 'Industry & MSME', body: 'Solutions supporting industries and MSMEs.', color: 'from-slate-500 to-zinc-700' },
  { icon: HeartPulse, title: 'Health', body: 'Technology-driven healthcare solutions.', color: 'from-pink-500 to-rose-600' },
  { icon: Recycle, title: 'Waste Management', body: 'Innovative approaches to waste and sustainability.', color: 'from-teal-500 to-cyan-600' },
]

const POOLS = [
  { icon: Trophy, pool: 'Pool 1', teams: 'Top 8', award: '1st Prize', gradient: 'from-amber-400 via-yellow-300 to-amber-500', shadow: 'shadow-amber-500/30', ring: 'ring-amber-400/50' },
  { icon: Medal, pool: 'Pool 2', teams: 'Next 8', award: '2nd Prize', gradient: 'from-slate-300 via-gray-200 to-slate-400', shadow: 'shadow-slate-400/20', ring: 'ring-slate-300/50' },
  { icon: Award, pool: 'Pool 3', teams: 'Next 8', award: '3rd Prize', gradient: 'from-orange-400 via-amber-600 to-orange-700', shadow: 'shadow-orange-500/20', ring: 'ring-orange-400/40' },
]

const GUIDELINES_DATA = [
  { icon: Timer, title: 'Build Continuously', body: 'Manage your 24-hour development time effectively.' },
  { icon: Flag, title: 'Respond to Challenges', body: 'Follow challenge instructions and deadlines.' },
  { icon: Rocket, title: 'Demonstrate Functionality', body: 'Keep your prototype ready for evaluation.' },
  { icon: ShieldCheck, title: 'Maintain Originality', body: 'Use your own work and respect IPR.' },
  { icon: CheckCircle2, title: 'Submit on Time', body: 'Follow official submission instructions.' },
  { icon: Users, title: 'Collaborate Effectively', body: 'Ensure all team members contribute.' },
  { icon: ShieldAlert, title: 'Follow Event Protocols', body: 'Maintain discipline and safety.' },
  { icon: ClipboardCheck, title: 'Use Official Platforms', body: 'Submit through designated platforms.' },
]

const FLOW = [
  { label: 'Existing Project', tag: '50%', strong: true },
  { label: 'New Challenge Introduced', strong: false },
  { label: 'Build • Adapt • Integrate', strong: false },
  { label: 'New Challenge', tag: '50%', strong: true },
  { label: 'Final Submission', strong: false },
  { label: 'Online Evaluation', strong: false },
  { label: 'Final Ranking & Awards', strong: true },
]

const IMPORTANT = [
  { icon: Timer, title: 'Hackathon End', body: 'Officially ends at 10:00 AM on 30 August 2026.' },
  { icon: ClipboardCheck, title: 'Evaluation', body: 'Online evaluation begins at 11:00 AM.' },
  { icon: Trophy, title: 'Awards', body: 'Winners determined after final evaluation and ranking.' },
  { icon: Scale, title: '50:50 Model', body: 'Equal weight to existing project and new challenge adaptation.' },
]

const START = new Date('2026-08-29T08:30:00+05:30').getTime()
const END = new Date('2026-08-30T10:00:00+05:30').getTime()

/* ═══════════════════════════  COMPONENTS  ═══════════════════════════ */

const ease = [0.16, 1, 0.3, 1]

function Countdown() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  if (now >= START && now <= END) return (
    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="inline-flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-6 py-3 backdrop-blur-sm">
      <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" /></span>
      <span className="font-display text-lg font-bold text-emerald-300">LIVE NOW</span>
    </motion.div>
  )
  if (now > END) return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-white/70 backdrop-blur-sm">Concluded</span>
  )
  const d = Math.max(0, START - now)
  const days = Math.floor(d / 86400000), hrs = Math.floor((d % 86400000) / 3600000), min = Math.floor((d % 3600000) / 60000), sec = Math.floor((d % 60000) / 1000)
  return (
    <div className="flex items-center gap-3">
      {[['D', days], ['H', hrs], ['M', min], ['S', sec]].map(([l, v], i) => (
        <motion.div key={l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08, ease }}
          className="group relative flex min-w-[4.5rem] flex-col items-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />
          <span className="relative font-display text-3xl font-extrabold tabular-nums text-white sm:text-4xl">
            {String(v).padStart(2, '0')}
          </span>
          <span className="relative mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{l}</span>
        </motion.div>
      ))}
    </div>
  )
}

function GlowOrb({ className }) {
  return <div className={['pointer-events-none absolute rounded-full blur-[100px]', className].join(' ')} aria-hidden />
}

function Section({ children, muted = false, className = '', id }) {
  return (
    <section id={id} className={[muted ? 'border-t border-[rgb(var(--border))]/60 bg-gradient-to-b from-[rgb(var(--surface-muted))]/40 to-[rgb(var(--page-bg))]' : '', 'relative py-20 sm:py-28', className].join(' ')}>
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

function NumberStep({ n, title, body, icon: Icon, i }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
      transition={{ delay: i * 0.06, duration: 0.5, ease }}
      className="group relative flex gap-5"
    >
      {/* connector line */}
      {i < 5 && <div className="absolute left-[1.375rem] top-14 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-brand-500/40 to-transparent" />}
      {/* step number orb */}
      <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-sm font-bold text-white shadow-lg shadow-brand-500/25 ring-4 ring-[rgb(var(--page-bg))]">
        {n}
      </div>
      <div className="flex-1 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-card-hover group-hover:border-brand-500/30">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-bold text-ink-900">{title}</h3>
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{body}</p>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════  PAGE  ═══════════════════════════ */

export function GrandFinalePage() {
  usePageSeo({
    title: 'Grand Finale',
    description: 'Smart Kopargaon Hackathon 2026 — 24-hour Grand Finale. 100 teams, 8 domains, 50:50 evaluation. 29–30 August 2026 at Sanjivani University.',
  })
  const [day, setDay] = useState('Day 1 · 29 Aug')
  const heroRef = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <>
      {/* ═══════ HERO — full-viewport, parallax, atmospheric ═══════ */}
      <section ref={heroRef} className="relative flex min-h-[90vh] items-center overflow-hidden bg-ink-950 md:min-h-screen">
        {/* BG image with parallax */}
        <motion.div style={{ y: heroY }} className="absolute inset-0">
          {/* Blurred fill removes the hard side edges of the portrait poster */}
          <img src="/skhfinal.jpeg" alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl" draggable={false} />
          {/* Sharp, fully-visible poster on top */}
          <img src="/skhfinal.jpeg" alt="" className="relative h-full w-full object-contain" draggable={false} />
        </motion.div>
        {/* Overlays */}
        <div className="absolute inset-0 bg-ink-950/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/60 via-transparent to-ink-950/60" />
        {/* Atmospheric orbs */}
        <GlowOrb className="-left-32 top-1/4 h-96 w-96 bg-brand-500/20" />
        <GlowOrb className="-right-20 bottom-20 h-72 w-72 bg-cyan-500/15" />
        {/* Grid pattern subtle */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'%3E%3Cpath d=\'M0 0h60v60H0z\' fill=\'none\' stroke=\'white\' stroke-width=\'0.5\'/%3E%3C/svg%3E")' }} />

        <motion.div style={{ opacity: heroOpacity }} className="relative z-10 mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
            {/* Pill */}
            <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px] shadow-emerald-400/50" />
              Smart Kopargaon Hackathon 2026
            </div>

            <h1 className="font-display text-5xl font-extrabold tracking-tight text-white sm:text-7xl lg:text-8xl">
              Grand<br />
              <span className="bg-gradient-to-r from-brand-400 via-cyan-400 to-brand-300 bg-clip-text text-transparent">Finale</span>
            </h1>

            <p className="mt-5 font-display text-xl font-bold text-white/90 sm:text-2xl">24-Hour Grand Finale</p>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 sm:text-base">
                <CalendarDays className="h-4 w-4 text-brand-300" /> 29–30 August 2026
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 sm:text-base">
                <MapPin className="h-4 w-4 text-brand-300" /> Sanjivani University, Kopargaon
              </span>
            </div>

            {/* Tagline */}
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8 font-display text-lg font-extrabold tracking-[0.25em] text-white/60 sm:text-xl">
              BUILD<span className="text-brand-400">.</span> ADAPT<span className="text-brand-400">.</span> SOLVE<span className="text-brand-400">.</span> IMPACT<span className="text-brand-400">.</span>
            </motion.p>

            {/* Countdown */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease }} className="mt-10">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Starts in</p>
              <Countdown />
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Scroll</span>
            <ArrowDown className="h-4 w-4 text-white/30" />
          </motion.div>
        </motion.div>
      </section>

      {/* ═══════ AT A GLANCE ═══════ */}
      <Section>
        <GlowOrb className="-right-40 top-0 h-80 w-80 bg-brand-500/10" />
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease }}
          className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl lg:text-5xl">The Grand Finale</h2>
          <p className="mt-5 text-base leading-relaxed text-ink-600 sm:text-lg">
            A <strong className="text-ink-900">24-hour round-the-clock hackathon</strong> bringing together <strong className="text-ink-900">100 teams across 8 domains</strong>.
            Teams work on qualifying projects while responding to <strong className="text-ink-900">new challenges introduced live</strong> — scored on a <strong className="text-ink-900">50:50 evaluation model</strong>.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {GLANCE.map((g, i) => (
            <motion.div key={g.unit} initial={{ opacity: 0, y: 20, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5, ease }}
              className="group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-7 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover hover:border-brand-500/30">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-500/5 blur-2xl transition-all group-hover:bg-brand-500/15" />
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-cyan-500/10 text-brand-600 ring-1 ring-brand-500/20">
                <g.icon className="h-7 w-7" />
              </div>
              <p className="relative mt-5 font-display text-4xl font-extrabold text-ink-900">{g.value}</p>
              <p className="mt-1 font-display text-sm font-bold uppercase tracking-wide text-brand-600">{g.unit}</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">{g.note}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ═══════ HOW IT WORKS — vertical timeline ═══════ */}
      <Section muted>
        <SectionHeading eyebrow="Format" title="How the Grand Finale works"
          description="From qualifying project to final ranking — 6 stages." />
        <div className="mx-auto mt-12 max-w-2xl space-y-6">
          {WORKS.map((s, i) => <NumberStep key={s.n} {...s} i={i} />)}
        </div>
      </Section>

      {/* ═══════ 50:50 MODEL ═══════ */}
      <Section>
        <GlowOrb className="-left-40 top-20 h-96 w-96 bg-cyan-500/8" />
        <SectionHeading eyebrow="Scoring" title="50:50 Evaluation Model"
          description="Your final score: two equally weighted halves." />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            { pct: '50%', title: 'Existing Project', body: 'The project that qualified the team for the Grand Finale.', accent: 'from-brand-600 to-brand-500' },
            { pct: '50%', title: 'New Challenge', body: "The team's response to the new problem statement introduced during the hackathon.", accent: 'from-cyan-600 to-cyan-500' },
          ].map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0, x: i === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5, ease }}
              className="group relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 shadow-card transition-all duration-300 hover:shadow-card-hover">
              {/* accent bar top */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.accent}`} />
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/5 blur-3xl group-hover:bg-brand-500/10 transition-all" />
              <p className={`relative font-display text-6xl font-extrabold bg-gradient-to-r ${c.accent} bg-clip-text text-transparent`}>{c.pct}</p>
              <h3 className="relative mt-3 font-display text-xl font-bold text-ink-900">{c.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-ink-600">{c.body}</p>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.5, ease }}
          className="mx-auto mt-8 max-w-xl rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-500/5 via-transparent to-cyan-500/5 p-6 text-center shadow-sm">
          <p className="font-display text-lg font-bold text-ink-900 sm:text-xl">
            <span className="text-brand-600">50%</span> Existing Project <span className="mx-2 text-ink-300">+</span>
            <span className="text-cyan-600">50%</span> New Challenge <span className="mx-2 text-ink-300">=</span>
            <span className="bg-gradient-to-r from-brand-600 to-cyan-600 bg-clip-text text-transparent">100%</span>
          </p>
        </motion.div>
      </Section>

      {/* ═══════ EVALUATION CRITERIA ═══════ */}
      <Section muted>
        <SectionHeading eyebrow="Rubric" title="Evaluation criteria"
          description="Judges evaluate teams across 8 key areas." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CRITERIA.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 16, scale: 0.96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.4, ease }}
              className="group flex flex-col rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-500/25">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/15 to-brand-500/5 text-brand-600 ring-1 ring-brand-500/15 transition-all group-hover:ring-brand-500/30 group-hover:shadow-sm group-hover:shadow-brand-500/10">
                <c.icon className="h-5 w-5" />
              </div>
              <p className="mt-4 font-display text-sm font-semibold leading-snug text-ink-900">
                <span className="mr-1.5 inline-block rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-xs font-bold text-brand-600">{String(i + 1).padStart(2, '0')}</span>
                {c.label}
              </p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ═══════ TIMELINE (interactive) ═══════ */}
      <Section>
        <SectionHeading eyebrow="Schedule" title="Grand Finale Timeline"
          description="A two-day event. Switch between days below." />
        <div className="mx-auto max-w-3xl">
          {/* Tab buttons */}
          <div className="flex justify-center gap-3">
            {Object.keys(DAYS).map((k) => (
              <button key={k} type="button" onClick={() => setDay(k)}
                className={['relative rounded-xl px-6 py-3 text-sm font-bold transition-all duration-200',
                  day === k
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-600 hover:text-ink-900 hover:border-brand-500/30 hover:shadow-sm'].join(' ')}>
                {k}
              </button>
            ))}
          </div>

          {/* Schedule card */}
          <AnimatePresence mode="wait">
            <motion.div key={day}
              initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.35, ease }}
              className="mt-10 overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-card">
              {DAYS[day].rows.map(([time, act], i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, ease }}
                  className={['flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:gap-6', i > 0 ? 'border-t border-[rgb(var(--border))]/60' : ''].join(' ')}>
                  <span className="shrink-0 rounded-lg bg-brand-500/10 px-3 py-1 font-display text-sm font-bold text-brand-600 sm:w-44 sm:text-center">{time}</span>
                  <span className="text-sm font-medium text-ink-700">{act}</span>
                </motion.div>
              ))}
              {DAYS[day].meals.length > 0 && (
                <div className="flex flex-wrap gap-3 border-t border-dashed border-[rgb(var(--border))]/60 bg-gradient-to-r from-[rgb(var(--surface-muted))]/60 to-transparent p-5">
                  {DAYS[day].meals.map((m) => (
                    <span key={m.label} className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-2 text-sm font-medium text-ink-700 shadow-sm">
                      <m.icon className="h-4 w-4 text-brand-500" /> {m.label} — <strong className="text-ink-900">{m.time}</strong>
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Section>

      {/* ═══════ DOMAINS ═══════ */}
      <Section muted>
        <SectionHeading eyebrow="Categories" title="8 Domains" description="Domain-specific innovation categories for the finale." />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {DOMAINS.map((d, i) => (
            <motion.div key={d.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.5, ease }}
              className="group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              {/* Color accent line */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.color} opacity-80`} />
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${d.color} text-white shadow-md`}>
                <d.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink-900">{d.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{d.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ═══════ PRIZE STRUCTURE ═══════ */}
      <Section>
        <GlowOrb className="-right-32 top-10 h-72 w-72 bg-amber-500/10" />
        <SectionHeading eyebrow="Rewards" title="Prize Structure"
          description="Overall prizes irrespective of domain, plus one winner from each domain." />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {POOLS.map((p, i) => (
            <motion.div key={p.pool} initial={{ opacity: 0, y: 20, rotateX: 8 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.6, ease }}
              className={`group relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-8 text-center shadow-card ring-1 ${p.ring} transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${p.shadow}`}>
              <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${p.gradient}`} />
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${p.gradient} text-white shadow-lg ${p.shadow}`}>
                <p.icon className="h-8 w-8" />
              </div>
              <p className="mt-5 font-display text-lg font-bold text-ink-900">{p.pool}</p>
              <p className="text-sm text-ink-500">{p.teams} teams</p>
              <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">{p.award}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease }}
            className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><Award className="h-5 w-5" /></div>
              <h3 className="font-display text-base font-bold text-ink-900">Domain-specific awards</h3></div>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">One winner selected from each of the 8 domains based on domain ranking.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08, duration: 0.5, ease }}
            className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/5 to-transparent p-6">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><ShieldAlert className="h-5 w-5" /></div>
              <h3 className="font-display text-base font-bold text-ink-900">Important award rule</h3></div>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Overall prize winners are <strong className="text-ink-900">not</strong> eligible for domain-specific awards. The next highest-scoring eligible team in that domain is considered instead.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* ═══════ EVALUATION FLOW ═══════ */}
      <Section muted>
        <SectionHeading eyebrow="Journey" title="Evaluation Flow" description="From qualifying project to final ranking." />
        <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-0">
          {FLOW.map((f, i) => (
            <div key={f.label} className="flex w-full flex-col items-center">
              <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4, ease }}
                className={['w-full rounded-2xl px-5 py-4 text-center font-display font-bold shadow-sm transition-all',
                  f.strong
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-brand-500/20'
                    : 'border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-ink-800'].join(' ')}>
                {f.label}
                {f.tag && <span className={['ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold', f.strong ? 'bg-white/20 text-white' : 'bg-brand-500/10 text-brand-600'].join(' ')}>{f.tag}</span>}
              </motion.div>
              {i < FLOW.length - 1 && (
                <div className="py-1"><ArrowDown className="h-5 w-5 text-brand-400/60" /></div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ═══════ PARTICIPANT GUIDELINES ═══════ */}
      <Section>
        <SectionHeading eyebrow="Rules" title="Participant Guidelines" description="What every finalist team is expected to follow." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDELINES_DATA.map((g, i) => (
            <motion.div key={g.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.4, ease }}
              className="group rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-500/20">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/10 group-hover:ring-brand-500/25 transition-all">
                <g.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-display text-sm font-bold text-ink-900">{g.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{g.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ═══════ IMPORTANT ═══════ */}
      <Section muted>
        <SectionHeading eyebrow="Note" title="Important" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {IMPORTANT.map((it, i) => (
            <motion.div key={it.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4, ease }}
              className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink-900">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{it.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ═══════ BOTTOM CTA ═══════ */}
      <section className="relative overflow-hidden bg-ink-950 py-24 sm:py-32">
        <div className="absolute inset-0">
          <GlowOrb className="-left-40 top-0 h-[500px] w-[500px] bg-brand-500/20" />
          <GlowOrb className="-right-40 bottom-0 h-[400px] w-[400px] bg-cyan-500/15" />
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'%3E%3Cpath d=\'M0 0h60v60H0z\' fill=\'none\' stroke=\'white\' stroke-width=\'0.5\'/%3E%3C/svg%3E")' }} />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease }}>
            <h2 className="font-display text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">
              Ready for the<br />
              <span className="bg-gradient-to-r from-brand-400 via-cyan-400 to-brand-300 bg-clip-text text-transparent">Grand Finale?</span>
            </h2>
            <p className="mt-5 text-lg font-semibold text-white/75 sm:text-xl">24 Hours. 100 Teams. 8 Domains. One Grand Finale.</p>
            <p className="mt-8 font-display text-xl font-extrabold tracking-[0.25em] text-white/50 sm:text-2xl">
              BUILD<span className="text-brand-400">.</span> ADAPT<span className="text-brand-400">.</span> SOLVE<span className="text-brand-400">.</span> IMPACT<span className="text-brand-400">.</span>
            </p>
            <p className="mt-8 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-white/60">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-300" /> 29–30 August 2026</span>
              <span className="hidden text-white/20 sm:inline">|</span>
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-brand-300" /> Sanjivani University, Kopargaon</span>
            </p>
          </motion.div>
        </div>
      </section>
    </>
  )
}
