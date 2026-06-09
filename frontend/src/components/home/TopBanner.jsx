import { useState } from 'react'
import { X, Megaphone } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Marquee } from '@/components/ui/Marquee.jsx'

export function TopBanner({ text = 'Registration for SKH 2026 is now open — Register your team today!' }) {
  const [visible, setVisible] = useState(true)

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-500 text-white"
        >
          <div className="relative flex items-center justify-center gap-3 px-4 py-2.5 text-center text-sm font-medium sm:px-6">
            <Megaphone className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
            <div className="flex-1 overflow-hidden">
              <Marquee speed={40} pauseOnHover={true} className="max-w-full">
                <span className="whitespace-nowrap px-8">{text}</span>
                <span className="whitespace-nowrap px-8">{text}</span>
                <span className="whitespace-nowrap px-8">{text}</span>
                <span className="whitespace-nowrap px-8">{text}</span>
              </Marquee>
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
