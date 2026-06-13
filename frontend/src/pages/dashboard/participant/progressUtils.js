import { isRegistrationComplete } from '@/utils/teamRegistrationDisplay.js'
import { isPhaseSubmissionOpen } from '@/utils/phaseStatus.js'

/** Derives participant journey steps for UI (client-side only; gates enforced on API). */

export function buildParticipantSteps({
  eventCfg,
  team,
  submission,
  feeResolved,
  problemChosen,
}) {
  const phase = eventCfg?.lifecyclePhase || ''
  const feeRequired = Boolean(eventCfg?.entryFeeEnabled && (eventCfg?.entryFeeAmount ?? 0) > 0)
  const registrationDone = team ? isRegistrationComplete(team, { feeRequired }) : false

  const competitionPhases = Array.isArray(eventCfg?.competitionPhases) ? eventCfg.competitionPhases : []
  const hasMultiPhase = competitionPhases.length > 1

  const steps = [
    {
      id: 'hackathon',
      title: 'Hackathon',
      description: 'Registration & deadlines',
      done: Boolean(eventCfg),
    },
    {
      id: 'team',
      title: 'Team',
      description: 'Create or join',
      done: Boolean(team?.id),
    },
    {
      id: 'register',
      title: feeRequired ? 'Register & pay' : 'Event registration',
      description: feeRequired ? 'Fee required to complete' : 'Confirm participation',
      done: registrationDone,
    },
    {
      id: 'payment',
      title: feeRequired ? 'Entry fee' : 'Fee',
      description: feeRequired ? 'Pay via Razorpay' : 'Not required',
      done: feeRequired ? feeResolved : true,
      skipped: !feeRequired,
    },
    {
      id: 'problem',
      title: 'Problem statement',
      description: 'Choose your track',
      done: Boolean(problemChosen),
    },
  ]

  // Adapt submission step(s) based on competition phases
  if (hasMultiPhase) {
    // Show phase-aware submission progress
    const visiblePhases = competitionPhases.filter(
      (p) => p.status && p.status !== 'DRAFT' && p.status !== 'ARCHIVED'
    )
    const shortlistedPhases = team?.shortlistedPhases || []

    if (visiblePhases.length > 0) {
      for (const cp of visiblePhases) {
        const isFirst = cp.order === 1
        const isEligible = isFirst || shortlistedPhases.includes(cp.id)
        const phaseSubmission = submission?.phases?.[cp.id]
        const isPhaseComplete = Boolean(phaseSubmission?.status === 'submitted' || phaseSubmission?.finalizedAt)
        // Active = open for submissions (manual ACTIVE or date-driven UPCOMING).
        // Shared helper keeps this consistent with backend + SubmissionPage.
        const isPhaseActive = isPhaseSubmissionOpen(cp)
        const isPhaseCompleted = cp.status === 'COMPLETED' || cp.status === 'ARCHIVED'

        steps.push({
          id: `phase-${cp.id}`,
          title: cp.name || `Phase ${cp.order}`,
          description: isEligible
            ? (isPhaseActive ? 'Submissions open' : isPhaseCompleted ? 'Completed' : 'Upcoming')
            : 'Not shortlisted',
          done: isPhaseComplete || (isPhaseCompleted && isEligible),
          skipped: !isEligible,
        })
      }
    } else {
      // All phases are still DRAFT — show generic submission step
      steps.push({
        id: 'submission',
        title: 'Submission',
        description: `${competitionPhases.length} phases planned`,
        done: Boolean(team?.submissionLocked || submission?.finalizedAt),
      })
    }
  } else {
    // Single phase or no phases — show single submission step
    steps.push({
      id: 'submission',
      title: 'Submission',
      description: 'Artifacts + finalize',
      done: Boolean(team?.submissionLocked || submission?.finalizedAt),
    })
  }

  const completed = steps.filter((s) => s.done).length
  const activeIndex = steps.findIndex((s) => !s.done && !s.skipped)
  const currentIndex = activeIndex === -1 ? steps.length - 1 : activeIndex

  return { steps, completed, currentIndex, phase }
}

export function submissionCompleteness(sub) {
  if (!sub) return { filled: 0, total: 4, pct: 0 }
  const filled = [sub.pptUrl, sub.pdfUrl, sub.githubUrl, sub.videoUrl].filter(Boolean).length
  const total = 4
  return { filled, total, pct: Math.round((filled / total) * 100) }
}
