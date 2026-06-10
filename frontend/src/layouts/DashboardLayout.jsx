import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LogOut, Gavel, Users, FileUp, Megaphone, Home,
  ClipboardCheck, Target, Bell, Settings, Menu, X, ChevronLeft, ChevronRight,
  Clock, CreditCard, Layers, Star, BarChart3, ClipboardList, FolderLock,
  ScrollText, Sliders, Activity, UserPlus, Handshake, ShieldCheck, Search,
  MessageCircle, BookOpen,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext.jsx'
import { ROLES, roleHome } from '@/utils/roles.js'
import { Button } from '@/components/ui/Button.jsx'
import { APP } from '@/utils/constants.js'
import { AdminScopeBanner } from '@/components/admin/AdminScopeBanner.jsx'
import { AdminChatbot } from '@/components/admin/AdminChatbot.jsx'
import { CommandPalette } from '@/components/admin/CommandPalette.jsx'
import { EmailVerificationBanner } from '@/components/participant/EmailVerificationBanner.jsx'
import { useUnreadCounts } from '@/hooks/useUnreadCounts.js'
import { useSecurityAlertCount } from '@/hooks/useSecurityAlertCount.js'
import { useAdminSessionTimeout } from '@/hooks/useAdminSessionTimeout.js'

const nav = {
  default: [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/submission', label: 'Submission', icon: FileUp },
  ],
  participant: [
    { to: '/dashboard', label: 'Home', icon: Home, end: true },
    { to: '/dashboard/team', label: 'My Team', icon: Users },
    { to: '/dashboard/registration', label: 'Registration', icon: ClipboardCheck },
    { to: '/dashboard/problems', label: 'Problem Statements', icon: Target },
    { to: '/dashboard/submission', label: 'Submission', icon: FileUp },
    { group: 'Communicate' },
    { to: '/dashboard/chat', label: 'Team Chat', icon: MessageCircle },
    { to: '/dashboard/mentor-chat', label: 'Mentor Chat', icon: Handshake },
    { to: '/dashboard/announcements', label: 'Announcements', icon: Megaphone },
    { group: 'Account' },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ],
  admin: [
    { to: '/admin/overview', label: 'Overview', icon: LayoutDashboard, end: true },
    { group: 'Management' },
    { to: '/admin/registrations', label: 'Registrations', icon: UserPlus },
    { to: '/admin/teams', label: 'Teams', icon: Users },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/admin/problems', label: 'Problem Statements', icon: Layers },
    { to: '/admin/phases', label: 'Competition Phases', icon: Layers },
    { to: '/admin/submissions', label: 'Submissions', icon: FileUp },
    { group: 'Evaluation' },
    { to: '/admin/jury', label: 'Jury Management', icon: Gavel },
    { to: '/admin/mentors', label: 'Mentor Management', icon: Handshake },
    { to: '/admin/evaluations', label: 'Evaluations', icon: ClipboardCheck },
    { to: '/admin/shortlisting', label: 'Shortlisting', icon: Star },
    { group: 'Operations' },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/admin/timeline', label: 'Timeline', icon: Clock },
    { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
    { to: '/admin/access', label: 'Access Control', icon: ShieldCheck },
    { to: '/admin/audit', label: 'Activity Logs', icon: ScrollText },
    { to: '/admin/settings', label: 'Settings', icon: Sliders },
    { to: '/admin/health', label: 'System Health', icon: Activity },
    { to: '/admin/security', label: 'Security', icon: ShieldCheck },
    { group: 'Help' },
    { to: '/admin/tutorial', label: 'Tutorial / Guide', icon: BookOpen },
  ],
  judge: [
    { to: '/judge/home', label: 'Home', icon: Home, end: true },
    { group: 'Evaluation' },
    { to: '/judge/assignments', label: 'Assignments', icon: Layers },
    { to: '/judge/evaluate', label: 'Evaluate Teams', icon: ClipboardList },
    { to: '/judge/progress', label: 'Progress', icon: BarChart3 },
    { group: 'Updates' },
    { to: '/judge/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/judge/notifications', label: 'Notifications', icon: Bell },
    { to: '/judge/account', label: 'Account', icon: Settings },
  ],
  mentor: [
    { to: '/mentor', label: 'Dashboard', icon: Home, end: true },
    { to: '/mentor/chat', label: 'Teams Chat', icon: MessageCircle },
  ],
}

const COLLAPSED_KEY = 'sk_participant_sidebar_collapsed'

const roleLabels = {
  [ROLES.PARTICIPANT]: 'Participant',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.JUDGE]: 'Jury Member',
  [ROLES.MENTOR]: 'Mentor',
}

const roleBadgeColors = {
  [ROLES.PARTICIPANT]: 'bg-brand-500/15 text-brand-600',
  [ROLES.ADMIN]: 'bg-red-500/15 text-red-600',
  [ROLES.JUDGE]: 'bg-amber-500/15 text-amber-600',
  [ROLES.MENTOR]: 'bg-emerald-500/15 text-emerald-600',
}

export function DashboardLayout({ variant = 'default' }) {
  const { profile, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const items = nav[variant] || nav.default
  const role = profile?.role || ROLES.PARTICIPANT
  const isParticipantShell = variant === 'participant'
  const isAdminShell = variant === 'admin'
  const isJudgeShell = variant === 'judge'
  const shellMobile = isParticipantShell || isAdminShell || isJudgeShell

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(COLLAPSED_KEY) === 'true' : false,
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { mentorChatUnread } = useUnreadCounts()

  // Global Cmd/Ctrl+K shortcut
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isAdminShell) setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAdminShell])
  const securityAlertCount = useSecurityAlertCount()
  const { showWarning, secondsLeft, stayLoggedIn, doLogout } = useAdminSessionTimeout()

  // Build badge map for nav items
  const badges = isParticipantShell
    ? { '/dashboard/mentor-chat': mentorChatUnread }
    : isAdminShell
      ? { '/admin/security': securityAlertCount }
      : {}

  useEffect(() => {
    if (isParticipantShell) localStorage.setItem(COLLAPSED_KEY, collapsed ? 'true' : 'false')
  }, [collapsed, isParticipantShell])

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  const asideWidth = isParticipantShell
    ? collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64'
    : isAdminShell ? 'lg:w-72' : 'lg:w-64'

  function navLinkClass(isActive) {
    return [
      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
      isParticipantShell && collapsed ? 'lg:justify-center lg:px-2' : '',
      isActive
        ? 'bg-brand-500/15 text-brand-700 shadow-sm'
        : 'text-ink-600 hover:bg-[rgb(var(--surface-muted))] hover:text-ink-900',
    ].join(' ')
  }

  const sidebarInner = (
    <>
      {/* Logo area */}
      <div className={`shrink-0 flex h-16 items-center justify-between gap-2 border-b border-[rgb(var(--border))]/50 px-4 lg:h-auto lg:border-b-0 lg:px-4 lg:pb-0 lg:pt-7 ${isParticipantShell && collapsed ? 'lg:px-2' : ''}`}>
        <div className={`flex items-center gap-2.5 ${isParticipantShell && collapsed ? 'lg:justify-center lg:w-full' : ''}`}>
          <img src="/logo.png" alt={APP.shortName} className="h-11 w-11 shrink-0 rounded-xl object-contain shadow-md shadow-brand-500/20 ring-1 ring-brand-500/10" />
          {!(isParticipantShell && collapsed) ? (
            <div className="min-w-0 leading-tight">
              <p className="font-display text-sm font-bold text-ink-900">{APP.shortName}</p>
              <span className={`inline-block mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${roleBadgeColors[role] || roleBadgeColors[ROLES.PARTICIPANT]}`}>
                {roleLabels[role] || role}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-lg p-2 text-ink-500 hover:bg-[rgb(var(--surface-muted))]" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Collapse toggle */}
      {isParticipantShell ? (
        <button
          type="button"
          className="mx-3 mt-4 hidden shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--border))] p-1.5 text-ink-400 transition-colors hover:bg-[rgb(var(--surface-muted))] hover:text-ink-600 lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      ) : null}

      {/* Nav links */}
      <nav
        data-lenis-prevent
        className={[
          'flex min-h-0 flex-col gap-0.5 px-2 pb-3 pt-3',
          /* Mobile / tablet: vertical scrollable list */
          'max-lg:flex-1 max-lg:overflow-y-auto max-lg:overflow-x-hidden',
          /* Desktop: fill sidebar and scroll vertically */
          'lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:px-3 lg:pb-3 lg:touch-pan-y',
        ].join(' ')}
      >
        {items.map((item) => {
          if (item.group) {
            if (isParticipantShell && collapsed) return null
            return (
              <p key={item.group} className="mt-5 mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-400 first:mt-0">
                {item.group}
              </p>
            )
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={Boolean(item.end)}
              title={isParticipantShell && collapsed ? item.label : undefined}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) => navLinkClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600'}`} />
                  {!(isParticipantShell && collapsed) ? <span className="flex-1">{item.label}</span> : null}
                  {badges[item.to] > 0 && !(isParticipantShell && collapsed) ? (
                    <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {badges[item.to] > 99 ? '99+' : badges[item.to]}
                    </span>
                  ) : null}
                  {badges[item.to] > 0 && isParticipantShell && collapsed ? (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                  ) : null}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom user area */}
      <div className={`mt-auto hidden shrink-0 border-t border-[rgb(var(--border))]/50 p-4 lg:block ${isParticipantShell && collapsed ? 'lg:p-2' : ''}`}>
        {!(isParticipantShell && collapsed) ? (
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 font-display text-xs font-bold text-brand-600">
              {(user?.displayName || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{user?.displayName || 'User'}</p>
              <p className="truncate text-xs text-ink-500">{user?.email}</p>
            </div>
          </div>
        ) : null}
        <div className={`flex items-center gap-2 ${isParticipantShell && collapsed ? 'flex-col' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            className={isParticipantShell && collapsed ? 'w-full px-2' : 'flex-1'}
            onClick={() => logout().then(() => navigate('/'))}
          >
            <LogOut className={`h-4 w-4 ${isParticipantShell && collapsed ? '' : 'mr-2'}`} />
            {!(isParticipantShell && collapsed) ? 'Sign out' : null}
          </Button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[rgb(var(--page-bg))] lg:flex lg:h-screen lg:overflow-hidden">
      {/* Mobile top bar */}
      {shellMobile ? (
        <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-[rgb(var(--border))] bg-[rgb(var(--page-bg))]/90 px-4 backdrop-blur-xl lg:hidden">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-ink-600 hover:bg-[rgb(var(--surface-muted))]" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-display text-sm font-bold text-ink-900">
            {isAdminShell ? 'Admin Panel' : isJudgeShell ? 'Jury Panel' : APP.shortName}
          </p>
          {isAdminShell ? (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="rounded-lg p-2 text-ink-600 hover:bg-[rgb(var(--surface-muted))]"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>
      ) : null}

      {/* Mobile backdrop */}
      <AnimatePresence>
        {shellMobile && mobileNavOpen ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={[
          'z-50 flex min-h-0 flex-shrink-0 flex-col overflow-hidden border-[rgb(var(--border))] bg-[rgb(var(--surface))]',
          asideWidth,
          shellMobile
            ? 'fixed inset-y-0 left-0 h-[100dvh] max-h-[100dvh] w-[min(100%,18rem)] max-w-[90vw] -translate-x-full border-r shadow-lift transition-transform duration-300 ease-out-expo lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:max-w-none lg:translate-x-0 lg:shadow-none'
            : 'sticky top-0 z-30 max-h-[100dvh] border-b lg:h-screen lg:max-h-screen lg:border-b-0 lg:border-r',
          shellMobile && mobileNavOpen ? 'translate-x-0' : '',
        ].join(' ')}
      >
        {sidebarInner}
      </aside>

      {/* Main content area */}
      <div data-lenis-prevent className={`flex min-h-screen flex-1 flex-col lg:h-screen lg:overflow-y-auto ${shellMobile ? 'pt-14 lg:pt-0' : ''}`}>
        {/* Desktop top header */}
        <header className="sticky top-0 z-20 hidden border-b border-[rgb(var(--border))]/70 bg-[rgb(var(--page-bg))]/80 px-8 py-3 backdrop-blur-xl lg:flex lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-400 transition-all hover:border-brand-500/30 hover:text-ink-600"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search…</span>
              <kbd className="ml-2 hidden rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] px-1.5 py-0.5 font-mono text-[10px] text-ink-400 sm:inline">⌘K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              Home
            </Button>
            <Button variant="ghost" size="sm" className="text-ink-500 hover:text-red-600" onClick={() => logout().then(() => navigate('/'))}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className={[
          'flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8',
          variant === 'participant' ? 'pb-[max(6rem,env(safe-area-inset-bottom,0px)+4rem)] lg:pb-14' : '',
        ].join(' ')}>
          {isAdminShell ? <AdminScopeBanner /> : null}
          {isParticipantShell ? <EmailVerificationBanner /> : null}
          <Outlet />
        </div>
      </div>
      {/* Admin AI chatbot — only shown in admin shell */}
      {isAdminShell ? <AdminChatbot /> : null}
      {/* Command palette — only shown in admin shell */}
      {isAdminShell ? <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} /> : null}

      {/* Admin session timeout warning modal */}
      {isAdminShell && showWarning ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-amber-500/30 bg-[rgb(var(--surface))] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-ink-900">Session expiring</h2>
                <p className="mt-1 text-sm text-ink-600">
                  You've been inactive. Your admin session will end in{' '}
                  <span className="font-bold text-amber-700">{secondsLeft}s</span>.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <Button onClick={stayLoggedIn} className="flex-1">
                Stay logged in
              </Button>
              <Button variant="secondary" onClick={doLogout} className="flex-1 text-red-600 hover:bg-red-500/10">
                Log out now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
