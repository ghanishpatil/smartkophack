import { motion } from 'framer-motion'

export function UniversitySection() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      {/* Background Pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.15) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />
      
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-center">
          {/* Left: YouTube Video */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative group"
          >
            {/* Blue background layer (larger, more prominent) */}
            <div className="absolute -inset-6 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 rounded-[2rem] transform rotate-3 opacity-90 group-hover:opacity-100 transition-all duration-500 shadow-2xl" />
            
            {/* Ambient glow effect */}
            <div className="absolute -inset-8 bg-gradient-to-r from-brand-400/30 via-cyan-400/30 to-violet-400/30 rounded-[2.5rem] blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-500" />
            
            {/* Main video container (premium dark card) */}
            <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] group-hover:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)] transition-all duration-500 transform -rotate-1 border border-gray-700/50">
              {/* Glossy overlay effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
              
              {/* Inner decorative glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-cyan-500/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              {/* Video frame with enhanced styling */}
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                {/* Premium corner accents with glow */}
                <div className="absolute top-2 left-2 w-20 h-20 border-t-[3px] border-l-[3px] border-brand-400 rounded-tl-2xl z-20 shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                <div className="absolute top-2 right-2 w-20 h-20 border-t-[3px] border-r-[3px] border-cyan-400 rounded-tr-2xl z-20 shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                <div className="absolute bottom-2 left-2 w-20 h-20 border-b-[3px] border-l-[3px] border-violet-400 rounded-bl-2xl z-20 shadow-[0_0_15px_rgba(139,92,246,0.5)]" />
                <div className="absolute bottom-2 right-2 w-20 h-20 border-b-[3px] border-r-[3px] border-brand-400 rounded-br-2xl z-20 shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
                
                {/* Subtle scan line effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent pointer-events-none z-10" />
                
                <iframe
                  className="h-full w-full relative z-10"
                  src="https://www.youtube.com/embed/thBG6VIutp8?si=96ge7jRY80O_gLrT"
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              
              {/* Premium bottom label with backdrop */}
              <div className="mt-4 flex items-center justify-center gap-2.5 py-2 px-4 rounded-xl bg-gradient-to-r from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-white/5">
                <div className="relative">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  <div className="absolute inset-0 h-2 w-2 rounded-full bg-red-500 animate-ping opacity-75" />
                </div>
                <span className="font-semibold text-sm text-white/90 tracking-wide">Watch Our Story</span>
              </div>
            </div>
          </motion.div>

          {/* Right: University Info */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="space-y-6"
          >
            {/* Logo - Left aligned like video */}
            <div className="flex items-center justify-start">
              <motion.div
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-md"
              >
                <img
                  src="/sanjivani-university.png"
                  alt="Sanjivani University"
                  className="h-20 w-auto object-contain sm:h-24"
                />
              </motion.div>
            </div>

            {/* Title - Left aligned */}
            <div className="text-left">
              <h3 className="font-display text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
                About Sanjivani University
              </h3>
              <div className="mt-2 h-1 w-24 bg-gradient-to-r from-brand-500 to-cyan-500 rounded-full" />
            </div>

            {/* Description - Left aligned text */}
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6 shadow-lg text-left">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-500/5 blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-cyan-500/5 blur-3xl" />
              
              <p className="relative text-sm leading-relaxed text-gray-700 sm:text-base">
                Sanjivani University, Kopargaon, is a premier institution committed to excellence in teaching, research, and innovation. 
                Offering comprehensive programs across Engineering, Management, Commerce, Sciences, and Pharmacy, the University follows 
                a learner-centric model aligned with NEP 2020.
              </p>
              
              <p className="relative mt-4 text-sm leading-relaxed text-gray-700 sm:text-base">
                Through strong industry partnerships, innovation centers, and global collaborations, students gain real-world exposure. 
                Rooted in ethical values and supported by state-of-the-art infrastructure, Sanjivani University develops future-ready 
                professionals and responsible global citizens contributing to nation-building and sustainable development.
              </p>
            </div>

            {/* Stats - Left aligned */}
            <div className="grid grid-cols-3 gap-4 pt-4 text-left">
              <div>
                <div className="text-2xl font-bold text-brand-600">10+</div>
                <div className="text-xs text-gray-600 uppercase tracking-wider">Programs</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">5000+</div>
                <div className="text-xs text-gray-600 uppercase tracking-wider">Students</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-violet-600">100+</div>
                <div className="text-xs text-gray-600 uppercase tracking-wider">Faculty</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
