/**
 * Email Service — sends via SMTP (nodemailer) when SMTP_* env vars are set,
 * otherwise falls back to the Brevo REST API.
 *
 * Transport: Brevo — either Brevo SMTP relay (smtp-relay.brevo.com:587, set via
 * SMTP_* env vars) or the Brevo REST API (BREVO_API_KEY) when SMTP is unset.
 *
 * Deliverability note: verify your sender / authenticate the sending domain
 * (SPF/DKIM) in Brevo so mail is accepted and stays out of spam.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

// Directory holding email templates and attachments (e.g. the How-to-Register PDF).
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'emailTemplates')

let _smtpTransport = null
let _smtpHealthy = null // null=unknown, true=working, false=failed
let _smtpLastTry = 0
let _smtpError = null // last SMTP init/verify error message (for admin diagnostics)
const SMTP_RETRY_COOLDOWN_MS = 60 * 1000 // don't hammer the server after a failure

// Stats for admin dashboard — reset daily
let _emailStats = {
  lastReset: Date.now(),
  smtp: { sent: 0, failed: 0 },
  brevo: { sent: 0, failed: 0 },
}

function resetStatsIfNeeded() {
  const dayMs = 24 * 60 * 60 * 1000
  if (Date.now() - _emailStats.lastReset > dayMs) {
    _emailStats = {
      lastReset: Date.now(),
      smtp: { sent: 0, failed: 0 },
      brevo: { sent: 0, failed: 0 },
    }
  }
}

/** Lazily create (and cache) the nodemailer SMTP transport if env vars are present. */
async function getSmtpTransport({ force = false } = {}) {
  // Already have a verified transport — reuse it.
  if (_smtpTransport) return _smtpTransport

  // Trim env values and strip accidental surrounding quotes — copy/paste into
  // hosting dashboards often adds stray whitespace, newlines, or wrapping
  // quotes that silently break authentication.
  const clean = (v) => (v || '').trim().replace(/^['"]+|['"]+$/g, '').trim()
  const host = clean(process.env.SMTP_HOST)
  const user = clean(process.env.SMTP_USER)
  const pass = clean(process.env.SMTP_PASS)
  if (!host || !user || !pass) {
    _smtpHealthy = null
    return null
  }

  // After a failure, wait for the cooldown before retrying (unless forced,
  // e.g. the admin clicked Refresh). This lets SMTP recover once the env is
  // fixed without needing a full process restart.
  if (!force && _smtpHealthy === false && Date.now() - _smtpLastTry < SMTP_RETRY_COOLDOWN_MS) {
    return null
  }

  _smtpLastTry = Date.now()
  try {
    const nodemailer = (await import('nodemailer')).default
    const port = Number(clean(process.env.SMTP_PORT)) || 465
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
      // Fail fast if the host blocks outbound SMTP (e.g. Railway trial plans),
      // so we fall back to the Brevo HTTP API quickly instead of hanging.
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    })
    // Verify connection/credentials before caching.
    await transport.verify()
    _smtpTransport = transport
    _smtpHealthy = true
    _smtpError = null
    console.log(`[Email] SMTP transport configured and verified (${host}:${port} as ${user})`)
  } catch (e) {
    _smtpTransport = null
    _smtpHealthy = false
    _smtpError = e.message
    console.error(`[Email] SMTP init/verify failed (${host}:${process.env.SMTP_PORT || 465} as ${user}):`, e.message)
  }
  return _smtpTransport
}

/**
 * Returns the configured frontend URL, falling back to a safe placeholder.
 * Prevents email links from rendering as "undefined/dashboard".
 */
function getFrontendUrl() {
  const url = process.env.FRONTEND_URL || ''
  if (!url) {
    console.warn('[Email] FRONTEND_URL is not set — email links will be broken.')
    return 'https://skh.example.com'
  }
  // Strip trailing slash
  return url.replace(/\/$/, '')
}

/**
 * HTML entity escaping to prevent XSS in email templates.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/** Branded CTA button (email-safe, table-based). */
function ctaButton(text, url) {
  if (!text || !url) return ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 4px;"><tr><td align="center" bgcolor="#185983" style="border-radius:8px;"><a href="${url}" target="_blank" style="display:inline-block;padding:13px 32px;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`
}

/**
 * Shared branded email shell — consistent SKH gif header + footer for every
 * participant email. `bodyHtml` is the inner content (already HTML-escaped).
 */
function renderBrandedEmail({ title, bodyHtml }) {
  const base = getFrontendUrl()
  const year = new Date().getFullYear()
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background-color:#f2f6f9;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f2f6f9;"><tr><td align="center" style="padding:20px 12px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,0.08);">
<tr><td align="center" style="padding:0;background:#ffffff;"><img src="${base}/email-logos.png" alt="Partners" width="600" style="display:block;width:100%;max-width:600px;height:auto;"></td></tr>
<tr><td align="center" style="padding:34px 20px 6px;background:#e6f4ff;"><img src="${base}/skh.gif" alt="Smart Kopargaon Hackathon" width="420" style="display:block;width:100%;max-width:420px;height:auto;margin:0 auto;"></td></tr>
<tr><td align="center" style="padding:0 20px 30px;background:#e6f4ff;"><h2 style="margin:0;color:#185983;font-family:'Space Grotesk',Arial,sans-serif;font-size:22px;font-weight:700;">Smart Kopargaon Hackathon</h2></td></tr>
<tr><td style="padding:34px 40px 36px;background:#ffffff;">
<h1 style="margin:0 0 18px;color:#0f172a;font-family:'Space Grotesk',Arial,sans-serif;font-size:25px;font-weight:700;line-height:1.3;">${title}</h1>
<div style="color:#334155;font-size:15px;line-height:1.65;">${bodyHtml}</div>
</td></tr>
<tr><td align="center" style="padding:30px 40px 20px;background:#185983;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;"><tr>
<td style="padding:0 8px;"><a href="https://x.com/skhackathon" target="_blank"><img src="${base}/email-x.png" alt="X" width="30" style="display:block;border:0;width:30px;height:30px;"></a></td>
<td style="padding:0 8px;"><a href="https://instagram.com/smartkophack.su" target="_blank"><img src="${base}/email-ig.png" alt="Instagram" width="30" style="display:block;border:0;width:30px;height:30px;"></a></td>
</tr></table>
<p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#ffffff;">Smart Kopargaon Hackathon</p>
<p style="margin:0 0 14px;font-size:13px;color:#a9d4ec;">Powered by Sanjivani University</p>
<p style="margin:0 0 6px;font-size:14px;"><a href="${base}" target="_blank" style="color:#ffffff;text-decoration:underline;font-weight:600;">skh.sanjivaniuniversity.com</a></p>
<p style="margin:0;font-size:13px;color:#a9d4ec;">Kopargaon, Maharashtra, India</p>
</td></tr>
<tr><td align="center" style="padding:14px 20px;background:#124a6e;"><p style="margin:0;font-size:12px;color:#a9d4ec;">&copy; ${year} Smart Kopargaon Hackathon &middot; All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`
}

/**
 * Send email — prefers SMTP (nodemailer) when configured, else Brevo REST API.
 */
async function sendEmail({ to, toName, subject, htmlContent, textContent, params = {}, attachments = [] }) {
  resetStatsIfNeeded()
  
  // Validate required fields
  if (!to || !subject || !htmlContent) {
    console.error('[Email] Missing required field:', { to: !!to, subject: !!subject, htmlContent: !!htmlContent })
    return { success: false, error: 'Missing required email fields (to, subject, or htmlContent)' }
  }
  if (!to.includes('@')) {
    console.error('[Email] Invalid recipient email:', to)
    return { success: false, error: 'Invalid recipient email' }
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'Smart Kopargaon Hackathon'
  const fromAddr = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'noreply@skh.com'

  // ─── Preferred: SMTP (best deliverability from an authenticated domain) ───
  const smtp = await getSmtpTransport()
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: toName ? `"${toName}" <${to}>` : to,
        subject,
        html: htmlContent,
        text: textContent || undefined,
        attachments: attachments.length
          ? attachments.map((a) => ({ filename: a.filename, path: a.path }))
          : undefined,
      })
      _emailStats.smtp.sent++
      console.log('[Email] Sent via SMTP:', { to, subject, messageId: info.messageId })
      return { success: true, messageId: info.messageId, transport: 'smtp' }
    } catch (error) {
      _emailStats.smtp.failed++
      _smtpHealthy = false
      console.error('[Email] SMTP send failed, falling back to Brevo:', error.message)
      // fall through to Brevo
    }
  }

  // ─── Fallback: Brevo REST API ───
  if (!process.env.BREVO_API_KEY) {
    console.warn('[Email] No SMTP and no Brevo API key configured. Email not sent.')
    return { success: false, reason: 'not_configured' }
  }

  try {
    const payload = {
      sender: { name: fromName, email: fromAddr },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent,
    }
    if (textContent) payload.textContent = textContent
    if (params && Object.keys(params).length > 0) payload.params = params

    // Attachments (read from disk → base64 for the Brevo REST API)
    if (attachments.length) {
      const fsp = await import('fs/promises')
      const list = []
      for (const a of attachments) {
        try {
          const buf = await fsp.readFile(a.path)
          list.push({ name: a.filename, content: buf.toString('base64') })
        } catch (e) {
          console.warn('[Email] attachment read failed:', a.path, e.message)
        }
      }
      if (list.length) payload.attachment = list
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      _emailStats.brevo.failed++
      const errMsg = data?.message || data?.code || `HTTP ${res.status}`
      console.error('[Email] Brevo API error:', errMsg, JSON.stringify(data))
      return { success: false, error: errMsg }
    }

    _emailStats.brevo.sent++
    console.log('[Email] Sent via Brevo:', { to, subject, messageId: data.messageId })
    return { success: true, messageId: data.messageId, transport: 'brevo' }
  } catch (error) {
    _emailStats.brevo.failed++
    console.error('[Email] Failed to send:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Email Templates
 */

// 0. Account Created Email — sent once when a user signs up (any method)
export async function sendAccountCreatedEmail({ to, name, eventName }) {
  const safeName = escapeHtml(name || 'Participant')
  const safeEventName = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const subject = `You're registered for ${safeEventName} 🎉`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">You're in! Your account is ready. Here's what to do next to participate:</p>
    <ol style="margin:0 0 8px;padding-left:20px;color:#334155;">
      <li style="margin-bottom:8px;"><strong>Create your team</strong><br><span style="color:#64748b;font-size:14px;">Go to Dashboard → My Team and create your team.</span></li>
      <li style="margin-bottom:8px;"><strong>Add member details &amp; register</strong><br><span style="color:#64748b;font-size:14px;">Enter every member's details, then confirm your registration.</span></li>
      <li style="margin-bottom:8px;"><strong>Pick a problem statement</strong><br><span style="color:#64748b;font-size:14px;">Browse the problem statements and select one to solve.</span></li>
      <li style="margin-bottom:8px;"><strong>Build and submit</strong><br><span style="color:#64748b;font-size:14px;">Upload your PPT and finalize before the deadline.</span></li>
    </ol>
    ${ctaButton('Go to Dashboard', `${getFrontendUrl()}/dashboard`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Have questions? Reach the organizers at <a href="mailto:skh@sanjivani.edu.in" style="color:#185983;">skh@sanjivani.edu.in</a>. Good luck! 🚀</p>
  `
  const htmlContent = renderBrandedEmail({ title: `Welcome to ${safeEventName}! 🎉`, bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}


export async function sendWelcomeEmail({ to, name, teamName, eventName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeEventName = escapeHtml(eventName)
  const subject = `Welcome to ${safeEventName}! 🎉`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">Congratulations! Your team <strong>${safeTeamName}</strong> has been successfully registered for ${safeEventName}.</p>
    <p style="margin:0 0 8px;font-weight:600;color:#0f172a;">What's next?</p>
    <ul style="margin:0 0 8px;padding-left:20px;color:#334155;">
      <li style="margin-bottom:6px;">Review your team &amp; member details</li>
      <li style="margin-bottom:6px;">Select a problem statement</li>
      <li style="margin-bottom:6px;">Start working on your solution</li>
      <li style="margin-bottom:6px;">Submit before the deadline</li>
    </ul>
    ${ctaButton('Go to Dashboard', `${getFrontendUrl()}/dashboard`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Best of luck! 🚀</p>
  `
  const htmlContent = renderBrandedEmail({ title: `Welcome to ${safeEventName}! 🎉`, bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 2. Payment Confirmation Email
export async function sendPaymentConfirmationEmail({ to, name, teamName, amount, currency, paymentId }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeAmount = escapeHtml(String(amount))
  const safeCurrency = escapeHtml(String(currency))
  const safePaymentId = escapeHtml(String(paymentId))
  const subject = `Payment Confirmed - ${safeTeamName} ✅`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">Your payment has been successfully processed. Your team <strong>${safeTeamName}</strong> is now fully registered!</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #eef2f6;">Team</td><td style="padding:12px 16px;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #eef2f6;">${safeTeamName}</td></tr>
      <tr><td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #eef2f6;">Amount paid</td><td style="padding:12px 16px;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #eef2f6;">${safeCurrency} ${safeAmount}</td></tr>
      <tr><td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #eef2f6;">Payment ID</td><td style="padding:12px 16px;text-align:right;font-family:'Courier New',monospace;color:#0f172a;border-bottom:1px solid #eef2f6;">${safePaymentId}</td></tr>
      <tr><td style="padding:12px 16px;color:#64748b;">Date</td><td style="padding:12px 16px;text-align:right;color:#0f172a;">${new Date().toLocaleDateString()}</td></tr>
    </table>
    ${ctaButton('Go to Dashboard', `${getFrontendUrl()}/dashboard`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Please keep this email for your records.</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Payment Confirmed ✅', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 3. Payment Reminder Email
export async function sendPaymentReminderEmail({ to, name, teamName, amount, currency, deadline }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeAmount = escapeHtml(String(amount))
  const safeCurrency = escapeHtml(String(currency))
  const safeDeadline = escapeHtml(String(deadline))
  const subject = `⏰ Payment Reminder - ${safeTeamName}`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">This is a friendly reminder that your team <strong>${safeTeamName}</strong> has a pending payment.</p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:0 0 16px;color:#92400e;font-size:14px;">
      <strong>Important:</strong> Payment must be completed before <strong>${safeDeadline}</strong> to unlock submissions.
    </div>
    <ul style="margin:0 0 8px;padding-left:20px;color:#334155;">
      <li style="margin-bottom:6px;">Amount: <strong>${safeCurrency} ${safeAmount}</strong></li>
      <li style="margin-bottom:6px;">Team: <strong>${safeTeamName}</strong></li>
      <li style="margin-bottom:6px;">Deadline: <strong>${safeDeadline}</strong></li>
    </ul>
    ${ctaButton('Complete Payment Now', `${getFrontendUrl()}/dashboard/registration`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">If you've already paid, please ignore this email — it may take a few minutes to reflect.</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Payment Reminder ⏰', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 4. Submission Confirmation Email
export async function sendSubmissionConfirmationEmail({ to, name, teamName, problemStatement, submittedAt }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeProblemStatement = escapeHtml(problemStatement)
  const safeSubmittedAt = escapeHtml(String(submittedAt))
  const subject = `Submission Received - ${safeTeamName} ✅`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">Great news — your team's submission has been successfully received.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #eef2f6;">Team</td><td style="padding:12px 16px;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #eef2f6;">${safeTeamName}</td></tr>
      <tr><td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #eef2f6;">Problem statement</td><td style="padding:12px 16px;text-align:right;color:#0f172a;border-bottom:1px solid #eef2f6;">${safeProblemStatement}</td></tr>
      <tr><td style="padding:12px 16px;color:#64748b;">Submitted at</td><td style="padding:12px 16px;text-align:right;color:#0f172a;">${safeSubmittedAt}</td></tr>
    </table>
    <p style="margin:0 0 8px;font-weight:600;color:#0f172a;">What happens next?</p>
    <ul style="margin:0 0 8px;padding-left:20px;color:#334155;">
      <li style="margin-bottom:6px;">Your submission is now under review</li>
      <li style="margin-bottom:6px;">Judges will evaluate your project</li>
      <li style="margin-bottom:6px;">Results will be announced soon</li>
    </ul>
    ${ctaButton('View Submission', `${getFrontendUrl()}/dashboard/submission`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Best of luck! 🚀</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Submission Received ✅', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 5. Submission Deadline Reminder
export async function sendSubmissionDeadlineReminderEmail({ to, name, teamName, deadline, hoursLeft }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeDeadline = escapeHtml(String(deadline))
  const safeHoursLeft = escapeHtml(String(hoursLeft))
  const subject = `⏰ ${safeHoursLeft}h Left - Submission Deadline Approaching!`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <div style="background:#fee2e2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:6px;margin:0 0 16px;color:#991b1b;font-size:14px;">
      <strong>Deadline approaching:</strong> your submission window closes soon.
    </div>
    <p style="margin:0 0 16px;text-align:center;font-family:'Space Grotesk',Arial,sans-serif;font-size:38px;font-weight:700;color:#ef4444;">${safeHoursLeft} hours left</p>
    <p style="margin:0 0 12px;">Team <strong>${safeTeamName}</strong>, you have only <strong>${safeHoursLeft} hours</strong> left to submit your project.</p>
    <p style="margin:0 0 8px;"><strong>Deadline:</strong> ${safeDeadline}</p>
    <p style="margin:0 0 8px;font-weight:600;color:#0f172a;">Before you submit, make sure:</p>
    <ul style="margin:0 0 8px;padding-left:20px;color:#334155;">
      <li style="margin-bottom:6px;">All required files are uploaded</li>
      <li style="margin-bottom:6px;">Your presentation is complete</li>
      <li style="margin-bottom:6px;">You've finalized your submission</li>
    </ul>
    ${ctaButton('Submit Now', `${getFrontendUrl()}/dashboard/submission`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Don't miss out — submit before the deadline. Good luck! 🚀</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Deadline Approaching ⏰', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 6. Team Member Joined Email
export async function sendTeamMemberJoinedEmail({ to, name, teamName, newMemberName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeNewMemberName = escapeHtml(newMemberName)
  const subject = `New Member Joined - ${safeTeamName}`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;"><strong>${safeNewMemberName}</strong> has joined your team <strong>${safeTeamName}</strong>.</p>
    <p style="margin:0 0 8px;">Your team is growing stronger — coordinate with all members for the best results.</p>
    ${ctaButton('View Team', `${getFrontendUrl()}/dashboard/team`)}
  `
  const htmlContent = renderBrandedEmail({ title: 'New Team Member 👥', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 7. Admin Announcement Email using SKH branded template
export async function sendAnnouncementEmail({ to, name, title, message, link }) {
  const fs = await import('fs/promises')
  const path = await import('path')
  const { fileURLToPath } = await import('url')
  
  // Get template path
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const templatePath = path.join(__dirname, 'emailTemplates', 'announcement.html')
  
  let htmlTemplate
  try {
    htmlTemplate = await fs.readFile(templatePath, 'utf-8')
  } catch (error) {
    console.error('[Email] Failed to read announcement template:', error)
    // Fallback to simple template
    return sendAnnouncementEmailSimple({ to, name, title, message, link })
  }
  
  const safeName = escapeHtml(name)
  const safeTitle = escapeHtml(title)
  // Convert newlines to <br> tags for HTML
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>')
  const currentYear = new Date().getFullYear()
  
  // Replace template placeholders
  let htmlContent = htmlTemplate
    .replace(/{{TITLE}}/g, safeTitle)
    .replace(/{{MESSAGE}}/g, safeMessage)
    .replace(/{{YEAR}}/g, currentYear.toString())
  
  const subject = `📢 Announcement: ${safeTitle}`
  
  return sendEmail({ to, toName: safeName, subject, htmlContent })
}

// Fallback simple announcement email (if template fails)
function sendAnnouncementEmailSimple({ to, name, title, message, link }) {
  const safeName = escapeHtml(name)
  const safeTitle = escapeHtml(title)
  const safeMessage = escapeHtml(message)
  const safeLink = escapeHtml(link || '')
  const linkUrl = (link || '').trim().toLowerCase()
  const linkSafe = linkUrl.startsWith('http://') || linkUrl.startsWith('https://') || linkUrl === '' ? safeLink : ''
  const subject = `📢 Announcement: ${safeTitle}`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <div style="background:#f8fafc;border-left:4px solid #185983;padding:14px 18px;border-radius:6px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0f172a;font-size:16px;">${safeTitle}</p>
      <p style="margin:0;color:#334155;">${safeMessage}</p>
    </div>
    ${link ? ctaButton('Learn More', linkSafe) : ''}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Stay updated with all announcements on your dashboard.</p>
  `
  const htmlContent = renderBrandedEmail({ title: '📢 Announcement', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 8. Evaluation Complete Email (for teams)
export async function sendEvaluationCompleteEmail({ to, name, teamName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const subject = `Evaluation Complete - ${safeTeamName}`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">The evaluation for your team <strong>${safeTeamName}</strong> has been completed.</p>
    <p style="margin:0 0 8px;">Results will be announced soon — stay tuned!</p>
    ${ctaButton('View Dashboard', `${getFrontendUrl()}/dashboard`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Thank you for participating! 🎉</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Evaluation Complete ✅', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 8b. Team Qualified Email — sent to a team leader when their team qualifies.
export async function sendQualifiedEmail({ to, name, teamName, eventName }) {
  const safeName = escapeHtml(name || 'Team Leader')
  const safeTeam = escapeHtml(teamName || 'Your Team')
  const safeEvent = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const subject = `Congratulations! ${safeTeam} has qualified for the Grand Finale — ${safeEvent}`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Dear ${safeName},</strong></p>
    <p style="margin:0 0 16px;">Congratulations! We are delighted to inform you that your team
      <strong>${safeTeam}</strong> has <strong>qualified for the Grand Finale</strong> of ${safeEvent}. 🎉</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin:0 0 16px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#185983;">Grand Finale Details</p>
        <p style="margin:0 0 6px;color:#0f172a;"><strong>📅 Dates:</strong> 29th &amp; 30th August 2026</p>
        <p style="margin:0 0 6px;color:#0f172a;"><strong>📍 Venue:</strong> Sanjivani University, Kopargaon</p>
        <p style="margin:0;color:#334155;font-size:14px;">Kindly <strong>plan your travel and stay in advance</strong> for both days.
          Details regarding accommodation will be shared with you soon.</p>
      </td></tr>
    </table>

    <p style="margin:0 0 16px;">All other details, including the reporting time, event schedule, and travel guidance,
      will be shared with you shortly via <strong>email</strong> and <strong>WhatsApp</strong>. Please keep an eye on both.</p>
    ${ctaButton('View Results', `${getFrontendUrl()}/results`)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">Warm regards,<br/>Team ${safeEvent}</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'You\u2019re in the Grand Finale! 🎉', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 9. Account Credentials Email — sent when admin bulk-creates a leader account.
// Contains their email, a temporary password, and the platform link.
// Uses the branded credentials.html template with an inline fallback.
// Role-specific copy for the credentials email. `participant` keeps the exact
// wording the team-leader email has always used, so that path is unchanged.
const CREDENTIALS_ROLE_COPY = {
  participant: {
    defaultName: 'Team Leader',
    introLine: 'Your team has been registered successfully',
    subtitleLine: 'and manage your team, problem statement &amp; submissions.',
    fallbackIntro: 'as a team leader',
    attachPdf: true,
  },
  judge: {
    defaultName: 'Jury Member',
    introLine: 'You have been added as a Jury Member',
    subtitleLine: 'and review your assigned teams &amp; submit evaluations.',
    fallbackIntro: 'as a jury member',
    attachPdf: false,
  },
  mentor: {
    defaultName: 'Mentor',
    introLine: 'You have been added as a Mentor',
    subtitleLine: 'and guide your assigned teams via mentor chat.',
    fallbackIntro: 'as a mentor',
    attachPdf: false,
  },
  viewer: {
    defaultName: 'Observer',
    introLine: 'You have been given Observer (read-only) access',
    subtitleLine: 'to view teams, submissions, results &amp; reports (read-only).',
    fallbackIntro: 'as an observer (read-only)',
    attachPdf: false,
  },
}

export async function sendCredentialsEmail({ to, name, tempPassword, eventName, role = 'participant' }) {
  const copy = CREDENTIALS_ROLE_COPY[role] || CREDENTIALS_ROLE_COPY.participant
  const safeName = escapeHtml(name || copy.defaultName)
  const safeEmail = escapeHtml(to)
  const safePassword = escapeHtml(String(tempPassword))
  const safeEventName = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const loginUrl = `${getFrontendUrl()}/auth`
  const subject = `Your ${safeEventName} login credentials`

  // Attach the "How to Register" PDF guide only on the team-leader credentials
  // email (judges/mentors don't register teams).
  const pdfPath = join(TEMPLATES_DIR, 'How-To-Register-SKH.pdf')
  const attachments = (copy.attachPdf && existsSync(pdfPath))
    ? [{ filename: 'How-To-Register-SKH.pdf', path: pdfPath }]
    : []

  // Try the branded template file first
  try {
    const fs = await import('fs/promises')
    const templatePath = join(TEMPLATES_DIR, 'credentials.html')
    const tpl = await fs.readFile(templatePath, 'utf-8')
    const htmlContent = tpl
      .replace(/{{ASSET_BASE}}/g, getFrontendUrl())
      .replace(/{{EVENT_NAME}}/g, safeEventName)
      .replace(/{{NAME}}/g, safeName)
      .replace(/{{EMAIL}}/g, safeEmail)
      .replace(/{{PASSWORD}}/g, safePassword)
      .replace(/{{LOGIN_URL}}/g, loginUrl)
      .replace(/{{INTRO_LINE}}/g, copy.introLine)
      .replace(/{{SUBTITLE_LINE}}/g, copy.subtitleLine)
      .replace(/{{YEAR}}/g, String(new Date().getFullYear()))
    return sendEmail({ to, toName: name, subject, htmlContent, attachments })
  } catch (e) {
    console.warn('[Email] credentials template missing, using inline fallback:', e.message)
  }

  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">An account has been created for you ${copy.fallbackIntro} on the ${safeEventName} platform. Use the credentials below to sign in:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 16px;">
      <tr><td style="padding:14px 16px;border-bottom:1px solid #eef2f6;"><span style="display:block;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Email</span><strong style="font-family:'Courier New',monospace;color:#0f172a;">${safeEmail}</strong></td></tr>
      <tr><td style="padding:14px 16px;"><span style="display:block;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Temporary Password</span><strong style="font-family:'Courier New',monospace;color:#0f172a;">${safePassword}</strong></td></tr>
    </table>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin:0 0 16px;color:#92400e;font-size:14px;">
      🔒 For your security, you'll be asked to <strong>set a new password</strong> (verified by a one-time code sent to this email) the first time you log in.
    </div>
    ${ctaButton('Log in to the Platform', loginUrl)}
    ${copy.attachPdf ? '<p style="margin:20px 0 0;color:#64748b;font-size:14px;">📎 A step-by-step <strong>“How to Register”</strong> guide is attached to this email (PDF).</p>' : ''}
  `
  const htmlContent = renderBrandedEmail({ title: `Your ${safeEventName} Access`, bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent, attachments })
}

// 10. OTP Email — sent when a user requests to change their password (first login).
export async function sendOtpEmail({ to, name, otp, eventName }) {
  const safeName = escapeHtml(name || 'there')
  const safeOtp = escapeHtml(String(otp))
  const safeEventName = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const gifUrl = `${getFrontendUrl()}/skh.gif`
  const year = new Date().getFullYear()
  const subject = `Your verification code: ${safeOtp}`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f2f6f9;font-family:'Inter',Arial,sans-serif;color:#22255e;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f6f9;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
              <!-- Header with SKH gif -->
              <tr>
                <td align="center" style="background-color:#e6f4ff;padding:36px 20px 8px;">
                  <img src="${gifUrl}" alt="SKH" width="260" style="display:block;border:0;width:100%;max-width:260px;height:auto;margin:0 auto;">
                </td>
              </tr>
              <tr>
                <td align="center" style="background-color:#e6f4ff;padding:6px 20px 32px;">
                  <h1 style="margin:0;color:#185983;font-family:'Space Grotesk','Inter',Arial,sans-serif;font-size:26px;font-weight:700;">Verify Your Password Change</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:36px 40px 8px;">
                  <p style="margin:0;font-size:16px;line-height:150%;"><strong>Hi ${safeName},</strong></p>
                  <p style="margin:12px 0 0;font-size:15px;line-height:160%;color:#5a6472;">Enter this one-time code to set your new password:</p>
                </td>
              </tr>
              <!-- OTP -->
              <tr>
                <td align="center" style="padding:24px 40px 8px;">
                  <div style="display:inline-block;font-family:'Space Grotesk','Courier New',monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#185983;background:#ffffff;border:2px dashed #185983;border-radius:10px;padding:18px 28px;">${safeOtp}</div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:10px 40px 36px;">
                  <p style="margin:0;font-size:13px;line-height:160%;color:#8a94a3;">This code expires in <strong style="color:#185983;">10 minutes</strong> and can be used once.</p>
                  <p style="margin:8px 0 0;font-size:12px;line-height:160%;color:#a9b2bf;">If you didn't request this, you can safely ignore this email.</p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td align="center" style="background-color:#185983;padding:22px 20px;">
                  <a href="${getFrontendUrl()}" style="color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">skh.sanjivaniuniversity.com</a>
                  <p style="margin:6px 0 0;font-size:12px;color:#a9d4ec;">${safeEventName} &middot; ${year}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 11. Password Reset Link Email (Fix 1) — generated by Admin SDK, delivered via Brevo
// so it lands in the inbox instead of Firebase's spam-prone default sender.
export async function sendPasswordResetLinkEmail({ to, name, resetLink, eventName }) {
  const safeName = escapeHtml(name || 'there')
  const safeEventName = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const safeLink = String(resetLink || '')
  const subject = `Reset your ${safeEventName} password`
  const bodyHtml = `
    <p style="margin:0 0 14px;"><strong>Hi ${safeName},</strong></p>
    <p style="margin:0 0 16px;">We received a request to reset your ${safeEventName} password. Click the button below to choose a new one.</p>
    ${ctaButton('Reset Password', safeLink)}
    <p style="margin:20px 0 0;color:#64748b;font-size:14px;">This link expires shortly. If you didn't request it, you can safely ignore this email.</p>
  `
  const htmlContent = renderBrandedEmail({ title: 'Reset Your Password', bodyHtml })
  return sendEmail({ to, toName: name, subject, htmlContent })
}

export default {
  sendEmail,
  sendAccountCreatedEmail,
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendPaymentReminderEmail,
  sendSubmissionConfirmationEmail,
  sendSubmissionDeadlineReminderEmail,
  sendTeamMemberJoinedEmail,
  sendAnnouncementEmail,
  sendEvaluationCompleteEmail,
  sendQualifiedEmail,
  sendCredentialsEmail,
  sendOtpEmail,
  sendPasswordResetLinkEmail,
}


// ─── Health Check Export (for admin dashboard) ───────────────────────────────

/**
 * Returns email system health status + last 24h stats for admin dashboard.
 * Called by GET /api/admin/email-health
 */
export async function getEmailHealth() {
  resetStatsIfNeeded()

  // Force a live re-check so the admin "Refresh" button reflects the current
  // environment (e.g. right after fixing SMTP_PASS in the hosting dashboard).
  await getSmtpTransport({ force: true })

  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const brevoConfigured = !!process.env.BREVO_API_KEY

  return {
    smtp: {
      configured: smtpConfigured,
      healthy: _smtpHealthy, // null=unknown, true=working, false=failed
      host: smtpConfigured ? (process.env.SMTP_HOST || '').trim() : null,
      user: smtpConfigured ? (process.env.SMTP_USER || '').trim() : null,
      port: smtpConfigured ? (Number((process.env.SMTP_PORT || '').trim()) || 465) : null,
      // Diagnostics (admin-only): length of the cleaned password (never the value)
      // and the last auth/connection error, to debug production env mismatches.
      passLen: (process.env.SMTP_PASS || '').trim().replace(/^['"]+|['"]+$/g, '').trim().length || 0,
      error: _smtpHealthy === false ? (_smtpError || 'Authentication/connection failed') : null,
    },
    brevo: {
      configured: brevoConfigured,
      fromAddress: process.env.EMAIL_FROM_ADDRESS || null,
    },
    stats: {
      period: '24h',
      smtp: { ..._emailStats.smtp },
      brevo: { ..._emailStats.brevo },
      total: _emailStats.smtp.sent + _emailStats.brevo.sent,
    },
    activeTransport: smtpConfigured && _smtpHealthy ? 'smtp' : brevoConfigured ? 'brevo' : 'none',
  }
}
