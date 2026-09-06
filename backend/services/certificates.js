/**
 * Certificates — award catalog, the editable HTML template, and rendering.
 *
 * Design notes:
 * - A certificate is a self-contained HTML fragment sized to A4 LANDSCAPE
 *   (297mm x 210mm). Physical mm units are used so the browser's
 *   "Print → Save as PDF" produces a correctly-sized, vector-quality PDF with
 *   no server-side PDF dependency (the backend ships none).
 * - The template is admin-editable raw HTML stored in Firestore. Placeholders
 *   like {{RECIPIENT_NAME}} are substituted at render time.
 * - Every substituted value is HTML-escaped. Team and member names come from
 *   participant-entered registration data, so unescaped substitution into an
 *   admin template would be a stored-XSS vector on the public verify page.
 */

import { randomBytes } from 'crypto'

/** A4 landscape, in millimetres. Used by the template and the frontend preview. */
export const CERT_SIZE = { widthMm: 297, heightMm: 210, orientation: 'landscape' }

/**
 * The 11 awards that can be issued. `citation` is the body paragraph printed on
 * the certificate. Titles/citations are editable per-issue by the admin; these
 * are the defaults.
 */
export const AWARD_CATALOG = [
  {
    id: 'participation',
    tier: 'participation',
    title: 'Participation in Smart Kopargaon Hackathon 2026',
    citation: 'For active participation, dedication and innovative contribution in the Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'grand_finale_participation',
    tier: 'participation',
    title: 'Offline Grand Finale Participation',
    citation: 'For attending and participating in the 24-hour offline Grand Finale of the Smart Kopargaon Hackathon 2026, held at Sanjivani University, Kopargaon, with dedication and innovative contribution.',
  },
  {
    id: 'first_prize',
    tier: 'major',
    rank: 1,
    title: '1st Prize',
    citation: 'For outstanding performance, dedication and innovative contribution, securing the 1st Prize at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'second_prize',
    tier: 'major',
    rank: 2,
    title: '2nd Prize (1st Runner Up)',
    citation: 'For outstanding performance, dedication and innovative contribution, securing the 2nd Prize at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'third_prize',
    tier: 'major',
    rank: 3,
    title: '3rd Prize (2nd Runner Up)',
    citation: 'For outstanding performance, dedication and innovative contribution, securing the 3rd Prize at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_healthcare',
    tier: 'major',
    title: 'Best Solution in Healthcare Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Healthcare Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_waste_management',
    tier: 'major',
    title: 'Best Solution in Waste Management Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Waste Management Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_industry_msme',
    tier: 'major',
    title: 'Best Solution in Industry & MSME Innovation Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Industry & MSME Innovation Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_education',
    tier: 'major',
    title: 'Best Solution in Education Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Education Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_transportation',
    tier: 'major',
    title: 'Best Solution in Transportation & Mobility Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Transportation & Mobility Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_food_safety',
    tier: 'major',
    title: 'Best Solution in Food Safety & Security Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Food Safety & Security Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_open_innovation',
    tier: 'major',
    title: 'Best Solution in Open Innovation Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Open Innovation Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
  {
    id: 'best_smart_agriculture',
    tier: 'major',
    title: 'Best Solution in Smart Agriculture Award',
    citation: 'For outstanding performance, dedication, and innovative contribution, securing the Best Solution in Smart Agriculture Award at the Grand Finale of Smart Kopargaon Hackathon 2026.',
  },
]

export const AWARD_BY_ID = Object.fromEntries(AWARD_CATALOG.map((a) => [a.id, a]))

/**
 * "Major" awards are the 3 overall prizes and the 8 domain awards. A team
 * holding one of these should NOT also receive the Offline Grand Finale
 * Participation certificate — they already hold a higher distinction.
 */
export const MAJOR_AWARD_IDS = AWARD_CATALOG.filter((a) => a.tier === 'major').map((a) => a.id)
export const PARTICIPATION_AWARD_IDS = AWARD_CATALOG.filter((a) => a.tier === 'participation').map((a) => a.id)

export const isMajorAward = (id) => AWARD_BY_ID[id]?.tier === 'major'

/** Placeholders the admin may use in the template, surfaced in the editor UI. */
export const TEMPLATE_PLACEHOLDERS = [
  { token: '{{RECIPIENT_NAME}}', desc: "The individual member's full name" },
  { token: '{{TEAM_NAME}}', desc: 'Team name' },
  { token: '{{AWARD_TITLE}}', desc: 'e.g. 1st Prize' },
  { token: '{{CITATION}}', desc: 'The award citation paragraph' },
  { token: '{{COLLEGE}}', desc: "Recipient's college / institute" },
  { token: '{{DOMAIN}}', desc: "The team's domain" },
  { token: '{{CERT_ID}}', desc: 'Unique certificate ID' },
  { token: '{{ISSUED_DATE}}', desc: 'Date of issue' },
  { token: '{{VERIFY_URL}}', desc: 'Public verification URL' },
  { token: '{{EVENT_NAME}}', desc: 'Event name' },
  { token: '{{ASSET_BASE}}', desc: 'Frontend origin, for image URLs' },
]

/**
 * Default certificate template — A4 landscape.
 *
 * The artwork (logos, "CERTIFICATE OF APPRECIATION", the name rule, and the
 * three signatures) is a pre-designed background image at
 * `frontend/public/certificate-bg.jpg`. This template only overlays the
 * per-recipient content, positioned in millimetres against the 297x210mm sheet:
 *
 *   ~117.6mm  the pre-printed horizontal rule (the name sits just above it)
 *   ~151mm    the pre-printed "SKH 2026" banner graphic (keep text above this)
 *   ~160mm+   the pre-printed signature block
 *
 * Inline CSS only (it is injected as raw HTML); classes are `skhc-` prefixed.
 */
export const DEFAULT_TEMPLATE = `<div class="skhc-cert" style="position:relative;width:297mm;height:210mm;box-sizing:border-box;background:#ffffff;font-family:'Inter',Arial,sans-serif;color:#0f172a;overflow:hidden;">

  <!-- Pre-designed artwork: logos, headings, name rule, signatures -->
  <img src="{{ASSET_BASE}}/certificate-bg.jpg" alt="" style="position:absolute;top:0;left:0;width:297mm;height:210mm;object-fit:fill;" />

  <!-- Recipient name — sits directly on the pre-printed rule -->
  <div style="position:absolute;top:103mm;left:56mm;width:185mm;text-align:center;font-family:'Space Grotesk',Georgia,serif;font-size:11mm;font-weight:700;line-height:1.05;color:#10203f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{RECIPIENT_NAME}}</div>

  <!-- Team + college -->
  <div style="position:absolute;top:120.5mm;left:48mm;width:201mm;text-align:center;font-size:4.2mm;line-height:1.3;color:#475569;">
    Team <strong style="color:#1b3b8b;">{{TEAM_NAME}}</strong><span style="color:#94a3b8;">&nbsp;&middot;&nbsp;</span>{{COLLEGE}}
  </div>

  <!-- Award -->
  <div style="position:absolute;top:127mm;left:48mm;width:201mm;text-align:center;font-family:'Space Grotesk',Georgia,serif;font-size:6mm;font-weight:700;line-height:1.2;color:#7db928;">{{AWARD_TITLE}}</div>

  <!-- Citation -->
  <div style="position:absolute;top:135.5mm;left:53.5mm;width:190mm;text-align:center;font-size:3.6mm;line-height:1.55;color:#475569;">{{CITATION}}</div>

  <!-- Verification footer — sits inside the navy band at the bottom edge
       (~200-210mm), clear of the signature captions which run to ~194mm. -->
  <div style="position:absolute;top:203mm;left:0;width:297mm;text-align:center;font-size:2.6mm;line-height:1.3;color:#a9d4ec;">
    Certificate ID <strong style="color:#ffffff;letter-spacing:0.35mm;">{{CERT_ID}}</strong>
    &nbsp;&middot;&nbsp; Issued {{ISSUED_DATE}}
    &nbsp;&middot;&nbsp; Verify at {{VERIFY_URL}}
  </div>
</div>`

/** HTML entity escaping — applied to every substituted value. */
export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Substitute {{TOKENS}} in a template with escaped values.
 * Unknown tokens are left untouched so a typo is visible rather than silent.
 */
export function renderTemplate(template, values = {}) {
  const tpl = typeof template === 'string' && template.trim() ? template : DEFAULT_TEMPLATE
  return tpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? escapeHtml(values[key]) : match,
  )
}

// Crockford-style alphabet: no 0/O/1/I/L/U so IDs are unambiguous when typed
// by hand into the public verification page.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * Generate a certificate ID like `SKH26-7K2QF9XM`.
 * Random (not sequential) so certificates cannot be enumerated on the public
 * verification endpoint.
 */
export function generateCertId(prefix = 'SKH26') {
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length]
  return `${prefix}-${out}`
}

/** Normalise user-typed IDs (trim, uppercase, collapse spaces). */
export function normalizeCertId(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '')
}

/** Formats a Date as e.g. "30 August 2026". */
export function formatIssuedDate(d = new Date()) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Build the substitution map for one recipient. Values are escaped later by
 * renderTemplate, so raw strings are passed here.
 */
export function buildCertValues({
  recipientName, teamName, awardTitle, citation, college, domain,
  certId, issuedDate, verifyUrl, eventName, assetBase,
}) {
  return {
    RECIPIENT_NAME: recipientName || '',
    TEAM_NAME: teamName || '',
    AWARD_TITLE: awardTitle || '',
    CITATION: citation || '',
    COLLEGE: college || '',
    DOMAIN: domain || '',
    CERT_ID: certId || '',
    ISSUED_DATE: issuedDate || formatIssuedDate(),
    VERIFY_URL: verifyUrl || '',
    EVENT_NAME: eventName || 'Smart Kopargaon Hackathon',
    ASSET_BASE: assetBase || '',
  }
}
