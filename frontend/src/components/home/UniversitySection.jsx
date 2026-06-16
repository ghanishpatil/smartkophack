import { motion } from 'framer-motion'

const stats = [
  { value: '10+', label: 'Programs', color: 'text-brand-600' },
  { value: '5000+', label: 'Students', color: 'text-cyan-600' },
  { value: '100+', label: 'Faculty', color: 'text-violet-600' },
]

export function UniversitySection() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      {/* Background image behind the cards */}
      <div
        className="pointer-events-none absolute inset-0 bg-no-repeat"
        style={{ backgroundImage: 'url(/su-card.png)', backgroundSize: '100% 100%', backgroundPosition: 'center' }}
      />
      {/* Subtle dot pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.18) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />
      {/* Vivid color blobs positioned BEHIND the cards so the glass refracts color */}
      <div className="pointer-events-none absolute left-[10%] top-[30%] h-72 w-72 rounded-full bg-brand-500/30 blur-[90px]" />
      <div className="pointer-events-none absolute left-[28%] bottom-[10%] h-64 w-64 rounded-full bg-violet-500/25 blur-[90px]" />
      <div className="pointer-events-none absolute right-[12%] top-[20%] h-72 w-72 rounded-full bg-cyan-500/30 blur-[90px]" />
      <div className="pointer-events-none absolute right-[30%] bottom-[15%] h-60 w-60 rounded-full bg-pink-500/20 blur-[90px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 text-center"
        >
          <span className="inline-block rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-600">
            Our Institution
          </span>
          <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
            Backed by Sanjivani University
          </h2>
        </motion.div>

        <div className="grid items-stretch gap-8 lg:grid-cols-2">
          {/* Left: Video */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="group relative flex"
          >
            {/* Glass video card */}
            <div className="relative flex w-full flex-col overflow-hidden rounded-[1.75rem] border border-white/50 bg-gradient-to-br from-white/40 to-white/20 p-4 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)] backdrop-blur-2xl ring-1 ring-white/30">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

              {/* Video frame */}
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] ring-1 ring-black/10">
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube-nocookie.com/embed/thBG6VIutp8"
                  title="Sanjivani University Campus Tour"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>

              {/* Label */}
              <div className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border border-black/5 bg-white/70 px-4 py-2.5 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-sm font-semibold tracking-wide text-gray-700">Watch Our Campus Story</span>
              </div>
            </div>
          </motion.div>

          {/* Right: About — Glass Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="group relative flex"
          >
            <div className="relative flex w-full flex-col overflow-hidden rounded-[1.75rem] border border-white/50 bg-gradient-to-br from-white/45 to-white/20 p-8 shadow-[0_20px_60px_-25px_rgba(0,0,0,0.35)] backdrop-blur-2xl ring-1 ring-white/30 sm:p-9">
              {/* Glossy highlight + inner glow */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-400/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />

              <div className="relative flex h-full flex-col">
                {/* Logo + title row */}
                <div className="flex items-center gap-4">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-md"
                  >
                    <img
                      src="/sanjivani-university.png"
                      alt="Sanjivani University"
                      className="h-full w-full object-contain"
                    />
                  </motion.div>
                  <div>
                    <h3 className="font-display text-2xl font-bold leading-tight tracking-tight text-gray-900 sm:text-3xl">
                      About Sanjivani University
                    </h3>
                    <div className="mt-2 h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-cyan-500" />
                  </div>
                </div>

                {/* Description */}
                <p className="mt-6 text-sm leading-relaxed text-gray-700 sm:text-[15px]">
                  Sanjivani University, Kopargaon, is a premier institution committed to excellence in teaching,
                  research, and innovation. Offering comprehensive programs across Engineering, Management, Commerce,
                  Sciences, and Pharmacy, the University follows a learner-centric model aligned with NEP 2020.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-gray-700 sm:text-[15px]">
                  Through strong industry partnerships, innovation centers, and global collaborations, students gain
                  real-world exposure — developing future-ready professionals and responsible global citizens.
                </p>

                {/* Stats — pushed to bottom for equal-height alignment */}
                <div className="mt-auto grid grid-cols-3 gap-4 border-t border-gray-200/70 pt-6">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <div className={`font-display text-2xl font-bold sm:text-3xl ${s.color}`}>{s.value}</div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
