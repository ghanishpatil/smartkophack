import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/Button.jsx'

const tones = {
  danger: {
    Icon: AlertTriangle,
    iconWrap: 'bg-red-500/12 text-red-600',
    ring: 'border-red-500/25',
  },
  warn: {
    Icon: AlertTriangle,
    iconWrap: 'bg-amber-500/15 text-amber-600',
    ring: 'border-amber-500/30',
  },
  info: {
    Icon: Info,
    iconWrap: 'bg-brand-500/12 text-brand-600',
    ring: 'border-brand-500/25',
  },
}

/**
 * Responsive confirmation dialog.
 *  - Mobile: full-width bottom sheet with stacked, thumb-friendly buttons.
 *  - Desktop: centered card.
 * Handles Escape, background scroll lock, and focuses the cancel action.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const panelRef = useRef(null)
  const t = tones[tone] || tones.danger

  // Close on Escape + lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, busy, onCancel])

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          {/* Backdrop */}
          <motion.div
            role="presentation"
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={busy ? undefined : onCancel}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-body"
            className={`relative w-full max-w-lg rounded-t-3xl border-t ${t.ring} bg-[rgb(var(--surface))] shadow-2xl outline-none sm:rounded-2xl sm:border`}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {/* Mobile drag affordance */}
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-ink-300" />
            </div>

            {/* Close (desktop) */}
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label="Close"
              className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-[rgb(var(--surface-muted))] hover:text-ink-700 disabled:opacity-50 sm:block"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="max-h-[80vh] overflow-y-auto px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
              <div className="flex gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.iconWrap}`}>
                  <t.Icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="confirm-dialog-title"
                    className="font-display text-lg font-bold leading-snug text-ink-900 sm:text-xl"
                  >
                    {title}
                  </h2>
                  {description ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>
                  ) : null}
                </div>
              </div>

              {children ? (
                <div id="confirm-dialog-body" className="mt-4 space-y-2.5 text-sm leading-relaxed text-ink-600">
                  {children}
                </div>
              ) : null}
            </div>

            {/* Actions — stacked on mobile, inline on desktop */}
            <div className="flex flex-col-reverse gap-2 border-t border-[rgb(var(--border))] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="w-full sm:w-auto"
              >
                {cancelLabel}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="w-full sm:w-auto"
              >
                {busy ? 'Working…' : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
