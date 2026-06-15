import { motion } from 'framer-motion'

export function UniversitySection() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      {/* Background dot pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.15) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      {/* Decorative floating shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[6%] top-[18%] h-24 w-1 rotate-45 rounded-full bg-gradient-to-b from-orange-400 to-orange-500 opacity-70" />
        <div className="absolute right-[8%] top-[12%] h-16 w-16 rounded-2xl bg-brand-600/15 blur-[1px]" />
        <div className="absolute bottom-[15%] right-[14%] h-20 w-20 rounded-3xl bg-blue-600/10" />
        <div className="absolute left-[12%] bottom-[20%] h-8 w-8 rounded-full border-2 border-dashed border-gray-300" />
        <div className="absolute right-[20%] top-[40%] h-3 w-3 rotate-45 bg-cyan-400/40" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Left: YouTube Video */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative group"
          >
            {/* Blue offset background layer */}
            <div className="absolute -inset-6 transform rotate-3 rounded-[2rem] bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 opacity-90 shadow-2xl transition-all duration-500 group-hover:opacity-100" />

            {/* Ambient glow */}
            <div className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-r from-brand-400/30 via-cyan-400/30 to-violet-400/30 opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />

            {/* Premium dark video card */}
            <div className="relative transform -rotate-1 overflow-hidden rounded-[1.75rem] border border-gray-700/50 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-500 group-hover:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)]">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />

              {/* Video frame */}
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                <iframe
                  className="relative z-10 h-full w-full"
                  src="https://www.youtube-nocookie.com/embed/thBG6VIutp8"
                  title="Sanjivani University Campus Tour"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>

              {/* Bottom label */}
              <div className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border border-white/5 bg-gradient-to-r from-gray-800/80 to-gray-900/80 px-4 py-2 backdrop-blur-sm">
                <div className="relative">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <div className="absolute inset-0 h-2 w-2 rounded-full bg-red-500 animate-ping opacity-75" />
                </div>
                <span className="text-sm font-semibold tracking-wide text-white/90">Watch Our Story</span>
              </div>
            </div>
          </motion.div>

          {/* Right: About — Glassy Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="relative group"
          >
            {/* Soft glow behind glass */}
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-400/20 via-cyan-400/15 to-violet-400/20 blur-2xl opacity-70 group-hover:opacity-90 transition-opacity duration-500" />

            {/* Glassmorphism card */}
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/60 p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-10">
              {/* Inner decorative glows */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
              {/* Top glossy highlight */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

              <div className="relative">
                {/* Logo */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                  className="inline-flex overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-md backdrop-blur"
                >
                  <img
                    src="/sanjivani-university.png"
                    alt="Sanjivani University"
                    className="h-16 w-auto object-contain sm:h-20"
                  />
                </motion.div>

                {/* Title */}
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
                  About Sanjivani University
                </h3>
                <div className="mt-3 h-1 w-24 rounded-full bg-gradient-to-r from-brand-500 to-cyan-500" />

                {/* Description */}
                <p className="mt-6 text-sm leading-relaxed text-gray-700 sm:text-base">
                  Sanjivani University, Kopargaon, is a premier institution committed to excellence in teaching, research, and innovation.
                  Offering comprehensive programs across Engineering, Management, Commerce, Sciences, and Pharmacy, the University follows
                  a learner-centric model aligned with NEP 2020.
                </p>
                <p className="mt-4 text-sm leading-relaxed text-gray-700 sm:text-base">
                  Through strong industry partnerships, innovation centers, and global collaborations, students gain real-world exposure.
                  Rooted in ethical values and supported by state-of-the-art infrastructure, Sanjivani University develops future-ready
                  professionals and responsible global citizens.
                </p>

                {/* Stats */}
                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-gray-200/60 pt-6">
                  <div>
                    <div className="text-2xl font-bold text-brand-600 sm:text-3xl">10+</div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-gray-600">Programs</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-cyan-600 sm:text-3xl">5000+</div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-gray-600">Students</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-violet-600 sm:text-3xl">100+</div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-gray-600">Faculty</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
