import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertCircle, Trash2, Lightbulb } from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { useEvent } from '@/context/EventContext.jsx'
import { APP } from '@/utils/constants.js'
import {
  displayCategory,
  displayOrganization,
  displayDepartment,
  displayTheme,
} from '@/utils/problemStatementDisplay.js'

import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input, Textarea } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { Skeleton } from '@/components/ui/Skeleton.jsx'
import { parseCSV, buildProblemStatementTemplate, buildSuperPsTemplate, downloadCSV } from '@/utils/csvParser.js'

// Problem-statement types (origin). Curated is the default (no origin stored).
// 'super_ps' is the flagship tier; 'open_innovation' is participant-authored.
const PS_TYPE = { CURATED: 'curated', SUPER: 'super_ps', OPEN_INNOVATION: 'open_innovation' }

// Official SKH track and domain lists
const TRACK_OPTIONS = ['Software', 'Hardware']
const DOMAIN_OPTIONS = [
  'Health',
  'Education',
  'Transportation',
  'Food Safety & Security',
  'Waste Management',
  'Agriculture',
  'Industry & MSME Innovation',
  'Open Innovation',
]

function slugPreview(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return s || '(auto-generated id)'
}

export function AdminProblemsPage() {
  usePageSeo({ title: 'Problem Statements', description: 'SKH problem list.' })
  const api = useApi()
  const { eventId, eventLoading } = useEvent()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState({})
  const [msg, setMsg] = useState('')

  const [newId, setNewId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newOrganization, setNewOrganization] = useState('')
  const [newDepartment, setNewDepartment] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newTheme, setNewTheme] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPublished, setNewPublished] = useState(true)
  const [newMaxTeams, setNewMaxTeams] = useState('')
  const [newOrder, setNewOrder] = useState('')
  const [newType, setNewType] = useState(PS_TYPE.CURATED)
  const [creating, setCreating] = useState(false)

  // Filter the list by problem-statement type (All / Curated / Super PS / Open Innovation)
  const [typeFilter, setTypeFilter] = useState('all')

  const [openPsIds, setOpenPsIds] = useState(() => new Set())

  // Bulk delete state
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Bulk import state
  const [bulkOpen, setBulkOpen] = useState(false)
  // Which tier this import creates: 'curated' (default) or 'super_ps'.
  const [bulkMode, setBulkMode] = useState(PS_TYPE.CURATED)
  const [bulkRows, setBulkRows] = useState([])
  const [bulkErrors, setBulkErrors] = useState([])
  const [bulkParseError, setBulkParseError] = useState('')
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const fileInputRef = useRef(null)

  function resetBulkState() {
    setBulkRows([])
    setBulkErrors([])
    setBulkParseError('')
    setBulkFileName('')
    setBulkResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function closeBulkModal() {
    setBulkOpen(false)
    resetBulkState()
  }

  function handleDownloadTemplate() {
    if (bulkMode === PS_TYPE.SUPER) {
      downloadCSV('super-ps-template.csv', buildSuperPsTemplate())
    } else {
      downloadCSV('problem-statements-template.csv', buildProblemStatementTemplate())
    }
  }

  /**
   * Export every problem statement (curated + Open Innovation) to a proper,
   * formatted Excel workbook (.xls via SpreadsheetML — opens natively in Excel
   * with a styled header, column widths and wrapped descriptions). Dependency-
   * free and read-only; nothing on the server changes.
   */
  function exportAllPs() {
    const xmlEsc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // strip control chars
    const cell = (v, type = 'String', styleId) => {
      const st = styleId ? ` ss:StyleID="${styleId}"` : ''
      if (type === 'Number' && v !== '' && v != null && !Number.isNaN(Number(v))) {
        return `<Cell${st}><Data ss:Type="Number">${Number(v)}</Data></Cell>`
      }
      return `<Cell${st}><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`
    }

    const headers = [
      'ID', 'Name', 'Organization', 'Department', 'Track', 'Domain',
      'Description', 'Status', 'Max Teams', 'List Order', 'Selections',
      'Assigned Judges', 'Type',
    ]
    const widths = [110, 220, 150, 150, 70, 130, 380, 80, 80, 80, 80, 110, 180]
    const headerRow = `<Row>${headers.map((h) => cell(h, 'String', 'hdr')).join('')}</Row>`
    const bodyRows = sortedRows.map((ps) => {
      const cells = [
        cell(ps.id),
        cell(ps.title || ''),
        cell(displayOrganization(ps) || ''),
        cell(displayDepartment(ps) || ''),
        cell(displayCategory(ps) || ''),
        cell(displayTheme(ps) || ''),
        cell(ps.description || '', 'String', 'wrap'),
        cell(ps.published !== false ? 'Published' : 'Draft'),
        typeof ps.maxTeams === 'number' ? cell(ps.maxTeams, 'Number') : cell('No cap'),
        cell(typeof ps.order === 'number' ? ps.order : '', 'Number'),
        cell(typeof ps.selectionCount === 'number' ? ps.selectionCount : 0, 'Number'),
        cell(Array.isArray(ps.assignedJudgeIds) ? ps.assignedJudgeIds.length : 0, 'Number'),
        cell(
          ps.origin === 'open_innovation'
            ? 'Open Innovation (team-submitted)'
            : ps.origin === 'super_ps'
              ? 'Super PS'
              : 'Curated',
        ),
      ]
      return `<Row>${cells.join('')}</Row>`
    }).join('')
    const cols = widths.map((w) => `<Column ss:AutoFitWidth="0" ss:Width="${w}"/>`).join('')

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A8A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
 </Styles>
 <Worksheet ss:Name="Problem Statements">
  <Table>${cols}${headerRow}${bodyRows}</Table>
 </Worksheet>
</Workbook>`

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `problem-statements-${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
    setMsg(`Exported ${sortedRows.length} problem statement(s) to Excel.`)
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBulkFileName(file.name)
    setBulkResult(null)
    setBulkParseError('')

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setBulkParseError('Only .csv files are supported. Save your Excel sheet as CSV first (File → Save As → CSV).')
      setBulkRows([])
      return
    }

    try {
      // Read as UTF-8 first. If we detect mojibake patterns, fall back to Windows-1252.
      // (Excel on Windows often saves CSV as windows-1252 unless "CSV UTF-8" is chosen.)
      const buffer = await file.arrayBuffer()
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
      // Heuristic: if the UTF-8 decoded text contains the classic mojibake sequences
      // ('├' or 'Â' followed by garbage), it was probably actually Windows-1252.
      if (/├\s?[ç│Ç├Â]/.test(text) || /Ã[©¨ª¯°±²]/.test(text)) {
        try {
          text = new TextDecoder('windows-1252').decode(buffer)
        } catch { /* keep utf-8 */ }
      }
      const { headers, rows, error } = parseCSV(text)
      if (error) {
        setBulkParseError(error)
        setBulkRows([])
        return
      }
      // Validate at least the title column exists
      if (!headers.includes('title')) {
        setBulkParseError('CSV is missing the required "title" column. Download the template to see the expected format.')
        setBulkRows([])
        return
      }
      // Pre-validate rows and collect errors
      const errs = []
      const valid = []
      rows.forEach((r, idx) => {
        const lineNum = idx + 2
        if (!r.title || !r.title.trim()) {
          errs.push({ line: lineNum, error: 'Missing required field: title' })
        } else {
          valid.push(r)
        }
      })
      setBulkRows(rows)
      setBulkErrors(errs)
    } catch (err) {
      setBulkParseError(err.message || 'Could not read file')
      setBulkRows([])
    }
  }

  async function submitBulkImport() {
    if (bulkRows.length === 0) return
    setBulkSubmitting(true)
    setBulkResult(null)
    try {
      const origin = bulkMode === PS_TYPE.SUPER ? PS_TYPE.SUPER : undefined
      const result = await api.bulkImportProblemStatements(bulkRows, origin)
      setBulkResult(result)
      if (result.success > 0) {
        const label = bulkMode === PS_TYPE.SUPER ? 'Super PS import' : 'Bulk import'
        setMsg(`✓ ${label}: ${result.success} added, ${result.skipped || 0} skipped, ${result.failed || 0} failed.`)
        await load()
      }
    } catch (err) {
      setBulkResult({ success: 0, failed: bulkRows.length, errors: [{ line: 0, error: err.message }] })
    } finally {
      setBulkSubmitting(false)
    }
  }

  const togglePsOpen = useCallback((id) => {
    setOpenPsIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Admin endpoint includes drafts + private Open Innovation entries.
      const list = await api.listAdminProblemStatements(eventId || undefined)
      setRows(Array.isArray(list) ? list : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const ids = new Set(rows.map((r) => r.id))
    setOpenPsIds((prev) => {
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [rows])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const oa = typeof a.order === 'number' ? a.order : 9999
      const ob = typeof b.order === 'number' ? b.order : 9999
      if (oa !== ob) return oa - ob
      return String(a.title || '').localeCompare(String(b.title || ''))
    })
  }, [rows])

  // Problem statements are grouped into three tiers:
  //  • Super PS       (origin === 'super_ps')       — flagship / high-priority
  //  • Open Innovation(origin === 'open_innovation') — participant-authored, private
  //  • Curated        (no origin)                    — the standard problem bank
  const isOpenInnovation = (ps) => ps?.origin === 'open_innovation'
  const isSuperPs = (ps) => ps?.origin === 'super_ps'
  const curatedRows = useMemo(
    () => sortedRows.filter((p) => !isOpenInnovation(p) && !isSuperPs(p)),
    [sortedRows],
  )
  const superRows = useMemo(() => sortedRows.filter(isSuperPs), [sortedRows])
  const openInnovationRows = useMemo(() => sortedRows.filter(isOpenInnovation), [sortedRows])
  // Admin-managed rows that carry a selection checkbox (curated + super). Open
  // Innovation entries are managed separately and are not part of select-all.
  const manageableRows = useMemo(() => [...curatedRows, ...superRows], [curatedRows, superRows])

  // Which sections are visible given the current filter dropdown.
  const showCurated = typeFilter === 'all' || typeFilter === PS_TYPE.CURATED
  const showSuper = typeFilter === 'all' || typeFilter === PS_TYPE.SUPER
  const showOpenInnovation = typeFilter === 'all' || typeFilter === PS_TYPE.OPEN_INNOVATION

  function rowTitle(ps) {
    return edits[ps.id]?.title ?? ps.title ?? ''
  }

  async function saveRow(ps) {
    setMsg('')
    const e = edits[ps.id] || {}
    try {
      const patch = {}
      if (e.title !== undefined) patch.title = e.title
      if (e.organization !== undefined) {
        patch.organization = e.organization
        patch.poweredBy = e.organization === '' ? '' : e.organization
      }
      if (e.department !== undefined) patch.department = e.department
      if (e.category !== undefined) {
        patch.category = e.category
        patch.domain = e.category === '' ? '' : e.category
      }
      if (e.theme !== undefined) patch.theme = e.theme
      if (e.origin !== undefined) patch.origin = e.origin === PS_TYPE.SUPER ? PS_TYPE.SUPER : ''
      if (e.description !== undefined) patch.description = e.description
      if (e.published !== undefined) patch.published = e.published
      if (e.order !== undefined && e.order !== '') {
        const n = Number(e.order)
        if (!Number.isNaN(n)) patch.order = n
      }
      if (e.maxTeams !== undefined) {
        if (e.maxTeams === '' || e.maxTeams === null) patch.maxTeams = null
        else {
          const n = Number(e.maxTeams)
          if (!Number.isNaN(n) && n >= 0) patch.maxTeams = n
        }
      }
      if (Object.keys(patch).length === 0) {
        setMsg('No changes to save.')
        return
      }
      await api.patchAdminProblemStatement(ps.id, patch)
      setMsg(`Saved ${ps.id}`)
      setEdits((prev) => {
        const next = { ...prev }
        delete next[ps.id]
        return next
      })
      await load()
    } catch (err) {
      setMsg(err.message || 'Save failed')
    }
  }

  async function createPs() {
    if (!eventId) {
      setMsg('Hackathon scope not loaded. Set config/platform.defaultEventId in Firestore.')
      return
    }
    const title = newTitle.trim()
    if (!title) {
      setMsg('Name is required.')
      return
    }
    setCreating(true)
    setMsg('')
    try {
      const organization = newOrganization.trim()
      const department = newDepartment.trim()
      const category = newCategory.trim()
      const theme = newTheme.trim()
      const body = {
        title,
        organization,
        poweredBy: organization,
        department,
        category,
        domain: category,
        theme,
        description: newDescription.trim(),
        published: newPublished,
        ...(newType === PS_TYPE.SUPER ? { origin: PS_TYPE.SUPER } : {}),
      }
      const idSlug = newId.trim()
      if (idSlug) body.id = idSlug
      if (newOrder.trim() !== '') {
        const o = Number(newOrder)
        if (!Number.isNaN(o)) body.order = o
      }
      if (newMaxTeams.trim() !== '') {
        const m = Number(newMaxTeams)
        if (!Number.isNaN(m) && m >= 0) body.maxTeams = m
      }
      const res = await api.createAdminProblemStatement(body)
      const createdId = typeof res?.id === 'string' ? res.id : ''
      setMsg(`Added "${title}".`)
      if (createdId) setOpenPsIds((prev) => new Set(prev).add(createdId))
      setNewId('')
      setNewTitle('')
      setNewOrganization('')
      setNewDepartment('')
      setNewCategory('')
      setNewTheme('')
      setNewDescription('')
      setNewPublished(true)
      setNewMaxTeams('')
      setNewOrder('')
      setNewType(PS_TYPE.CURATED)
      await load()
    } catch (err) {
      setMsg(err.message || 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function deletePs(ps) {
    if (!window.confirm(`Delete "${ps.title}" (${ps.id})?`)) return
    setMsg('')
    try {
      await api.deleteAdminProblemStatement(ps.id)
      setMsg(`Deleted ${ps.id}`)
      await load()
    } catch (err) {
      setMsg(err.message || 'Delete failed')
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === manageableRows.length && manageableRows.length > 0) return new Set()
      return new Set(manageableRows.map((r) => r.id))
    })
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} problem statement(s)? This cannot be undone.`)) return
    setBulkDeleting(true)
    setMsg('')
    let success = 0
    let failed = 0
    const errors = []
    for (const id of selectedIds) {
      try {
        await api.deleteAdminProblemStatement(id)
        success++
      } catch (err) {
        failed++
        errors.push(`${id}: ${err.message}`)
      }
    }
    setBulkDeleting(false)
    setSelectedIds(new Set())
    setMsg(
      failed > 0
        ? `✓ Deleted ${success}. ✗ Failed ${failed}: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '…' : ''}`
        : `✓ Deleted ${success} problem statement(s).`,
    )
    await load()
  }

  // Shared renderer for an admin-managed problem-statement card (used by both the
  // Curated and the Super PS sections — same editor, so they never drift apart).
  function renderPsCard(ps) {
    const isOpen = openPsIds.has(ps.id)
    const orgDisp = displayOrganization(ps)
    const catDisp = displayCategory(ps)
    const currentType = edits[ps.id]?.origin ?? (isSuperPs(ps) ? PS_TYPE.SUPER : PS_TYPE.CURATED)
    return (
      <Card key={ps.id} className="overflow-hidden p-0">
        <div className="flex items-center gap-1 px-4 py-3 transition hover:bg-[rgb(var(--surface-muted))]/80">
          <input
            type="checkbox"
            checked={selectedIds.has(ps.id)}
            onChange={() => toggleSelect(ps.id)}
            onClick={(e) => e.stopPropagation()}
            className="mr-2 h-4 w-4 rounded border-[rgb(var(--border))] text-brand-600 focus:ring-brand-500"
            aria-label={`Select ${ps.title}`}
          />
          <button
            type="button"
            className="flex flex-1 items-center gap-3 text-left"
            aria-expanded={isOpen}
            onClick={() => togglePsOpen(ps.id)}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--surface-muted))] text-ink-500">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-ink-900">{rowTitle(ps) || ps.title}</span>
              {!isOpen && (orgDisp || catDisp || displayTheme(ps)) ? (
                <span className="mt-0.5 block truncate text-xs text-ink-500">
                  {[catDisp, displayTheme(ps), orgDisp].filter(Boolean).join(' · ') || null}
                </span>
              ) : null}
            </span>
            {isSuperPs(ps) ? (
              <Badge tone="brand" className="shrink-0">Super PS</Badge>
            ) : null}
            <Badge tone={ps.published !== false ? 'success' : 'neutral'} className="shrink-0">
              {ps.published !== false ? 'published' : 'draft'}
            </Badge>
          </button>
        </div>

        {isOpen ? (
          <div className="border-t border-[rgb(var(--border))] px-4 pb-4 pt-2">
            <p className="mb-4 font-mono text-[11px] text-ink-500">{ps.id}</p>

            <div className="flex flex-wrap items-center justify-end gap-2 pb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(edits[ps.id]?.published ?? ps.published) !== false}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [ps.id]: { ...prev[ps.id], published: e.target.checked },
                    }))
                  }
                />
                Published
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => void deletePs(ps)}>
                Delete
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Name"
                value={edits[ps.id]?.title ?? ps.title ?? ''}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...prev,
                    [ps.id]: { ...prev[ps.id], title: e.target.value },
                  }))
                }
              />
              <Input
                label="Organization"
                value={edits[ps.id]?.organization ?? displayOrganization(ps)}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...prev,
                    [ps.id]: { ...prev[ps.id], organization: e.target.value },
                  }))
                }
              />
            </div>
            <Input
              className="mt-3"
              label="Department"
              value={edits[ps.id]?.department ?? displayDepartment(ps)}
              onChange={(e) =>
                setEdits((prev) => ({
                  ...prev,
                  [ps.id]: { ...prev[ps.id], department: e.target.value },
                }))
              }
            />
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Type</label>
              <select
                value={currentType}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...prev,
                    [ps.id]: { ...prev[ps.id], origin: e.target.value },
                  }))
                }
                className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value={PS_TYPE.CURATED}>Curated problem statement</option>
                <option value={PS_TYPE.SUPER}>Super PS (flagship)</option>
              </select>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Track</label>
                <select
                  value={edits[ps.id]?.category ?? displayCategory(ps) ?? ''}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [ps.id]: { ...prev[ps.id], category: e.target.value },
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">— Select track —</option>
                  {TRACK_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
                <select
                  value={edits[ps.id]?.theme ?? displayTheme(ps) ?? ''}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [ps.id]: { ...prev[ps.id], theme: e.target.value },
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">— Select domain —</option>
                  {DOMAIN_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Input
                label="Sort order"
                type="number"
                value={String(edits[ps.id]?.order ?? ps.order ?? '')}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...prev,
                    [ps.id]: { ...prev[ps.id], order: e.target.value },
                  }))
                }
              />
              <Input
                label="Max teams (empty = no cap)"
                type="number"
                min={0}
                value={String(
                  edits[ps.id]?.maxTeams !== undefined ? edits[ps.id].maxTeams : (ps.maxTeams ?? ''),
                )}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...prev,
                    [ps.id]: { ...prev[ps.id], maxTeams: e.target.value },
                  }))
                }
              />
            </div>
            <Textarea
              className="mt-3"
              label="Description"
              rows={5}
              value={edits[ps.id]?.description ?? ps.description ?? ''}
              onChange={(e) =>
                setEdits((prev) => ({
                  ...prev,
                  [ps.id]: { ...prev[ps.id], description: e.target.value },
                }))
              }
            />
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-500">
              <span>Selections: {typeof ps.selectionCount === 'number' ? ps.selectionCount : 0}</span>
              {Array.isArray(ps.assignedJudgeIds) && ps.assignedJudgeIds.length > 0 ? (
                <span>Judges: {ps.assignedJudgeIds.length}</span>
              ) : null}
            </div>
            <Button className="mt-4" size="sm" type="button" onClick={() => saveRow(ps)}>
              Save changes
            </Button>
          </div>
        ) : null}
      </Card>
    )
  }

  if (loading || eventLoading) return <Skeleton className="h-96 w-full rounded-2xl" />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Problem statements</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Build the list for <strong>{APP.name}</strong>. The same published rows appear on the public{' '}
            <Link to="/problems" className="font-medium text-brand-600 underline-offset-2 hover:underline">
              Problems
            </Link>{' '}
            page and in the participant dashboard. Judges still use these ids under{' '}
            <Link to="/admin/jury" className="font-medium text-brand-600 underline-offset-2 hover:underline">
              Jury Management
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={exportAllPs}
            disabled={sortedRows.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export all (Excel)
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => { resetBulkState(); setBulkMode(PS_TYPE.CURATED); setBulkOpen(true) }}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Bulk import (CSV)
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => { resetBulkState(); setBulkMode(PS_TYPE.SUPER); setBulkOpen(true) }}
            className="gap-2 border-indigo-500/40 text-indigo-700 hover:bg-indigo-500/5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Super PS (CSV)
          </Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-brand-700">{msg}</p> : null}

      <Card className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900">Add problem</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Problem ID (document id, optional)"
            placeholder="e.g. civic-dashboard"
            value={newId}
            disabled={creating}
            onChange={(e) => setNewId(e.target.value)}
          />
          <p className="self-end text-xs text-ink-500 sm:self-center">
            Stored as: <span className="font-mono">{slugPreview(newId)}</span>
          </p>
        </div>
        <Input label="Name" value={newTitle} disabled={creating} onChange={(e) => setNewTitle(e.target.value)} />
        <Input
          label="Organization"
          placeholder="Host org / sponsor"
          value={newOrganization}
          disabled={creating}
          onChange={(e) => setNewOrganization(e.target.value)}
        />
        <Input
          label="Department"
          placeholder="Department offering this challenge"
          value={newDepartment}
          disabled={creating}
          onChange={(e) => setNewDepartment(e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Type</label>
          <select
            value={newType}
            disabled={creating}
            onChange={(e) => setNewType(e.target.value)}
            className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
          >
            <option value={PS_TYPE.CURATED}>Curated problem statement</option>
            <option value={PS_TYPE.SUPER}>Super PS (flagship)</option>
          </select>
          <p className="mt-1 text-xs text-ink-500">
            Super PS are listed in their own section and use a separate import template.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Track</label>
            <select
              value={newCategory}
              disabled={creating}
              onChange={(e) => setNewCategory(e.target.value)}
              className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            >
              <option value="">— Select track —</option>
              {TRACK_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Domain</label>
            <select
              value={newTheme}
              disabled={creating}
              onChange={(e) => setNewTheme(e.target.value)}
              className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            >
              <option value="">— Select domain —</option>
              {DOMAIN_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        <Textarea
          label="Description"
          rows={4}
          value={newDescription}
          disabled={creating}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="List order (optional)"
            type="number"
            placeholder="auto"
            value={newOrder}
            disabled={creating}
            onChange={(e) => setNewOrder(e.target.value)}
          />
          <Input
            label="Max teams (optional)"
            type="number"
            min={0}
            placeholder="no cap"
            value={newMaxTeams}
            disabled={creating}
            onChange={(e) => setNewMaxTeams(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm sm:mt-7">
            <input type="checkbox" checked={newPublished} disabled={creating} onChange={(e) => setNewPublished(e.target.checked)} />
            Published (visible on site & to participants)
          </label>
        </div>
        <Button type="button" disabled={creating} variant="primary" onClick={() => void createPs()}>
          {creating ? 'Adding…' : 'Add to list'}
        </Button>
      </Card>

      {/* Filter problem statements by type (separate dropdown for the PS tab) */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-4 py-3">
        <label htmlFor="ps-type-filter" className="text-sm font-medium text-ink-700">Filter by type</label>
        <select
          id="ps-type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All types</option>
          <option value={PS_TYPE.CURATED}>Curated only</option>
          <option value={PS_TYPE.SUPER}>Super PS only</option>
          <option value={PS_TYPE.OPEN_INNOVATION}>Open Innovation only</option>
        </select>
        <span className="text-xs text-ink-500">
          {curatedRows.length} curated · {superRows.length} super PS · {openInnovationRows.length} open innovation
        </span>
      </div>

      {showCurated ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink-900">Curated problem statements</h2>
          {manageableRows.length > 0 ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={selectedIds.size === manageableRows.length && manageableRows.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < manageableRows.length
                  }}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[rgb(var(--border))] text-brand-600 focus:ring-brand-500"
                />
                Select all
              </label>
              {selectedIds.size > 0 ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={bulkDeleting}
                  onClick={() => void bulkDelete()}
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {curatedRows.map(renderPsCard)}
        {curatedRows.length === 0 ? (
          <p className="text-sm text-ink-500">No problems yet — add one above.</p>
        ) : null}
      </div>
      ) : null}

      {/* ── Super PS: flagship / high-priority problem statements ── */}
      {showSuper ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
              <Lightbulb className="h-4 w-4 text-brand-500" />
              Super PS (flagship)
            </h2>
            <span className="text-xs text-ink-500">{superRows.length} problem statement(s)</span>
          </div>
          <p className="text-xs text-ink-500">
            High-priority, flagship problem statements. They use a{' '}
            <strong>separate import template</strong> and are grouped here so they stand apart from the
            standard problem bank. Published Super PS still appear on the public Problems page.
          </p>
          {superRows.map(renderPsCard)}
          {superRows.length === 0 ? (
            <p className="text-sm text-ink-500">
              No Super PS yet — add one above (set Type to “Super PS”) or use “Import Super PS (CSV)”.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Open Innovation: participant-submitted problem statements ── */}
      {showOpenInnovation ? (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Open Innovation (submitted by teams)
          </h2>
          <span className="text-xs text-ink-500">{openInnovationRows.length} submission(s)</span>
        </div>
        <p className="text-xs text-ink-500">
          These are participant-authored problem statements. Each is private to its team and never
          published on the public site. Judges assigned the <strong>Open Innovation</strong> domain
          can see and evaluate them.
        </p>

        {openInnovationRows.length === 0 ? (
          <p className="text-sm text-ink-500">No Open Innovation submissions yet.</p>
        ) : (
          openInnovationRows.map((ps) => {
            const isOpen = openPsIds.has(ps.id)
            const e = edits[ps.id] || {}
            return (
              <Card key={ps.id} className="overflow-hidden border-amber-500/30 p-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-amber-500/[0.04]"
                  aria-expanded={isOpen}
                  onClick={() => togglePsOpen(ps.id)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-ink-900">{ps.title || '(untitled)'}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-500">
                      <span className="font-mono">{ps.id}</span>
                      {ps.ownerTeamName ? ` · ${ps.ownerTeamName}` : ''}
                      {ps.category ? ` · ${ps.category}` : ''}
                      {ps.selfDomain ? ` · ${ps.selfDomain}` : ''}
                    </span>
                  </span>
                  <Badge tone="warn" className="shrink-0">private</Badge>
                </button>

                {isOpen ? (
                  <div className="border-t border-[rgb(var(--border))] px-4 pb-4 pt-3">
                    <div className="mb-4 grid gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs sm:grid-cols-2">
                      <p className="text-ink-600">Problem ID: <span className="font-mono text-ink-900">{ps.id}</span></p>
                      <p className="text-ink-600">Team: <strong className="text-ink-900">{ps.ownerTeamName || '—'}</strong></p>
                      <p className="text-ink-600">Team ID: <span className="font-mono text-ink-800">{ps.ownerTeamId || '—'}</span></p>
                      <p className="text-ink-600">Track: <strong className="text-ink-900">{ps.category || '—'}</strong></p>
                      <p className="text-ink-600">Their domain choice: <strong className="text-ink-900">{ps.selfDomain || '—'}</strong></p>
                      <p className="text-ink-600">Judging domain: <strong className="text-ink-900">{ps.theme || '—'}</strong></p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Title"
                        value={e.title ?? ps.title ?? ''}
                        onChange={(ev) => setEdits((prev) => ({ ...prev, [ps.id]: { ...prev[ps.id], title: ev.target.value } }))}
                      />
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-ink-700">Track</label>
                        <select
                          value={e.category ?? ps.category ?? ''}
                          onChange={(ev) => setEdits((prev) => ({ ...prev, [ps.id]: { ...prev[ps.id], category: ev.target.value } }))}
                          className="h-11 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          <option value="">— Select track —</option>
                          {TRACK_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    <Textarea
                      className="mt-3"
                      label="Brief of the idea (as written by the team)"
                      rows={6}
                      value={e.description ?? ps.description ?? ''}
                      onChange={(ev) => setEdits((prev) => ({ ...prev, [ps.id]: { ...prev[ps.id], description: ev.target.value } }))}
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" type="button" onClick={() => saveRow(ps)}>Save changes</Button>
                      <Button size="sm" variant="secondary" type="button" onClick={() => void deletePs(ps)}>Delete</Button>
                      <span className="ml-auto text-xs text-ink-500">
                        Selections: {typeof ps.selectionCount === 'number' ? ps.selectionCount : 0}
                      </span>
                    </div>
                  </div>
                ) : null}
              </Card>
            )
          })
        )}
      </div>
      ) : null}

      {/* Bulk Import Modal */}
      {bulkOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] p-5">
              <div>
                <h2 className="font-display text-xl font-bold text-ink-900">
                  {bulkMode === PS_TYPE.SUPER ? 'Import Super PS' : 'Bulk import problem statements'}
                </h2>
                <p className="mt-1 text-sm text-ink-600">
                  {bulkMode === PS_TYPE.SUPER
                    ? 'Upload a CSV to add multiple Super PS (flagship) problem statements at once.'
                    : 'Upload a CSV file to add multiple problem statements at once.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkModal}
                className="rounded-lg p-1 text-ink-500 hover:bg-[rgb(var(--surface-muted))] hover:text-ink-900"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-5 p-5">
              {/* Step 1: Download template */}
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Step 1</p>
                <h3 className="mt-1 font-semibold text-ink-900">
                  {bulkMode === PS_TYPE.SUPER ? 'Download the Super PS template' : 'Download the CSV template'}
                </h3>
                <p className="mt-1 text-sm text-ink-600">
                  Open it in Excel or Google Sheets, fill in your rows, then save back as <strong>CSV</strong>.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={handleDownloadTemplate} className="mt-3 gap-2">
                  <Download className="h-4 w-4" />
                  {bulkMode === PS_TYPE.SUPER ? 'Download super-ps-template.csv' : 'Download template.csv'}
                </Button>
              </div>

              {/* Column reference */}
              <div className="rounded-xl border border-[rgb(var(--border))] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Expected columns</p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2 sm:col-span-2">
                    <p><code className="font-mono font-bold text-ink-900">title</code> <span className="text-red-600">*required</span></p>
                    <p className="mt-0.5 text-ink-500">The problem statement name (max 200 chars)</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">organization</code></p>
                    <p className="mt-0.5 text-ink-500">Sponsor / host organization</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">department</code></p>
                    <p className="mt-0.5 text-ink-500">Department offering the challenge</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">track</code></p>
                    <p className="mt-0.5 text-ink-500">Must be exactly: <strong>Software</strong> or <strong>Hardware</strong></p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">domain</code></p>
                    <p className="mt-0.5 text-ink-500">One of: Health · Education · Transportation · Food Safety &amp; Security · Waste Management · Agriculture · Industry &amp; MSME Innovation · Open Innovation</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2 sm:col-span-2">
                    <p><code className="font-mono font-bold text-ink-900">description</code></p>
                    <p className="mt-0.5 text-ink-500">Long description (max 20,000 chars). Wrap in quotes if it contains commas.</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">published</code></p>
                    <p className="mt-0.5 text-ink-500">true/false (default: true). Also accepts yes/no, 1/0</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2">
                    <p><code className="font-mono font-bold text-ink-900">maxTeams</code></p>
                    <p className="mt-0.5 text-ink-500">Optional cap on team selection count</p>
                  </div>
                  <div className="rounded-lg bg-[rgb(var(--surface-muted))]/60 p-2 sm:col-span-2">
                    <p><code className="font-mono font-bold text-ink-900">order</code></p>
                    <p className="mt-0.5 text-ink-500">Display order (auto-incremented from current max if blank)</p>
                  </div>
                  <div className="col-span-full rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                    <p className="text-emerald-800"><strong>Note:</strong> The system auto-assigns sequential PS Numbers (skh001, skh002, …). You don't need an <code className="font-mono">id</code> column.</p>
                  </div>
                </div>
              </div>

              {/* Step 2: Upload */}
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Step 2</p>
                <h3 className="mt-1 font-semibold text-ink-900">Upload your CSV file</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelect}
                  className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
                />
                {bulkFileName ? (
                  <p className="mt-2 text-xs text-ink-500">
                    File: <span className="font-mono text-ink-700">{bulkFileName}</span>
                  </p>
                ) : null}
              </div>

              {/* Parse error */}
              {bulkParseError ? (
                <div className="flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{bulkParseError}</span>
                </div>
              ) : null}

              {/* Preview */}
              {bulkRows.length > 0 && !bulkResult ? (
                <div className="rounded-xl border border-[rgb(var(--border))] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Preview</p>
                    <Badge tone={bulkErrors.length > 0 ? 'warn' : 'success'}>
                      {bulkRows.length} row(s){bulkErrors.length > 0 ? ` · ${bulkErrors.length} issue(s)` : ''}
                    </Badge>
                  </div>
                  <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[rgb(var(--border))]">
                    <table className="w-full text-xs">
                      <thead className="bg-[rgb(var(--surface-muted))]/60 text-ink-700">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold">#</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Title</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Track</th>
                          <th className="px-2 py-1.5 text-left font-semibold">Domain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-[rgb(var(--border))]">
                            <td className="px-2 py-1.5 font-mono text-ink-500">{i + 2}</td>
                            <td className="px-2 py-1.5 text-ink-900">{r.title || <span className="text-red-600">missing</span>}</td>
                            <td className="px-2 py-1.5 text-ink-600">{r.track || r.category || '—'}</td>
                            <td className="px-2 py-1.5 text-ink-600">{r.domain || r.theme || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkRows.length > 10 ? (
                      <p className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/40 px-2 py-1.5 text-center text-ink-500">
                        + {bulkRows.length - 10} more row(s)
                      </p>
                    ) : null}
                  </div>

                  {bulkErrors.length > 0 ? (
                    <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                      <p className="text-xs font-bold text-amber-800">Pre-validation warnings:</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                        {bulkErrors.slice(0, 5).map((err, i) => (
                          <li key={i}>Line {err.line}: {err.error}</li>
                        ))}
                        {bulkErrors.length > 5 ? (
                          <li className="italic">+ {bulkErrors.length - 5} more...</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Result */}
              {bulkResult ? (
                <div className={`rounded-xl border p-4 ${
                  bulkResult.success > 0
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-red-500/30 bg-red-500/5'
                }`}>
                  <div className="flex items-center gap-2">
                    {bulkResult.success > 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <p className="font-semibold text-ink-900">
                      Imported {bulkResult.success || 0} of {bulkRows.length}
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5 text-emerald-800">
                      ✓ Added: <strong>{bulkResult.success || 0}</strong>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-amber-800">
                      ⊘ Skipped: <strong>{bulkResult.skipped || 0}</strong>
                    </div>
                    <div className="rounded-lg bg-red-500/10 px-2 py-1.5 text-red-800">
                      ✗ Failed: <strong>{bulkResult.failed || 0}</strong>
                    </div>
                  </div>
                  {Array.isArray(bulkResult.errors) && bulkResult.errors.length > 0 ? (
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2">
                      <p className="text-xs font-bold text-ink-700">Details:</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
                        {bulkResult.errors.map((err, i) => (
                          <li key={i}>Line {err.line}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/30 p-4">
              <Button type="button" variant="ghost" onClick={closeBulkModal}>
                {bulkResult ? 'Close' : 'Cancel'}
              </Button>
              {!bulkResult ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={bulkRows.length === 0 || bulkSubmitting || Boolean(bulkParseError)}
                  onClick={() => void submitBulkImport()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {bulkSubmitting ? 'Importing…' : `Import ${bulkRows.length} row(s)`}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
