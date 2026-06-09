import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { TopBanner } from '@/components/home/TopBanner.jsx'
import { Hero } from '@/components/home/Hero.jsx'
import { StatsSection } from '@/components/home/StatsSection.jsx'
import { TracksSection } from '@/components/home/TracksSection.jsx'
import { PatronsSection } from '@/components/home/PatronsSection.jsx'
import { CollaborationSection } from '@/components/home/CollaborationSection.jsx'
import { TimelineSection } from '@/components/home/TimelineSection.jsx'
import { AnnouncementsPreview } from '@/components/home/AnnouncementsPreview.jsx'
import { SponsorsSection } from '@/components/home/SponsorsSection.jsx'
import { FAQSection } from '@/components/home/FAQSection.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { APP } from '@/utils/constants.js'
import DotField from '@/components/ui/DotField.jsx'

export function LandingPage() {
  usePageSeo({
    title: 'Home',
    description: `${APP.name} — a national-level innovation platform for ${APP.region}.`,
  })
  return (
    <div className="relative overflow-x-hidden">
      <TopBanner />
      <Hero />

      {/* ── StatsSection with right-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -right-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-brand-500/25 blur-[70px]" aria-hidden />
        <StatsSection />
      </div>

      {/* ── TracksSection with left-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-cyan-500/20 blur-[70px]" aria-hidden />
        <TracksSection />
      </div>

      {/* ── PatronsSection with right-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-violet-500/15 blur-[70px]" aria-hidden />
        <PatronsSection />
      </div>

      {/* ── CollaborationSection with right-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-indigo-500/20 blur-[80px]" aria-hidden />
        <div className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full bg-brand-400/15 blur-[60px]" aria-hidden />
        <CollaborationSection />
      </div>

      {/* ── TimelineSection with left-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-brand-500/20 blur-[70px]" aria-hidden />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-cyan-400/15 blur-[60px]" aria-hidden />
        <TimelineSection />
      </div>

      {/* ── AnnouncementsPreview with right-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-500/15 blur-[70px]" aria-hidden />
        <AnnouncementsPreview />
      </div>

      {/* ── SponsorsSection with left-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -left-20 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-violet-500/15 blur-[70px]" aria-hidden />
        <SponsorsSection />
      </div>

      {/* ── FAQSection with right-edge blob ── */}
      <div className="relative">
        <div className="pointer-events-none absolute -right-20 top-1/3 h-64 w-64 rounded-full bg-brand-500/20 blur-[70px]" aria-hidden />
        <FAQSection />
      </div>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-[rgb(var(--border))] py-24 sm:py-32">
        {/* Section-specific blobs */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-[80px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-cyan-500/15 blur-[90px]" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[100px]" aria-hidden />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/5 via-transparent to-cyan-500/5" />
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <DotField
            dotRadius={1.5}
            dotSpacing={14}
            bulgeStrength={67}
            glowRadius={160}
            sparkle={true}
            waveAmplitude={0}
            gradientFrom="rgba(59, 130, 246, 0.35)"
            gradientTo="rgba(6, 182, 212, 0.25)"
            glowColor="#0F172A"
          />
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
          className="relative mx-auto max-w-4xl px-6 text-center"
        >
          <motion.div
            variants={{ hidden: { opacity: 0, scale: 0.7, filter: 'blur(10px)' }, visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } }}
            whileHover={{ rotate: [0, -5, 5, 0], transition: { duration: 0.4 } }}
            className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden"
          >
            <img src="/logo.png" alt="SKH" className="h-14 w-14 object-contain" />
          </motion.div>
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 30, filter: 'blur(6px)' }, visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } } }}
            className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl"
          >
            Ready to build for{' '}
            <span className="text-gradient">{APP.region}</span>?
          </motion.h2>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            className="mx-auto mt-5 max-w-xl text-lg text-ink-600"
          >
            Team spaces, structured submissions, and jury workflows — all in one cohesive, national-grade platform.
          </motion.p>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            <Link to="/auth">
              <Button size="lg" className="gap-2 shadow-glow-brand">
                Start registration
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="lg" variant="secondary" className="gap-2">
                Partner with us
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>
    </div>
  )
}
