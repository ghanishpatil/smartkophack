# Razorpay Webhook Setup Guide

## Overview
Razorpay webhooks automatically notify your backend when payments are completed. This guide shows how to configure the webhook with your new domain.

## Current Configuration

### Backend Domain
**URL**: `https://skhspidy.sanjivaniuniversity.com`

### Webhook Endpoint
**Full URL**: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`

This endpoint handles `payment.captured` events from Razorpay and automatically:
- Verifies payment signatures
- Marks teams as paid in Firestore
- Sends confirmation emails to team leaders
- Logs all webhook events for auditing

---

## Step-by-Step Setup Instructions

### 1. Login to Razorpay Dashboard
Go to: https://dashboard.razorpay.com/

### 2. Navigate to Webhooks Section
- Click on **Settings** (gear icon in left sidebar)
- Click on **Webhooks**
- You'll see a list of existing webhooks (if any)

### 3. Create or Update Webhook

#### If No Webhook Exists (Create New):
1. Click **"+ Create New Webhook"** button
2. Enter webhook URL: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`
3. In "Active Events" section, select **only**:
   - ✅ `payment.captured`
4. Leave other events unchecked (the backend ignores them anyway)
5. Click **"Create Webhook"**

#### If Webhook Already Exists (Update):
1. Find your existing webhook in the list
2. Click the **Edit** (pencil) icon
3. Update the URL to: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`
4. Ensure `payment.captured` is checked
5. Click **"Save"**

### 4. Copy the Webhook Secret
After creating/updating the webhook:
1. You'll see a **"Secret"** field with a value like: `whsec_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`
2. Click the **"Copy"** button or manually select and copy this secret
3. **IMPORTANT**: This is NOT a URL! It's a random string used for signature verification

### 5. Update Backend Environment Variable
Open `backend/.env` and update the webhook secret:

```env
RAZORPAY_WEBHOOK_SECRET=whsec_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456
```

**Replace** `whsec_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456` with your actual secret from Razorpay.

### 6. Restart Your Backend Server
After updating `.env`, restart the backend:
```bash
cd backend
npm restart
# or if using PM2:
pm2 restart skh-backend
```

---

## Verification Steps

### 1. Check Backend Health
Visit: `https://skhspidy.sanjivaniuniversity.com/api/health/config`

Look for the `razorpay` section:
```json
{
  "razorpay": {
    "configured": true,
    "webhookSecretSet": true,
    "webhookSecretIsUrl": false,
    "warning": null
  }
}
```

**Good signs:**
- ✅ `webhookSecretSet: true`
- ✅ `webhookSecretIsUrl: false`
- ✅ `warning: null`

**Bad signs:**
- ❌ `webhookSecretSet: false` → Secret not set in `.env`
- ❌ `webhookSecretIsUrl: true` → You pasted the URL instead of the secret
- ⚠️ `warning: "..."` → Read the warning message

### 2. Test Webhook in Razorpay Dashboard
1. Go back to Razorpay Dashboard → Settings → Webhooks
2. Find your webhook in the list
3. Click the **"Send Test Webhook"** button
4. Razorpay will send a test `payment.captured` event
5. Check the response:
   - **Status 200** = Success ✅
   - **Status 503** = Secret not set ❌
   - **Status 400/401** = Invalid signature ❌

### 3. Check Webhook Logs (Admin Panel)
1. Login as admin: `https://skh.sanjivaniuniversity.com/admin`
2. Navigate to: **Security → Webhook Log**
3. You should see recent webhook events with:
   - Event: `payment.captured`
   - Status: `success` or `ignored`
   - Team ID (for successful payments)

---

## Common Issues & Solutions

### Issue 1: "RAZORPAY_WEBHOOK_SECRET not set"
**Symptom**: Backend returns 503 status
**Solution**: 
1. Add the secret to `backend/.env`
2. Restart backend server
3. Verify it's loaded: check `/api/health/config`

### Issue 2: "Invalid signature" (400 status)
**Symptom**: Webhook fails with "invalid signature" error
**Causes**:
- Wrong secret copied from Razorpay
- Secret is for a different webhook
- Accidental spaces/newlines in the secret

**Solution**:
1. Go to Razorpay Dashboard → Settings → Webhooks
2. Find the webhook with URL: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`
3. Copy the secret again (click the Copy button)
4. Update `backend/.env` with the exact secret (no extra spaces)
5. Restart backend

### Issue 3: Webhook secret looks like a URL
**Symptom**: Backend logs warning about secret being a URL
**Problem**: You copied the webhook URL instead of the secret

**Solution**:
1. Open Razorpay Dashboard → Settings → Webhooks
2. Click your webhook to view details
3. Look for the **"Secret"** field (usually below the URL)
4. Copy the SECRET value, not the URL
5. The secret should look like: `whsec_...` or similar random string

### Issue 4: Webhooks work but emails not sent
**Symptom**: Payment recorded but no confirmation email
**Solution**: Check email configuration in `backend/.env`:
```env
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM_ADDRESS=noreply@smartkopargaon.com
EMAIL_FROM_NAME=Smart Kopargaon Hackathon
```

---

## Environment Variables Summary

### Backend (.env)
```env
# Domain Configuration
CORS_ORIGIN=https://skh.sanjivaniuniversity.com
FRONTEND_URL=https://skh.sanjivaniuniversity.com

# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_live_SIlLabY9zOFOQo
RAZORPAY_KEY_SECRET=Rc0sKH70DgKla2FSZ6oVDWPH
RAZORPAY_WEBHOOK_SECRET=whsec_YOUR_ACTUAL_SECRET_HERE

# Email Configuration (Brevo)
BREVO_API_KEY=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
EMAIL_FROM_ADDRESS=noreply@smartkopargaon.com
EMAIL_FROM_NAME=Smart Kopargaon Hackathon
```

### Frontend (.env)
```env
# API Configuration
VITE_API_URL=https://skhspidy.sanjivaniuniversity.com
```

---

## Security Notes

### Rate Limiting
The webhook endpoint is protected with rate limiting:
- **30 requests per minute** per IP address
- Razorpay retries failed webhooks automatically
- Rate limits prevent abuse while allowing legitimate retries

### Signature Verification
Every webhook request is verified using HMAC-SHA256:
1. Razorpay signs the payload with your webhook secret
2. Backend recomputes the signature
3. If signatures match → request is authentic
4. If signatures don't match → request is rejected (possible attack)

### Idempotency
The backend handles duplicate webhooks gracefully:
- Each payment creates a lock document: `webhookEvents/{razorpayPaymentId}`
- Duplicate webhooks are detected and return success without processing
- This prevents duplicate emails and double-processing

### Logging
All webhook events are logged:
- Collection: `webhookLog`
- Security events: `securityLog`
- Admin can review: Security → Webhook Log

---

## Testing Payment Flow

### Test Mode (Development)
1. Use Razorpay test keys: `rzp_test_...`
2. Create webhook with test mode URL
3. Use test card: `4111 1111 1111 1111`, CVV: `123`, Expiry: any future date

### Live Mode (Production)
1. Use Razorpay live keys: `rzp_live_...` (already configured)
2. Create webhook with production URL: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`
3. Test with real payment

---

## Support & Troubleshooting

### Backend Logs
Check logs for webhook events:
```bash
cd backend
pm2 logs skh-backend --lines 100
# or
npm run dev
```

Look for:
- `[razorpay webhook]` - Webhook processing logs
- `[Payment Email]` - Email sending logs

### Admin Panel
Login as admin and check:
1. **Security → Webhook Log** - All webhook events
2. **Security → Security Log** - Invalid signature attempts
3. **Access Control → Activity Log** - Team payment updates

### Razorpay Support
If issues persist:
1. Go to Razorpay Dashboard
2. Click **"Support"** in left sidebar
3. Create a ticket with:
   - Webhook URL
   - Payment ID or Order ID
   - Error message from logs

---

## Quick Reference

| Item | Value |
|------|-------|
| Backend Domain | `https://skhspidy.sanjivaniuniversity.com` |
| Frontend Domain | `https://skh.sanjivaniuniversity.com` |
| Webhook Endpoint | `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay` |
| Webhook Event | `payment.captured` |
| Rate Limit | 30 requests/minute |
| Health Check | `https://skhspidy.sanjivaniuniversity.com/api/health/config` |

---

**Last Updated**: June 9, 2026
