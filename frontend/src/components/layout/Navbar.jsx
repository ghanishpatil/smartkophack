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
  { to: '/problems', label: 'Problem Statements' },
  { to: '/timeline', label: 'Event Timeline' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/results', label: 'Results' },
  { to: '/sponsors', label: 'Partners & Sponsors' },
  { to: '/contact', label: 'Contact Us' },
]

const resourceLinks = [
  { to: '/guidelines', label: 'Submission Guidelines' },
  { to: '/code-of-conduct', label: 'Code of Conduct' },
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

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      // Get current scroll position
      const scrollY = window.scrollY
      
      // Add class to body for CSS-based lock
      document.body.classList.add('menu-open')
      
      // Store original body styles
      const originalOverflow = document.body.style.overflow
      const originalPosition = document.body.style.position
      const originalTop = document.body.style.top
      const originalWidth = document.body.style.width
      
      // Lock body scroll - works on iOS and Android
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.height = '100vh'
      
      return () => {
        // Remove class
        document.body.classList.remove('menu-open')
        
        // Restore original values
        document.body.style.overflow = originalOverflow
        document.body.style.position = originalPosition
        document.body.style.top = originalTop
        document.body.style.width = originalWidth
        document.body.style.height = ''
        
        // Restore scroll position
        window.scrollTo(0, scrollY)
      }
    }
  }, [open])

  return (
    <header
      className={[
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        'border-b border-white/20 bg-white/70 shadow-sm backdrop-blur-xl backdrop-saturate-150',
        'safe-top', // iOS safe area
      ].join(' ')}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-4 md:px-6 lg:h-[4.5rem] lg:px-8">
        {/* Logo - Optimized for mobile */}
        <Link to="/" className="group flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
          {/* Sanjivani University Logo */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 object-contain shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/10 transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10 md:h-12 md:w-12 md:rounded-xl">
            <img 
              src="/sanjivani-logo.png" 
              alt="Sanjivani University" 
              className="h-[90%] w-[90%] rounded-lg object-contain md:rounded-xl"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.parentElement.innerHTML = '<span class="text-xs font-bold text-brand-600">SU</span>'
              }}
            />
          </div>
          
          {/* SKH Logo */}
          <img 
            src="/logo.png" 
            alt={APP.shortName} 
            className="h-9 w-9 shrink-0 rounded-lg object-contain shadow-sm shadow-brand-500/20 ring-1 ring-brand-500/10 transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10 md:h-11 md:w-11 md:rounded-xl" 
          />
          
          {/* Text - Show full name on tablets (md+), abbreviated on small phones */}
          <span className="hidden flex-col leading-tight xs:flex">
            <span className="font-display text-xs font-bold text-ink-900 sm:text-sm md:text-base">
              <span className="hidden md:inline">Smart Kopargaon Hackathon</span>
              <span className="md:hidden">SKH</span>
            </span>
            <span className="hidden text-[9px] font-medium text-ink-500 sm:block sm:text-[10px]">
              Powered by Sanjivani University
            </span>
          </span>
        </Link>

        {/* Desktop nav - Hidden on mobile/tablet */}
        <nav className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'relative whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium transition-colors duration-200 xl:px-3 xl:text-sm',
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
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Dashboard/Login button - Show on tablets and up */}
          <Link to={dash} className="hidden sm:block">
            {user ? (
              <Button size="sm" variant="secondary" className="gap-1 text-xs sm:gap-1.5 sm:text-sm">
                <span className="hidden md:inline">Dashboard</span>
                <span className="md:hidden">Dash</span>
                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </Button>
            ) : (
              <Button size="sm" className="gap-1 text-xs sm:gap-1.5 sm:text-sm">
                <span className="hidden md:inline">Register / Login</span>
                <span className="md:hidden">Login</span>
                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </Button>
            )}
          </Link>

          {/* Mobile menu toggle - Better touch target */}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-[rgb(var(--surface-muted))] active:scale-95 lg:hidden"
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

      {/* Mobile full-screen overlay - Optimized for all mobile devices */}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="max-h-[calc(100vh-3.5rem)] overflow-y-auto overscroll-contain border-t border-[rgb(var(--border))] bg-[rgb(var(--page-bg))] lg:hidden"
            style={{ 
              WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            }}
          >
            <div className="flex flex-col gap-1 px-3 py-4 pb-safe sm:px-4 sm:py-5">
              {/* Platform Links */}
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-500 sm:mb-2 sm:px-4 sm:text-xs">
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
                        'flex min-h-[44px] items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] sm:px-4 sm:py-3',
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
              <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-500 sm:mb-2 sm:mt-4 sm:px-4 sm:text-xs">
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
                        'flex min-h-[44px] items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] sm:px-4 sm:py-3',
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

              {/* Dashboard/Login button in mobile menu */}
              <div className="mt-3 border-t border-[rgb(var(--border))] pt-3 sm:pt-4">
                <Link to={dash} onClick={() => setOpen(false)}>
                  <Button className="min-h-[44px] w-full active:scale-[0.98]">
                    {user ? 'Dashboard' : 'Register / Login'}
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
