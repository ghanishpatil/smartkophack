const base = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// ─── PERF: Simple in-memory cache for public GET requests ────────────────────
// Prevents redundant network calls when components re-mount or multiple
// components fetch the same data simultaneously.
const _cache = new Map()
const CACHE_TTL = 30_000 // 30 seconds
const CACHE_MAX_SIZE = 50 // max entries to prevent memory leaks in long-lived tabs

function getCached(key) {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL) { _cache.delete(key); return null }
  return entry.data
}

function setCache(key, data) {
  // Evict oldest entry if over capacity
  if (_cache.size >= CACHE_MAX_SIZE) {
    const oldest = _cache.keys().next().value
    _cache.delete(oldest)
  }
  _cache.set(key, { data, at: Date.now() })
}

async function cachedRequest(path) {
  const cached = getCached(path)
  if (cached) return cached
  const data = await request(path)
  setCache(path, data)
  return data
}

async function request(path, { method = 'GET', token, body, headers = {}, eventId } = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(eventId ? { 'x-sk-event-id': eventId } : {}),
    ...headers,
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers: mergedHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText
    throw new Error(msg)
  }
  return data
}

/** Unauthenticated reads — cached for 30s to prevent redundant calls. */
export const publicApi = {
  listEvents: () => cachedRequest('/api/events'),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  getEventConfig: (eventId) =>
    cachedRequest(
      `/api/event-config${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`,
    ),
  listProblemStatements: (eventId) =>
    cachedRequest(
      `/api/problem-statements${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`,
    ),
  getTimeline: (eventId) =>
    cachedRequest(
      `/api/timeline${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`,
    ),
  // Home hero slideshow — public read of admin-managed banners + settings.
  getHeroBanners: () => cachedRequest('/api/hero-banners'),
  // Challenges that "drop" to participants on a schedule — only released ones
  // are returned. Uncached so drops appear promptly.
  getChallenges: () => request('/api/challenges'),
}

export function createApi(getToken, getEventId = () => '') {
  const ev = () => getEventId() || ''

  const authReq = (path, opts = {}) =>
    getToken().then((token) => request(path, { ...opts, token, eventId: ev() }))

  return {
    ...publicApi,
    health: () => authReq('/api/health'),
    me: () => authReq('/api/users/me'),
    listUsers: () => authReq('/api/admin/users'),
    listAdminEvents: () => authReq('/api/admin/events'),
    createAdminEvent: (body) => authReq('/api/admin/events', { method: 'POST', body }),
    patchAdminEvent: (eventId, body) =>
      authReq(`/api/admin/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body }),
    getAdminEvaluationCriteria: () => authReq('/api/admin/evaluation-criteria'),
    listAuditLogs: (limit = 100) =>
      authReq(`/api/admin/audit-logs?limit=${encodeURIComponent(limit)}`),
    adminStats: () => authReq(`/api/admin/stats`),
    updateUserRole: (uid, role) =>
      authReq(`/api/admin/users/${uid}/role`, { method: 'PATCH', body: { role } }),
    banUser: (uid) =>
      authReq(`/api/admin/users/${uid}/ban`, { method: 'POST' }),
    unbanUser: (uid) =>
      authReq(`/api/admin/users/${uid}/unban`, { method: 'POST' }),
    deleteUser: (uid) =>
      authReq(`/api/admin/users/${uid}`, { method: 'DELETE' }),
    bulkDeleteUsers: (uids) =>
      authReq('/api/admin/users/bulk-delete', { method: 'POST', body: { uids } }),
    // Competition Phases
    getPhases: () => authReq('/api/admin/phases'),
    updatePhases: (phases) => authReq('/api/admin/phases', { method: 'PUT', body: { phases } }),
    transitionPhase: (phaseId, status) =>
      authReq(`/api/admin/phases/${encodeURIComponent(phaseId)}/transition`, { method: 'POST', body: { status } }),
    shortlistForPhase: (phaseId, teamIds) =>
      authReq(`/api/admin/phases/${encodeURIComponent(phaseId)}/shortlist`, { method: 'POST', body: { teamIds } }),
    unshortlistFromPhase: (phaseId, teamIds) =>
      authReq(`/api/admin/phases/${encodeURIComponent(phaseId)}/unshortlist`, { method: 'POST', body: { teamIds } }),
    updateEventConfig: (body) =>
      authReq('/api/admin/event-config', { method: 'PATCH', body }),
    assignJudgeProblems: (body) =>
      authReq('/api/admin/assign-judge-problems', { method: 'POST', body }),
    assignJudgeDomainTrack: (body) =>
      authReq('/api/admin/judges/assign-domain-track', { method: 'POST', body }),
    unassignJudgeDomainTrack: (body) =>
      authReq('/api/admin/judges/unassign-domain-track', { method: 'POST', body }),
    assignJudgeTeam: (body) =>
      authReq('/api/admin/judges/assign-team', { method: 'POST', body }),
    unassignJudgeTeam: (body) =>
      authReq('/api/admin/judges/unassign-team', { method: 'POST', body }),
    getJudgeAssignmentsOverview: () =>
      authReq('/api/admin/judges/assignments-overview'),
    recordTeamPayment: (body) =>
      authReq('/api/admin/record-team-payment', { method: 'POST', body }),
    // BUG FIX #8: Admin endpoint to manually record team registration
    recordTeamRegistration: (body) =>
      authReq('/api/admin/record-team-registration', { method: 'POST', body }),
    broadcastAnnouncement: (payload) =>
      authReq('/api/admin/announcements', { method: 'POST', body: payload }),
    listAnnouncements: () =>
      authReq('/api/admin/announcements'),
    deleteAnnouncement: (id) =>
      authReq(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    patchAnnouncement: (id, body) =>
      authReq(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    assignMentor: (payload) =>
      authReq('/api/admin/mentors/assign', { method: 'POST', body: payload }),
    unassignMentor: (payload) =>
      authReq('/api/admin/mentors/unassign', { method: 'POST', body: payload }),
    assignMentorToProblem: (payload) =>
      authReq('/api/admin/mentors/assign-problem', { method: 'POST', body: payload }),
    unassignMentorFromProblem: (payload) =>
      authReq('/api/admin/mentors/unassign-problem', { method: 'POST', body: payload }),
    assignMentorDomainTrack: (payload) =>
      authReq('/api/admin/mentors/assign-domain-track', { method: 'POST', body: payload }),
    unassignMentorDomainTrack: (payload) =>
      authReq('/api/admin/mentors/unassign-domain-track', { method: 'POST', body: payload }),
    getMentorAssignmentsOverview: () =>
      authReq('/api/admin/mentors/assignments-overview'),
    adminTeams: (opts = {}) =>
      authReq(`/api/admin/teams${opts.all ? '?all=1' : ''}`),
    // Search Pro: find any person (member/leader/judge/mentor) by name/email/phone.
    adminSearch: (q) =>
      authReq(`/api/admin/search?q=${encodeURIComponent(q)}`),
    // Per-team college + location (leader-entered) for Results/Reports filters.
    adminTeamColleges: () =>
      authReq('/api/admin/team-colleges'),
    // Email qualified teams' leaders (all when teamIds omitted, else specific).
    notifyQualifiedTeams: (teamIds) =>
      authReq('/api/admin/results/notify-qualified', {
        method: 'POST',
        body: Array.isArray(teamIds) && teamIds.length ? { teamIds } : {},
      }),
    // Send a CUSTOM email to qualified team(s) — leader + all members on record.
    // payload: { teamIds?, subject?, title?, message, link? }
    notifyQualifiedTeamsCustom: (payload = {}) =>
      authReq('/api/admin/results/notify-qualified-custom', {
        method: 'POST',
        body: payload,
      }),
    adminSubmissions: (opts = {}) =>
      authReq(`/api/admin/submissions${opts.all ? '?all=1' : ''}`),
    adminEvaluations: (opts = {}) =>
      authReq(`/api/admin/evaluations${opts.all ? '?all=1' : ''}`),
    // Admin chat monitor (read-only): all team + mentor conversations, and one thread's messages.
    adminChats: () => authReq('/api/admin/chats'),
    adminChatMessages: (type, teamId, limit = 300) =>
      authReq(`/api/admin/chats/${type}/${encodeURIComponent(teamId)}/messages?limit=${limit}`),
    deleteAdminEvaluation: (id) =>
      authReq(`/api/admin/evaluations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    // Archive the current round's evaluations and clear the live ones so a new
    // round (e.g. Finals) starts fresh. Old scores are preserved in the archive.
    archiveAdminEvaluations: (label = 'round-2') =>
      authReq('/api/admin/evaluations/archive', { method: 'POST', body: { label } }),
    listAdminArchivedEvaluations: (label = '') =>
      authReq(`/api/admin/evaluations/archived${label ? `?label=${encodeURIComponent(label)}` : ''}`),
    patchAdminTeam: (teamId, body) =>
      authReq(`/api/admin/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', body }),
    deleteAdminTeamRegistration: (teamId) =>
      authReq(`/api/admin/teams/${encodeURIComponent(teamId)}/registration`, { method: 'DELETE' }),
    deleteAdminTeam: (teamId) =>
      authReq(`/api/admin/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' }),
    // BUG FIX #6: Cleanup orphaned member registrations
    cleanupOrphanedRegistrations: (teamId) =>
      authReq(`/api/registrations/team/${encodeURIComponent(teamId)}/cleanup`, { method: 'DELETE' }),
    // BUG FIX #7: Update member registration status
    updateMemberRegistrationStatus: (registrationId, status) =>
      authReq(`/api/registrations/member/${encodeURIComponent(registrationId)}/status`, { method: 'PUT', body: { status } }),
    // BUG FIX #6: Delete single member registration
    deleteMemberRegistration: (registrationId) =>
      authReq(`/api/registrations/member/${encodeURIComponent(registrationId)}`, { method: 'DELETE' }),
    bulkOperation: (body) =>
      authReq('/api/admin/bulk-operation', { method: 'POST', body }),
    exportTeams: () => authReq('/api/admin/export/teams'),
    exportSubmissions: () => authReq('/api/admin/export/submissions'),
    patchAdminProblemStatement: (psId, body) =>
      authReq(`/api/admin/problem-statements/${encodeURIComponent(psId)}`, { method: 'PATCH', body }),
    createAdminProblemStatement: (body) => authReq('/api/admin/problem-statements', { method: 'POST', body }),
    bulkImportProblemStatements: (items, origin) =>
      authReq('/api/admin/problem-statements/bulk-import', {
        method: 'POST',
        body: { items, ...(origin ? { origin } : {}) },
      }),
    deleteAdminProblemStatement: (psId) =>
      authReq(`/api/admin/problem-statements/${encodeURIComponent(psId)}`, { method: 'DELETE' }),
    // Admin listing includes drafts + private Open Innovation entries
    listAdminProblemStatements: (eventId) =>
      authReq(`/api/admin/problem-statements${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
    // Challenges (scheduled "drops"). Schedule config is set via patchAdminEvent.
    listAdminChallenges: (eventId) =>
      authReq(`/api/admin/challenges${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`),
    createAdminChallenge: (body) => authReq('/api/admin/challenges', { method: 'POST', body }),
    patchAdminChallenge: (id, body) =>
      authReq(`/api/admin/challenges/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    deleteAdminChallenge: (id) =>
      authReq(`/api/admin/challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    bulkImportChallenges: (items) =>
      authReq('/api/admin/challenges/bulk-import', { method: 'POST', body: { items } }),
    // Finals: hand-pick finalists. Sets the dedicated `finalist` flag on teams
    // (separate from shortlisting). Per-domain target counts + the finalistsOnly
    // gate are stored on the event via patchAdminEvent (finalistsPerDomain / finalistsOnly).
    setFinalists: (teamIds, finalist) =>
      authReq('/api/admin/finalists/set', {
        method: 'POST',
        body: { teamIds: Array.isArray(teamIds) ? teamIds : [teamIds], finalist: finalist === true },
      }),
    adminSystemHealth: () => authReq('/api/admin/system-health'),
    // Security Center
    listPlatformActivity: (limit = 300) => authReq(`/api/admin/security/activity?limit=${limit}`),
    listSecurityEvents: (limit = 200) => authReq(`/api/admin/security/events?limit=${limit}`),
    listSecurityIncidents: () => authReq('/api/admin/security/incidents'),
    createSecurityIncident: (body) => authReq('/api/admin/security/incidents', { method: 'POST', body }),
    updateSecurityIncident: (id, body) => authReq(`/api/admin/security/incidents/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    listWebhookLog: (limit = 100) => authReq(`/api/admin/security/webhook-log?limit=${limit}`),
    getDuplicateTeams: () => authReq('/api/admin/security/duplicate-teams'),
    getTimeline: () => authReq('/api/timeline'),
    updateTimeline: (phases) =>
      authReq('/api/admin/timeline', { method: 'PUT', body: { phases } }),
    createTeam: (name, eventIdOverride) =>
      authReq('/api/participant/create-team', {
        method: 'POST',
        body: { name, eventId: eventIdOverride || ev() },
      }),
    // New team-formation model: leader submits all member details in one step.
    registerTeamMembers: (payload) =>
      authReq('/api/participant/register-team-members', { method: 'POST', body: payload }),
    teamMemberRegistrations: (teamId) =>
      authReq(`/api/registrations/team/${encodeURIComponent(teamId)}/members`),
    registerTeamEvent: (paymentChoice = 'now') =>
      authReq('/api/participant/register-team-event', { method: 'POST', body: { paymentChoice } }),
    createRazorpayOrder: () =>
      authReq('/api/participant/create-razorpay-order', { method: 'POST' }),
    verifyRazorpayPayment: (body) =>
      authReq('/api/participant/verify-razorpay-payment', { method: 'POST', body }),
    selectProblem: (problemStatementId) =>
      authReq('/api/participant/select-problem', {
        method: 'POST',
        body: { problemStatementId },
      }),
    // Super PS — the one-time, final finals problem-statement choice.
    // Stored separately from the round-1 selectProblem; cannot be changed once set.
    selectSuperProblem: (problemStatementId) =>
      authReq('/api/participant/select-super-problem', {
        method: 'POST',
        body: { problemStatementId },
      }),
    // Open Innovation — a team's own problem statement
    getOpenInnovation: () => authReq('/api/participant/open-innovation'),
    saveOpenInnovation: (body) =>
      authReq('/api/participant/open-innovation', { method: 'POST', body }),
    patchSubmissionMetadata: (patch) =>
      authReq('/api/participant/submission-metadata', { method: 'POST', body: { patch } }),
    finalizeSubmission: () =>
      authReq('/api/participant/finalize-submission', { method: 'POST' }),
    getSubmissionVersions: () =>
      authReq('/api/participant/submission-versions'),
    // Judges' qualitative remarks for the team — FEEDBACK ONLY, never marks.
    evaluationRemarks: () => authReq('/api/participant/evaluation-remarks'),
    judgeAssignments: () => authReq('/api/judges/assignments'),
    judgeTeamReview: (teamId) => authReq(`/api/judges/review/${encodeURIComponent(teamId)}`),
    submitEvaluation: (payload) =>
      authReq('/api/judges/evaluations', { method: 'POST', body: payload }),
    judgeSetTeamStatus: (payload) =>
      authReq('/api/judges/team-status', { method: 'POST', body: payload }),
    mentorAssignments: () => authReq('/api/mentors/assignments'),
    mentorNote: (payload) =>
      authReq('/api/mentors/notes', { method: 'POST', body: payload }),
    mentorTeamChatMessages: (teamId, limit = 50) =>
      authReq(`/api/mentors/chat/${encodeURIComponent(teamId)}/messages?limit=${limit}`),
    mentorTeamChatSend: (teamId, text, replyTo, file) =>
      authReq(`/api/mentors/chat/${encodeURIComponent(teamId)}/send`, { method: 'POST', body: {
        text,
        replyTo,
        ...(file ? { fileUrl: file.url, fileName: file.name, fileType: file.type, fileSize: file.size } : {}),
      } }),
    teamRoster: () => authReq('/api/participant/team-roster'),
    mentorChatMessages: (limit = 50) =>
      authReq(`/api/participant/mentor-chat/messages?limit=${limit}`),
    mentorChatSend: (text, replyTo, file) =>
      authReq('/api/participant/mentor-chat/send', { method: 'POST', body: {
        text,
        replyTo,
        ...(file ? { fileUrl: file.url, fileName: file.name, fileType: file.type, fileSize: file.size } : {}),
      } }),
    mentorChatUnread: () =>
      authReq('/api/participant/mentor-chat/unread'),
    mentorChatStatus: () =>
      authReq('/api/participant/mentor-chat/status'),
    mentorChatMarkRead: () =>
      authReq('/api/participant/mentor-chat/mark-read', { method: 'POST' }),
    leaveTeam: () => authReq('/api/participant/leave-team', { method: 'POST' }),
    removeTeamMember: (memberUid) =>
      authReq('/api/participant/remove-team-member', { method: 'POST', body: { memberUid } }),
    updateTeamProfile: (profile) =>
      authReq('/api/participant/update-team-profile', { method: 'POST', body: profile }),
    updateMemberDesignation: (memberUid, designation) =>
      authReq('/api/participant/update-member-designation', { method: 'POST', body: { memberUid, designation } }),
    // Feature 3: Skill tags & profile
    getMyProfile: () => authReq('/api/participant/my-profile'),
    updateMySkills: (body) =>
      authReq('/api/participant/update-my-skills', { method: 'POST', body }),
    // Feature 1: Team matchmaking
    matchmakingCandidates: (skill = '') =>
      authReq(`/api/participant/matchmaking/candidates${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`),
    matchmakingOpenTeams: () =>
      authReq('/api/participant/matchmaking/open-teams'),
    matchmakingRequestJoin: (teamId, message) =>
      authReq('/api/participant/matchmaking/request', { method: 'POST', body: { teamId, message } }),
    matchmakingMyRequests: () =>
      authReq('/api/participant/matchmaking/my-requests'),
    teamJoinRequests: () =>
      authReq('/api/participant/team-join-requests'),
    respondJoinRequest: (requestId, action) =>
      authReq(`/api/participant/team-join-requests/${encodeURIComponent(requestId)}/respond`, { method: 'POST', body: { action } }),
    // Chat
    chatInfo: () => authReq('/api/chat/info'),
    chatMessages: (limit = 50, before) =>
      authReq(`/api/chat/messages?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
    chatSend: (text, replyTo, file) =>
      authReq('/api/chat/send', { method: 'POST', body: {
        text,
        replyTo,
        ...(file ? { fileUrl: file.url, fileName: file.name, fileType: file.type, fileSize: file.size } : {}),
      } }),
    chatDeleteMessage: (messageId) =>
      authReq(`/api/chat/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
    // Admin notifications
    sendPaymentReminders: () =>
      authReq('/api/admin/send-payment-reminders', { method: 'POST' }),
    sendSubmissionReminders: (hoursLeft = 24) =>
      authReq('/api/admin/send-submission-reminders', { method: 'POST', body: { hoursLeft } }),
    adminChatbot: (message, history) =>
      authReq('/api/admin/chatbot', { method: 'POST', body: { message, history } }),
    adminTestEmail: () =>
      authReq('/api/admin/test-email', { method: 'POST' }),
    adminEmailHealth: () =>
      authReq('/api/admin/email-health'),
    // Leader onboarding (admin)
    bulkInviteParticipants: (emails) =>
      authReq('/api/admin/participants/bulk-invite', { method: 'POST', body: { emails } }),
    participantInviteStatus: () =>
      authReq('/api/admin/participants/status'),
    // Judge & mentor credential invites (admin) — same flow as leaders, diff role
    bulkInviteJudges: (emails) =>
      authReq('/api/admin/judges/bulk-invite', { method: 'POST', body: { emails } }),
    judgeInviteStatus: () =>
      authReq('/api/admin/judges/status'),
    bulkInviteMentors: (emails) =>
      authReq('/api/admin/mentors/bulk-invite', { method: 'POST', body: { emails } }),
    mentorInviteStatus: () =>
      authReq('/api/admin/mentors/status'),
    // Observer (read-only viewer) credential invites (admin)
    bulkInviteViewers: (emails) =>
      authReq('/api/admin/viewers/bulk-invite', { method: 'POST', body: { emails } }),
    viewerInviteStatus: () =>
      authReq('/api/admin/viewers/status'),
    // Registration Desk — admin management
    bulkInviteRegDesk: (emails) =>
      authReq('/api/reg-desk/invite', { method: 'POST', body: { emails } }),
    inviteRegDeskIncharge: (emails) =>
      authReq('/api/reg-desk/invite-incharge', { method: 'POST', body: { emails } }),
    assignRegDeskDomains: (uid, domains) =>
      authReq('/api/reg-desk/assign-domains', { method: 'POST', body: { uid, domains } }),
    // Registration Desk — desk + admin check-in data
    regDeskMe: () => authReq('/api/reg-desk/me'),
    regDeskTeams: (deskUid) => authReq(`/api/reg-desk/teams${deskUid ? `?deskUid=${encodeURIComponent(deskUid)}` : ''}`),
    regDeskStats: () => authReq('/api/reg-desk/stats'),
    regDeskAnalytics: () => authReq('/api/reg-desk/analytics'),
    regDeskMarkMember: (memberId, present) =>
      authReq('/api/reg-desk/attendance', { method: 'POST', body: { memberId, present } }),
    regDeskMarkTeam: (teamId, present) =>
      authReq('/api/reg-desk/attendance/team', { method: 'POST', body: { teamId, present } }),
    // Export attendance as CSV. Pass a deskUid (admin only) for a desk-wise export.
    regDeskExportAttendance: async (deskUid) => {
      const token = await getToken()
      const eventId = getEventId()
      const params = new URLSearchParams()
      if (eventId) params.append('eventId', eventId)
      if (deskUid) params.append('deskUid', deskUid)
      const url = `${base}/api/reg-desk/export${params.toString() ? `?${params}` : ''}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Export failed')
      return await response.blob()
    },
    regDeskClearAttendance: () =>
      authReq('/api/reg-desk/attendance/clear', { method: 'DELETE' }),
    // Hero slideshow settings (banners are uploaded via multipart in the page)
    updateHeroSettings: (body) =>
      authReq('/api/hero-banners/settings', { method: 'PUT', body }),
    sendResetLink: (email) =>
      authReq('/api/admin/participants/send-reset-link', { method: 'POST', body: { email } }),
    // First-login password change (participant)
    requestPasswordOtp: () =>
      authReq('/api/participant/password/request-otp', { method: 'POST' }),
    changePasswordWithOtp: (otp, newPassword) =>
      authReq('/api/participant/password/change', { method: 'POST', body: { otp, newPassword } }),
  }
}
