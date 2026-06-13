/**
 * Canonical phase-status helpers for the client.
 *
 * These MUST stay in sync with the backend service
 * (backend/services/competitionPhases.js: getActivePhase / isPhaseSubmissionOpen).
 * Keeping the logic in one place prevents the drift that previously caused the
 * "submissions open but uploads blocked" bug.
 */

/**
 * Returns the currently active phase from a list of competition phases.
 *  - A phase manually set to ACTIVE takes priority.
 *  - Otherwise a phase still in UPCOMING status auto-activates once the current
 *    time is within its [startDate, deadline] window (date-driven activation).
 * Returns null when no phase qualifies.
 */
export function getActivePhase(phases, now = Date.now()) {
  const list = Array.isArray(phases) ? phases : []
  const manual = list.find((p) => p?.status === 'ACTIVE')
  if (manual) return manual
  for (const p of list) {
    if (p?.status !== 'UPCOMING') continue
    const start = p.startDate ? new Date(p.startDate).getTime() : null
    const end = p.deadline ? new Date(p.deadline).getTime() : null
    if (start != null && now >= start && (end == null || now <= end)) return p
  }
  return null
}

/**
 * Whether a phase is open for submissions right now.
 *  - status ACTIVE (respecting deadline), OR
 *  - status UPCOMING inside its [startDate, deadline] window.
 */
export function isPhaseSubmissionOpen(phase, now = Date.now()) {
  if (!phase) return false
  const start = phase.startDate ? new Date(phase.startDate).getTime() : null
  const end = phase.deadline ? new Date(phase.deadline).getTime() : null
  if (phase.status === 'ACTIVE') return end == null || now <= end
  if (phase.status === 'UPCOMING') {
    return start != null && now >= start && (end == null || now <= end)
  }
  return false
}
