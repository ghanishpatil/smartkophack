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
