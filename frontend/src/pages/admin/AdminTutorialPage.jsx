import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, BookOpen, Rocket, Users, CreditCard, FileUp, Gavel,
  Megaphone, BarChart3, Shield, Settings, Search, Layers, MessageSquare,
  UserCheck, Trophy, CheckSquare, X,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { Card } from '@/components/ui/Card.jsx'
import { Badge } from '@/components/ui/Badge.jsx'

// ─── Tutorial content ─────────────────────────────────────────────────────────
const steps = [
  {
    icon: Settings,
    title: 'Event Setup',
    badge: 'Start Here',
    tone: 'brand',
    tags: ['setup', 'settings', 'event', 'create', 'configure'],
    content: [
      '**Where:** Admin → Settings',
      '',
      '**What to do first:**',
      '1. The event "SKH 2026" is already created. You just need to configure it.',
      '2. Set **Team Size** — minimum 2, maximum 4 members.',
      '3. Set **Entry Fee** — enable it and enter the amount (e.g. ₹400).',
      '',
      '**Lifecycle flags — turn these on/off as the event progresses:**',
      '• **Registration Open** → teams can sign up and register',
      '• **Submissions Open** → teams can upload their work',
      '• **Evaluations Open** → judges can score teams',
      '• **Publish Results** → leaderboard becomes public at /results',
      '',
      'These flags are independent. You can open submissions while registration is still running.',
      '',
      '**Dates (optional):**',
      '• Registration Opens At / Closes At — auto-closes registration on schedule',
      '• Submission Deadline — auto-blocks submissions after this time',
    ],
  },
  {
    icon: FileUp,
    title: 'Problem Statements',
    badge: 'Content',
    tone: 'neutral',
    tags: ['problem', 'ps', 'domain', 'track', 'content', 'add'],
    content: [
      '**Where:** Admin → Problem Statements',
      '',
      '**Adding problem statements:**',
      '• Click "Add Problem Statement" or bulk import via CSV',
      '• Each PS needs: Title, Domain (7 options), Track (Software or Hardware), Description',
      '• Set "Max Teams" to limit how many teams can pick this PS',
      '• Toggle "Published" to make it visible to participants',
      '',
      '**Domains:** Health, Education, Transportation, Food Safety & Security, Waste Management, Agriculture, Industry & MSME Innovation, Open Innovation',
      '',
      '**2 Tracks:** Software, Hardware',
      '',
      'Teams can only select published problem statements. Unpublished ones are hidden from participants.',
    ],
  },
  {
    icon: Users,
    title: 'Registration & Teams',
    badge: 'Go Live',
    tone: 'success',
    tags: ['registration', 'teams', 'participants', 'invite', 'join', 'members'],
    content: [
      '**Where:** Admin → Registrations, Admin → Teams',
      '',
      '**How participants register:**',
      '1. Sign up at /auth (email or Google)',
      '2. Create a team → get a 6-character invite code',
      '3. Share invite code with teammates → they join',
      '4. Team leader clicks "Register for Event"',
      '5. Pay entry fee via Razorpay (if enabled)',
      '6. Select a problem statement',
      '7. Start submitting',
      '',
      '**Admin controls:**',
      '• View all teams and their status at Admin → Teams',
      '• Block/unblock a team using the "Blocked" status',
      '• Remove a team\'s registration if needed',
      '• Bulk operations: shortlist, block, export CSV',
      '',
      '**Minimum team size check:** Teams must meet the minimum size before registering.',
    ],
  },
  {
    icon: CreditCard,
    title: 'Payments',
    badge: 'Finance',
    tone: 'warn',
    tags: ['payment', 'razorpay', 'fee', 'waive', 'paid', 'pending', 'finance'],
    content: [
      '**Where:** Admin → Payments',
      '',
      '**Automatic flow:**',
      '• Razorpay handles UPI, Card, Net Banking',
      '• Payment confirmation email sent automatically',
      '• Team is marked "Registered" after payment',
      '',
      '**Manual overrides (Admin → Teams → select team):**',
      '• Mark as "Paid" — for cash/offline payments',
      '• Mark as "Waived" — for sponsored or scholarship teams',
      '',
      '**Pay Later option:**',
      '• Teams can choose "Pay Later" during registration',
      '• They can still form a team but cannot submit until paid',
      '',
      '**Send payment reminders:**',
      '• Admin → Settings → "Send Payment Reminders" button',
      '• Emails all teams with pending payment',
    ],
  },
  {
    icon: Layers,
    title: 'Competition Phases (Optional)',
    badge: 'Advanced',
    tone: 'brand',
    tags: ['phases', 'phase', 'shortlist', 'round', 'stage', 'competition', 'multi-phase'],
    content: [
      '**Where:** Admin → Competition Phases',
      '',
      'Phases let you run a multi-round hackathon (e.g. Idea → Prototype → Finals).',
      'If you don\'t need rounds, skip this — the basic submission flow works without phases.',
      '',
      '**Phase states (in order):**',
      'DRAFT → UPCOMING → ACTIVE → SUBMISSION_LOCKED → EVALUATION → SHORTLISTING → COMPLETED → ARCHIVED',
      '',
      '**To start a phase:**',
      '1. Create a phase with a name, order number, and deadline',
      '2. Set requirements (which files are needed: PPT, PDF, Video, GitHub, Deployed URL)',
      '3. Set evaluation criteria (rubric) for this phase',
      '4. Transition it to ACTIVE — teams can now submit',
      '',
      '**Shortlisting teams for the next phase:**',
      '• Admin → Shortlisting → select teams → "Shortlist for Phase X"',
      '• Only shortlisted teams can submit in Phase 2 and beyond',
      '• Phase 1 is open to all registered teams',
      '',
      '**Phase transitions:**',
      '• ACTIVE → SUBMISSION_LOCKED (close submissions)',
      '• SUBMISSION_LOCKED → EVALUATION (judges start scoring)',
      '• EVALUATION → SHORTLISTING (admin picks winners)',
      '• SHORTLISTING → COMPLETED (phase done)',
    ],
  },
  {
    icon: FileUp,
    title: 'Submissions',
    badge: 'Submissions',
    tone: 'neutral',
    tags: ['submission', 'upload', 'ppt', 'pdf', 'video', 'github', 'finalize', 'lock'],
    content: [
      '**Where:** Admin → Submissions',
      '',
      '**To open submissions:**',
      '• Admin → Settings → toggle "Submissions Open" → Save',
      '• OR activate a Competition Phase (if using phases)',
      '',
      '**What teams submit:**',
      '• PPT/PPTX presentation',
      '• PDF document',
      '• Demo video (optional, depends on phase requirements)',
      '• GitHub repository link',
      '• Deployed URL (optional)',
      '',
      '**Team flow:**',
      '1. Upload files to the Submission Center',
      '2. Save GitHub/deployed links',
      '3. Click "Finalize Submission" to lock it',
      '4. Locked submissions cannot be edited unless admin unlocks',
      '',
      '**Admin controls:**',
      '• View all submissions at Admin → Submissions',
      '• Unlock a team\'s submission: Admin → Teams → find team → "Unlock Submission"',
      '• Send deadline reminders: Admin → Settings → "Send Submission Reminders"',
    ],
  },
  {
    icon: Gavel,
    title: 'Jury Setup & Evaluation',
    badge: 'Evaluation',
    tone: 'brand',
    tags: ['jury', 'judge', 'evaluation', 'score', 'rubric', 'assign', 'criteria'],
    content: [
      '**Where:** Admin → Jury Management, Admin → Evaluations',
      '',
      '**Step 1 — Make someone a judge:**',
      '• Admin → Access Control → find user → change role to "Judge"',
      '',
      '**Step 2 — Assign judges (two ways):**',
      '',
      'Option A — By Domain + Track (recommended):',
      '• Admin → Jury Management → select judge → "By Domain + Track" tab',
      '• Click the domain/track cells to assign (e.g. Health + Software)',
      '• Judge automatically sees all teams in that domain/track',
      '',
      'Option B — By specific Problem Statement:',
      '• Admin → Jury Management → select judge → "By Problem Statement" tab',
      '• Tick the specific PS IDs to assign',
      '',
      '**Step 3 — Set evaluation criteria:**',
      '• Admin → Evaluations → upload CSV rubric or paste from spreadsheet',
      '• Default criteria: Originality, Feasibility, Impact, Presentation (10 pts each)',
      '• Custom criteria can be set per competition phase',
      '',
      '**Step 4 — Open evaluations:**',
      '• Admin → Settings → toggle "Evaluations Open" → Save',
      '• OR transition a Competition Phase to EVALUATION state',
      '',
      '**Judge workflow:**',
      '• Judge logs in → sees assigned teams → views submission → scores each criterion → submits',
      '• Judges can save drafts and submit final evaluation separately',
      '• Admin monitors progress at Admin → Evaluations',
    ],
  },
  {
    icon: UserCheck,
    title: 'Mentors',
    badge: 'Mentors',
    tone: 'neutral',
    tags: ['mentor', 'mentors', 'assign', 'chat', 'guidance'],
    content: [
      '**Where:** Admin → Mentor Management',
      '',
      '**Make someone a mentor:**',
      '• Admin → Access Control → find user → change role to "Mentor"',
      '',
      '**Assign mentors (three ways):**',
      '1. By Domain + Track — mentor sees all teams in that domain/track',
      '2. By Problem Statement — mentor sees teams on specific PS',
      '3. Direct team assignment — mentor assigned to a specific team',
      '',
      '**Mentor capabilities:**',
      '• Chat with assigned teams via Mentor Chat',
      '• Leave structured notes on teams (visible to admin)',
      '• View team submissions',
      '',
      '**Participants can:**',
      '• Chat with their assigned mentor at Dashboard → Mentor Chat',
      '• Share files (photos, PDFs, PPTs) in chat — max 35MB, no videos',
    ],
  },
  {
    icon: MessageSquare,
    title: 'Team Chat',
    badge: 'Communication',
    tone: 'neutral',
    tags: ['chat', 'message', 'team', 'communication', 'file', 'share'],
    content: [
      '**Team Chat (Dashboard → Chat):**',
      '• All team members can chat with each other in real-time',
      '• Messages appear instantly via Firestore live sync',
      '• Members can reply to specific messages',
      '• Members can delete their own messages',
      '• File sharing: photos, PDFs, PPTs — max 35MB, no videos',
      '',
      '**Mentor Chat (Dashboard → Mentor Chat):**',
      '• Participants chat with their assigned mentor',
      '• Mentor sees all their assigned teams in a sidebar',
      '• File sharing supported in both directions',
      '',
      'Admin can read all chats via Firestore (Admin SDK access).',
    ],
  },
  {
    icon: Trophy,
    title: 'Results & Leaderboard',
    badge: 'Finals',
    tone: 'success',
    tags: ['results', 'leaderboard', 'publish', 'shortlist', 'winners', 'announce'],
    content: [
      '**Where:** Admin → Shortlisting, Admin → Settings',
      '',
      '**Step 1 — Review scores:**',
      '• Admin → Evaluations → scroll down to see team rankings by average score',
      '• Scores are normalized to 0–100% so different rubrics are comparable',
      '',
      '**Step 2 — Shortlist winners:**',
      '• Admin → Shortlisting → select teams → "Shortlist for Phase X"',
      '• Shortlisted teams see a badge on their dashboard',
      '',
      '**Step 3 — Publish results:**',
      '• Admin → Settings → toggle "Publish Results" → Save',
      '• The public /results page shows team names and problem statements',
      '• Scores are NOT shown publicly — only team name and PS',
      '',
      '**Step 4 — Announce:**',
      '• Admin → Announcements → create announcement with results',
      '• Check "Send via email" to notify all participants',
    ],
  },
  {
    icon: Megaphone,
    title: 'Announcements & Emails',
    badge: 'Ongoing',
    tone: 'neutral',
    tags: ['announcement', 'email', 'notify', 'broadcast', 'message', 'reminder'],
    content: [
      '**Where:** Admin → Announcements',
      '',
      '**Post an announcement:**',
      '• Title + body text',
      '• Pin it to keep it at the top',
      '• Choose audience: All / Participants / Judges / Mentors',
      '• Check "Send via email" to also email everyone',
      '',
      '**Automatic emails (sent by the system):**',
      '• Welcome email when team registers',
      '• Payment confirmation after Razorpay payment',
      '• Submission confirmation when team finalizes',
      '• Team member joined notification',
      '',
      '**Manual email reminders:**',
      '• Admin → Settings → "Send Payment Reminders" — emails all unpaid teams',
      '• Admin → Settings → "Send Submission Reminders" — emails teams without finalized submissions',
    ],
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    badge: 'Reports',
    tone: 'neutral',
    tags: ['reports', 'analytics', 'stats', 'export', 'csv', 'data'],
    content: [
      '**Where:** Admin → Reports, Admin → Overview',
      '',
      '**Overview dashboard shows:**',
      '• Total teams, registered teams, payments pending',
      '• Submission completion rate',
      '• Evaluation progress',
      '• Registration funnel (teams → registered → paid → PS selected → submitted)',
      '',
      '**Reports page:**',
      '• Team rankings by average evaluation score',
      '• Score distribution histogram',
      '• Judge activity (how many evaluations each judge submitted)',
      '• Export teams as CSV',
      '• Export submissions as CSV',
      '',
      '**Admin → Stats** (API endpoint) gives real-time counts for all metrics.',
    ],
  },
  {
    icon: Shield,
    title: 'Security & Access Control',
    badge: 'Security',
    tone: 'warn',
    tags: ['security', 'access', 'roles', 'ban', 'admin', 'judge', 'mentor', 'audit', 'logs'],
    content: [
      '**Where:** Admin → Access Control, Admin → Security, Admin → Audit Logs',
      '',
      '**User roles:**',
      '• **Participant** — default role, can register and submit',
      '• **Judge** — can evaluate assigned teams',
      '• **Mentor** — can chat with and guide assigned teams',
      '• **Admin** — full access to everything',
      '• **Banned** — blocked from all access',
      '',
      '**Change a user\'s role:**',
      '• Admin → Access Control → find user → change role',
      '• Role change takes effect on their next login',
      '',
      '**Ban a user:**',
      '• Admin → Access Control → find user → "Ban"',
      '• Banned users see an error on all protected routes',
      '',
      '**Security Center (Admin → Security):**',
      '• Live activity log — all user actions',
      '• Security events — suspicious activity, honeypot triggers',
      '• Incidents — auto-created when honeypot routes are hit',
      '• Duplicate team detection',
      '',
      '**Audit Logs (Admin → Audit Logs):**',
      '• Every admin action is logged: role changes, payment recordings, team patches',
      '• Cannot be deleted or modified (server-only writes)',
    ],
  },
  {
    icon: Rocket,
    title: 'Quick Checklist',
    badge: 'Checklist',
    tone: 'brand',
    tags: ['checklist', 'quick', 'reference', 'todo', 'steps', 'guide'],
    content: [
      '**Before opening registration:**',
      '☐ Add all problem statements (published)',
      '☐ Set team size limits in Settings',
      '☐ Configure entry fee (if applicable)',
      '☐ Set registration deadline',
      '☐ Test the registration flow yourself',
      '',
      '**During registration:**',
      '☐ Toggle "Registration Open" in Settings',
      '☐ Share the platform URL with participants',
      '☐ Monitor registrations at Admin → Registrations',
      '☐ Send payment reminders before deadline',
      '',
      '**Before submissions:**',
      '☐ Toggle "Submissions Open" in Settings (or activate a Phase)',
      '☐ Set submission deadline',
      '☐ Optionally set up Competition Phases for multi-round',
      '',
      '**During submissions:**',
      '☐ Send deadline reminders (24h, 6h before)',
      '☐ Monitor progress at Admin → Reports',
      '☐ Unlock submissions for teams that need corrections',
      '',
      '**Before evaluation:**',
      '☐ Assign judges (Admin → Jury Management)',
      '☐ Set evaluation criteria (Admin → Evaluations)',
      '☐ Toggle "Evaluations Open" in Settings',
      '',
      '**After evaluation:**',
      '☐ Review scores at Admin → Evaluations',
      '☐ Shortlist top teams (Admin → Shortlisting)',
      '☐ Toggle "Publish Results" in Settings',
      '☐ Post announcement with results',
      '☐ Export reports for records',
    ],
  },
]

// ─── Component ────────────────────────────────────────────────────────────────
export function AdminTutorialPage() {
  usePageSeo({ title: 'Tutorial', description: 'Admin guide for managing the hackathon.' })
  const [openIndex, setOpenIndex] = useState(-1)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return steps.map((s, i) => ({ ...s, originalIndex: i }))
    return steps
      .map((s, i) => ({ ...s, originalIndex: i }))
      .filter((s) =>
        s.title.toLowerCase().includes(q) ||
        s.tags.some((t) => t.includes(q)) ||
        s.content.some((line) => line.toLowerCase().includes(q))
      )
  }, [search])

  const toneMap = {
    brand: 'bg-brand-500 text-white',
    success: 'bg-emerald-500 text-white',
    warn: 'bg-amber-500 text-white',
    neutral: 'bg-ink-400 text-white',
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold text-ink-900">Admin Guide</h1>
            <p className="mt-0.5 text-sm text-ink-500">Everything you need to run the hackathon — in plain language</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          placeholder="Search — e.g. 'judge', 'payment', 'submission', 'phase'..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpenIndex(-1) }}
          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lifecycle overview */}
      {!search && (
        <Card className="border-brand-500/20 bg-brand-500/5">
          <h2 className="font-display text-sm font-semibold text-ink-900">How the hackathon flows</h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            {['Setup', 'Problem Statements', 'Registration', 'Payment', 'Submissions', 'Evaluation', 'Results'].map((phase, i, arr) => (
              <span key={phase} className="flex items-center gap-1.5">
                <span className="rounded-full bg-brand-500 px-2.5 py-0.5 font-semibold text-white">{phase}</span>
                {i < arr.length - 1 && <span className="text-ink-300">→</span>}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Each step below is independent — you can open submissions while registration is still running, or run multiple competition phases. Use the search above to jump to any topic.
          </p>
        </Card>
      )}

      {/* Results count when searching */}
      {search && (
        <p className="text-sm text-ink-500">
          {filtered.length === 0 ? 'No results found.' : `${filtered.length} section${filtered.length > 1 ? 's' : ''} match "${search}"`}
        </p>
      )}

      {/* Accordion */}
      <div className="space-y-2.5">
        {filtered.map((step, idx) => {
          const isOpen = openIndex === step.originalIndex
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={[
                'overflow-hidden rounded-2xl border transition-all duration-200',
                isOpen
                  ? 'border-brand-500/40 bg-[rgb(var(--surface))] shadow-md'
                  : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-brand-500/20',
              ].join(' ')}
            >
              <button
                type="button"
                className="flex w-full items-center gap-4 px-5 py-4 text-left"
                onClick={() => setOpenIndex(isOpen ? -1 : step.originalIndex)}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isOpen ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-500'}`}>
                  <step.icon className="h-4.5 w-4.5" />
                </div>
                <p className="flex-1 font-display text-sm font-semibold text-ink-900">{step.title}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneMap[step.tone]}`}>
                  {step.badge}
                </span>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                </motion.div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[rgb(var(--border))]/50 px-5 py-5 pl-[4.25rem]">
                      <div className="space-y-1.5 text-sm leading-relaxed text-ink-600">
                        {step.content.map((line, j) => {
                          if (!line) return <div key={j} className="h-2" />
                          const formatted = line
                            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-ink-900">$1</strong>')
                            .replace(/☐/g, '<span class="mr-1.5 inline-block h-3.5 w-3.5 rounded border border-ink-300 align-middle"></span>')
                          return <p key={j} dangerouslySetInnerHTML={{ __html: formatted }} />
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Footer tip */}
      {!search && (
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-3 text-xs text-ink-500">
          <strong className="text-ink-700">Tip:</strong> Use the search bar above to instantly find any topic — type "judge", "phase", "payment", "ban", "shortlist", etc.
        </div>
      )}
    </div>
  )
}
