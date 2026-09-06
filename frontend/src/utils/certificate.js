/**
 * Client-side mirror of the backend certificate renderer
 * (backend/services/certificates.js) so the admin template editor can show a
 * live preview without a server round-trip.
 *
 * Keep the escaping and token behaviour identical to the backend: every
 * substituted value is escaped, and unknown tokens are left in place so a typo
 * is visible rather than silently blank.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export function renderTemplate(template, values = {}) {
  if (typeof template !== 'string') return ''
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? escapeHtml(values[key]) : match,
  )
}

export function formatIssuedDate(d = new Date()) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Placeholder values used for the admin's sample/preview certificate. */
export function sampleValues({ awardTitle, citation, assetBase, verifyUrl }) {
  return {
    RECIPIENT_NAME: 'Aditi Sharma',
    TEAM_NAME: 'Team Innovators',
    AWARD_TITLE: awardTitle || '1st Prize',
    CITATION: citation || '',
    COLLEGE: 'Sanjivani College of Engineering',
    DOMAIN: 'Healthcare',
    CERT_ID: 'SKH26-SAMPLE01',
    ISSUED_DATE: formatIssuedDate(),
    VERIFY_URL: verifyUrl || `${window.location.origin}/verify-certificate`,
    EVENT_NAME: 'Smart Kopargaon Hackathon',
    ASSET_BASE: assetBase || window.location.origin,
  }
}

/** Build substitution values for a real certificate record. */
export function certValues(cert, { assetBase, verifyUrl } = {}) {
  return {
    RECIPIENT_NAME: cert?.recipientName || '',
    TEAM_NAME: cert?.teamName || '',
    AWARD_TITLE: cert?.awardTitle || '',
    CITATION: cert?.citation || '',
    COLLEGE: cert?.college || '',
    DOMAIN: cert?.domain || '',
    CERT_ID: cert?.certId || '',
    ISSUED_DATE: cert?.issuedDate || formatIssuedDate(),
    VERIFY_URL: verifyUrl || `${window.location.origin}/verify-certificate`,
    EVENT_NAME: 'Smart Kopargaon Hackathon',
    ASSET_BASE: assetBase || window.location.origin,
  }
}
