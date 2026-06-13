import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PublicLayout } from '@/layouts/PublicLayout.jsx'
import { DashboardLayout } from '@/layouts/DashboardLayout.jsx'
import { ProtectedRoute } from '@/routes/ProtectedRoute.jsx'
import { LandingPage } from '@/pages/LandingPage.jsx'
import { AboutPage } from '@/pages/AboutPage.jsx'
import { ProblemsPage } from '@/pages/ProblemsPage.jsx'
import { ContactPage } from '@/pages/ContactPage.jsx'
import { AuthPage } from '@/pages/AuthPage.jsx'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage.jsx'
import { TeamPage } from '@/pages/TeamPage.jsx'
import { JoinTeamPage } from '@/pages/JoinTeamPage.jsx'
import { TimelinePage } from '@/pages/TimelinePage.jsx'
import { SponsorsPage } from '@/pages/SponsorsPage.jsx'
import { FAQPage } from '@/pages/FAQPage.jsx'
import { ResultsPage } from '@/pages/ResultsPage.jsx'
import { GuidelinesPage } from '@/pages/GuidelinesPage.jsx'
import { CodeOfConductPage } from '@/pages/CodeOfConductPage.jsx'
import { NotFoundPage } from '@/pages/NotFoundPage.jsx'
import { AuthActionPage } from '@/pages/AuthActionPage.jsx'
import { ROLES } from '@/utils/roles.js'

const ParticipantHomePage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantHomePage.jsx').then((m) => ({ default: m.ParticipantHomePage })),
)
const ParticipantTeamPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantTeamPage.jsx').then((m) => ({ default: m.ParticipantTeamPage })),
)
const ParticipantRegistrationPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantRegistrationPage.jsx').then((m) => ({
    default: m.ParticipantRegistrationPage,
  })),
)
const ParticipantProblemsPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantProblemsPage.jsx').then((m) => ({ default: m.ParticipantProblemsPage })),
)
const ParticipantAnnouncementsPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantAnnouncementsPage.jsx').then((m) => ({
    default: m.ParticipantAnnouncementsPage,
  })),
)
const ParticipantSettingsPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantSettingsPage.jsx').then((m) => ({ default: m.ParticipantSettingsPage })),
)
const ParticipantChatPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantChatPage.jsx').then((m) => ({ default: m.ParticipantChatPage })),
)
const ParticipantMentorChatPage = lazy(() =>
  import('@/pages/dashboard/participant/ParticipantMentorChatPage.jsx').then((m) => ({ default: m.ParticipantMentorChatPage })),
)
const AdminOverviewPage = lazy(() =>
  import('@/pages/admin/AdminOverviewPage.jsx').then((m) => ({ default: m.AdminOverviewPage })),
)
const AdminRegistrationsPage = lazy(() =>
  import('@/pages/admin/AdminRegistrationsPage.jsx').then((m) => ({ default: m.AdminRegistrationsPage })),
)
const AdminTeamRegistrationsPage = lazy(() =>
  import('@/pages/admin/AdminTeamRegistrationsPage.jsx').then((m) => ({ default: m.AdminTeamRegistrationsPage })),
)
const AdminTeamsPage = lazy(() =>
  import('@/pages/admin/AdminTeamsPage.jsx').then((m) => ({ default: m.AdminTeamsPage })),
)
const AdminPaymentsPage = lazy(() =>
  import('@/pages/admin/AdminPaymentsPage.jsx').then((m) => ({ default: m.AdminPaymentsPage })),
)
const AdminProblemsPage = lazy(() =>
  import('@/pages/admin/AdminProblemsPage.jsx').then((m) => ({ default: m.AdminProblemsPage })),
)
const AdminSubmissionsPage = lazy(() =>
  import('@/pages/admin/AdminSubmissionsPage.jsx').then((m) => ({ default: m.AdminSubmissionsPage })),
)
const AdminJuryPage = lazy(() =>
  import('@/pages/admin/AdminJuryPage.jsx').then((m) => ({ default: m.AdminJuryPage })),
)
const AdminMentorsPage = lazy(() =>
  import('@/pages/admin/AdminMentorsPage.jsx').then((m) => ({ default: m.AdminMentorsPage })),
)
const AdminEvaluationsPage = lazy(() =>
  import('@/pages/admin/AdminEvaluationsPage.jsx').then((m) => ({ default: m.AdminEvaluationsPage })),
)
const AdminShortlistingPage = lazy(() =>
  import('@/pages/admin/AdminShortlistingPage.jsx').then((m) => ({ default: m.AdminShortlistingPage })),
)
const AdminPhasesPage = lazy(() =>
  import('@/pages/admin/AdminPhasesPage.jsx').then((m) => ({ default: m.AdminPhasesPage })),
)
const AdminAnnouncementsPage = lazy(() =>
  import('@/pages/admin/AdminAnnouncementsPage.jsx').then((m) => ({ default: m.AdminAnnouncementsPage })),
)
const AdminReportsPage = lazy(() =>
  import('@/pages/admin/AdminReportsPage.jsx').then((m) => ({ default: m.AdminReportsPage })),
)
const AdminAccessPage = lazy(() =>
  import('@/pages/admin/AdminAccessPage.jsx').then((m) => ({ default: m.AdminAccessPage })),
)
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage.jsx').then((m) => ({ default: m.AdminUsersPage })),
)
const AdminAuditPage = lazy(() =>
  import('@/pages/admin/AdminAuditPage.jsx').then((m) => ({ default: m.AdminAuditPage })),
)
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage.jsx').then((m) => ({ default: m.AdminSettingsPage })),
)
const AdminHealthPage = lazy(() =>
  import('@/pages/admin/AdminHealthPage.jsx').then((m) => ({ default: m.AdminHealthPage })),
)
const AdminSecurityPage = lazy(() =>
  import('@/pages/admin/AdminSecurityPage.jsx').then((m) => ({ default: m.AdminSecurityPage })),
)
const AdminTutorialPage = lazy(() =>
  import('@/pages/admin/AdminTutorialPage.jsx').then((m) => ({ default: m.AdminTutorialPage })),
)
const AdminTimelinePage = lazy(() =>
  import('@/pages/admin/AdminTimelinePage.jsx').then((m) => ({ default: m.AdminTimelinePage })),
)
const AdminSponsorsPage = lazy(() =>
  import('@/pages/admin/AdminSponsorsPage.jsx').then((m) => ({ default: m.AdminSponsorsPage })),
)
const JudgeHomePage = lazy(() => import('@/pages/jury/JudgeHomePage.jsx').then((m) => ({ default: m.JudgeHomePage })))
const JudgeAssignmentsPage = lazy(() =>
  import('@/pages/jury/JudgeAssignmentsPage.jsx').then((m) => ({ default: m.JudgeAssignmentsPage })),
)
const JudgeEvaluateListPage = lazy(() =>
  import('@/pages/jury/JudgeEvaluateListPage.jsx').then((m) => ({ default: m.JudgeEvaluateListPage })),
)
const JudgeTeamReviewPage = lazy(() =>
  import('@/pages/jury/JudgeTeamReviewPage.jsx').then((m) => ({ default: m.JudgeTeamReviewPage })),
)
const JudgeProgressPage = lazy(() => import('@/pages/jury/JudgeProgressPage.jsx').then((m) => ({ default: m.JudgeProgressPage })))
const JudgeAnnouncementsPage = lazy(() =>
  import('@/pages/jury/JudgeAnnouncementsPage.jsx').then((m) => ({ default: m.JudgeAnnouncementsPage })),
)
const JudgeNotificationsPage = lazy(() =>
  import('@/pages/jury/JudgeNotificationsPage.jsx').then((m) => ({ default: m.JudgeNotificationsPage })),
)
const JudgeAccountPage = lazy(() => import('@/pages/jury/JudgeAccountPage.jsx').then((m) => ({ default: m.JudgeAccountPage })))
const MentorDashboard = lazy(() =>
  import('@/pages/dashboard/MentorDashboard.jsx').then((m) => ({ default: m.MentorDashboard })),
)
const MentorChatPage = lazy(() =>
  import('@/pages/dashboard/MentorChatPage.jsx').then((m) => ({ default: m.MentorChatPage })),
)
const SubmissionPage = lazy(() =>
  import('@/pages/SubmissionPage.jsx').then((m) => ({ default: m.SubmissionPage })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  )
}

const pageTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.12 },
}

function AnimatedOutlet({ children }) {
  return (
    <motion.div {...pageTransition} className="min-h-[60vh]">
      {children}
    </motion.div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={
              <AnimatedOutlet>
                <LandingPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/about"
            element={
              <AnimatedOutlet>
                <AboutPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/problems"
            element={
              <AnimatedOutlet>
                <ProblemsPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/contact"
            element={
              <AnimatedOutlet>
                <ContactPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/announcements"
            element={
              <AnimatedOutlet>
                <AnnouncementsPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/timeline"
            element={
              <AnimatedOutlet>
                <TimelinePage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/sponsors"
            element={
              <AnimatedOutlet>
                <SponsorsPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/faq"
            element={
              <AnimatedOutlet>
                <FAQPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/results"
            element={
              <AnimatedOutlet>
                <ResultsPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/guidelines"
            element={
              <AnimatedOutlet>
                <GuidelinesPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/code-of-conduct"
            element={
              <AnimatedOutlet>
                <CodeOfConductPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/team"
            element={
              <AnimatedOutlet>
                <TeamPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/auth"
            element={
              <AnimatedOutlet>
                <AuthPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/auth/action"
            element={
              <AnimatedOutlet>
                <AuthActionPage />
              </AnimatedOutlet>
            }
          />
          <Route
            path="/join/:inviteCode"
            element={
              <AnimatedOutlet>
                <JoinTeamPage />
              </AnimatedOutlet>
            }
          />
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.PARTICIPANT]} />}>
          <Route element={<DashboardLayout variant="participant" />}>
            <Route path="/dashboard" element={<ParticipantHomePage />} />
            <Route path="/dashboard/team" element={<ParticipantTeamPage />} />
            <Route path="/dashboard/registration" element={<ParticipantRegistrationPage />} />
            <Route path="/dashboard/problems" element={<ParticipantProblemsPage />} />
            <Route path="/dashboard/submission" element={<SubmissionPage />} />
            <Route path="/dashboard/chat" element={<ParticipantChatPage />} />
            <Route path="/dashboard/mentor-chat" element={<ParticipantMentorChatPage />} />
            <Route path="/dashboard/announcements" element={<ParticipantAnnouncementsPage />} />
            <Route path="/dashboard/settings" element={<ParticipantSettingsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.ADMIN]} />}>
          <Route element={<DashboardLayout variant="admin" />}>
            <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
            <Route path="/admin/overview" element={<AdminOverviewPage />} />
            <Route path="/admin/events" element={<Navigate to="/admin/problems" replace />} />
            <Route path="/admin/registrations" element={<AdminTeamRegistrationsPage />} />
            <Route path="/admin/registrations-old" element={<AdminRegistrationsPage />} />
            <Route path="/admin/teams" element={<AdminTeamsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/problems" element={<AdminProblemsPage />} />
            <Route path="/admin/submissions" element={<AdminSubmissionsPage />} />
            <Route path="/admin/jury" element={<AdminJuryPage />} />
            <Route path="/admin/mentors" element={<AdminMentorsPage />} />
            <Route path="/admin/evaluations" element={<AdminEvaluationsPage />} />
            <Route path="/admin/shortlisting" element={<AdminShortlistingPage />} />
            <Route path="/admin/phases" element={<AdminPhasesPage />} />
            <Route path="/admin/announcements" element={<AdminAnnouncementsPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/access" element={<AdminAccessPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/admin/timeline" element={<AdminTimelinePage />} />
            <Route path="/admin/sponsors" element={<AdminSponsorsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
            <Route path="/admin/health" element={<AdminHealthPage />} />
            <Route path="/admin/security" element={<AdminSecurityPage />} />
            <Route path="/admin/tutorial" element={<AdminTutorialPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.JUDGE]} />}>
          <Route element={<DashboardLayout variant="judge" />}>
            <Route path="/judge" element={<Navigate to="/judge/home" replace />} />
            <Route path="/judge/home" element={<JudgeHomePage />} />
            <Route path="/judge/assignments" element={<JudgeAssignmentsPage />} />
            <Route path="/judge/evaluate" element={<JudgeEvaluateListPage />} />
            <Route path="/judge/evaluate/:teamId" element={<JudgeTeamReviewPage />} />
            <Route path="/judge/progress" element={<JudgeProgressPage />} />
            <Route path="/judge/announcements" element={<JudgeAnnouncementsPage />} />
            <Route path="/judge/notifications" element={<JudgeNotificationsPage />} />
            <Route path="/judge/account" element={<JudgeAccountPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={[ROLES.MENTOR]} />}>
          <Route element={<DashboardLayout variant="mentor" />}>
            <Route path="/mentor" element={<MentorDashboard />} />
            <Route path="/mentor/chat" element={<MentorChatPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
