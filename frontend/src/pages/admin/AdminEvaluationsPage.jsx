import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useResolvedEventId } from '@/hooks/useResolvedEventId.js'
import { Badge } from '@/components/ui/Badge.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { Textarea } from '@/components/ui/Input.jsx'
import { useAdminFiltersStore } from '@/stores/adminFiltersStore.js'
import {
  EVALUATION_CRITERIA_TEMPLATE_CSV,
  parseCriterionLines,
  splitPasteGrid,
} from '@/utils/evaluationCriteriaCsv.js'

export function AdminEvaluationsPage() {
  usePageSeo({ title: 'Evaluations', description: 'Evaluation queue analytics.' })
  const api = useApi()
  const { eventId } = useResolvedEventId()
  const fileRef = useRef(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const globalFilter = useAdminFiltersStore((s) => s.evaluationsGlobalFilter)
  const setGlobalFilter = useAdminFiltersStore((s) => s.setEvaluationsGlobalFilter)

  const [criteriaDraft, setCriteriaDraft] = useState([])
  const [criteriaPaste, setCriteriaPaste] = useState('')
  const [criteriaLoading, setCriteriaLoading] = useState(false)
  const [criteriaSaving, setCriteriaSaving] = useState(false)
  const [criteriaMsg, setCriteriaMsg] = useState('')
  const [criteriaErr, setCriteriaErr] = useState('')
  const [criteriaScopedEventId, setCriteriaScopedEventId] = useState('')

  // Archive current-round evaluations before starting the Finals.
  const [archiveLabel, setArchiveLabel] = useState('round-2')
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState('')

  // Two-part (Finals 50:50) rubric — upload TWO sheets (Part A + Part B).
  const [twoPartOn, setTwoPartOn] = useState(false)
  const [criteriaA, setCriteriaA] = useState([])
  const [criteriaB, setCriteriaB] = useState([])
  // Shared "Universal Challenge" rubric — scored inside both Part A and Part B.
  const [criteriaU, setCriteriaU] = useState([])
  const [labelA, setLabelA] = useState('Existing Project')
  const [labelB, setLabelB] = useState('New Problem Statement / Challenge')
  const [weightA, setWeightA] = useState(50)
  const [weightB, setWeightB] = useState(50)
  const [twoPartSaving, setTwoPartSaving] = useState(false)
  const [twoPartMsg, setTwoPartMsg] = useState('')
  const [twoPartErr, setTwoPartErr] = useState('')

  const rubricEventId = criteriaScopedEventId || eventId

  const [usersMap, setUsersMap] = useState(new Map())
  const [teamsMap, setTeamsMap] = useState(new Map())
  const [judgeUsers, setJudgeUsers] = useState([])

  const loadEvaluations = useCallback(async () => {
    setLoading(true)
    try {
      const [data, users, teams] = await Promise.all([
        api.adminEvaluations(),
        api.listUsers().catch(() => []),
        api.adminTeams().catch(() => []),
      ])
      setRows(Array.isArray(data) ? data : [])
      const uMap = new Map()
      const judgeList = []
      for (const u of (Array.isArray(users) ? users : [])) {
        const name = u.displayName || u.email || u.id
        uMap.set(u.id, name)
        // Everyone with the judge role — listed even before they score anything.
        if (u.role === 'judge') judgeList.push({ id: u.id, name })
      }
      setUsersMap(uMap)
      setJudgeUsers(judgeList)
      const tMap = new Map()
      for (const t of (Array.isArray(teams) ? teams : [])) {
        tMap.set(t.id, t.name || t.id)
      }
      setTeamsMap(tMap)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [api])

  const loadCriteria = useCallback(async () => {
    setCriteriaLoading(true)
    setCriteriaErr('')
    try {
      const data = await api.getAdminEvaluationCriteria()
      const id = typeof data?.eventId === 'string' ? data.eventId.trim() : ''
      if (id) setCriteriaScopedEventId(id)
      const list = Array.isArray(data?.criteria) ? data.criteria : []
      setCriteriaDraft(list)
      // Two-part (Finals) config
      setTwoPartOn(data?.scoringMode === 'twoPart')
      setCriteriaA(Array.isArray(data?.criteriaA) ? data.criteriaA : [])
      setCriteriaB(Array.isArray(data?.criteriaB) ? data.criteriaB : [])
      setCriteriaU(Array.isArray(data?.criteriaU) ? data.criteriaU : [])
      if (typeof data?.partALabel === 'string' && data.partALabel) setLabelA(data.partALabel)
      if (typeof data?.partBLabel === 'string' && data.partBLabel) setLabelB(data.partBLabel)
      if (typeof data?.partAWeight === 'number') setWeightA(data.partAWeight)
      if (typeof data?.partBWeight === 'number') setWeightB(data.partBWeight)
    } catch (e) {
      setCriteriaErr(e.message || 'Could not load criteria')
      setCriteriaDraft([])
    } finally {
      setCriteriaLoading(false)
    }
  }, [api])

  useEffect(() => {
    void loadEvaluations()
  }, [loadEvaluations])

  useEffect(() => {
    void loadCriteria()
  }, [loadCriteria])

  const submitted = rows.filter((r) => r.evaluationStatus === 'submitted').length
  const draft = rows.filter((r) => r.evaluationStatus === 'draft').length

  function applyParsedToDraft(parsed) {
    setCriteriaDraft(parsed)
    setCriteriaMsg(`Loaded ${parsed.length} criterion row(s). Save to apply for this hackathon.`)
    setCriteriaErr('')
  }

  function onPasteApply() {
    const grid = splitPasteGrid(criteriaPaste)
    const parsed = parseCriterionLines(grid)
    if (parsed.length === 0) {
      setCriteriaErr('No criteria rows found. Use columns key, label, maxScore, hint — or a single column of labels.')
      return
    }
    applyParsedToDraft(parsed)
  }

  async function onCsvFileChange(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const text = await f.text()
      const parsed = parseCriterionLines(splitPasteGrid(text))
      if (parsed.length === 0) {
        setCriteriaErr('No criteria rows found in file.')
        return
      }
      applyParsedToDraft(parsed)
    } catch (err) {
      setCriteriaErr(err.message || 'Could not read file')
    }
  }

  function downloadTemplate() {
    const blob = new Blob([EVALUATION_CRITERIA_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'evaluation-criteria-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveCriteria() {
    if (!rubricEventId) return
    setCriteriaSaving(true)
    setCriteriaErr('')
    setCriteriaMsg('')
    try {
      await api.patchAdminEvent(rubricEventId, { evaluationCriteria: criteriaDraft })
      setCriteriaMsg('Evaluation criteria saved. Judges will see this rubric on the next review load.')
      await loadCriteria()
    } catch (e) {
      setCriteriaErr(e.message || 'Save failed')
    } finally {
      setCriteriaSaving(false)
    }
  }

  async function archiveAndStartFresh() {
    const label = (archiveLabel || 'round-2').trim() || 'round-2'
    const submittedCount = rows.filter((r) => r.evaluationStatus === 'submitted').length
    const ok = window.confirm(
      `Archive ALL current evaluations under the label "${label}" and clear them so a new round (Finals) starts fresh?\n\n` +
      `• ${rows.length} evaluation record(s) will be copied to the permanent archive (${submittedCount} submitted).\n` +
      `• The live evaluations will then be cleared — judges will start the new round with a clean slate.\n` +
      `• Nothing is lost: archived scores stay viewable/exportable in Reports.\n\n` +
      `Proceed?`,
    )
    if (!ok) return
    setArchiveBusy(true)
    setArchiveMsg('')
    try {
      const res = await api.archiveAdminEvaluations(label)
      setArchiveMsg(`Archived ${res.archived || 0} evaluation(s) as "${res.label || label}" and cleared the live board. Finals can now start fresh.`)
      await loadEvaluations()
    } catch (e) {
      setArchiveMsg(e.message || 'Archive failed')
    } finally {
      setArchiveBusy(false)
    }
  }

  async function saveTwoPart() {
    if (!rubricEventId) return
    setTwoPartErr('')
    setTwoPartMsg('')
    if (twoPartOn && (criteriaA.length === 0 || criteriaB.length === 0)) {
      setTwoPartErr('Upload both Part A and Part B rubrics before enabling two-part scoring.')
      return
    }
    setTwoPartSaving(true)
    try {
      await api.patchAdminEvent(rubricEventId, {
        scoringMode: twoPartOn ? 'twoPart' : 'single',
        evaluationCriteriaA: criteriaA.length ? criteriaA : null,
        evaluationCriteriaB: criteriaB.length ? criteriaB : null,
        evaluationCriteriaU: criteriaU.length ? criteriaU : null,
        partALabel: labelA,
        partBLabel: labelB,
        partAWeight: Number(weightA) || 50,
        partBWeight: Number(weightB) || 50,
      })
      setTwoPartMsg(
        twoPartOn
          ? 'Two-part Finals scoring saved. Judges now submit two evaluations per team (Part A, then Part B).'
          : 'Saved. Two-part scoring is OFF — judges use the single rubric above.',
      )
      await loadCriteria()
    } catch (e) {
      setTwoPartErr(e.message || 'Save failed')
    } finally {
      setTwoPartSaving(false)
    }
  }

  function copyAtoB() {
    setCriteriaB(criteriaA.map((c) => ({ ...c })))
    setTwoPartMsg('Copied Part A rubric into Part B. Click "Save two-part rubric" to apply.')
    setTwoPartErr('')
  }

  async function clearCustomCriteria() {
    if (!rubricEventId) return
    if (!window.confirm('Remove custom criteria for this hackathon? Judges fall back to the built-in default rubric.'))
      return
    setCriteriaSaving(true)
    setCriteriaErr('')
    setCriteriaMsg('')
    try {
      await api.patchAdminEvent(rubricEventId, { evaluationCriteria: null })
      setCriteriaMsg('Custom criteria cleared.')
      await loadCriteria()
    } catch (e) {
      setCriteriaErr(e.message || 'Could not clear criteria')
    } finally {
      setCriteriaSaving(false)
    }
  }

  if (loading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Evaluations</h1>
          <p className="mt-2 text-sm text-ink-600">
            Aggregated Firestore evaluation docs. Reopening flows require judges to POST updated payloads during `EVALUATION`
            phase.
          </p>
        </div>
        <Badge tone="success">{submitted} submitted</Badge>
        <Badge tone="warn">{draft} drafts</Badge>
      </div>

      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Evaluation rubric (CSV)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Upload a CSV (Excel: Save As → CSV UTF-8), paste rows from a spreadsheet, or download the template. The same
            criteria apply to all jury scoring for this hackathon (rounds, deck, and remarks).
          </p>
          <p className="mt-2 text-xs text-ink-500">
            Columns: <span className="font-mono">key</span> (optional), <span className="font-mono">label</span>,{' '}
            <span className="font-mono">maxScore</span> (optional, default 10), <span className="font-mono">hint</span>{' '}
            (optional). Label-only rows get stable keys generated on save.
          </p>
        </div>

        {criteriaErr ? <p className="text-sm text-red-600">{criteriaErr}</p> : null}
        {criteriaMsg ? <p className="text-sm text-brand-700">{criteriaMsg}</p> : null}

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onCsvFileChange} />
          <Button type="button" variant="secondary" disabled={criteriaLoading} onClick={() => fileRef.current?.click()}>
            Upload CSV
          </Button>
          <Button type="button" variant="secondary" disabled={criteriaLoading} onClick={downloadTemplate}>
            Download template
          </Button>
          <Button type="button" variant="secondary" disabled={criteriaLoading || criteriaSaving} onClick={() => void loadCriteria()}>
            Reload from server
          </Button>
          <Button type="button" variant="secondary" disabled={!rubricEventId || criteriaSaving} onClick={clearCustomCriteria}>
            Clear custom → default rubric
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Textarea
              label="Paste from Excel / Sheets (TSV or CSV)"
              rows={6}
              value={criteriaPaste}
              disabled={criteriaLoading}
              placeholder="Paste header + rows, or label-only lines…"
              onChange={(e) => setCriteriaPaste(e.target.value)}
            />
            <Button type="button" className="mt-2" variant="secondary" disabled={criteriaLoading} onClick={onPasteApply}>
              Apply paste to preview
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-ink-500">Preview ({criteriaDraft.length})</p>
            {criteriaLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : criteriaDraft.length === 0 ? (
              <p className="text-sm text-ink-500">No rows yet — upload, paste, or reload.</p>
            ) : (
              <div className="max-h-52 overflow-auto rounded-xl border border-[rgb(var(--border))]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[rgb(var(--surface-muted))]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Key</th>
                      <th className="px-3 py-2 font-semibold">Label</th>
                      <th className="px-3 py-2 font-semibold">Max</th>
                      <th className="px-3 py-2 font-semibold">Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteriaDraft.map((r, idx) => (
                      <tr key={`${r.key || 'k'}-${idx}`} className="border-t border-[rgb(var(--border))]">
                        <td className="px-3 py-2 font-mono text-[11px]">{r.key || '—'}</td>
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2">{r.maxScore ?? 10}</td>
                        <td className="px-3 py-2 text-ink-500">{r.hint || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            disabled={!rubricEventId || criteriaSaving || criteriaDraft.length === 0}
            onClick={saveCriteria}
          >
            Save rubric
          </Button>
          <span className="self-center text-xs text-ink-500">
            Saves to the active hackathon event document. Clearing custom removes that field so the built-in default rubric applies again.
          </span>
        </div>
      </Card>

      {/* Finals — Two-Part Rubric (upload TWO sheets) */}
      <Card className="space-y-4 border-brand-500/30 bg-brand-500/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Finals — Two-part rubric (50:50)</h2>
            <p className="mt-1 text-sm text-ink-600">
              For the Grand Finale, judges submit <strong>two evaluations per team</strong>: one for the existing project,
              one for the new challenge. Upload a rubric sheet for <strong>each part</strong> — just like the single
              rubric above, but two of them. The Final Score is the weighted combination.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm">
            <input type="checkbox" checked={twoPartOn} onChange={(e) => setTwoPartOn(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            <span className="font-medium text-ink-800">Enable two-part scoring</span>
          </label>
        </div>

        {twoPartErr ? <p className="text-sm text-red-600">{twoPartErr}</p> : null}
        {twoPartMsg ? <p className="text-sm text-brand-700">{twoPartMsg}</p> : null}

        {/* Part labels + weights */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 text-xs font-medium text-ink-500">
              Part A label
              <input
                value={labelA}
                onChange={(e) => setLabelA(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="text-xs font-medium text-ink-500">
              Weight %
              <input
                type="number" min="0" max="1000"
                value={weightA}
                onChange={(e) => setWeightA(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 text-xs font-medium text-ink-500">
              Part B label
              <input
                value={labelB}
                onChange={(e) => setLabelB(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            <label className="text-xs font-medium text-ink-500">
              Weight %
              <input
                type="number" min="0" max="1000"
                value={weightB}
                onChange={(e) => setWeightB(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          </div>
        </div>
        <p className="text-xs text-ink-500">Weights are auto-normalized — 50/50, 60/40, or any ratio works.</p>

        {/* Two uploaders */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RubricUploader
            title={`Part A — ${labelA}`}
            criteria={criteriaA}
            onChange={setCriteriaA}
            onError={setTwoPartErr}
            onMessage={setTwoPartMsg}
            onDownloadTemplate={downloadTemplate}
          />
          <RubricUploader
            title={`Part B — ${labelB}`}
            criteria={criteriaB}
            onChange={setCriteriaB}
            onError={setTwoPartErr}
            onMessage={setTwoPartMsg}
            onDownloadTemplate={downloadTemplate}
            extraAction={
              <Button type="button" size="sm" variant="secondary" disabled={criteriaA.length === 0} onClick={copyAtoB}>
                Copy Part A → Part B
              </Button>
            }
          />
        </div>

        {/* Shared Universal Challenge rubric — scored WITHIN both parts */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <RubricUploader
            title="Universal Challenge (common to all teams)"
            criteria={criteriaU}
            onChange={setCriteriaU}
            onError={setTwoPartErr}
            onMessage={setTwoPartMsg}
            onDownloadTemplate={downloadTemplate}
          />
          <p className="mt-2 text-xs text-ink-600">
            These criteria are the <strong>same for every team</strong> and are scored inside{' '}
            <strong>both Part A and Part B</strong> (e.g. 5 challenge items × max 3 = 15). Import them once here.
            Leave empty to disable the challenge block. Each part total = its project criteria + this challenge.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" disabled={!rubricEventId || twoPartSaving} onClick={saveTwoPart}>
            {twoPartSaving ? 'Saving…' : 'Save two-part rubric'}
          </Button>
          <span className="self-center text-xs text-ink-500">
            When enabled, this applies to the active evaluation. Both parts use the official 8-criteria sheet — upload it
            to Part A and click <strong>Copy Part A → Part B</strong> if both parts are identical.
          </span>
        </div>
      </Card>

      {/* Archive current round & start Finals fresh */}
      <Card className="space-y-4 border-amber-500/30 bg-amber-500/5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Start a new evaluation round (Finals)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Before the Finals begin, archive the current round&apos;s evaluations so the new (two-part) Finals scoring
            starts from a clean slate. Each judge scores a team in one document, so without archiving, Finals scores would
            overwrite the earlier round. Archiving copies every current evaluation into a permanent, read-only store
            (viewable and exportable in Reports), then clears the live board.
          </p>
        </div>

        {archiveMsg ? (
          <p className={`text-sm ${archiveMsg.toLowerCase().includes('fail') ? 'text-red-600' : 'text-emerald-700'}`}>{archiveMsg}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-ink-500">
            Archive label
            <input
              value={archiveLabel}
              onChange={(e) => setArchiveLabel(e.target.value)}
              placeholder="round-2"
              className="mt-1 block w-48 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={archiveBusy}
            onClick={archiveAndStartFresh}
          >
            {archiveBusy ? 'Archiving…' : 'Archive current evaluations & start fresh'}
          </Button>
        </div>
        <p className="text-xs text-ink-500">
          Tip: after archiving, go to <strong>Competition Phases</strong> and switch the Finals phase to
          <strong> Two-part (50:50)</strong> scoring so judges submit their two evaluations per team.
        </p>
      </Card>

      {/* Judge-centric view: list judges → click to see their teams + marks */}
      <JudgeEvaluations
        rows={rows}
        judgeUsers={judgeUsers}
        usersMap={usersMap}
        search={globalFilter}
        onSearch={setGlobalFilter}
      />

      {/* Score Distribution & Insights */}
      {submitted > 0 && <EvaluationInsights evaluations={rows} usersMap={usersMap} teamsMap={teamsMap} />}
    </div>
  )
}

/**
 * Reusable single-rubric uploader: upload CSV, paste from a sheet, or download
 * the template, with a live preview table. Used for each part (A / B) of the
 * Finals two-part rubric. Mirrors the primary single-rubric block's UX.
 */
function RubricUploader({ title, criteria = [], onChange, onError, onMessage, onDownloadTemplate, extraAction = null }) {
  const fileRef = useRef(null)
  const [paste, setPaste] = useState('')

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const parsed = parseCriterionLines(splitPasteGrid(await f.text()))
      if (parsed.length === 0) {
        onError?.(`${title}: no criteria rows found in that file.`)
        return
      }
      onChange(parsed)
      onMessage?.(`Loaded ${parsed.length} row(s) into ${title}. Save to apply.`)
    } catch (err) {
      onError?.(err.message || 'Could not read file')
    }
  }

  function applyPaste() {
    const parsed = parseCriterionLines(splitPasteGrid(paste))
    if (parsed.length === 0) {
      onError?.(`${title}: no criteria rows found. Use columns key, label, maxScore, hint — or a single column of labels.`)
      return
    }
    onChange(parsed)
    onMessage?.(`Loaded ${parsed.length} row(s) into ${title}. Save to apply.`)
  }

  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
        <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>Upload CSV</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDownloadTemplate}>Template</Button>
        {extraAction}
      </div>
      <Textarea
        className="mt-3"
        label="Or paste from Excel / Sheets"
        rows={3}
        value={paste}
        placeholder="Paste header + rows, or label-only lines…"
        onChange={(e) => setPaste(e.target.value)}
      />
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={applyPaste}>Apply paste</Button>

      <p className="mt-3 mb-1 text-xs font-semibold uppercase text-ink-500">Preview ({criteria.length})</p>
      {criteria.length === 0 ? (
        <p className="text-sm text-ink-500">No rows yet — upload or paste a rubric sheet.</p>
      ) : (
        <div className="max-h-44 overflow-auto rounded-lg border border-[rgb(var(--border))]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[rgb(var(--surface-muted))]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Label</th>
                <th className="px-2 py-1.5 font-semibold">Max</th>
                <th className="px-2 py-1.5 font-semibold">Hint</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((r, idx) => (
                <tr key={`${r.key || 'k'}-${idx}`} className="border-t border-[rgb(var(--border))]">
                  <td className="px-2 py-1.5">{r.label}</td>
                  <td className="px-2 py-1.5">{r.maxScore ?? 10}</td>
                  <td className="px-2 py-1.5 text-ink-500">{r.hint || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * Judge list: every user with the judge role, by name. Clicking a judge opens a
 * dedicated page showing all their evaluated teams with full marks + breakdown.
 */
function JudgeEvaluations({ rows, judgeUsers = [], usersMap = new Map(), search = '', onSearch }) {
  const judges = useMemo(() => {
    const evalsByJudge = new Map()
    for (const ev of rows) {
      const jid = ev.judgeId || 'unknown'
      if (!evalsByJudge.has(jid)) evalsByJudge.set(jid, [])
      evalsByJudge.get(jid).push(ev)
    }
    const base = new Map()
    for (const j of judgeUsers) {
      base.set(j.id, { judgeId: j.id, name: j.name, evals: evalsByJudge.get(j.id) || [] })
    }
    for (const [jid, evs] of evalsByJudge) {
      if (!base.has(jid)) base.set(jid, { judgeId: jid, name: usersMap.get(jid) || 'Unknown judge', evals: evs })
    }
    let list = [...base.values()].map((g) => ({
      judgeId: g.judgeId,
      name: g.name,
      count: g.evals.length,
      submitted: g.evals.filter((e) => e.evaluationStatus === 'submitted').length,
      drafts: g.evals.filter((e) => e.evaluationStatus === 'draft').length,
    }))
    const q = String(search || '').trim().toLowerCase()
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q))
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [rows, judgeUsers, usersMap, search])

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink-900">Judges &amp; their evaluations</h2>
        <p className="mt-1 text-sm text-ink-600">
          Click a judge to open their page with all evaluated teams and the marks given.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={search}
          onChange={(e) => onSearch?.(e.target.value)}
          placeholder="Search judge by name…"
          className="w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] py-2.5 pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      {judges.length === 0 ? (
        <p className="rounded-lg bg-[rgb(var(--surface-muted))]/50 px-4 py-6 text-center text-sm text-ink-500">
          No judges found. Assign the judge role to users in Access Control.
        </p>
      ) : (
        <div className="space-y-2">
          {judges.map((j) => (
            <Link
              key={j.judgeId}
              to={`/admin/evaluations/judge/${j.judgeId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] px-4 py-3 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
            >
              <span className="min-w-0 truncate text-sm font-semibold text-ink-900">{j.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge tone="neutral">{j.count} team{j.count === 1 ? '' : 's'}</Badge>
                {j.submitted > 0 ? <Badge tone="success">{j.submitted} submitted</Badge> : null}
                {j.drafts > 0 ? <Badge tone="warn">{j.drafts} draft</Badge> : null}
                <ChevronRight className="h-4 w-4 text-ink-400" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Score distribution visualization */
function EvaluationInsights({ evaluations, usersMap = new Map(), teamsMap = new Map() }) {
  const submitted = evaluations.filter((e) => e.evaluationStatus === 'submitted')
  if (submitted.length === 0) return null

  /**
   * Issue B fix: Normalize scores to 0–100% before aggregating.
   * Raw sums are not comparable when rubrics differ (e.g. 4 criteria × 10 = 40 max
   * vs 6 criteria × 10 = 60 max). We compute each evaluation's score as a percentage
   * of its own maximum possible score, making rankings fair across rubric versions.
   *
   * If an evaluation has no criteria metadata stored, we fall back to raw sum / 40
   * (the legacy 4-criterion default max) to avoid dividing by zero.
   */
  function normalizedPct(ev) {
    // Two-part (Finals 50:50) evaluations already carry a server-computed
    // weighted Final Score % — use it directly instead of a raw sum, since
    // Part A and Part B use independent rubrics with independent maxes.
    if (ev.scoringMode === 'twoPart') {
      return typeof ev.finalScorePct === 'number' ? ev.finalScorePct : 0
    }
    if (!ev.scores || typeof ev.scores !== 'object') return 0
    const vals = Object.values(ev.scores).map(Number).filter(Number.isFinite)
    if (vals.length === 0) return 0
    const rawTotal = vals.reduce((a, b) => a + b, 0)
    // Use stored criteria to compute the true maximum possible score for this eval
    const criteria = Array.isArray(ev.evaluationCriteria) && ev.evaluationCriteria.length > 0
      ? ev.evaluationCriteria
      : null
    const maxPossible = criteria
      ? criteria.reduce((sum, c) => sum + (typeof c.maxScore === 'number' && c.maxScore > 0 ? c.maxScore : 10), 0)
      : vals.length * 10 // fallback: assume 10 per criterion
    return maxPossible > 0 ? Math.round((rawTotal / maxPossible) * 1000) / 10 : 0 // 0–100.0
  }

  // Aggregate normalized scores per team
  const teamScores = {}
  for (const ev of submitted) {
    if (!ev.teamId) continue
    if (ev.scoringMode !== 'twoPart' && !ev.scores) continue
    if (!teamScores[ev.teamId]) teamScores[ev.teamId] = { total: 0, count: 0 }
    teamScores[ev.teamId].total += normalizedPct(ev)
    teamScores[ev.teamId].count += 1
  }

  // Rank teams by average normalized score (0–100%)
  const ranked = Object.entries(teamScores)
    .map(([teamId, data]) => ({
      teamId,
      avgScore: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      evaluationCount: data.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  // Score distribution histogram (normalized 0–100% buckets of 10)
  const allNormalized = submitted
    .filter((e) => e.scoringMode === 'twoPart' || e.scores)
    .map((e) => normalizedPct(e))

  const bins = {}
  for (const s of allNormalized) {
    const bin = Math.floor(s / 10) * 10
    bins[bin] = (bins[bin] || 0) + 1
  }
  const histogramData = Object.entries(bins)
    .map(([bin, count]) => ({ bin: Number(bin), range: `${bin}–${Math.min(100, Number(bin) + 9)}%`, count }))
    .sort((a, b) => a.bin - b.bin)

  const avgNorm = allNormalized.length > 0
    ? Math.round(allNormalized.reduce((a, b) => a + b, 0) / allNormalized.length * 10) / 10
    : 0

  // Judge activity
  const judgeActivity = {}
  for (const ev of submitted) {
    if (!ev.judgeId) continue
    judgeActivity[ev.judgeId] = (judgeActivity[ev.judgeId] || 0) + 1
  }
  const judgeList = Object.entries(judgeActivity)
    .map(([judgeId, count]) => ({ judgeId, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Team Rankings */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="font-display text-base font-semibold text-ink-900">Team Rankings (by avg score)</h3>
          <p className="mt-1 text-xs text-ink-500">
            Scores normalized to 0–100% of each rubric's maximum — comparable even if criteria changed mid-event.
          </p>
          <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {ranked.slice(0, 15).map((t, i) => (
              <div key={t.teamId} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[rgb(var(--surface-muted))]">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < 3 ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--surface-muted))] text-ink-600'
                }`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{teamsMap.get(t.teamId) || t.teamId}</span>
                <span className="font-display text-sm font-bold text-ink-900">{t.avgScore}%</span>
                <span className="text-[10px] text-ink-400">({t.evaluationCount} eval{t.evaluationCount > 1 ? 's' : ''})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score Distribution */}
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
          <h3 className="font-display text-base font-semibold text-ink-900">Score Distribution</h3>
          <p className="mt-1 text-xs text-ink-500">Normalized score buckets (0–100%) across all submitted evaluations</p>
          <div className="mt-4 space-y-2">
            {histogramData.map((bin) => {
              const maxBin = Math.max(1, ...histogramData.map((b) => b.count))
              const pct = Math.round((bin.count / maxBin) * 100)
              return (
                <div key={bin.range} className="flex items-center gap-3">
                  <span className="w-20 text-right font-mono text-xs text-ink-500">{bin.range}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-md bg-[rgb(var(--surface-muted))]">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-xs font-medium text-ink-700">{bin.count}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Total evaluations: {allNormalized.length} · Avg normalized score: {avgNorm}%
          </p>
        </div>
      </div>

      {/* Judge Activity */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
        <h3 className="font-display text-base font-semibold text-ink-900">Judge Activity</h3>
        <p className="mt-1 text-xs text-ink-500">Number of submitted evaluations per judge</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {judgeList.map((j) => (
            <div key={j.judgeId} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50 px-3 py-2">
              <span className="text-xs font-medium text-ink-700">{usersMap.get(j.judgeId) || 'Judge'}</span>
              <span className="ml-2 font-display text-sm font-bold text-ink-900">{j.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
