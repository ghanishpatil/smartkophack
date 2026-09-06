import { useLayoutEffect, useRef, useState } from 'react'

/** A4 landscape, in millimetres — must match backend CERT_SIZE. */
export const CERT_W_MM = 297
export const CERT_H_MM = 210

/** CSS reference pixels per millimetre (96 CSS dpi). */
const MM_TO_PX = 96 / 25.4

export const CERT_W_PX = CERT_W_MM * MM_TO_PX // ≈ 1122.5
export const CERT_H_PX = CERT_H_MM * MM_TO_PX // ≈ 793.7

/**
 * Renders certificate HTML at true A4-landscape size, scaled down to fit its
 * container so the on-screen preview is an exact proportional representation of
 * the printed output.
 *
 * The HTML is admin-authored (the certificate template) and every value the
 * server substitutes into it is HTML-escaped in `renderTemplate`, so
 * participant-entered names cannot inject markup. Rendering it verbatim is the
 * intended behaviour — the template is deliberately raw, editable HTML.
 */
export function CertificateCanvas({ html, className = '' }) {
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(0)

  // useLayoutEffect so the first measurement happens before paint — otherwise
  // the sheet flashes at the wrong size on mount.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setScale(Math.min(1, w / CERT_W_PX))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    // minWidth:0 lets this shrink inside flex/grid parents instead of being
    // forced wide by its own content.
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        height: scale ? CERT_H_PX * scale : 0,
        overflow: 'hidden',
      }}
    >
      {/* Absolutely positioned so the unscaled 1122px sheet contributes NOTHING
          to layout. A transform shrinks paint, not layout size, so leaving this
          in normal flow inflates any content-sized ancestor (a `1fr` grid
          column), which in turn inflates the measured width — a feedback loop
          that pins the scale near 1 and overflows the panel. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CERT_W_PX,
          height: CERT_H_PX,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          visibility: scale ? 'visible' : 'hidden',
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    </div>
  )
}

/**
 * Opens the certificate in a new window sized to A4 landscape and triggers the
 * browser's print dialog, where the user picks "Save as PDF".
 *
 * Printing in a dedicated window rather than the current page avoids fighting
 * the app's global stylesheet, and `@page { size: A4 landscape; margin: 0 }`
 * plus millimetre units in the template give a correctly-scaled,
 * vector-quality PDF with no PDF library needed.
 *
 * Returns false if the popup was blocked, so the caller can surface a message.
 */
export function printCertificate(html, title = 'Certificate') {
  const win = window.open('', '_blank', 'width=1280,height=900')
  if (!win) return false

  const safeTitle = String(title).replace(/[<>]/g, '')
  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #e2e8f0; }
  .skhc-stage { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
  .skhc-sheet { width: ${CERT_W_MM}mm; height: ${CERT_H_MM}mm; background: #fff; box-shadow: 0 10px 40px rgba(15,23,42,0.25); overflow: hidden; }
  .skhc-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    display: flex; gap: 10px; align-items: center; justify-content: center;
    padding: 10px; background: #0f172a; color: #fff;
    font-family: 'Inter', Arial, sans-serif; font-size: 13px;
  }
  .skhc-bar button {
    padding: 7px 16px; border: 0; border-radius: 7px; cursor: pointer;
    background: #2563eb; color: #fff; font-weight: 600; font-size: 13px;
    font-family: 'Inter', Arial, sans-serif;
  }
  .skhc-bar span { opacity: .75; }
  @media print {
    html, body { background: #fff; }
    .skhc-bar { display: none !important; }
    .skhc-stage { min-height: 0; padding: 0; display: block; }
    .skhc-sheet { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="skhc-bar">
    <button type="button" onclick="window.print()">Save as PDF / Print</button>
    <span>Choose &ldquo;Save as PDF&rdquo;, set Layout to Landscape and Margins to None.</span>
  </div>
  <div class="skhc-stage"><div class="skhc-sheet">${html || ''}</div></div>
</body>
</html>`)
  win.document.close()

  // Give webfonts and the logo a chance to load so the first print is correct.
  const go = () => {
    const ready = win.document.fonts?.ready
    const fire = () => setTimeout(() => { try { win.focus(); win.print() } catch { /* user can use the button */ } }, 250)
    if (ready && typeof ready.then === 'function') ready.then(fire).catch(fire)
    else fire()
  }
  if (win.document.readyState === 'complete') go()
  else win.addEventListener('load', go)

  return true
}
