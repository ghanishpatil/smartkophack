# Deploy to New Firebase Project - Step by Step

## Prerequisites Completed ✅

- ✅ Frontend config updated to `verify-sih`
- ✅ Backend super admin email set to `nexxus975@gmail.com`
- ✅ Frontend super admin email set to `nexxus975@gmail.com`
- ✅ Project ID updated in `.firebaserc`

## Step 1: Login to Firebase CLI

Run this command and follow the browser authentication:
```cmd
firebase login
```

## Step 2: Verify Project Selection

```cmd
firebase use
```

Should show: `verify-sih` as active project

If not, run:
```cmd
firebase use verify-sih
```

## Step 3: Get Service Account JSON

⚠️ **CRITICAL: You must do this before deploying**

1. Go to https://console.firebase.google.com/
2. Select **verify-sih** project
3. Click ⚙️ (Settings) → **Project settings**
4. Go to **Service accounts** tab
5. Click **Generate new private key** button
6. Download the JSON file
7. Open the JSON file and copy ALL content
8. Open `backend/.env` file
9. Replace the entire `FIREBASE_SERVICE_ACCOUNT_JSON=...` line with:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON=<paste the entire JSON here as one line>
   ```

## Step 4: Deploy Security Rules

### Deploy Firestore Rules:
```cmd
firebase deploy --only firestore:rules
```

### Deploy Firestore Indexes:
```cmd
firebase deploy --only firestore:indexes
```

### Deploy Storage Rules:
```cmd
firebase deploy --only storage
```

### Or Deploy All at Once:
```cmd
firebase deploy --only firestore,storage
```

## Step 5: Create Super Admin User

### Option A: Via Authentication First
1. Sign in to the frontend app with `nexxus975@gmail.com`
2. This creates the Firebase Auth user
3. Note the UID from Firebase Console → Authentication
4. Go to Firestore Console
5. Create collection `users`
6. Add document with ID = UID
7. Set fields:
   ```json
   {
     "email": "nexxus975@gmail.com",
     "role": "admin",
     "displayName": "Super Admin",
     "teamId": "",
     "createdAt": <timestamp>,
     "updatedAt": <timestamp>,
     "activeEventId": ""
   }
   ```

### Option B: Via Firebase Console Directly
1. Firebase Console → Authentication → Users
2. Add user manually with email `nexxus975@gmail.com`
3. Copy the UID
4. Follow steps 4-7 from Option A

## Step 6: Commit to Git

```cmd
git add .
git commit -m "chore: migrate to Firebase project verify-sih with super admin nexxus975@gmail.com"
git push
```

## Step 7: Test Everything

1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Sign in with `nexxus975@gmail.com`
4. Verify admin access works
5. Test creating events, teams, etc.

## 🔒 Security Checklist

- ✅ Firestore rules deployed
- ✅ Storage rules deployed
- ✅ Indexes deployed
- ✅ Super admin email protected in both .env files
- ✅ Service account JSON updated (DO NOT COMMIT)
- ✅ Old database config removed

## 📊 Current Configuration

**Project ID:** verify-sih  
**Super Admin:** nexxus975@gmail.com  
**Frontend URL:** https://skh.sanjivaniuniversity.com  
**API URL:** https://skhspidy.sanjivaniuniversity.com

## ⚠️ Important Notes

1. **Do NOT commit** the service account JSON to git
2. The backend `.env` file is already in `.gitignore`
3. All security rules are preserved exactly as before
4. The new database is empty - you'll need to:
   - Create events
   - Add problem statements
   - Configure platform settings
5. Storage buckets inherit the same rules

## 🚨 If Something Goes Wrong

### Can't deploy rules?
- Run `firebase login --reauth`
- Verify project: `firebase use verify-sih`

### Service account errors?
- Double-check the JSON is valid
- Ensure it's from the `verify-sih` project
- Make sure it's a single line in the .env file

### Super admin can't access?
- Verify the email in backend/.env matches frontend/.env
- Check Firestore `users` collection has the user document
- Ensure role is set to "admin"
