# Deployment Checklist - Domain Update

## ✅ Completed Steps

### 1. Updated Backend Configuration (`backend/.env`)
```env
CORS_ORIGIN=https://skh.sanjivaniuniversity.com
FRONTEND_URL=https://skh.sanjivaniuniversity.com
```

### 2. Updated Frontend Configuration (`frontend/.env`)
```env
VITE_API_URL=https://skhspidy.sanjivaniuniversity.com
```

### 3. Created Webhook Setup Guide
Created `RAZORPAY_WEBHOOK_SETUP.md` with complete instructions.

---

## 🔧 Required Actions (Do These Now!)

### Step 1: Update Environment Files on Server

#### Backend Server (`skhspidy.sanjivaniuniversity.com`)
1. SSH into your backend server
2. Navigate to the backend directory
3. Edit `backend/.env` and update:
```env
CORS_ORIGIN=https://skh.sanjivaniuniversity.com
FRONTEND_URL=https://skh.sanjivaniuniversity.com
```

#### Frontend Server (or build configuration)
1. Edit `frontend/.env` (or build environment variables)
2. Update:
```env
VITE_API_URL=https://skhspidy.sanjivaniuniversity.com
```

### Step 2: Configure Razorpay Webhook

**Important**: This step is CRITICAL for payment processing!

1. **Login to Razorpay Dashboard**: https://dashboard.razorpay.com/
2. **Go to Settings → Webhooks**
3. **Create or Update Webhook**:
   - **URL**: `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay`
   - **Active Events**: Check only `payment.captured`
4. **Copy the Webhook Secret**:
   - After saving, you'll see a "Secret" field
   - Copy the secret (looks like: `whsec_aBcDeFg...`)
   - **DO NOT copy the URL - copy the SECRET!**
5. **Update Backend .env**:
```env
RAZORPAY_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE
```

### Step 3: Restart Backend Server
After updating `.env` files:
```bash
# If using PM2
pm2 restart skh-backend

# If using systemd
sudo systemctl restart skh-backend

# If running directly
cd backend
npm restart
```

### Step 4: Rebuild Frontend
After updating frontend `.env`:
```bash
cd frontend
npm run build
# Deploy the new build to your hosting (Vercel/Netlify/etc)
```

### Step 5: Verify Configuration

#### Check Backend Health
Visit: `https://skhspidy.sanjivaniuniversity.com/api/health/config`

**Expected Response**:
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

✅ **Good Signs**:
- `webhookSecretSet: true`
- `webhookSecretIsUrl: false`
- `warning: null`

❌ **Bad Signs**:
- `webhookSecretSet: false` → Add secret to `.env`
- `webhookSecretIsUrl: true` → You pasted URL instead of secret
- `warning: "..."` → Read warning and fix

#### Test Webhook
1. Go to Razorpay Dashboard → Settings → Webhooks
2. Find your webhook
3. Click **"Send Test Webhook"**
4. Check response:
   - **200 OK** = Success ✅
   - **503** = Secret not set ❌
   - **400** = Invalid signature ❌

#### Test Payment Flow
1. Visit: `https://skh.sanjivaniuniversity.com`
2. Register a team
3. Try making a payment
4. Verify:
   - Razorpay checkout opens
   - Payment completes
   - Team status updates to "Complete"
   - Confirmation email received

---

## 🔒 Security Notes

### Environment Files
**NEVER commit these files to Git**:
- `backend/.env`
- `frontend/.env`
- `*firebase-adminsdk*.json`

They are already in `.gitignore` and contain sensitive keys.

### Webhook Secret
- The webhook secret is NOT a URL
- It's a random string for signature verification
- Without it, webhook payments will fail
- Keep it secret, never expose in frontend

---

## 📝 Configuration Summary

| Component | URL/Value |
|-----------|-----------|
| **Backend Domain** | `https://skhspidy.sanjivaniuniversity.com` |
| **Frontend Domain** | `https://skh.sanjivaniuniversity.com` |
| **Webhook Endpoint** | `https://skhspidy.sanjivaniuniversity.com/api/webhooks/razorpay` |
| **API Health Check** | `https://skhspidy.sanjivaniuniversity.com/api/health/config` |

---

## 🐛 Troubleshooting

### Issue: "CORS error" in browser console
**Solution**: Ensure `CORS_ORIGIN` in backend `.env` matches your frontend URL exactly.

### Issue: "Webhook secret not set"
**Solution**: 
1. Check `backend/.env` has `RAZORPAY_WEBHOOK_SECRET=...`
2. Restart backend server
3. Verify at `/api/health/config`

### Issue: "Invalid signature" on webhook
**Solution**:
1. Go to Razorpay Dashboard
2. Copy the webhook secret again
3. Update `backend/.env`
4. Restart backend

### Issue: Payments work but no confirmation email
**Solution**: Check email configuration:
```env
BREVO_API_KEY=your_key
EMAIL_FROM_ADDRESS=noreply@smartkopargaon.com
EMAIL_FROM_NAME=Smart Kopargaon Hackathon
```

---

## 📚 Additional Resources

- **Full Webhook Guide**: See `RAZORPAY_WEBHOOK_SETUP.md`
- **Razorpay Docs**: https://razorpay.com/docs/webhooks/
- **Admin Panel**: `https://skh.sanjivaniuniversity.com/admin`
- **Webhook Logs**: Admin Panel → Security → Webhook Log

---

**Last Updated**: June 9, 2026
