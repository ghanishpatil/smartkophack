import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { APP } from '@/utils/constants.js'
import { roleHome, ROLES } from '@/utils/roles.js'

const links = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About SKH' },
  { to: '/problems', label: 'Problem Bank' },
  { to: '/timeline', label: 'Event Timeline' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/faq', label: 'FAQ' },
  { to: '/sponsors', label: 'Partners & Sponsors' },
  { to: '/contact', label: 'Contact Us' },
]

const resourceLinks = [
  { to: '/guidelines', label: 'Submission Guidelines' },
  { to: '/code-of-conduct', label: 'Code of Conduct' },
  { to: '/results', label: 'Results' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, profile, firebaseReady } = useAuth()
  const role = profile?.role || ROLES.PARTICIPANT
  const dash = user && firebaseReady ? roleHome(role) : '/auth'
  const location = useLocation()

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        'border-b border-white/20 bg-white/70 shadow-sm backdrop-blur-xl backdrop-saturate-150',
      ].join(' ')}
    >
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-3">
          {/* Sanjivani University Logo - placeholder, add sanjivani-logo.png to public folder */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 object-contain shadow-md shadow-brand-500/20 ring-1 ring-brand-500/10 transition-transform duration-300 group-hover:scale-110">
            <img 
              src="/sanjivani-logo.png" 
              alt="Sanjivani University" 
              className="h-full w-full rounded-xl object-contain"
              onError={(e) => {
                // Fallback to text if logo doesn't exist
                e.target.style.display = 'none'
                e.target.parentElement.innerHTML = '<span class="text-xs font-bold text-brand-600">SU</span>'
              }}
            />
          </div>
          
          {/* SKH Logo */}
          <img src="/logo.png" alt={APP.shortName} className="h-11 w-11 rounded-xl object-contain shadow-md shadow-brand-500/20 ring-1 ring-brand-500/10 transition-transform duration-300 group-hover:scale-110" />
          
          <span className="flex flex-col leading-tight">
            <span className="font-display text-sm font-bold text-ink-900 sm:text-base">
              Smart Kopargaon Hackathon
            </span>
            <span className="text-[10px] font-medium text-ink-500">
              Powered by Sanjivani University
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
                  isActive
                    ? 'text-brand-600'
                    : 'text-ink-600 hover:text-ink-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive ? (
                    <motion.span
                      layoutId="navbar-indicator"
                      className="absolute inset-x-1 -bottom-[1px] h-0.5 rounded-full bg-brand-500"
                      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <Link to={dash} className="hidden sm:block">
            {user ? (
              <Button size="sm" variant="secondary" className="gap-1.5">
                Dashboard
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5">
                Register / Login
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="rounded-lg p-2 text-ink-700 transition-colors hover:bg-[rgb(var(--surface-muted))] md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={open ? 'close' : 'open'}
                initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="block"
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Mobile full-screen overlay */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-5">
              {/* Platform Links */}
              <div className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-ink-500">
                Platform
              </div>
              {links.map(({ to, label }, i) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <NavLink
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      [
                        'flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-500/10 text-brand-600'
                          : 'text-ink-700 hover:bg-[rgb(var(--surface-muted))]',
                      ].join(' ')
                    }
                  >
                    {label}
                  </NavLink>
                </motion.div>
              ))}

              {/* Resources Links */}
              <div className="mb-2 mt-4 px-4 text-xs font-semibold uppercase tracking-wider text-ink-500">
                Resources
              </div>
              {resourceLinks.map(({ to, label }, i) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (links.length + i) * 0.04 }}
                >
                  <NavLink
                    to={to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      [
                        'flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-500/10 text-brand-600'
                          : 'text-ink-700 hover:bg-[rgb(var(--surface-muted))]',
                      ].join(' ')
                    }
                  >
                    {label}
                  </NavLink>
                </motion.div>
              ))}

              <div className="mt-3 border-t border-[rgb(var(--border))] pt-4">
                <Link to={dash} onClick={() => setOpen(false)}>
                  <Button className="w-full">{user ? 'Dashboard' : 'Register / Login'}</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
