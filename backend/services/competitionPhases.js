/**
 * Competition Phases Service — Multi-Phase Hackathon Orchestration
 * 
 * Phase state machine:
 *   DRAFT → UPCOMING → ACTIVE → SUBMISSION_LOCKED → EVALUATION → SHORTLISTING → COMPLETED → ARCHIVED
 * 
 * Phase data structure (events/{eventId}.competitionPhases):
 * {
 *   id: 'phase-1',
 *   name: 'Phase 1: Idea Pitch',
 *   description: 'Submit your initial idea presentation',
 *   order: 1,
 *   status: 'ACTIVE',           // state machine
 *   deadline: ISO string,
 *   requirements: { pptRequired, pdfRequired, videoRequired, githubRequired, deployedUrlRequired },
 *   evaluationCriteria: [{ key, label, maxScore, hint, weight }]  // per-phase rubric
 * }
 */

export const PHASE_STATES = {
  DRAFT: 'DRAFT',                       // Admin only, hidden from participants
  UPCOMING: 'UPCOMING',                 // Visible to participants, not started yet
  ACTIVE: 'ACTIVE',                     // Live — submissions open
  SUBMISSION_LOCKED: 'SUBMISSION_LOCKED', // Deadline passed, no more submissions
  EVALUATION: 'EVALUATION',             // Judges actively scoring
  SHORTLISTING: 'SHORTLISTING',         // Admin reviewing, advancing teams
  COMPLETED: 'COMPLETED',               // Phase done, results published
  ARCHIVED: 'ARCHIVED',                 // Hidden from main view
}

/** Valid state transitions (state machine) */
export const PHASE_TRANSITIONS = {
  DRAFT: ['UPCOMING', 'ARCHIVED'],
  UPCOMING: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  ACTIVE: ['SUBMISSION_LOCKED', 'UPCOMING'],
  SUBMISSION_LOCKED: ['EVALUATION', 'ACTIVE'],
  EVALUATION: ['SHORTLISTING', 'SUBMISSION_LOCKED'],
  SHORTLISTING: ['COMPLETED', 'EVALUATION'],
  COMPLETED: ['ARCHIVED', 'SHORTLISTING'],
  ARCHIVED: ['DRAFT'],
}

const ALLOWED_REQUIREMENTS = ['pptRequired', 'pdfRequired', 'videoRequired', 'githubRequired', 'deployedUrlRequired']

export function getPhases(eventData) {
  if (!eventData?.competitionPhases || !Array.isArray(eventData.competitionPhases)) return []
  return [...eventData.competitionPhases].sort((a, b) => (a.order || 0) - (b.order || 0))
}

/** 
 * Get the active phase — DATE-DRIVEN with manual override.
 * A phase is "active" if:
 * 1. Status is explicitly ACTIVE (manual override), OR
 * 2. Current time is between startDate and deadline AND status allows participation
 *    (only UPCOMING phases auto-activate by date; DRAFT/ARCHIVED/LOCKED phases never auto-activate)
 */
export function getActivePhase(eventData) {
  const phases = getPhases(eventData)
  // Manual override takes priority
  const manualActive = phases.find((p) => p.status === PHASE_STATES.ACTIVE)
  if (manualActive) return manualActive

  // Auto-detect from dates: only phases in UPCOMING status can auto-activate
  // DRAFT, ARCHIVED, SUBMISSION_LOCKED, EVALUATION, SHORTLISTING, COMPLETED are never auto-activated
  const now = Date.now()
  for (const phase of phases) {
    if (phase.status !== PHASE_STATES.UPCOMING) continue
    const start = phase.startDate ? new Date(phase.startDate).getTime() : null
    const end = phase.deadline ? new Date(phase.deadline).getTime() : null
    if (start && now >= start && (!end || now <= end)) {
      return phase
    }
  }

  return null
}

/** Get the phase currently in evaluation/shortlisting */
export function getEvaluationPhase(eventData) {
  const phases = getPhases(eventData)
  return phases.find((p) =>
    p.status === PHASE_STATES.EVALUATION || p.status === PHASE_STATES.SHORTLISTING
  ) || null
}

export function getPhaseById(eventData, phaseId) {
  return getPhases(eventData).find((p) => p.id === phaseId) || null
}

/**
 * Returns true if a phase is open for submissions based on status + dates.
 * This MUST stay consistent with getActivePhase():
 *   - A phase manually set to ACTIVE is open.
 *   - A phase still in UPCOMING status auto-opens once the current time is
 *     within its [startDate, deadline] window (date-driven activation).
 * Once a phase is SUBMISSION_LOCKED, EVALUATION, etc. it is never open,
 * regardless of dates.
 */
export function isPhaseSubmissionOpen(phase, now = Date.now()) {
  if (!phase) return false
  const start = phase.startDate ? new Date(phase.startDate).getTime() : null
  const end = phase.deadline ? new Date(phase.deadline).getTime() : null

  const isManualActive = phase.status === PHASE_STATES.ACTIVE
  const isDateDrivenActive =
    phase.status === PHASE_STATES.UPCOMING &&
    start != null && now >= start &&
    (end == null || now <= end)

  if (!isManualActive && !isDateDrivenActive) return false

  // Respect the deadline even when the phase is manually ACTIVE.
  if (end && now > end) return false

  return true
}

/**
 * Whether a phase actually accepts file submissions. A phase with no required
 * artifacts (e.g. "Problem Statements Live & Registration Opens") is a
 * registration/informational phase — teams cannot submit to it, even while it
 * is the active phase.
 */
export function phaseAcceptsSubmissions(phase) {
  const req = phase?.requirements || {}
  return ALLOWED_REQUIREMENTS.some((k) => Boolean(req[k]))
}

/** Check if a team can submit to a specific phase */
export function canTeamSubmit(team, phase) {
  if (!team || !phase) return false

  // Phase must be open for submissions (status ACTIVE, or date-driven UPCOMING).
  // BUGFIX: previously this required status === 'ACTIVE' only, which blocked
  // submissions during date-driven phases that getActivePhase() reports as active.
  if (!isPhaseSubmissionOpen(phase)) return false

  // A phase that requires no artifacts is not a submission phase — block it.
  if (!phaseAcceptsSubmissions(phase)) return false

  // First phase is open to all registered teams
  if (phase.order === 1) return true
  // Subsequent phases require shortlisting
  const shortlisted = team.shortlistedPhases || []
  return Array.isArray(shortlisted) && shortlisted.includes(phase.id)
}

/** Check if a phase is visible to participants (not DRAFT or ARCHIVED) */
export function isPhaseVisible(phase) {
  return phase && ![PHASE_STATES.DRAFT, PHASE_STATES.ARCHIVED].includes(phase.status)
}

/** Check if judges can evaluate this phase */
export function canEvaluatePhase(phase) {
  return phase && [PHASE_STATES.EVALUATION, PHASE_STATES.SHORTLISTING].includes(phase.status)
}

/** Get team's progression status for a specific phase */
export function getTeamPhaseProgress(team, phase, allPhases) {
  if (!team || !phase) return 'locked'

  const shortlisted = team.shortlistedPhases || []
  const isFirstPhase = phase.order === 1
  const eligibleForPhase = isFirstPhase || shortlisted.includes(phase.id)

  // Hidden phases
  if (phase.status === PHASE_STATES.DRAFT || phase.status === PHASE_STATES.ARCHIVED) {
    return 'locked'
  }

  // Future phase, team not yet eligible
  if (phase.status === PHASE_STATES.UPCOMING) {
    return eligibleForPhase ? 'upcoming' : 'locked'
  }

  // Currently active
  if (phase.status === PHASE_STATES.ACTIVE) {
    if (!eligibleForPhase) return 'locked'
    return 'in-progress'
  }

  // Locked / Evaluation / Shortlisting — team participated
  if ([PHASE_STATES.SUBMISSION_LOCKED, PHASE_STATES.EVALUATION, PHASE_STATES.SHORTLISTING].includes(phase.status)) {
    if (!eligibleForPhase) return 'locked'
    return 'under-review'
  }

  // Completed phase
  if (phase.status === PHASE_STATES.COMPLETED) {
    if (!eligibleForPhase) return 'eliminated'
    // Check if team advanced to next phase
    const nextPhase = allPhases.find((p) => p.order === phase.order + 1)
    if (nextPhase && shortlisted.includes(nextPhase.id)) {
      return 'qualified'
    }
    return 'eliminated'
  }

  return 'locked'
}

/** Validate phase requirements against submitted artifacts */
export function validatePhaseSubmission(phase, artifacts) {
  if (!phase) return { ok: false, reason: 'No active phase.' }
  const req = phase.requirements || {}
  const missing = []
  if (req.pptRequired && !artifacts?.pptUrl) missing.push('PPT')
  if (req.pdfRequired && !artifacts?.pdfUrl) missing.push('PDF')
  if (req.videoRequired && !artifacts?.videoUrl) missing.push('Video')
  if (req.githubRequired && !artifacts?.githubUrl) missing.push('GitHub')
  if (req.deployedUrlRequired && !artifacts?.deployedUrl) missing.push('Deployed URL')
  if (missing.length > 0) {
    return { ok: false, reason: `Missing required artifacts: ${missing.join(', ')}` }
  }
  return { ok: true }
}

/** Validate state transition */
export function canTransition(fromStatus, toStatus) {
  if (!fromStatus) return toStatus === PHASE_STATES.DRAFT
  const allowed = PHASE_TRANSITIONS[fromStatus] || []
  return allowed.includes(toStatus)
}

/** Sanitize and validate a phase object */
export function normalizePhase(input, existingId = null) {
  if (!input || typeof input !== 'object') throw new Error('Phase data required')

  const id = String(input.id || existingId || `phase-${Date.now()}`).trim().slice(0, 50)
  const name = String(input.name || '').trim().slice(0, 100)
  if (!name) throw new Error('Phase name is required')

  const status = Object.values(PHASE_STATES).includes(input.status) ? input.status : PHASE_STATES.DRAFT

  const normalized = {
    id,
    name,
    description: String(input.description || '').trim().slice(0, 500),
    order: typeof input.order === 'number' ? Math.floor(input.order) : 1,
    status,
    startDate: typeof input.startDate === 'string' ? input.startDate : null,
    deadline: typeof input.deadline === 'string' ? input.deadline : null,
    requirements: {},
    evaluationCriteria: [],
    // Two-part ("50:50 Finals") scoring — see backend/utils/evaluationScores.js
    // for how these fields are resolved and applied at score time.
    scoringMode: input.scoringMode === 'twoPart' ? 'twoPart' : 'single',
    evaluationCriteriaA: [],
    evaluationCriteriaB: [],
    partAWeight: 50,
    partBWeight: 50,
    partALabel: 'Part A',
    partBLabel: 'Part B',
  }

  for (const key of ALLOWED_REQUIREMENTS) {
    normalized.requirements[key] = Boolean(input.requirements?.[key])
  }

  function normalizeCriterionRow(c) {
    return {
      key: String(c.key || c.label).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30),
      label: String(c.label).trim().slice(0, 100),
      maxScore: typeof c.maxScore === 'number' && c.maxScore > 0 ? Math.min(100, Math.floor(c.maxScore)) : 10,
      hint: c.hint ? String(c.hint).trim().slice(0, 200) : '',
      weight: typeof c.weight === 'number' ? Math.max(0, Math.min(1, c.weight)) : 1,
    }
  }

  function normalizeCriterionList(raw) {
    if (!Array.isArray(raw)) return []
    return raw
      .filter((c) => c && typeof c === 'object' && c.label)
      .map(normalizeCriterionRow)
      .slice(0, 20)
  }

  // Per-phase evaluation criteria (single-rubric mode)
  normalized.evaluationCriteria = normalizeCriterionList(input.evaluationCriteria)

  // Two-part rubrics (only meaningful when scoringMode === 'twoPart', but we
  // store them regardless so an admin can toggle modes without losing data).
  normalized.evaluationCriteriaA = normalizeCriterionList(input.evaluationCriteriaA)
  normalized.evaluationCriteriaB = normalizeCriterionList(input.evaluationCriteriaB)

  const rawA = Number(input.partAWeight)
  const rawB = Number(input.partBWeight)
  normalized.partAWeight = Number.isFinite(rawA) && rawA >= 0 ? Math.min(1000, rawA) : 50
  normalized.partBWeight = Number.isFinite(rawB) && rawB >= 0 ? Math.min(1000, rawB) : 50

  normalized.partALabel = typeof input.partALabel === 'string' && input.partALabel.trim()
    ? input.partALabel.trim().slice(0, 80)
    : 'Part A'
  normalized.partBLabel = typeof input.partBLabel === 'string' && input.partBLabel.trim()
    ? input.partBLabel.trim().slice(0, 80)
    : 'Part B'

  return normalized
}

/** Default phases template for a new event */
export function defaultPhasesTemplate() {
  return [
    {
      id: 'phase-1',
      name: 'Phase 1: Idea Screening',
      description: 'Submit your initial idea presentation. Evaluated on innovation, feasibility, and problem understanding.',
      order: 1,
      status: PHASE_STATES.DRAFT,
      deadline: null,
      requirements: { pptRequired: true, pdfRequired: false, videoRequired: false, githubRequired: false, deployedUrlRequired: false },
      evaluationCriteria: [
        { key: 'innovation', label: 'Innovation', maxScore: 10, hint: 'Originality of idea', weight: 0.4 },
        { key: 'feasibility', label: 'Feasibility', maxScore: 10, hint: 'Can it be built?', weight: 0.3 },
        { key: 'problem_understanding', label: 'Problem Understanding', maxScore: 10, hint: 'Depth of analysis', weight: 0.3 },
      ],
    },
    {
      id: 'phase-2',
      name: 'Phase 2: Prototype Validation',
      description: 'Submit working prototype with demo. Evaluated on implementation quality and prototype maturity.',
      order: 2,
      status: PHASE_STATES.DRAFT,
      deadline: null,
      requirements: { pptRequired: true, pdfRequired: true, videoRequired: true, githubRequired: true, deployedUrlRequired: false },
      evaluationCriteria: [
        { key: 'implementation', label: 'Implementation Quality', maxScore: 10, hint: 'Code & architecture', weight: 0.3 },
        { key: 'technical_feasibility', label: 'Technical Feasibility', maxScore: 10, hint: 'Realistic to deploy', weight: 0.25 },
        { key: 'prototype_maturity', label: 'Prototype Maturity', maxScore: 10, hint: 'How polished is it?', weight: 0.25 },
        { key: 'scalability', label: 'Scalability', maxScore: 10, hint: 'Can it grow?', weight: 0.2 },
      ],
    },
    {
      id: 'phase-3',
      name: 'Finals',
      description: 'Live presentation and demo. Compete for top awards.',
      order: 3,
      status: PHASE_STATES.DRAFT,
      deadline: null,
      requirements: { pptRequired: true, pdfRequired: true, videoRequired: true, githubRequired: true, deployedUrlRequired: true },
      evaluationCriteria: [
        { key: 'innovation_impact', label: 'Innovation & Impact', maxScore: 10, hint: 'Real-world value', weight: 0.3 },
        { key: 'execution', label: 'Execution', maxScore: 10, hint: 'Quality of work', weight: 0.3 },
        { key: 'presentation', label: 'Presentation', maxScore: 10, hint: 'Clarity & delivery', weight: 0.2 },
        { key: 'qa', label: 'Q&A Performance', maxScore: 10, hint: 'Response to questions', weight: 0.2 },
      ],
    },
  ]
}
