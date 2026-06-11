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
            className="relative"
          >
            <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-2 shadow-xl">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
                  title="Smart Kopargaon Hackathon"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
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
            {/* Logo */}
            <div className="flex items-center justify-center lg:justify-start">
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

            {/* Title */}
            <div className="text-center lg:text-left">
              <h3 className="font-display text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl lg:text-4xl">
                About Sanjivani University
              </h3>
              <div className="mt-2 h-1 w-24 bg-gradient-to-r from-brand-500 to-cyan-500 rounded-full mx-auto lg:mx-0" />
            </div>

            {/* Description */}
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6 shadow-lg">
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

            {/* Stats or Highlights */}
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-brand-600">10+</div>
                <div className="text-xs text-gray-600 uppercase tracking-wider">Programs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-600">5000+</div>
                <div className="text-xs text-gray-600 uppercase tracking-wider">Students</div>
              </div>
              <div className="text-center">
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
