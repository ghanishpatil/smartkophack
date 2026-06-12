# Vercel Environment Variables Setup

## Issue
The frontend was trying to connect to `http://localhost:4000` in production, causing "Failed to fetch" errors.

## Solution
Set the following environment variables in Vercel:

### Go to: https://vercel.com/your-project/settings/environment-variables

Add these variables for **Production** environment:

```
VITE_FIREBASE_API_KEY=AIzaSyCaPCChGuCVYT6D9j4ClhYLLBoBABd13_A
VITE_FIREBASE_AUTH_DOMAIN=verify-sih.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=verify-sih
VITE_FIREBASE_STORAGE_BUCKET=verify-sih.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=594291182215
VITE_FIREBASE_APP_ID=1:594291182215:web:fb76ff7982a2b206abc622
VITE_FIREBASE_MEASUREMENT_ID=G-90RT530FDY

VITE_API_URL=https://skhspidy.sanjivaniuniversity.com
VITE_API_BASE_URL=https://skhspidy.sanjivaniuniversity.com

VITE_SUPER_ADMIN_EMAILS=nexxus975@gmail.com
```

## Critical Variables
The most important ones to fix the registration error:
- `VITE_API_URL` - Points to the Railway backend
- `VITE_API_BASE_URL` - Points to the Railway backend

## After Setting Variables
1. Trigger a new deployment in Vercel (or it will deploy automatically on next push)
2. The registration form will now connect to the correct backend API

## Alternative: Use .env.production
Vite automatically loads `.env.production` when building for production. The file has been created with the correct values.
