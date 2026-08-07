import { useEffect, useRef, useState } from 'react'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { Link } from 'react-router-dom'
import { Upload, FileText, Github, Video, ArrowLeft, Lock, AlertTriangle, CheckCircle } from 'lucide-react'
import { storage } from '@/firebase/client.js'
import { useAuth } from '@/context/AuthContext.jsx'
import { useEvent } from '@/context/EventContext.jsx'
import { Card } from '@/components/ui/Card.jsx'
import { Button } from '@/components/ui/Button.jsx'
import { Input } from '@/components/ui/Input.jsx'
import { Badge } from '@/components/ui/Badge.jsx'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { useApi } from '@/hooks/useApi.js'
import { submissionCompleteness } from '@/pages/dashboard/participant/progressUtils.js'
import { isPhaseSubmissionOpen, phaseAcceptsSubmissions } from '@/utils/phaseStatus.js'

const MAX_PPT_BYTES = 35 * 1024 * 1024
const MAX_PDF_BYTES = 35 * 1024 * 1024
const MAX_VIDEO_BYTES = 250 * 1024 * 1024

function assertFile(kind, file) {
  if (!file) return 'No file selected.'
  const name = file.name.toLowerCase()
  if (kind === 'ppt' && !name.endsWith('.ppt') && !name.endsWith('.pptx')) {
    return 'Please upload a .ppt or .pptx file.'
  }
  if (kind === 'pdf' && !name.endsWith('.pdf')) return 'Please upload a PDF file.'
  if (kind === 'video' && !file.type.startsWith('video/')) {
    return 'Please upload a video file (MP4/WebM).'
  }
  const max =
    kind === 'ppt' ? MAX_PPT_BYTES : kind === 'pdf' ? MAX_PDF_BYTES : MAX_VIDEO_BYTES
  if (file.size > max) {
    return `File too large (max ${Math.round(max / (1024 * 1024))} MB for ${kind}).`
  }
  return ''
}

export function SubmissionPage() {
  usePageSeo({ title: 'Submission Center', description: 'Upload hackathon submission assets.' })
  const { user, profile } = useAuth()
  const { eventId, eventCfg } = useEvent()   // ← live from Firestore onSnapshot
  const api = useApi()
  const [sub, setSub] = useState(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [status, setStatus] = useState('')
  const [pct, setPct] = useState(0)

  // Auto-dismiss status toast after 6 seconds
  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(''), 6000)
    return () => clearTimeout(timer)
  }, [status])
  const [teamLocked, setTeamLocked] = useState(false)
  const [teamData, setTeamData] = useState(null)

  const teamId = profile?.teamId

  // Derive phase data directly from live eventCfg — no separate fetch needed
  const activePhase = eventCfg?.activePhase || null
  const phases = Array.isArray(eventCfg?.competitionPhases) ? eventCfg.competitionPhases : []
  const deadlineLabel = eventCfg?.submissionDeadline
    ? new Date(eventCfg.submissionDeadline).toLocaleString()
    : ''

  // HIGH-10: Debounce timer ref for deployedUrl onChange
  const deployedUrlTimer = useRef(null)

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => { clearTimeout(deployedUrlTimer.current) }
  }, [])

  // HIGH-05: Load submission data and team info via backend API
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!teamId) return
      try {
        const [versionsData, rosterData] = await Promise.all([
          api.getSubmissionVersions(),
          api.teamRoster(),
        ])
        if (cancelled) return
        const current = versionsData?.current || {}
        const subData = {
          ...current,
          phases: versionsData?.phases || {},
          currentPhaseId: versionsData?.currentPhaseId || null,
          status: current.pptUrl || current.pdfUrl || current.videoUrl || current.githubUrl ? 'draft' : 'draft',
        }
        setSub(subData)
        setGithubUrl(current.githubUrl || '')
        setVideoUrl(current.videoUrl || '')
        setTeamLocked(Boolean(rosterData?.submissionLocked))
        setTeamData({
          submissionLocked: Boolean(rosterData?.submissionLocked),
          eventRegistered: Boolean(rosterData?.eventRegistered),
          paymentStatus: rosterData?.paymentStatus || 'pending',
          paymentChoice: rosterData?.paymentChoice || null,
          shortlistedPhases: Array.isArray(rosterData?.shortlistedPhases) ? rosterData.shortlistedPhases : [],
        })
      } catch {
        // API error — leave state as null
      }
    }
    load()
    return () => { cancelled = true }
  }, [teamId, api])

  const locked = teamLocked || Boolean(sub?.finalizedAt)
  const progress = submissionCompleteness(sub)

  // Phase-aware logic
  const isPhase1 = activePhase && phases.find((p) => p.id === activePhase.id)?.order === 1
  const teamShortlistedPhases = teamData?.shortlistedPhases || []
  const teamCanAccessActivePhase = !activePhase || isPhase1 || teamShortlistedPhases.includes(activePhase.id)
  // Phase is open if backend would accept a submission. Shared helper keeps this
  // consistent with backend isPhaseSubmissionOpen()/canTeamSubmit() so the UI
  // doesn't grey out uploads while the phase is genuinely open.
  // A phase with no required artifacts (e.g. registration / problem-statements
  // phase) is NOT a submission phase — the Submission Center stays closed.
  const activePhaseIsSubmission = !activePhase || phaseAcceptsSubmissions(activePhase)
  const phaseSubmissionsOpen = !activePhase || (isPhaseSubmissionOpen(activePhase) && activePhaseIsSubmission)
  const phaseDeadlinePassed = activePhase?.deadline && new Date(activePhase.deadline).getTime() < Date.now()
  const phaseRequirements = activePhase
    ? (activePhase.requirements || { pptRequired: false, pdfRequired: false, videoRequired: false, githubRequired: false, deployedUrlRequired: false })
    : { pptRequired: true, pdfRequired: true, videoRequired: false, githubRequired: false, deployedUrlRequired: false }
  
  // Check if payment is pending (Phase 3: Pay Later flow)
  const paymentPending = teamData && 
    teamData.paymentStatus === 'pending' && 
    !teamData.eventRegistered &&
    teamData.paymentChoice === 'later'

  async function uploadFile(kind, file) {
    if (!storage || !teamId || !user) {
      setStatus('Configure Firebase Storage to enable uploads.')
      return
    }
    if (locked) {
      setStatus('Submission is locked — contact an admin if you need changes.')
      return
    }
    // BUG-5 FIX: Validate phase gate before starting the Storage upload.
    // Without this, the file uploads to Storage even when the phase is closed,
    // and only the metadata write is blocked — leaving orphaned files in Storage.
    if (activePhase && (!phaseSubmissionsOpen || phaseDeadlinePassed)) {
      setStatus('Submissions are not open for the current phase.')
      return
    }
    if (activePhase && !teamCanAccessActivePhase) {
      setStatus('Your team is not shortlisted for this phase.')
      return
    }
    const err = assertFile(kind, file)
    if (err) {
      setStatus(err)
      return
    }
    setStatus('')
    const path = `submissions/${teamId}/${kind}/${file.name}`
    const storageRef = ref(storage, path)
    const task = uploadBytesResumable(storageRef, file)
    task.on(
      'state_changed',
      (s) => setPct(Math.round((100 * s.bytesTransferred) / s.totalBytes)),
      (e) => setStatus(e.message),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref)
        const field = kind === 'ppt' ? 'pptUrl' : kind === 'pdf' ? 'pdfUrl' : 'videoUrl'
        try {
          const result = await api.patchSubmissionMetadata({ [field]: url, status: 'draft' })
          setSub((prev) => ({ ...prev, [field]: url, status: 'draft' }))
          setPct(0)
          const versionInfo = result?.currentVersion ? ` (Version ${result.currentVersion})` : ''
          setStatus(`Uploaded — saved as draft${versionInfo} until you finalize.`)
        } catch (e) {
          setPct(0)
          setStatus(e.message || 'Upload reached Storage but metadata write failed (API / deadline).')
        }
      },
    )
  }

  async function saveLinks() {
    if (!teamId || !user) return
    if (locked) {
      setStatus('Submission is locked.')
      return
    }
    if (activePhase && (!phaseSubmissionsOpen || phaseDeadlinePassed)) {
      setStatus('Submissions are not open for the current phase.')
      return
    }
    if (activePhase && !teamCanAccessActivePhase) {
      setStatus('Your team is not shortlisted for this phase.')
      return
    }
    setStatus('')
    try {
      const result = await api.patchSubmissionMetadata({ githubUrl, status: 'draft' })
      setSub((prev) => ({ ...prev, githubUrl, status: 'draft' }))
      const versionInfo = result?.currentVersion ? ` (Version ${result.currentVersion})` : ''
      setStatus(`GitHub link saved (draft)${versionInfo}.`)
    } catch (e) {
      setStatus(e.message || 'Could not save links')
    }
  }

  // Demo video is submitted as a YouTube link (not a file upload).
  async function saveVideoLink() {
    if (!teamId || !user) return
    if (locked) { setStatus('Submission is locked.'); return }
    if (activePhase && (!phaseSubmissionsOpen || phaseDeadlinePassed)) {
      setStatus('Submissions are not open for the current phase.')
      return
    }
    if (activePhase && !teamCanAccessActivePhase) {
      setStatus('Your team is not shortlisted for this phase.')
      return
    }
    const trimmed = videoUrl.trim()
    if (trimmed && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(trimmed)) {
      setStatus('Please enter a valid YouTube link (youtube.com or youtu.be).')
      return
    }
    setStatus('')
    try {
      const result = await api.patchSubmissionMetadata({ videoUrl: trimmed, status: 'draft' })
      setSub((prev) => ({ ...prev, videoUrl: trimmed, status: 'draft' }))
      const versionInfo = result?.currentVersion ? ` (Version ${result.currentVersion})` : ''
      setStatus(`Demo video link saved (draft)${versionInfo}.`)
    } catch (e) {
      setStatus(e.message || 'Could not save the video link')
    }
  }

  async function finalize() {
    setStatus('')
    if (!canFinalize) {
      setStatus(finalizeBlockedReason || 'You cannot finalize yet.')
      return
    }
    try {
      await api.finalizeSubmission()
      setStatus('Submission finalized and locked.')
      // HIGH-05: Reload via API instead of direct Firestore reads
      const [versionsData, rosterData] = await Promise.all([
        api.getSubmissionVersions(),
        api.teamRoster(),
      ])
      const current = versionsData?.current || {}
      setSub((prev) => ({ ...prev, ...current, phases: versionsData?.phases || {} }))
      setTeamLocked(Boolean(rosterData?.submissionLocked))
    } catch (e) {
      setStatus(e.message || 'Could not finalize')
    }
  }

  if (!teamId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-cyan-500/20">
          <Upload className="h-7 w-7 text-brand-600" />
        </div>
        <p className="mt-4 text-lg font-semibold text-ink-900">No team yet</p>
        <p className="mt-1 text-sm text-ink-500">Create a team before uploading submissions.</p>
        <Link to="/dashboard/team" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600">
          Go to My Team <ArrowLeft className="h-4 w-4 rotate-180" />
        </Link>
      </div>
    )
  }

  const uploadsDisabled = locked || !teamCanAccessActivePhase || !phaseSubmissionsOpen || phaseDeadlinePassed

  // ── Finalize gating ───────────────────────────────────────────────
  // A team may only finalize when the submission window is genuinely open,
  // all required artifacts are uploaded, and payment (if any) is settled.
  const submissionWindowOpen = teamCanAccessActivePhase && phaseSubmissionsOpen && !phaseDeadlinePassed
  const requiredComplete =
    (!phaseRequirements.pptRequired || Boolean(sub?.pptUrl)) &&
    (!phaseRequirements.pdfRequired || Boolean(sub?.pdfUrl)) &&
    (!phaseRequirements.videoRequired || Boolean(sub?.videoUrl)) &&
    (!phaseRequirements.githubRequired || Boolean(sub?.githubUrl)) &&
    (!phaseRequirements.deployedUrlRequired || Boolean(sub?.deployedUrl))
  const hasAnyUpload = Boolean(sub?.pptUrl || sub?.pdfUrl || sub?.videoUrl || sub?.githubUrl || sub?.deployedUrl)

  let finalizeBlockedReason = ''
  if (locked) finalizeBlockedReason = 'Your submission is already finalized and locked.'
  else if (paymentPending) finalizeBlockedReason = 'Complete your payment to unlock submissions.'
  else if (!teamCanAccessActivePhase) finalizeBlockedReason = 'Your team is not shortlisted for this phase.'
  else if (phaseDeadlinePassed) finalizeBlockedReason = 'The deadline for the current phase has passed.'
  else if (!phaseSubmissionsOpen) finalizeBlockedReason = 'Submissions are not open for the current phase yet.'
  else if (!hasAnyUpload) finalizeBlockedReason = 'Upload your files before finalizing.'
  else if (!requiredComplete) finalizeBlockedReason = 'Upload all required files before finalizing.'
  const canFinalize = !finalizeBlockedReason

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ━━ Header with Phase Banner ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="relative overflow-hidden rounded-3xl border border-[rgb(var(--border))] bg-gradient-to-br from-cyan-500/5 via-[rgb(var(--surface))] to-brand-500/5 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <h1 className="mt-3 font-display text-3xl font-extrabold text-ink-900 sm:text-4xl">Submission Center</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-500">
            Upload your files for the current competition phase. Required artifacts are marked below.
          </p>

          {/* Status chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={sub?.status === 'submitted' || locked ? 'success' : 'brand'} dot={locked} pulse={locked}>
              {locked ? 'Locked & Submitted' : sub?.status || 'Draft'}
            </Badge>
            <Badge tone="info">{progress.filled}/{progress.total} files uploaded</Badge>
            {pct > 0 && <Badge tone="warn">Uploading {pct}%</Badge>}
          </div>

          {/* Phase info */}
          {activePhase && (
            <div className={`mt-5 rounded-2xl border p-4 ${
              !teamCanAccessActivePhase ? 'border-red-500/30 bg-red-500/5' :
              !phaseSubmissionsOpen || phaseDeadlinePassed ? 'border-amber-500/30 bg-amber-500/5' :
              'border-emerald-500/30 bg-emerald-500/5'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-ink-500">Current Phase</p>
                  <h2 className="mt-0.5 font-display text-lg font-bold text-ink-900">{activePhase.name}</h2>
                  {activePhase.description && <p className="mt-0.5 text-xs text-ink-600">{activePhase.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {phaseSubmissionsOpen && !phaseDeadlinePassed ? (
                    <Badge tone="success" dot pulse>Submissions Open</Badge>
                  ) : phaseDeadlinePassed ? (
                    <Badge tone="danger" dot>Deadline Passed</Badge>
                  ) : !activePhaseIsSubmission ? (
                    <Badge tone="warn" dot>No Submission Yet</Badge>
                  ) : (
                    <Badge tone="warn" dot>Closed</Badge>
                  )}
                  {teamCanAccessActivePhase ? (
                    <Badge tone="brand">Eligible</Badge>
                  ) : (
                    <Badge tone="danger">Not Shortlisted</Badge>
                  )}
                </div>
              </div>
              {activePhase.deadline && (
                <p className="mt-2 text-xs font-medium text-ink-600">
                  Deadline: {new Date(activePhase.deadline).toLocaleString()}
                </p>
              )}
              {!teamCanAccessActivePhase && (
                <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700">
                  Your team is not shortlisted for this phase.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {locked && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <Lock className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">Submission is <strong>locked</strong>. Edits disabled until an admin unlocks your team.</p>
        </div>
      )}
      {paymentPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-900">Payment Required</p>
            <p className="mt-1 text-xs text-red-700">Complete your payment to unlock submissions.</p>
            <Link to="/dashboard/registration" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700">
              Pay Now <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
            </Link>
          </div>
        </div>
      )}

      {!locked && !paymentPending && !submissionWindowOpen && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-ink-900">Submissions are not open yet</p>
            <p className="mt-1 text-xs text-ink-600">
              {phaseDeadlinePassed
                ? 'The deadline for the current phase has passed. Uploads and finalizing are closed.'
                : !teamCanAccessActivePhase
                  ? 'Your team is not shortlisted for the current phase.'
                  : 'You’ll be notified by email and WhatsApp when PPT submission opens.'}
            </p>
          </div>
        </div>
      )}

      {/* ━━ Upload Grid ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* PPT */}
        {phaseRequirements.pptRequired && (
          <div className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all ${uploadsDisabled ? 'pointer-events-none opacity-50' : 'hover:border-brand-500/30 hover:shadow-lg'}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">PPT / Presentation</h3>
                    <p className="text-[11px] text-ink-500">Max {Math.round(MAX_PPT_BYTES / (1024 * 1024))} MB · .ppt/.pptx</p>
                  </div>
                </div>
                <Badge tone="danger" className="text-[9px]">Required</Badge>
              </div>
              {sub?.pptUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Uploaded
                </div>
              ) : null}
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[rgb(var(--border))] py-6 text-center transition-colors hover:border-brand-500/50 hover:bg-brand-500/5">
                <Upload className="h-6 w-6 text-ink-400" />
                <span className="text-xs font-medium text-ink-600">{sub?.pptUrl ? 'Replace file' : 'Click to upload'}</span>
                <input type="file" accept=".ppt,.pptx" className="hidden" disabled={uploadsDisabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile('ppt', f) }} />
              </label>
            </div>
          </div>
        )}

        {/* PDF */}
        {phaseRequirements.pdfRequired && (
          <div className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all ${uploadsDisabled ? 'pointer-events-none opacity-50' : 'hover:border-brand-500/30 hover:shadow-lg'}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-red-500/10 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">PDF Document</h3>
                    <p className="text-[11px] text-ink-500">Max {Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB · .pdf</p>
                  </div>
                </div>
                <Badge tone="danger" className="text-[9px]">Required</Badge>
              </div>
              {sub?.pdfUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Uploaded
                </div>
              ) : null}
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[rgb(var(--border))] py-6 text-center transition-colors hover:border-brand-500/50 hover:bg-brand-500/5">
                <Upload className="h-6 w-6 text-ink-400" />
                <span className="text-xs font-medium text-ink-600">{sub?.pdfUrl ? 'Replace file' : 'Click to upload'}</span>
                <input type="file" accept=".pdf" className="hidden" disabled={uploadsDisabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile('pdf', f) }} />
              </label>
            </div>
          </div>
        )}

        {/* Video — submitted as a YouTube link */}
        {phaseRequirements.videoRequired && (
          <div className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all ${uploadsDisabled ? 'pointer-events-none opacity-50' : 'hover:border-brand-500/30 hover:shadow-lg'}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                    <Video className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">Demo Video</h3>
                    <p className="text-[11px] text-ink-500">Paste your YouTube video link</p>
                  </div>
                </div>
                <Badge tone="danger" className="text-[9px]">Required</Badge>
              </div>
              {sub?.videoUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Saved
                </div>
              ) : null}
              <Input className="mt-4" value={videoUrl} disabled={uploadsDisabled} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
              <Button variant="secondary" className="mt-3 w-full gap-2" disabled={uploadsDisabled} onClick={saveVideoLink}>
                <Video className="h-4 w-4" /> Save Video Link
              </Button>
              <p className="mt-2 text-[11px] text-ink-400">Upload your demo to YouTube (public or unlisted), then paste the link here.</p>
            </div>
          </div>
        )}

        {/* GitHub */}
        {phaseRequirements.githubRequired && (
          <div className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all ${uploadsDisabled ? 'pointer-events-none opacity-50' : 'hover:border-brand-500/30 hover:shadow-lg'}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-ink-200/30 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">GitHub Repository</h3>
                    <p className="text-[11px] text-ink-500">Public repo URL</p>
                  </div>
                </div>
                <Badge tone="danger" className="text-[9px]">Required</Badge>
              </div>
              {sub?.githubUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Saved
                </div>
              ) : null}
              <Input className="mt-4" value={githubUrl} disabled={uploadsDisabled} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo" />
              <Button variant="secondary" className="mt-3 w-full gap-2" disabled={uploadsDisabled} onClick={saveLinks}>
                <Github className="h-4 w-4" /> Save Link
              </Button>
            </div>
          </div>
        )}

        {/* Deployed URL */}
        {phaseRequirements.deployedUrlRequired && (
          <div className={`group relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 transition-all ${uploadsDisabled ? 'pointer-events-none opacity-50' : 'hover:border-brand-500/30 hover:shadow-lg'}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl transition-transform group-hover:scale-150" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">Deployed URL</h3>
                    <p className="text-[11px] text-ink-500">Live deployment link</p>
                  </div>
                </div>
                <Badge tone="danger" className="text-[9px]">Required</Badge>
              </div>
              {sub?.deployedUrl ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5" /> Saved
                </div>
              ) : null}
              <Input className="mt-4" defaultValue={sub?.deployedUrl || ''} disabled={uploadsDisabled} placeholder="https://your-app.vercel.app" onChange={(e) => {
                const val = e.target.value
                clearTimeout(deployedUrlTimer.current)
                deployedUrlTimer.current = setTimeout(() => {
                  if (val !== sub?.deployedUrl) {
                    api.patchSubmissionMetadata({ deployedUrl: val, status: 'draft' })
                      .then(() => setSub((prev) => ({ ...prev, deployedUrl: val })))
                      .catch((err) => setStatus(err.message || 'Failed to save'))
                  }
                }, 600)
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ━━ Finalize ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-r from-brand-500/5 to-cyan-500/5 p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
          <Lock className="h-5 w-5 text-brand-600" /> Finalize Submission
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          Finalizing locks edits server-side. The API verifies phase & deadline before accepting.
          You can only finalize once all required files are uploaded and the submission window is open.
        </p>
        <Button className="mt-4 gap-2 shadow-lg shadow-brand-500/20" disabled={!canFinalize} onClick={finalize}>
          <Lock className="h-4 w-4" /> Finalize & Lock
        </Button>
        {!canFinalize && finalizeBlockedReason ? (
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {finalizeBlockedReason}
          </p>
        ) : null}
      </div>

      {/* ━━ Submitted Files Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Your Submissions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SubmittedFile label="Presentation (PPT)" url={sub?.pptUrl} icon="ppt" />
          <SubmittedFile label="PDF Document" url={sub?.pdfUrl} icon="pdf" />
          <SubmittedFile label="Video Demo" url={sub?.videoUrl} icon="video" />
          <SubmittedFile label="GitHub Repo" url={sub?.githubUrl} icon="github" />
          {sub?.deployedUrl && <SubmittedFile label="Deployed URL" url={sub?.deployedUrl} icon="github" />}
        </div>
      </div>

      {/* Floating Toast */}
      {status && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm animate-slide-up rounded-2xl border px-5 py-4 shadow-xl backdrop-blur-md ${
          status.startsWith('Uploaded') || status.includes('saved') || status.includes('finalized')
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
            : status.includes('locked') || status.includes('not configured') || status.includes('payment') || status.includes('deadline')
              ? 'border-red-500/30 bg-red-50 text-red-800'
              : 'border-amber-500/30 bg-amber-50 text-amber-800'
        }`}>
          <p className="text-sm font-medium">{status}</p>
        </div>
      )}
    </div>
  )
}
/** Clean file card — shows icon + label, opens in new tab on click */
function SubmittedFile({ label, url, icon }) {
  const iconColors = {
    ppt: 'bg-orange-500/10 text-orange-600',
    pdf: 'bg-red-500/10 text-red-600',
    video: 'bg-blue-500/10 text-blue-600',
    github: 'bg-ink-100 text-ink-700',
  }

  const IconComponent = icon === 'ppt' ? FileText : icon === 'pdf' ? FileText : icon === 'video' ? Video : Github

  if (!url) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[rgb(var(--border))] px-4 py-3 opacity-50">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColors[icon]}`}>
          <IconComponent className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="text-[11px] text-ink-400">Not uploaded</p>
        </div>
      </div>
    )
  }

  // Use Google Docs Viewer for PPT/PDF to preview in browser without downloading
  const viewUrl = (icon === 'ppt' || icon === 'pdf')
    ? `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`
    : url

  return (
    <a
      href={viewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 transition-all hover:border-brand-500/30 hover:shadow-md"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColors[icon]}`}>
        <IconComponent className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{label}</p>
        <p className="text-[11px] text-emerald-600">Uploaded ✓ · Click to view</p>
      </div>
      <ArrowLeft className="h-4 w-4 rotate-180 text-ink-400" />
    </a>
  )
}

