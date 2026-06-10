import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from 'lenis'

/**
 * SmoothScroll — Lenis for inertia scrolling on public pages only.
 * 
 * PERFORMANCE FIX: Increased lerp (0.06 → 0.12) for faster response,
 * reduced duration (1.4 → 0.8) to prevent sluggish feel.
 * Only enabled on landing page where it adds value.
 * Other public pages use native scroll (faster, no JS overhead).
 * 
 * MOBILE FIX: Disabled on touch devices to preserve native scrolling.
 */
export function SmoothScroll({ children }) {
  const lenisRef = useRef(null)
  const location = useLocation()

  // Detect if device is mobile/touch device
  const isTouchDevice = () => {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    )
  }

  // Only enable Lenis on the landing page AND on desktop (non-touch) devices.
  // Mobile devices use native scroll for better performance and touch handling.
  const enableSmooth = location.pathname === '/' && !isTouchDevice()

  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.destroy()
      lenisRef.current = null
    }

    if (!enableSmooth) return

    const lenis = new Lenis({
      lerp: 0.12,       // was 0.06 — faster response, less lag
      duration: 0.8,    // was 1.4 — snappier feel
      smoothWheel: true,
      wheelMultiplier: 1,    // was 0.8 — normal scroll speed
      touchMultiplier: 1.5,
      infinite: false,
      // Prevent Lenis from intercepting scroll inside elements with data-lenis-prevent
      prevent: (node) => node.hasAttribute('data-lenis-prevent'),
    })

    lenisRef.current = lenis

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [enableSmooth])

  return children
}
