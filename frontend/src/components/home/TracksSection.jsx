import * as Icons from 'lucide-react'
import { motion } from 'framer-motion'
import { TRACKS } from '@/utils/constants.js'
import { Marquee } from '@/components/ui/Marquee.jsx'
import TiltedCard from '@/components/ui/TiltedCard.jsx'

// Light-theme palette per domain
const domainConfig = [
  { iconBg: 'bg-rose-500/10',    iconColor: 'text-rose-600',    cardBg: 'from-rose-50 to-white',       border: 'border-rose-200',    titleColor: 'text-rose-700',    accentBar: 'bg-rose-500'    },
  { iconBg: 'bg-violet-500/10',  iconColor: 'text-violet-600',  cardBg: 'from-violet-50 to-white',     border: 'border-violet-200',  titleColor: 'text-violet-700',  accentBar: 'bg-violet-500'  },
  { iconBg: 'bg-cyan-500/10',    iconColor: 'text-cyan-600',    cardBg: 'from-cyan-50 to-white',       border: 'border-cyan-200',    titleColor: 'text-cyan-700',    accentBar: 'bg-cyan-500'    },
  { iconBg: 'bg-orange-500/10',  iconColor: 'text-orange-600',  cardBg: 'from-orange-50 to-white',     border: 'border-orange-200',  titleColor: 'text-orange-700',  accentBar: 'bg-orange-500'  },
  { iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600', cardBg: 'from-emerald-50 to-white',    border: 'border-emerald-200', titleColor: 'text-emerald-700', accentBar: 'bg-emerald-500' },
  { iconBg: 'bg-lime-500/10',    iconColor: 'text-lime-600',    cardBg: 'from-lime-50 to-white',       border: 'border-lime-200',    titleColor: 'text-lime-700',    accentBar: 'bg-lime-500'    },
  { iconBg: 'bg-indigo-500/10',  iconColor: 'text-indigo-600',  cardBg: 'from-indigo-50 to-white',     border: 'border-indigo-200',  titleColor: 'text-indigo-700',  accentBar: 'bg-indigo-500'  },
  { iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-600',   cardBg: 'from-amber-50 to-white',      border: 'border-amber-200',   titleColor: 'text-amber-700',   accentBar: 'bg-amber-500'   },
]

export function TracksSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      {/* Background image (1366×768, 16:9) — stretched to show full art incl. rocket */}
      <div
        className="pointer-events-none absolute inset-0 bg-no-repeat"
        style={{ backgroundImage: 'url(/cardsbg.png)', backgroundSize: '100% 100%', backgroundPosition: 'center' }}
      />
      {/* Soft white wash so cards stay readable */}
      <div className="pointer-events-none absolute inset-0 bg-white/70" />
      {/* Subtle dot pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.18) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />
      <div className="pointer-events-none absolute -left-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-brand-500/5 blur-[100px]" />
      <div className="pointer-events-none absolute -right-32 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-[100px]" />

      <div className="relative w-full">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 px-4 text-center sm:px-6 lg:px-8"
        >
          <span className="inline-block rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-600">
            Innovation Domains
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Domains of Impact
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-500 sm:text-base">
            No problem is too big… No idea is too small
          </p>
        </motion.div>

        {/* Continuous Scrolling Carousel of Tilted Cards */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.9 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <Marquee speed={40} pauseOnHover innerClassName="py-8">
            {TRACKS.map((track, idx) => {
              const cfg = domainConfig[idx]
              return <DomainCard key={track.id} track={track} config={cfg} />
            })}
          </Marquee>

          {/* Edge fade overlays (white) */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-transparent" />
        </motion.div>
      </div>
    </section>
  )
}

function DomainCard({ track, config }) {
  const Icon = Icons[track.icon] || Icons.Circle

  const overlay = (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center rounded-[15px] border bg-gradient-to-br p-6 text-center shadow-sm ${config.cardBg} ${config.border}`}
    >
      {/* Top accent bar */}
      <div className={`absolute left-0 right-0 top-0 h-1 rounded-t-[15px] ${config.accentBar}`} />

      {/* Icon */}
      <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${config.iconBg} ring-1 ring-black/5`}>
        <Icon className={`h-8 w-8 ${config.iconColor}`} />
      </div>

      {/* Title */}
      <h3 className={`mb-2.5 font-display text-sm font-bold uppercase tracking-wider ${config.titleColor}`}>
        {track.title}
      </h3>

      {/* Divider */}
      <div className={`mb-3 h-px w-14 rounded-full ${config.accentBar} opacity-40`} />

      {/* Description */}
      <p className="text-[13px] leading-relaxed text-gray-600">
        {track.description}
      </p>
    </div>
  )

  return (
    <div className="mx-4 shrink-0">
      <TiltedCard
        containerHeight="300px"
        containerWidth="300px"
        imageHeight="300px"
        imageWidth="300px"
        rotateAmplitude={10}
        scaleOnHover={1.06}
        showMobileWarning={false}
        showTooltip={false}
        displayOverlayContent
        overlayContent={overlay}
      />
    </div>
  )
}
