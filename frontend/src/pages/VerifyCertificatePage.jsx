import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck, Search, Download, ShieldAlert, ShieldX, Loader2, Award, Users, Building2, CalendarDays,
} from 'lucide-react'
import { usePageSeo } from '@/hooks/usePageSeo.js'
import { CertificateCanvas, printCertificate } from '@/components/certificates/CertificateCanvas.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function VerifyCertificatePage() {
  usePageSeo({
    title: 'Verify Certificate',
    description: 'Confirm that a Smart Kopargaon Hackathon certificate is genuine by entering its Certificate ID.',
  })

  const { certId: routeId } = useParams()
  const navigate = useNavigate()
  const [input, setInput] = useState(routeId || '')
  const [state, setState] = useState('idle') // idle | loading | valid | invalid | error
  const [result, setResult] = useState(null)
  const [reason, setReason] = useState('')

  const lookup = useCallback(async (rawId) => {
    const id = String(rawId || '').trim().toUpperCase()
    if (!id) return
    setState('loading'); setResult(null); setReason('')
    try {
      const res = await fetch(`${API}/api/certificates/verify/${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.valid) { setResult(data); setState('valid') }
      else { setReason(data.reason || 'not_found'); setState('invalid') }
    } catch {
      setState('error')
    }
  }, [])

  // Deep link: /verify-certificate/:certId verifies immediately.
  useEffect(() => {
    if (routeId) { setInput(routeId); lookup(routeId) }
  }, [routeId, lookup])

  function onSubmit(e) {
    e.preventDefault()
    const id = input.trim().toUpperCase()
    if (!id) return
    if (id !== routeId) navigate(`/verify-certificate/${encodeURIComponent(id)}`)
    else lookup(id)
  }

  const cert = result?.certificate

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Header */}
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-brand-600">
          <BadgeCheck className="h-3.5 w-3.5" /> Verification
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Verify a Certificate
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-ink-600">
          Enter the Certificate ID printed at the bottom of any Smart Kopargaon Hackathon certificate to confirm it is
          genuine.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={onSubmit} className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="SKH26-XXXXXXXX"
            spellCheck={false}
            aria-label="Certificate ID"
            className="h-12 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] pl-10 pr-4 font-mono text-sm uppercase tracking-wider focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <button type="submit" disabled={state === 'loading' || !input.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 disabled:opacity-50">
          {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Verify
        </button>
      </form>

      {/* States */}
      {state === 'invalid' && (
        <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-600">
            {reason === 'revoked' ? <ShieldAlert className="h-6 w-6" /> : <ShieldX className="h-6 w-6" />}
          </div>
          <h2 className="mt-3 font-display text-lg font-bold text-ink-900">
            {reason === 'revoked' ? 'This certificate has been revoked' : 'No certificate found'}
          </h2>
          <p className="mt-1.5 text-sm text-ink-600">
            {reason === 'revoked'
              ? 'This Certificate ID was issued but has since been revoked by the organizers, so it is no longer valid.'
              : 'Check the ID and try again. It is printed at the bottom of the certificate and looks like SKH26-XXXXXXXX.'}
          </p>
        </div>
      )}

      {state === 'error' && (
        <p className="mx-auto mt-8 max-w-xl rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700">
          We could not reach the verification service. Please try again in a moment.
        </p>
      )}

      {state === 'valid' && cert && (
        <div className="mt-10">
          {/* Verified banner */}
          <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <BadgeCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-3 font-display text-xl font-bold text-ink-900">Certificate verified</h2>
            <p className="mt-1.5 text-sm text-ink-600">
              This is a genuine certificate issued by Smart Kopargaon Hackathon.
            </p>
          </div>

          {/* Details */}
          <dl className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { icon: BadgeCheck, k: 'Awarded to', v: cert.recipientName },
              { icon: Award, k: 'Award', v: cert.awardTitle },
              { icon: Users, k: 'Team', v: cert.teamName },
              { icon: Building2, k: 'College', v: cert.college || '—' },
              { icon: CalendarDays, k: 'Issued', v: cert.issuedDate },
              { icon: BadgeCheck, k: 'Certificate ID', v: cert.certId, mono: true },
            ].map(({ icon: Icon, k, v, mono }) => (
              <div key={k} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4">
                <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  <Icon className="h-3.5 w-3.5" /> {k}
                </dt>
                <dd className={`mt-1 text-sm font-semibold text-ink-900 ${mono ? 'font-mono tracking-wider' : ''}`}>{v}</dd>
              </div>
            ))}
          </dl>

          {/* Certificate */}
          {result.html && (
            <div className="mt-8">
              <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] shadow-card">
                <CertificateCanvas html={result.html} />
              </div>
              <button type="button"
                onClick={() => printCertificate(result.html, `SKH-Certificate-${cert.certId}`)}
                className="mx-auto mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/20">
                <Download className="h-4 w-4" /> Download as PDF
              </button>
              <p className="mt-2 text-center text-xs text-ink-400">
                Opens your browser&apos;s print dialog — choose &ldquo;Save as PDF&rdquo;, Landscape, margins None.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
