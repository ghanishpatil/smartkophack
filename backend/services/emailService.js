/**
 * Email Service — sends via SMTP (nodemailer) when SMTP_* env vars are set,
 * otherwise falls back to the Brevo REST API.
 *
 * Deliverability note: sending from a domain with proper SPF/DKIM/DMARC is what
 * keeps mail out of spam. The Hostinger-hosted mailbox
 * (skh@sanjivaniuniversity.com) already has that, so SMTP is preferred when set.
 */

let _smtpTransport = null
let _smtpHealthy = null // null=unknown, true=working, false=failed
let _smtpLastTry = 0
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

  // Trim env values — copy/paste into hosting dashboards often adds stray
  // whitespace or newlines that silently break authentication.
  const host = (process.env.SMTP_HOST || '').trim()
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').trim()
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
    const port = Number((process.env.SMTP_PORT || '').trim()) || 465
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
    })
    // Verify connection/credentials before caching.
    await transport.verify()
    _smtpTransport = transport
    _smtpHealthy = true
    console.log(`[Email] SMTP transport configured and verified (${host}:${port} as ${user})`)
  } catch (e) {
    _smtpTransport = null
    _smtpHealthy = false
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

/**
 * Send email — prefers SMTP (nodemailer) when configured, else Brevo REST API.
 */
async function sendEmail({ to, toName, subject, htmlContent, textContent, params = {} }) {
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
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 36px 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 26px; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .steps { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .step { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .step:last-child { border-bottom: none; }
        .step-num { background: #667eea; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; font-size: 15px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to ${safeEventName}! 🎉</h1>
          <p>Your account has been created successfully</p>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          <p>You're in! Your account is ready. Here's what to do next to participate:</p>

          <div class="steps">
            <div class="step">
              <div class="step-num">1</div>
              <div><strong>Create or join a team</strong><br><span style="color:#666;font-size:13px">Go to Dashboard → Team. Create a new team or enter an invite code to join one.</span></div>
            </div>
            <div class="step">
              <div class="step-num">2</div>
              <div><strong>Register your team</strong><br><span style="color:#666;font-size:13px">Once your team has the minimum members, register for the event.</span></div>
            </div>
            <div class="step">
              <div class="step-num">3</div>
              <div><strong>Pick a problem statement</strong><br><span style="color:#666;font-size:13px">Browse the problem statements and select the one your team wants to solve.</span></div>
            </div>
            <div class="step">
              <div class="step-num">4</div>
              <div><strong>Build and submit</strong><br><span style="color:#666;font-size:13px">Upload your PPT, GitHub link, video demo, and finalize before the deadline.</span></div>
            </div>
          </div>

          <div style="text-align:center">
            <a href="${getFrontendUrl()}/dashboard" class="button">Go to Dashboard →</a>
          </div>

          <p style="color:#666;font-size:13px">If you have any questions, reach out to the organizers. Good luck! 🚀</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>${safeEventName} | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  return sendEmail({ to, toName: name, subject, htmlContent })
}


export async function sendWelcomeEmail({ to, name, teamName, eventName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeEventName = escapeHtml(eventName)
  const subject = `Welcome to ${safeEventName}! 🎉`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to ${safeEventName}!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p>Congratulations! Your team <strong>${safeTeamName}</strong> has been successfully registered for ${safeEventName}.</p>
          
          <p><strong>What's Next?</strong></p>
          <ul>
            <li>✅ Complete your team (invite members)</li>
            <li>✅ Select a problem statement</li>
            <li>✅ Start working on your solution</li>
            <li>✅ Submit before the deadline</li>
          </ul>
          
          <a href="${getFrontendUrl()}/dashboard" class="button">Go to Dashboard</a>
          
          <p>If you have any questions, feel free to reach out to our support team.</p>
          
          <p>Best of luck! 🚀</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
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
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .receipt { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .receipt-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Payment Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p>Your payment has been successfully processed. Your team <strong>${safeTeamName}</strong> is now fully registered!</p>
          
          <div class="receipt">
            <h3>Payment Receipt</h3>
            <div class="receipt-row">
              <span>Team Name:</span>
              <strong>${safeTeamName}</strong>
            </div>
            <div class="receipt-row">
              <span>Amount Paid:</span>
              <strong>${safeCurrency} ${safeAmount}</strong>
            </div>
            <div class="receipt-row">
              <span>Payment ID:</span>
              <strong>${safePaymentId}</strong>
            </div>
            <div class="receipt-row">
              <span>Date:</span>
              <strong>${new Date().toLocaleDateString()}</strong>
            </div>
          </div>
          
          <p><strong>You can now:</strong></p>
          <ul>
            <li>✅ Select your problem statement</li>
            <li>✅ Submit your project</li>
            <li>✅ Access all hackathon resources</li>
          </ul>
          
          <a href="${getFrontendUrl()}/dashboard" class="button">Go to Dashboard</a>
          
          <p>Keep this email for your records.</p>
          
          <p>Best regards,<br><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
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
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Payment Reminder</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p>This is a friendly reminder that your team <strong>${safeTeamName}</strong> has a pending payment.</p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> Payment must be completed before <strong>${safeDeadline}</strong> to unlock submissions.
          </div>
          
          <p><strong>Payment Details:</strong></p>
          <ul>
            <li>Amount: <strong>${safeCurrency} ${safeAmount}</strong></li>
            <li>Team: <strong>${safeTeamName}</strong></li>
            <li>Deadline: <strong>${safeDeadline}</strong></li>
          </ul>
          
          <a href="${getFrontendUrl()}/dashboard/registration" class="button">Complete Payment Now</a>
          
          <p>If you've already paid, please ignore this email. It may take a few minutes for the payment to reflect.</p>
          
          <p>Need help? Contact our support team.</p>
          
          <p>Best regards,<br><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 4. Submission Confirmation Email
export async function sendSubmissionConfirmationEmail({ to, name, teamName, problemStatement, submittedAt }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeProblemStatement = escapeHtml(problemStatement)
  const safeSubmittedAt = escapeHtml(String(submittedAt))
  const subject = `Submission Received - ${safeTeamName} ✅`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Submission Received!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p>Great news! Your team's submission has been successfully received.</p>
          
          <div class="info-box">
            <h3>Submission Details</h3>
            <p><strong>Team:</strong> ${safeTeamName}</p>
            <p><strong>Problem Statement:</strong> ${safeProblemStatement}</p>
            <p><strong>Submitted At:</strong> ${safeSubmittedAt}</p>
          </div>
          
          <p><strong>What happens next?</strong></p>
          <ul>
            <li>✅ Your submission is now under review</li>
            <li>✅ Judges will evaluate your project</li>
            <li>✅ You can update your submission until the deadline</li>
            <li>✅ Results will be announced soon</li>
          </ul>
          
          <a href="${getFrontendUrl()}/dashboard/submission" class="button">View Submission</a>
          
          <p>Best of luck! 🚀</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 5. Submission Deadline Reminder
export async function sendSubmissionDeadlineReminderEmail({ to, name, teamName, deadline, hoursLeft }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeDeadline = escapeHtml(String(deadline))
  const safeHoursLeft = escapeHtml(String(hoursLeft))
  const subject = `⏰ ${safeHoursLeft}h Left - Submission Deadline Approaching!`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .urgent { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .countdown { font-size: 48px; font-weight: bold; color: #ef4444; text-align: center; margin: 20px 0; }
        .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Deadline Approaching!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <div class="urgent">
            <strong>🚨 URGENT:</strong> The submission deadline is approaching fast!
          </div>
          
          <div class="countdown">${safeHoursLeft} Hours Left</div>
          
          <p>Team <strong>${safeTeamName}</strong>, you have only <strong>${safeHoursLeft} hours</strong> left to submit your project!</p>
          
          <p><strong>Deadline:</strong> ${safeDeadline}</p>
          
          <p><strong>Before you submit, make sure:</strong></p>
          <ul>
            <li>✅ All required files are uploaded</li>
            <li>✅ GitHub repository is accessible</li>
            <li>✅ Video demo is working</li>
            <li>✅ Presentation is complete</li>
          </ul>
          
          <a href="${getFrontendUrl()}/dashboard/submission" class="button">Submit Now</a>
          
          <p>Don't miss out! Submit before the deadline.</p>
          
          <p>Good luck! 🚀<br><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 6. Team Member Joined Email
export async function sendTeamMemberJoinedEmail({ to, name, teamName, newMemberName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const safeNewMemberName = escapeHtml(newMemberName)
  const subject = `New Member Joined - ${safeTeamName}`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>👥 New Team Member!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p><strong>${safeNewMemberName}</strong> has joined your team <strong>${safeTeamName}</strong>!</p>
          
          <p>Your team is growing stronger. Make sure to coordinate with all members for the best results.</p>
          
          <a href="${getFrontendUrl()}/dashboard/team" class="button">View Team</a>
          
          <p>Best regards,<br><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
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
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #667eea; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .announcement { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📢 Important Announcement</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <div class="announcement">
            <h2>${safeTitle}</h2>
            <p>${safeMessage}</p>
          </div>
          
          ${link ? `<a href="${linkSafe}" class="button">Learn More</a>` : ''}
          
          <p>Stay updated with all announcements on your dashboard.</p>
          
          <p>Best regards,<br><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 8. Evaluation Complete Email (for teams)
export async function sendEvaluationCompleteEmail({ to, name, teamName }) {
  const safeName = escapeHtml(name)
  const safeTeamName = escapeHtml(teamName)
  const subject = `Evaluation Complete - ${safeTeamName}`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Evaluation Complete!</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          
          <p>Great news! The evaluation for your team <strong>${safeTeamName}</strong> has been completed.</p>
          
          <p>Results will be announced soon. Stay tuned!</p>
          
          <a href="${getFrontendUrl()}/dashboard" class="button">View Dashboard</a>
          
          <p>Thank you for participating! 🎉</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>Smart Kopargaon Hackathon | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return sendEmail({ to, toName: name, subject, htmlContent })
}

// 9. Account Credentials Email — sent when admin bulk-creates a leader account.
// Contains their email, a temporary password, and the platform link.
// Uses the branded credentials.html template with an inline fallback.
export async function sendCredentialsEmail({ to, name, tempPassword, eventName }) {
  const safeName = escapeHtml(name || 'Team Leader')
  const safeEmail = escapeHtml(to)
  const safePassword = escapeHtml(String(tempPassword))
  const safeEventName = escapeHtml(eventName || 'Smart Kopargaon Hackathon')
  const loginUrl = `${getFrontendUrl()}/auth`
  const subject = `Your ${safeEventName} login credentials`

  // Try the branded template file first
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const templatePath = path.join(__dirname, 'emailTemplates', 'credentials.html')
    const tpl = await fs.readFile(templatePath, 'utf-8')
    const htmlContent = tpl
      .replace(/{{EVENT_NAME}}/g, safeEventName)
      .replace(/{{NAME}}/g, safeName)
      .replace(/{{EMAIL}}/g, safeEmail)
      .replace(/{{PASSWORD}}/g, safePassword)
      .replace(/{{LOGIN_URL}}/g, loginUrl)
      .replace(/{{YEAR}}/g, String(new Date().getFullYear()))
    return sendEmail({ to, toName: name, subject, htmlContent })
  } catch (e) {
    console.warn('[Email] credentials template missing, using inline fallback:', e.message)
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .creds { background: white; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .creds .row { padding: 8px 0; }
        .creds .label { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .creds .val { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #111; background: #f3f4f6; padding: 8px 12px; border-radius: 6px; display: inline-block; margin-top: 4px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .warn { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 15px; margin: 20px 0; font-size: 13px; border-radius: 4px; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your ${safeEventName} Access</h1>
        </div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          <p>An account has been created for you as a team leader on the ${safeEventName} platform. Use the credentials below to sign in:</p>

          <div class="creds">
            <div class="row">
              <div class="label">Email</div>
              <div class="val">${safeEmail}</div>
            </div>
            <div class="row">
              <div class="label">Temporary Password</div>
              <div class="val">${safePassword}</div>
            </div>
          </div>

          <div class="warn">
            🔒 For your security, you'll be asked to <strong>set a new password</strong> (verified by a one-time code sent to this email) the first time you log in.
          </div>

          <div style="text-align:center">
            <a href="${loginUrl}" class="button">Log in to the Platform →</a>
          </div>

          <p style="color:#666;font-size:13px">If you didn't expect this email, please contact the organizers.</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer">
          <p>${safeEventName} | ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `
  return sendEmail({ to, toName: name, subject, htmlContent })
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
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 28px 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>Reset Your Password</h1></div>
        <div class="content">
          <p>Hi <strong>${safeName}</strong>,</p>
          <p>We received a request to reset your ${safeEventName} password. Click the button below to choose a new one:</p>
          <div style="text-align:center">
            <a href="${safeLink}" class="button">Reset Password →</a>
          </div>
          <p style="color:#666;font-size:13px">This link expires shortly. If you didn't request it, you can ignore this email.</p>
          <p><strong>Team SKH</strong></p>
        </div>
        <div class="footer"><p>${safeEventName} | ${new Date().getFullYear()}</p></div>
      </div>
    </body>
    </html>
  `
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
      host: smtpConfigured ? process.env.SMTP_HOST : null,
      user: smtpConfigured ? process.env.SMTP_USER : null,
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
