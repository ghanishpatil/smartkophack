import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  Trophy, Medal, Award, Rocket, Lightbulb, Sprout, Bus, GraduationCap,
  ShieldCheck, Factory, HeartPulse, Recycle, Utensils, Moon, CheckCircle2,
  Gauge, Sparkles, Cpu, ClipboardCheck, FileCheck, ShieldAlert, Flag, Timer,
  Plus, Users, Layers,
} from 'lucide-react'
import { Marquee } from '@/components/ui/Marquee.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'

/* ══════════════════════════════  DATA  ══════════════════════════════ */

const START = new Date('2026-08-29T09:30:00+05:30').getTime() // kickoff
const END = new Date('2026-08-30T09:30:00+05:30').getTime()   // kickoff + 24 hours

const STATS = [
  { to: 24, pad: 0, suffix: '', label: 'Hours, non-stop' },
  { to: 100, pad: 0, suffix: '', label: 'Qualified teams' },
  { to: 8, pad: 2, suffix: '', label: 'Innovation domains' },
  { to: 50, pad: 0, suffix: ' / 50', label: 'Scoring split' },
]

const STAGES = [
  { n: '01', title: 'Existing Project', body: 'Teams arrive with the project that earned them a place in the Grand Finale. It forms one half of the final score.' },
  { n: '02', title: 'New Challenge', body: 'Fresh problem statements are introduced live on the floor during the hackathon. Nobody sees them in advance.' },
  { n: '03', title: 'Adapt & Build', body: 'Understand the new challenge, adapt the existing solution, build additional functionality and integrate it meaningfully.' },
  { n: '04', title: 'Final Submission', body: 'Complete and submit the solution through the official platform before the deadline closes.' },
  { n: '05', title: 'Online Evaluation', body: 'Judges score every team through the official online evaluation platform against two independent rubrics.' },
  { n: '06', title: 'Ranking & Awards', body: 'Final weighted scores determine the overall ranking and the domain-specific award winners.' },
]

const CRITERIA = [
  'Innovation & Uniqueness',
  'Technical Soundness & Feasibility',
  'Prototype Development & Functionality',
  'Problem Relevance & Effectiveness',
  'Integration & Scalability',
  'Usability & User Experience',
  'Impact & Market Readiness',
  'Presentation & Final Demonstration',
]

const DAYS = {
  'Day 01': {
    date: '29 August 2026',
    rows: [
      ['07:00', 'Participant Reporting'],
      ['08:30', 'Hackathon Begins'],
      ['10:00', 'ID Checking & Goodie Distribution'],
      ['08:30 →', '24-Hour Round-the-Clock Development, Mentoring & Challenges'],
    ],
    meals: [
      { icon: Utensils, label: 'Lunch', time: '13:30' },
      { icon: Moon, label: 'Dinner', time: '19:30' },
    ],
  },
  'Day 02': {
    date: '30 August 2026',
    rows: [
      ['09:30', 'Hackathon Ends & Final Submission'],
      ['11:00 – 13:30', 'Online Evaluation'],
      ['13:30', 'Lunch'],
      ['14:00 →', 'Result Finalization & Ranking'],
      ['by 16:00', 'Result Declaration & Award Announcements'],
    ],
    meals: [],
  },
}

const DOMAINS = [
  { icon: Lightbulb, title: 'Open Innovation' },
  { icon: Sprout, title: 'Agriculture' },
  { icon: Bus, title: 'Transportation' },
  { icon: GraduationCap, title: 'Education' },
  { icon: ShieldCheck, title: 'Food Safety & Security' },
  { icon: Factory, title: 'Industry & MSME' },
  { icon: HeartPulse, title: 'Health' },
  { icon: Recycle, title: 'Waste Management' },
]

const POOLS = [
  { icon: Trophy, place: '1st', pool: 'Pool 01', accent: 'text-amber-500' },
  { icon: Medal, place: '2nd', pool: 'Pool 02', accent: 'text-slate-400' },
  { icon: Award, place: '3rd', pool: 'Pool 03', accent: 'text-orange-500' },
]

const GUIDELINES = [
  { icon: Timer, title: 'Build Continuously', body: 'Manage your 24-hour development time effectively.' },
  { icon: Flag, title: 'Respond to Challenges', body: 'Follow challenge instructions and deadlines.' },
  { icon: Rocket, title: 'Demonstrate Functionality', body: 'Keep your prototype ready for evaluation.' },
  { icon: ShieldCheck, title: 'Maintain Originality', body: 'Use your own work and respect IPR.' },
  { icon: CheckCircle2, title: 'Submit on Time', body: 'Follow official submission instructions.' },
  { icon: Users, title: 'Collaborate Effectively', body: 'Ensure all team members contribute.' },
  { icon: ShieldAlert, title: 'Follow Event Protocols', body: 'Maintain discipline and safety.' },
  { icon: ClipboardCheck, title: 'Use Official Platforms', body: 'Submit through designated platforms only.' },
]

const RUBRIC_ICONS = [Sparkles, Cpu, Rocket, ClipboardCheck, Layers, Gauge, Trophy, FileCheck]
const ease = [0.16, 1, 0.3, 1]

/* Stagger variants — reused for grids/lists. */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
}
const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-70px' },
  transition: { duration: 0.55, ease },
}

/* ══════════════════════════════  ANIMATED NUMBER  ══════════════════════════════ */

function CountUp({ to, pad = 0, suffix = '', className }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [val, setVal] = useState(0)

  useEffect(() => {
    if (!inView) return undefined
    const controls = animate(0, to, {
      duration: 1.4,
      ease,
      onUpdate: (v) => setVal(v),
    })
    return () => controls.stop()
  }, [inView, to])

  const shown = pad ? String(Math.round(val)).padStart(pad, '0') : String(Math.round(val))
  return (
    <span ref={ref} className={className}>
      {shown}
      {suffix}
    </span>
  )
}

/* ══════════════════════════════  PRIMITIVES  ══════════════════════════════ */

function Section({ children, dark = false, className = '', labelledBy }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={['relative', dark ? 'bg-ink-950 text-white' : 'bg-[rgb(var(--page-bg))] text-ink-900', className].join(' ')}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )
}

/** Header matching the site: pill eyebrow + tracking-tight title, with an editorial counter. */
function SectionHead({ n, kicker, title, lead, dark = false }) {
  return (
    <motion.header {...reveal}>
      <div className={['flex items-center justify-between border-t pt-5', dark ? 'border-white/15' : 'border-ink-900/12'].join(' ')}>
        <span
          className={[
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.15em]',
            dark ? 'border-white/20 bg-white/10 text-white' : 'border-brand-500/20 bg-brand-500/10 text-brand-600',
          ].join(' ')}
        >
          <span className={['h-1.5 w-1.5 rounded-full', dark ? 'bg-emerald-400' : 'bg-brand-500'].join(' ')} />
          {kicker}
        </span>
        <span className={['font-mono text-[11px] font-medium tracking-[0.2em]', dark ? 'text-white/40' : 'text-ink-400'].join(' ')}>
          <span className={dark ? 'text-white/70' : 'text-brand-600'}>{n}</span> / 07
        </span>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-12">
        <h2
          className={[
            'col-span-1 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:col-span-7',
            dark ? 'text-white' : 'text-ink-900',
          ].join(' ')}
        >
          {title}
        </h2>
        {lead ? (
          <p className={['col-span-1 max-w-md self-end text-base leading-relaxed lg:col-span-5 lg:justify-self-end', dark ? 'text-white/60' : 'text-ink-600'].join(' ')}>
            {lead}
          </p>
        ) : null}
      </div>
    </motion.header>
  )
}

function Ticker({ words, dark = false, speed = 40, reverse = false }) {
  return (
    <div className={['relative overflow-hidden border-y', dark ? 'border-white/12 bg-ink-950' : 'border-ink-900/12 bg-[rgb(var(--page-bg))]'].join(' ')}>
      <Marquee speed={speed} reverse={reverse} innerClassName="gap-0 py-3.5">
        {words.map((w, i) => (
          <span key={i} className="flex shrink-0 items-center whitespace-nowrap">
            <span className={['font-display text-sm font-semibold uppercase tracking-[0.14em]', dark ? 'text-white/80' : 'text-ink-800'].join(' ')}>
              {w}
            </span>
            <span aria-hidden className="mx-6 h-1 w-1 rounded-full bg-brand-600 sm:mx-8" />
          </span>
        ))}
      </Marquee>
    </div>
  )
}

function Countdown({ dark = true, showLabel = true }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Before 09:30 on 29 Aug → count down to kickoff.
  // During the 24 hours → count down the time remaining until the hackathon ends.
  const mode = now < START ? 'kickoff' : now <= END ? 'live' : 'over'

  const cells = useMemo(() => {
    const d = Math.max(0, (mode === 'live' ? END : START) - now)
    return [
      ['Days', Math.floor(d / 86400000)],
      ['Hrs', Math.floor((d % 86400000) / 3600000)],
      ['Min', Math.floor((d % 3600000) / 60000)],
      ['Sec', Math.floor((d % 60000) / 1000)],
    ]
  }, [now, mode])

  const border = dark ? 'border-white/15 divide-white/15' : 'border-ink-900/15 divide-ink-900/15'
  const num = dark ? 'text-white' : 'text-ink-900'
  const lab = dark ? 'text-white/40' : 'text-ink-400'
  const labelTone = dark ? 'text-white/45' : 'text-ink-500'

  if (mode === 'over') {
    return <span className={['font-mono text-sm font-semibold uppercase tracking-[0.2em]', lab].join(' ')}>Hackathon concluded</span>
  }

  const liveNow = mode === 'live'

  return (
    <div>
      {showLabel ? (
        <p className={['mb-3.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em]', liveNow ? (dark ? 'text-emerald-300' : 'text-emerald-600') : labelTone].join(' ')}>
          {liveNow ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          ) : null}
          {liveNow ? 'Hackathon live · ends in' : 'Countdown to kickoff'}
        </p>
      ) : null}
      <div
        role="timer"
        aria-label={liveNow ? `Hackathon ends in ${cells[1][1]} hours ${cells[2][1]} minutes` : `${cells[0][1]} days until kickoff`}
        className={['flex divide-x border', border].join(' ')}
      >
        {cells.map(([l, v]) => (
          <div key={l} aria-hidden className="flex min-w-[3.5rem] flex-col items-center px-3 py-2.5 sm:min-w-[4.25rem] sm:px-4 sm:py-3">
            <span className={['font-display text-2xl font-bold leading-none tabular-nums sm:text-3xl', num].join(' ')}>
              {String(v).padStart(2, '0')}
            </span>
            <span className={['mt-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.2em]', lab].join(' ')}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StageRow({ stage, open, onToggle }) {
  const panelId = `stage-panel-${stage.n}`
  const btnId = `stage-btn-${stage.n}`
  return (
    <motion.div variants={item} className="border-b border-ink-900/12 first:border-t">
      <button
        id={btnId} type="button" onClick={onToggle}
        aria-expanded={open} aria-controls={panelId}
        className="group grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 text-left sm:grid-cols-[4rem_1fr_auto] sm:gap-6 sm:py-6"
      >
        <span className={['font-mono text-xs font-medium tracking-[0.2em] transition-colors', open ? 'text-brand-600' : 'text-ink-300 group-hover:text-brand-600'].join(' ')}>
          {stage.n}
        </span>
        <span className={['font-display text-xl font-bold leading-tight tracking-tight transition-colors sm:text-2xl', open ? 'text-brand-700' : 'text-ink-900 group-hover:text-brand-700'].join(' ')}>
          {stage.title}
        </span>
        <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.3, ease }} className="justify-self-end">
          <Plus aria-hidden className={['h-5 w-5', open ? 'text-brand-600' : 'text-ink-400 group-hover:text-brand-600'].join(' ')} />
        </motion.span>
      </button>
      <motion.div
        id={panelId} role="region" aria-labelledby={btnId}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.32, ease }}
        className="overflow-hidden"
      >
        <p className="max-w-2xl pb-6 pl-[2.5rem] pr-2 text-[15px] leading-relaxed text-ink-500 sm:pl-16 sm:pr-16">{stage.body}</p>
      </motion.div>
    </motion.div>
  )
}

/* ══════════════════════════════  PAGE  ══════════════════════════════ */

export function GrandFinalePage() {
  usePageSeo({
    title: 'Grand Finale',
    description: 'Smart Kopargaon Hackathon 2026 Grand Finale — a 24-hour hackathon. 100 teams, 8 domains, 50:50 evaluation. 29–30 August 2026 at Sanjivani University, Kopargaon.',
  })

  const [day, setDay] = useState('Day 01')
  const [openStage, setOpenStage] = useState('01')

  return (
    <>
      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
          style={{ backgroundImage: 'radial-gradient(ellipse 65% 100% at 50% 0%, rgb(37 99 235 / 0.26), transparent 70%)' }}
        />

        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Meta rail */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease }}
            className="flex items-center justify-between border-b border-white/12 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white/50"
          >
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Sanjivani University
            </span>
            <span className="hidden sm:inline">Kopargaon, Maharashtra</span>
            <span className="text-white/70">1st Edition</span>
          </motion.div>

          {/* Masthead */}
          <div className="pt-12 sm:pt-16">
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.6, ease }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
              Smart Kopargaon Hackathon · 2026
            </motion.p>
            <h1 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              <motion.span
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6, ease }}
                className="block"
              >
                Grand Finale
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease }}
                className="mt-1 block text-white/40"
              >
                29–30 August 2026
              </motion.span>
            </h1>
          </div>

          {/* Lead + countdown */}
          <div className="mt-12 grid grid-cols-1 gap-y-10 border-t border-white/12 pt-8 lg:grid-cols-12 lg:gap-x-10">
            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.6, ease }}
              className="col-span-1 max-w-2xl text-lg leading-relaxed text-white/80 lg:col-span-7"
            >
              A 24-hour, round-the-clock hackathon. One hundred qualified teams, eight domains — building on the
              projects that got them here while answering challenges revealed live on the floor.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, duration: 0.6, ease }}
              className="col-span-1 lg:col-span-5 lg:justify-self-end"
            >
              <Countdown />
              <dl className="mt-7 grid grid-cols-3 gap-x-6 gap-y-4">
                {[['Kickoff', '09:30 IST'], ['Venue', 'Solar Banquet Hall'], ['Format', 'Offline']].map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">{k}</dt>
                    <dd className="mt-1.5 text-sm font-semibold text-white/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>

          {/* Banner */}
          <motion.figure
            initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.75, ease }}
            whileHover={{ scale: 1.006 }}
            className="mt-14 border border-white/12 transition-shadow sm:mt-16"
          >
            <img
              src="/skhfinal.jpeg"
              alt="The Grand Finale of Smart Kopargaon Hackathon 2026 — 29 and 30 August 2026, 08:30, Solar Banquet Hall, Sanjivani University"
              className="block h-auto w-full"
              draggable={false}
            />
          </motion.figure>
          <div className="h-14 sm:h-20" />
        </div>
      </section>

      <Ticker words={['Build', 'Adapt', 'Solve', 'Impact', '24 Hours', '100 Teams', '8 Domains']} dark speed={44} />

      {/* ═══════════ STATS ═══════════ */}
      <Section className="py-14 sm:py-16" labelledBy="stats">
        <h2 id="stats" className="sr-only">By the numbers</h2>
        <motion.div
          variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="grid grid-cols-2 border-l border-ink-900/12 lg:grid-cols-4"
        >
          {STATS.map((s) => (
            <motion.div key={s.label} variants={item} className="border-b border-r border-ink-900/12 px-5 py-7 sm:px-7 sm:py-8">
              <CountUp
                to={s.to} pad={s.pad} suffix={s.suffix}
                className="font-display text-4xl font-bold leading-none tracking-tight text-ink-900 sm:text-5xl"
              />
              <p className="mt-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-500">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ═══════════ FORMAT ═══════════ */}
      <Section className="py-16 sm:py-24" labelledBy="fmt">
        <SectionHead n="01" kicker="The Format" title="How the finale works"
          lead="Six stages, from the project that qualified you to the final ranking. Select a stage to read the detail." />
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-12">
          {STAGES.map((s) => (
            <StageRow key={s.n} stage={s} open={openStage === s.n} onToggle={() => setOpenStage((c) => (c === s.n ? null : s.n))} />
          ))}
        </motion.div>
      </Section>

      {/* ═══════════ SCORING (dark) ═══════════ */}
      <Section dark className="py-16 sm:py-24" labelledBy="scoring">
        <SectionHead dark n="02" kicker="The Scoring" title="Two halves, weighted equally"
          lead="The final score is built from the project you brought and the challenge you had never seen before." />
        <div className="mt-12 grid grid-cols-1 border-t border-white/12 md:grid-cols-2">
          {[
            { pct: '50', tag: 'A', title: 'Existing Project', body: 'The project that qualified the team, carried forward and extended on the floor.' },
            { pct: '50', tag: 'B', title: 'New Challenge', body: "The team's response to the problem statement introduced live during the 24 hours." },
          ].map((c, i) => (
            <motion.div
              key={c.tag} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }}
              className={['border-b border-white/12 py-10 md:py-12', i === 0 ? 'md:border-r md:pr-12' : 'md:pl-12'].join(' ')}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-white/45">Part {c.tag}</span>
                <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-brand-400">Weight</span>
              </div>
              <p className="mt-5 font-display text-6xl font-bold leading-none tracking-tight text-white sm:text-7xl">
                {c.pct}<span className="text-brand-500">%</span>
              </p>
              <h3 className="mt-6 font-display text-xl font-bold text-white sm:text-2xl">{c.title}</h3>
              <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-white/60">{c.body}</p>
            </motion.div>
          ))}
        </div>
        <motion.p {...reveal} className="mt-10 font-display text-lg font-medium text-white/70 sm:text-xl">
          <span className="text-white">50% Existing Project</span>
          <span className="mx-3 text-brand-500">+</span>
          <span className="text-white">50% New Challenge</span>
          <span className="mx-3 text-white/30">=</span>
          <span className="text-white/50">Final Score</span>
        </motion.p>
      </Section>

      {/* ═══════════ RUBRIC ═══════════ */}
      <Section className="py-16 sm:py-24" labelledBy="rubric">
        <SectionHead n="03" kicker="The Rubric" title="Eight scoring areas"
          lead="Every team is judged against the same eight criteria, applied independently to each half of the score." />
        <motion.ol
          variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="mt-12 grid grid-cols-1 gap-x-16 md:grid-cols-2"
        >
          {CRITERIA.map((label, i) => {
            const Icon = RUBRIC_ICONS[i]
            return (
              <motion.li key={label} variants={item} className="group flex items-center gap-4 border-b border-ink-900/12 py-5">
                <span className="font-mono text-xs font-medium tabular-nums tracking-[0.15em] text-ink-300">{String(i + 1).padStart(2, '0')}</span>
                <Icon aria-hidden className="h-5 w-5 shrink-0 text-brand-600 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.75} />
                <span className="font-display text-base font-semibold tracking-tight text-ink-900 sm:text-lg">{label}</span>
              </motion.li>
            )
          })}
        </motion.ol>
      </Section>

      {/* ═══════════ SCHEDULE ═══════════ */}
      <Section className="border-y border-ink-900/12 bg-[rgb(var(--surface-muted))]/40 py-16 sm:py-24" labelledBy="sched">
        <SectionHead n="04" kicker="The Schedule" title="Two days, end to end"
          lead="Reporting at 07:00 on day one, awards declared by 16:00 on day two." />
        <div className="mt-12">
          <div role="tablist" aria-label="Schedule day" className="flex gap-8 border-b border-ink-900/12">
            {Object.entries(DAYS).map(([k, v]) => {
              const active = day === k
              return (
                <button
                  key={k} type="button" role="tab" aria-selected={active}
                  aria-controls={`sched-${k.replace(/\s/g, '')}`} onClick={() => setDay(k)}
                  className={['group relative -mb-px flex items-baseline gap-2.5 pb-3.5 transition-colors', active ? 'text-ink-900' : 'text-ink-400 hover:text-ink-700'].join(' ')}
                >
                  <span className="font-display text-base font-bold uppercase tracking-[0.08em] sm:text-lg">{k}</span>
                  <span className="font-mono text-[10px] tracking-wide">{v.date}</span>
                  {active ? <motion.span layoutId="schedTab" aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" /> : null}
                </button>
              )
            })}
          </div>

          <div id={`sched-${day.replace(/\s/g, '')}`} role="tabpanel" className="mt-1">
            {DAYS[day].rows.map(([time, act], i) => (
              <motion.div
                key={`${day}-${i}`}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.4, ease }}
                className="grid grid-cols-[6rem_1fr] items-baseline gap-4 border-b border-ink-900/10 py-4 sm:grid-cols-[9rem_1fr] sm:gap-8"
              >
                <span className="font-mono text-sm font-medium tabular-nums tracking-wide text-brand-600">{time}</span>
                <span className="font-display text-base font-semibold text-ink-800 sm:text-lg">{act}</span>
              </motion.div>
            ))}
            {DAYS[day].meals.length > 0 && (
              <div className="flex flex-wrap gap-6 pt-5">
                {DAYS[day].meals.map((m) => (
                  <span key={m.label} className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-ink-500">
                    <m.icon aria-hidden className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
                    {m.label}
                    <span className="font-semibold text-ink-900">{m.time}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ═══════════ DOMAINS ═══════════ */}
      <Section className="py-16 sm:py-24" labelledBy="domains">
        <SectionHead n="05" kicker="The Domains" title="Eight fields of play"
          lead="Each domain crowns its own winner, alongside the three overall prizes." />
        <motion.div
          variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="mt-12 grid grid-cols-1 border-t border-ink-900/12 sm:grid-cols-2 lg:grid-cols-4"
        >
          {DOMAINS.map((d, i) => (
            <motion.div
              key={d.title} variants={item} whileHover={{ y: -4 }}
              className="group flex min-h-[9rem] flex-col justify-between border-b border-ink-900/12 py-7 pr-6 sm:[&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(4n)]:border-r-0"
            >
              <div className="flex items-start justify-between">
                <d.icon aria-hidden className="h-6 w-6 text-ink-900 transition-colors group-hover:text-brand-600" strokeWidth={1.5} />
                <span className="font-mono text-[11px] font-medium tracking-[0.2em] text-ink-300">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-bold leading-tight tracking-tight text-ink-900">{d.title}</h3>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ═══════════ PRIZES (dark) ═══════════ */}
      <Section dark className="py-16 sm:py-24" labelledBy="prizes">
        <SectionHead dark n="06" kicker="The Rewards" title="Prize structure"
          lead="Three overall prizes awarded irrespective of domain, plus one winner from each of the eight domains." />
        <motion.div
          variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="mt-12 grid grid-cols-1 border-t border-white/12 lg:grid-cols-3"
        >
          {POOLS.map((p, i) => (
            <motion.div
              key={p.pool} variants={item}
              className={['border-b border-white/12 py-10 lg:border-b-0 lg:py-12', i < 2 ? 'lg:border-r lg:pr-10' : 'lg:pl-10', i === 1 ? 'lg:pl-10' : ''].join(' ')}
            >
              <p.icon aria-hidden className={['h-7 w-7', p.accent].join(' ')} strokeWidth={1.75} />
              <p className="mt-6 font-display text-4xl font-bold leading-none tracking-tight text-white sm:text-5xl">{p.place}</p>
              <p className="mt-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-white/45">{p.pool}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-x-16 gap-y-8 border-t border-white/12 pt-10 md:grid-cols-2">
          <motion.div {...reveal}>
            <h3 className="font-display text-lg font-bold text-white">Domain-specific awards</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-white/60">
              One winner is selected from each of the eight domains, based on that domain&apos;s ranking.
            </p>
          </motion.div>
          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
            <h3 className="flex items-center gap-2.5 font-display text-lg font-bold text-white">
              <ShieldAlert aria-hidden className="h-5 w-5 text-amber-400" strokeWidth={1.75} /> Important award rule
            </h3>
            <p className="mt-3 text-[15px] leading-relaxed text-white/60">
              Overall 1st, 2nd and 3rd prize winners are not eligible for a domain award. The next
              highest-scoring eligible team in that domain is considered instead.
            </p>
          </motion.div>
        </div>
      </Section>

      {/* ═══════════ RULES ═══════════ */}
      <Section className="py-16 sm:py-24" labelledBy="rules">
        <SectionHead n="07" kicker="The Rules" title="What we expect"
          lead="Eight ground rules every finalist team is held to across the 24 hours." />
        <motion.div
          variants={container} initial="hidden" whileInView="show" viewport={{ once: true }}
          className="mt-12 grid grid-cols-1 border-t border-ink-900/12 sm:grid-cols-2"
        >
          {GUIDELINES.map((g) => (
            <motion.div
              key={g.title} variants={item}
              className="flex gap-4 border-b border-ink-900/12 py-7 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:pr-10 sm:[&:nth-child(even)]:pl-10"
            >
              <g.icon aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" strokeWidth={1.5} />
              <div>
                <h3 className="font-display text-base font-bold tracking-tight text-ink-900">{g.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{g.body}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      <Ticker words={['On Air', '29–30 August 2026', 'Sanjivani University', 'Kopargaon', 'Grand Finale']} speed={34} reverse />

      {/* ═══════════ CTA (dark) ═══════════ */}
      <section aria-labelledby="cta" className="relative overflow-hidden bg-ink-950 py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[50vh]"
          style={{ backgroundImage: 'radial-gradient(ellipse 65% 100% at 50% 100%, rgb(37 99 235 / 0.24), transparent 70%)' }}
        />
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...reveal}>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.28em] text-white/45">Build · Adapt · Solve · Impact</p>
            <h2 id="cta" className="mt-6 max-w-4xl font-display text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Ready for the Grand Finale<span className="text-brand-500">?</span>
            </h2>

            <div className="mt-12 flex flex-col gap-10 border-t border-white/12 pt-8 lg:flex-row lg:items-end lg:justify-between">
              <dl className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-4">
                {[['Duration', '24 Hours'], ['Teams', '100'], ['Domains', '08'], ['Venue', 'Sanjivani Univ.']].map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">{k}</dt>
                    <dd className="mt-2 font-display text-lg font-bold text-white sm:text-xl">{v}</dd>
                  </div>
                ))}
              </dl>
              <Countdown />
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
