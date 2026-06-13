/** 
 * Simplified event lifecycle using independent boolean flags instead of rigid phases.
 * This allows flexible control - admin can enable/disable features independently.
 */

/** @deprecated Legacy phases kept for backward compatibility */
export const LIFECYCLE_PHASES = [
  'DRAFT',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'SUBMISSION_OPEN',
  'SUBMISSION_LOCKED',
  'EVALUATION',
  'RESULTS_PUBLISHED',
  'ARCHIVED',
]

/** @deprecated Use flag-based checks instead */
export function isValidLifecyclePhase(p) {
  return typeof p === 'string' && LIFECYCLE_PHASES.includes(p)
}

function tsMs(ts) {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate().getTime()
  if (ts instanceof Date) return ts.getTime()
  return null
}

/** Check if registration window is open based on timestamps.
 * In multi-phase mode, uses Phase 1 deadline instead of legacy registrationClosesAt
 */
function registrationTimestampsOk(eventDoc, now) {
  const opens = tsMs(eventDoc.registrationOpensAt)
  if (opens != null && opens > now) return false
  
  // Check for closing timestamp
  // Priority: explicit registrationClosesAt > Phase 1 deadline (fallback only)
  let closes = tsMs(eventDoc.registrationClosesAt)
  
  if (closes == null) {
    // Fallback: use Phase 1 deadline only if no explicit close date is set
    const phases = Array.isArray(eventDoc.competitionPhases) ? eventDoc.competitionPhases : []
    const phase1 = phases.find(p => p.order === 1)
    if (phase1?.deadline) {
      closes = new Date(phase1.deadline).getTime()
    }
  }
  
  if (closes != null && closes < now) return false
  return true
}

/** Check if submission deadline has passed */
function submissionDeadlinePassed(eventDoc, now) {
  const deadline = tsMs(eventDoc.submissionDeadline)
  return deadline != null && deadline < now
}

/** 
 * Get event status flags (new simplified system)
 * These flags are independent and can be controlled separately by admin
 */
export function getEventFlags(eventDoc, now = Date.now()) {
  if (!eventDoc) {
    return {
      registrationOpen: false,
      submissionsOpen: false,
      evaluationsOpen: false,
      resultsPublished: false,
    }
  }

  // Check explicit flags first (new system)
  const hasExplicitFlags = 
    typeof eventDoc.registrationOpen === 'boolean' ||
    typeof eventDoc.submissionsOpen === 'boolean' ||
    typeof eventDoc.evaluationsOpen === 'boolean'

  if (hasExplicitFlags) {
    // Use explicit flags with timestamp validation
    const regOpen = Boolean(eventDoc.registrationOpen) && registrationTimestampsOk(eventDoc, now)
    const subOpen = Boolean(eventDoc.submissionsOpen) && !submissionDeadlinePassed(eventDoc, now)
    
    return {
      registrationOpen: regOpen,
      submissionsOpen: subOpen,
      evaluationsOpen: Boolean(eventDoc.evaluationsOpen),
      resultsPublished: Boolean(eventDoc.resultsPublished),
    }
  }

  // Fallback: Infer from legacy lifecyclePhase
  const phase = eventDoc.lifecyclePhase || 'REGISTRATION_OPEN'
  
  return {
    registrationOpen: phase === 'REGISTRATION_OPEN' && registrationTimestampsOk(eventDoc, now),
    submissionsOpen: phase === 'SUBMISSION_OPEN' && !submissionDeadlinePassed(eventDoc, now),
    evaluationsOpen: phase === 'EVALUATION',
    resultsPublished: phase === 'RESULTS_PUBLISHED' || phase === 'ARCHIVED',
  }
}

/** @deprecated Use getEventFlags() instead */
export function effectivePhase(eventDoc) {
  if (!eventDoc) return 'REGISTRATION_OPEN'
  if (eventDoc.lifecyclePhase && isValidLifecyclePhase(eventDoc.lifecyclePhase)) {
    return eventDoc.lifecyclePhase
  }
  
  // Infer phase from flags if available
  const flags = getEventFlags(eventDoc)
  if (flags.resultsPublished) return 'RESULTS_PUBLISHED'
  if (flags.evaluationsOpen) return 'EVALUATION'
  if (flags.submissionsOpen) return 'SUBMISSION_OPEN'
  if (flags.registrationOpen) return 'REGISTRATION_OPEN'
  return 'REGISTRATION_CLOSED'
}

/** @deprecated Legacy function kept for backward compatibility */
export function inferLegacyLifecyclePhase(d, now = Date.now()) {
  const flags = getEventFlags(d, now)
  if (flags.resultsPublished) return 'RESULTS_PUBLISHED'
  if (flags.evaluationsOpen) return 'EVALUATION'
  if (flags.submissionsOpen) return 'SUBMISSION_OPEN'
  if (flags.registrationOpen) return 'REGISTRATION_OPEN'
  return 'REGISTRATION_CLOSED'
}

/** Check if team can register for event */
export function allowRegisterTeamForEvent(eventDoc, now = Date.now()) {
  const flags = getEventFlags(eventDoc, now)
  
  if (!flags.registrationOpen) {
    return { ok: false, reason: 'Event registration is not open.' }
  }
  
  if (!registrationTimestampsOk(eventDoc, now)) {
    return { ok: false, reason: 'Registration window is closed by schedule.' }
  }
  
  return { ok: true }
}

/** Check if team formation is allowed.
 * MED-08: Decoupled from allowRegisterTeamForEvent — team formation (creating/joining)
 * should be allowed as long as the event is active, even before registration opens.
 * This lets participants form teams early and register when the window opens.
 * 
 * FIXED: Now supports multi-phase system - checks if any phase is active or upcoming
 */
export function allowTeamFormation(eventDoc, now = Date.now()) {
  if (!eventDoc) return { ok: false, reason: 'Event configuration not available.' }

  // Block if event is archived or results published (hackathon concluded)
  const phase = eventDoc.lifecyclePhase || ''
  if (phase === 'ARCHIVED') {
    return { ok: false, reason: 'The hackathon has concluded. Team formation is closed.' }
  }

  // Check if using multi-phase system
  const phases = Array.isArray(eventDoc.competitionPhases) ? eventDoc.competitionPhases : []
  if (phases.length > 0) {
    // Multi-phase mode: allow team formation if any phase is not yet completed/archived
    const hasActiveOrUpcomingPhase = phases.some(p => 
      ['DRAFT', 'UPCOMING', 'ACTIVE', 'SUBMISSION_LOCKED', 'EVALUATION', 'SHORTLISTING'].includes(p.status)
    )
    
    if (!hasActiveOrUpcomingPhase) {
      return { ok: false, reason: 'All competition phases have concluded. Team formation is closed.' }
    }
    
    // Allow team formation during active phases
    return { ok: true }
  }

  // Legacy system: Block if submission deadline has passed (no point forming teams)
  const deadline = tsMs(eventDoc.submissionDeadline)
  if (deadline && deadline < now) {
    return { ok: false, reason: 'Submission deadline has passed. Team formation is closed.' }
  }

  return { ok: true }
}

/** Check if problem selection is allowed */
export function allowSelectProblem(eventDoc, now = Date.now()) {
  const flags = getEventFlags(eventDoc, now)
  
  // Allow during registration or submission phases
  if (!flags.registrationOpen && !flags.submissionsOpen) {
    return { ok: false, reason: 'Problem selection is not allowed at this time.' }
  }
  
  // Check timestamps
  if (flags.registrationOpen && !registrationTimestampsOk(eventDoc, now)) {
    return { ok: false, reason: 'Registration window is closed by schedule.' }
  }
  
  if (flags.submissionsOpen && submissionDeadlinePassed(eventDoc, now)) {
    return { ok: false, reason: 'Submission deadline has passed.' }
  }
  
  return { ok: true }
}

/** Check if submission editing is allowed */
export function submissionEditingAllowed(eventDoc, team, now = Date.now()) {
  const flags = getEventFlags(eventDoc, now)
  
  if (!flags.submissionsOpen) {
    return { ok: false, reason: 'Submissions are not open.' }
  }
  
  if (team?.submissionLocked) {
    return { ok: false, reason: 'Submission is finalized and locked for your team.' }
  }
  
  if (submissionDeadlinePassed(eventDoc, now)) {
    return { ok: false, reason: 'Submission deadline has passed.' }
  }
  
  return { ok: true }
}

/** Check if judge evaluations are allowed (NEW: Independent flag!) */
export function evaluationPhaseAllowsJudge(eventDoc) {
  const flags = getEventFlags(eventDoc)
  return flags.evaluationsOpen
}

/** Check if payment/fee settlement is allowed */
export function allowFeeSettlement(eventDoc, now = Date.now()) {
  const flags = getEventFlags(eventDoc, now)
  
  // Allow payment during registration (before deadline)
  if (flags.registrationOpen) {
    const regTimestampsOk = registrationTimestampsOk(eventDoc, now)
    if (!regTimestampsOk) {
      return { ok: false, reason: 'Registration window is closed. Payment deadline has passed.' }
    }
    return { ok: true }
  }
  
  // Also allow during submission phase (teams can pay late)
  if (flags.submissionsOpen) {
    return { ok: true }
  }
  
  return { ok: false, reason: 'Payment window is closed.' }
}
