import { useRef, useCallback } from 'react'
import { cn } from '@/utils/cn.js'
import './CardGlow.css'

/** Tracks pointer position to drive the edge-glow CSS variables. */
function useCardGlow(enabled) {
  const ref = useRef(null)
  const onPointerMove = useCallback((e) => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const dx = x - cx
    const dy = y - cy
    // Edge proximity 0 (center) → 100 (edge)
    let kx = Infinity
    let ky = Infinity
    if (dx !== 0) kx = cx / Math.abs(dx)
    if (dy !== 0) ky = cy / Math.abs(dy)
    const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)
    // Angle from center
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90
    if (deg < 0) deg += 360
    el.style.setProperty('--edge-proximity', (edge * 100).toFixed(2))
    el.style.setProperty('--cursor-angle', `${deg.toFixed(2)}deg`)
  }, [enabled])
  return { ref, onPointerMove }
}

export function Card({ className, accent, hover, glow, noGlow, children, ...props }) {
  const enableGlow = !noGlow
  const { ref, onPointerMove } = useCardGlow(enableGlow)
  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(
        'rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-6 shadow-card transition-all duration-300',
        enableGlow && 'card-glow',
        hover && 'hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-500/20',
        glow && 'animate-glow-pulse',
        accent === 'brand' && 'border-l-[3px] border-l-brand-500',
        accent === 'success' && 'border-l-[3px] border-l-emerald-500',
        accent === 'warn' && 'border-l-[3px] border-l-amber-500',
        accent === 'danger' && 'border-l-[3px] border-l-red-500',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function GlassCard({ className, hover, noGlow, children, ...props }) {
  const enableGlow = !noGlow
  const { ref, onPointerMove } = useCardGlow(enableGlow)
  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(
        'glass-card',
        enableGlow && 'card-glow',
        hover && 'hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function StatCard({ title, value, hint, icon: Icon, tone = 'brand', className, noGlow }) {
  const toneStyles = {
    brand: 'border-brand-500/20 bg-brand-500/5',
    warn: 'border-amber-500/25 bg-amber-500/5',
    danger: 'border-red-500/25 bg-red-500/5',
    success: 'border-emerald-500/20 bg-emerald-500/5',
    neutral: 'border-[rgb(var(--border))]',
  }

  const iconTones = {
    brand: 'text-brand-600',
    warn: 'text-amber-600',
    danger: 'text-red-600',
    success: 'text-emerald-600',
    neutral: 'text-ink-500',
  }

  const enableGlow = !noGlow
  const { ref, onPointerMove } = useCardGlow(enableGlow)

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(
        'rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover',
        enableGlow && 'card-glow',
        toneStyles[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={cn('rounded-xl bg-[rgb(var(--surface-muted))] p-2.5', iconTones[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
