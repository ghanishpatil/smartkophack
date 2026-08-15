import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useApi } from '@/hooks/useApi.js'
import { Card } from '@/components/ui/Card.jsx'

/**
 * Judges' qualitative remarks for the participant's team.
 * FEEDBACK ONLY — the backend never returns numeric marks/scores to
 * participants, and judges are anonymized (Judge 1, Judge 2, …).
 * Renders nothing until at least one submitted remark exists.
 */
export function JudgeRemarks() {
  const api = useApi()
  const [remarks, setRemarks] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    api.evaluationRemarks()
      .then((res) => { if (alive) setRemarks(Array.isArray(res?.remarks) ? res.remarks : []) })
      .catch(() => { if (alive) setRemarks([]) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [api])

  if (!loaded || remarks.length === 0) return null

  return (
    <Card>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand-600" />
        <h2 className="font-display text-lg font-bold text-ink-900">Judge feedback</h2>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Qualitative remarks from the jury on your submission. Scores are not shown.
      </p>
      <div className="mt-4 space-y-3">
        {remarks.map((r) => (
          <div key={r.id} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{r.judgeLabel}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{r.feedback}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
