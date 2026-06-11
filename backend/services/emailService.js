/**
 * Email Service using Brevo (formerly Sendinblue)
 * Uses direct REST API instead of SDK for reliability.
 */

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
 * Send email using Brevo REST API (direct fetch, no SDK needed)
 */
async function sendEmail({ to, toName, subject, htmlContent, textContent, params = {} }) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[Email] Brevo API key not configured. Email not sent.')
    return { success: false, reason: 'not_configured' }
  }

  // Validate required fields
  if (!to || !subject || !htmlContent) {
    console.error('[Email] Missing required field:', { to: !!to, subject: !!subject, htmlContent: !!htmlContent })
    return { success: false, error: 'Missing required email fields (to, subject, or htmlContent)' }
  }

  // Validate email format
  if (!to.includes('@')) {
    console.error('[Email] Invalid recipient email:', to)
    return { success: false, error: 'Invalid recipient email' }
  }

  try {
    const payload = {
      sender: {
        name: process.env.EMAIL_FROM_NAME || 'Smart Kopargaon Hackathon',
        email: process.env.EMAIL_FROM_ADDRESS || 'noreply@skh.com',
      },
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
      const errMsg = data?.message || data?.code || `HTTP ${res.status}`
      console.error('[Email] Brevo API error:', errMsg, JSON.stringify(data))
      return { success: false, error: errMsg }
    }

    console.log('[Email] Sent successfully:', { to, subject, messageId: data.messageId })
    return { success: true, messageId: data.messageId }
  } catch (error) {
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
}
