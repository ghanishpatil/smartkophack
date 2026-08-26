/** Default rubric when no `evaluationCriteria` is set on the event edition. */
export const LEGACY_DEFAULT_CRITERIA = [
  { key: 'originality', label: 'Originality', maxScore: 10, hint: 'Novelty of idea and differentiation.' },
  { key: 'feasibility', label: 'Feasibility', maxScore: 10, hint: 'Technical and operational viability.' },
  { key: 'impact', label: 'Impact', maxScore: 10, hint: 'Value for users / theme fit.' },
  { key: 'presentation', label: 'Presentation', maxScore: 10, hint: 'Clarity of deck, demo, and artifact quality.' },
]

const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/

function clampMaxScore(n) {
  if (!Number.isFinite(n) || n <= 0) return 10
  return Math.min(100, Math.max(1, Math.round(n)))
}

/** Normalize and validate criteria rows from Firestore or admin API. */
export function normalizeCriteriaList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return []
  const seen = new Set()
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    let key = typeof row.key === 'string' ? row.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '') : ''
    if (!key && typeof row.label === 'string') {
      key = row.label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48)
      if (!key.length || !/^[a-z]/.test(key)) key = `criterion_${out.length + 1}`
    }
    if (!KEY_RE.test(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    const label = typeof row.label === 'string' ? row.label.trim().slice(0, 120) : key
    if (!label) continue
    const maxScore = clampMaxScore(Number(row.maxScore))
    const hint = typeof row.hint === 'string' ? row.hint.trim().slice(0, 500) : ''
    out.push({ key, label, maxScore, hint })
    if (out.length >= 25) break
  }
  return out
}

export function resolveEvaluationCriteria(merged, phase = null) {
  // Per-phase criteria take priority (if the phase defines its own rubric)
  if (phase && Array.isArray(phase.evaluationCriteria) && phase.evaluationCriteria.length > 0) {
    const phaseNormalized = normalizeCriteriaList(phase.evaluationCriteria)
    if (phaseNormalized.length > 0) return phaseNormalized
  }
  // Fall back to event-level criteria
  const raw = merged?.evaluationCriteria
  const normalized = normalizeCriteriaList(Array.isArray(raw) ? raw : [])
  if (normalized.length > 0) return normalized
  return LEGACY_DEFAULT_CRITERIA
}

/**
 * Two-part ("50:50 Finals") scoring support.
 *
 * A phase may set `scoringMode: 'twoPart'` with TWO fully independent rubrics
 * (`evaluationCriteriaA`, `evaluationCriteriaB`) instead of one shared rubric.
 * A judge scores a team against BOTH rubrics in a single sitting/submission,
 * and the server computes a weighted Final Score from the two normalized
 * (0-100%) part totals — mirroring the paper "Judges' Scoring Sheet" (Part A:
 * Existing Project, Part B: New Problem Statement/Challenge, 50% each).
 *
 * Weights are stored as plain relative numbers (e.g. 50 and 50) and are always
 * normalized by their sum at resolve-time — so 50/50, 1/1, or 60/40 all behave
 * predictably even if an admin enters values that don't add up to 100.
 */
function clampWeight(n) {
  if (!Number.isFinite(n) || n < 0) return 50
  return Math.min(1000, n)
}

function normalizedWeights(rawA, rawB) {
  const a = clampWeight(Number(rawA))
  const b = clampWeight(Number(rawB))
  const sum = a + b
  if (!Number.isFinite(sum) || sum <= 0) return { weightA: 0.5, weightB: 0.5 }
  return { weightA: a / sum, weightB: b / sum }
}

/**
 * Build a two-part scoring config from a source object that carries the fields
 * `evaluationCriteriaA`, `evaluationCriteriaB`, `partAWeight`, `partBWeight`,
 * `partALabel`, `partBLabel`. The source can be either a competition phase OR
 * the event config itself (event-level two-part, set from the Evaluations page).
 */
function buildTwoPartConfig(src) {
  const criteriaAraw = normalizeCriteriaList(Array.isArray(src.evaluationCriteriaA) ? src.evaluationCriteriaA : [])
  const criteriaBraw = normalizeCriteriaList(Array.isArray(src.evaluationCriteriaB) ? src.evaluationCriteriaB : [])
  const criteriaA = criteriaAraw.length > 0 ? criteriaAraw : LEGACY_DEFAULT_CRITERIA
  const criteriaB = criteriaBraw.length > 0 ? criteriaBraw : LEGACY_DEFAULT_CRITERIA
  const { weightA, weightB } = normalizedWeights(src.partAWeight, src.partBWeight)
  const labelA = typeof src.partALabel === 'string' && src.partALabel.trim() ? src.partALabel.trim().slice(0, 80) : 'Part A'
  const labelB = typeof src.partBLabel === 'string' && src.partBLabel.trim() ? src.partBLabel.trim().slice(0, 80) : 'Part B'
  return {
    mode: 'twoPart',
    criteriaA,
    criteriaB,
    weightA,
    weightB,
    rawWeightA: clampWeight(Number(src.partAWeight)),
    rawWeightB: clampWeight(Number(src.partBWeight)),
    labelA,
    labelB,
  }
}

/**
 * Resolve the full scoring configuration: either a single shared rubric
 * (existing behavior) or two independent rubrics with weights/labels.
 *
 * Precedence:
 *   1. A phase explicitly set to two-part wins (per-phase rubric).
 *   2. Otherwise, an event-level two-part config (set from the Evaluations
 *      page by uploading two rubric CSVs) applies — this is the simplest path
 *      for the Finals: the admin just uploads Part A + Part B sheets.
 *   3. Otherwise, single-rubric scoring.
 */
export function resolveScoringConfig(merged, phase = null) {
  if (phase && phase.scoringMode === 'twoPart') return buildTwoPartConfig(phase)
  if (merged && merged.scoringMode === 'twoPart') return buildTwoPartConfig(merged)
  return { mode: 'single', criteria: resolveEvaluationCriteria(merged, phase) }
}

/** Sum of awarded scores and sum of max possible scores for one rubric part. */
export function computePartTotal(scores, criteria) {
  let total = 0
  let max = 0
  const list = Array.isArray(criteria) ? criteria : []
  const s = scores && typeof scores === 'object' ? scores : {}
  for (const c of list) {
    const m = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    max += m
    const v = Number(s[c.key])
    total += Number.isFinite(v) ? v : 0
  }
  return { total: Math.round(total * 10) / 10, max }
}

/**
 * Weighted Final Score (0-100%) from two independently-scored rubric parts.
 * Each part is first normalized to a 0-100% share of its own maximum before
 * weighting, so Part A and Part B can have different point totals and the
 * 50:50 (or any configured) weighting still applies correctly.
 */
export function computeFinalScorePct({ totalA, maxA, totalB, maxB, weightA = 0.5, weightB = 0.5 }) {
  const pctA = maxA > 0 ? (totalA / maxA) * 100 : 0
  const pctB = maxB > 0 ? (totalB / maxB) * 100 : 0
  return {
    pctA: Math.round(pctA * 10) / 10,
    pctB: Math.round(pctB * 10) / 10,
    finalScorePct: Math.round((pctA * weightA + pctB * weightB) * 10) / 10,
  }
}

/**
 * Overall evaluation status for a two-part evaluation, derived from the two
 * independent part statuses ('pending' | 'draft' | 'submitted').
 *
 * The judge submits TWO separate evaluations for a team (Evaluation 1 =
 * Part A, Evaluation 2 = Part B) — the whole evaluation only counts as
 * "submitted" once BOTH parts are submitted.
 */
export function computeOverallStatus(partAStatus, partBStatus) {
  if (partAStatus === 'submitted' && partBStatus === 'submitted') return 'submitted'
  if (partAStatus !== 'pending' || partBStatus !== 'pending') return 'draft'
  return 'pending'
}

export function parseEvaluationCriteriaPayload(raw) {
  const normalized = normalizeCriteriaList(Array.isArray(raw) ? raw : [])
  if (normalized.length === 0) {
    return { ok: false, error: 'Provide at least one criterion with a valid key or label.' }
  }
  return { ok: true, criteria: normalized }
}

export function defaultScoresFromCriteria(criteria) {
  const o = {}
  for (const c of criteria) {
    const max = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    o[c.key] = Math.round((max / 2) * 10) / 10
  }
  return o
}

/**
 * Normalize and validate judge scores against the current rubric criteria.
 *
 * Issue C fix: Graceful rubric version mismatch handling.
 * Previously this threw a 400 error if ANY criterion key was missing from the
 * submitted scores — meaning a judge who started scoring under an old rubric
 * would get a hard failure if the admin added new criteria mid-event.
 *
 * New behaviour:
 * - Known keys present in scores: validated and accepted as before
 * - Known keys MISSING from scores: filled with the midpoint default (not an error)
 * - Unknown keys in scores (old rubric keys no longer in criteria): silently dropped
 *
 * This allows judges to continue submitting even after a rubric update.
 * The admin can see which evaluations used partial scores via the evaluationCriteria
 * snapshot stored on the evaluation document.
 *
 * @param {Record<string, number>} scores
 * @param {Array<{ key: string, maxScore?: number }>} criteria
 */
export function normalizeJudgeScores(scores, criteria = LEGACY_DEFAULT_CRITERIA) {
  if (!scores || typeof scores !== 'object') {
    const e = new Error('scores must be an object')
    e.status = 400
    throw e
  }
  const out = {}
  for (const c of criteria) {
    const k = c.key
    const max = typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10
    const midpoint = Math.round((max / 2) * 10) / 10

    if (!(k in scores)) {
      // Issue C: Missing key — fill with midpoint instead of throwing.
      // This handles the case where criteria were added after the judge started scoring.
      out[k] = midpoint
      continue
    }

    const v = Number(scores[k])
    if (!Number.isFinite(v) || v < 0 || v > max) {
      const e = new Error(`scores.${k} must be a number between 0 and ${max}`)
      e.status = 400
      throw e
    }
    out[k] = Math.round(v * 10) / 10
  }
  // Unknown keys (from old rubric) are silently dropped — not included in out.
  return out
}
