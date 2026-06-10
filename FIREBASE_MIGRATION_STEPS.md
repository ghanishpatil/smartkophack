# Firebase Database Migration - Complete Guide

## ✅ Completed Steps

1. **Frontend configuration updated** - New Firebase config applied
2. **Super admin email set** - `nexxus975@gmail.com`
3. **Project ID updated** - Changed from `smart-kop` to `verify-sih`

## 🔧 Required: Get Service Account JSON

You need to generate a service account key for the new Firebase project:

### Steps to Get Service Account JSON:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the **verify-sih** project
3. Click the gear icon ⚙️ → **Project settings**
4. Navigate to **Service accounts** tab
5. Click **Generate new private key**
6. Download the JSON file
7. Copy the entire JSON content

### Update Backend .env:

Replace the `FIREBASE_SERVICE_ACCOUNT_JSON` value in `backend/.env` with the new JSON (as a single-line string).

**Example format:**
```
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"verify-sih",...}
```

## 🚀 Deployment Steps (After Service Account Update)

### 1. Deploy Firestore Rules
```cmd
firebase deploy --only firestore:rules
```

### 2. Deploy Firestore Indexes
```cmd
firebase deploy --only firestore:indexes
```

### 3. Deploy Storage Rules
```cmd
firebase deploy --only storage
```

### 4. Set Up Super Admin User

After deploying, you need to manually create the super admin user in Firestore:

1. Go to [Firestore Console](https://console.firebase.google.com/project/verify-sih/firestore)
2. Create a collection: `users`
3. Add a document with ID matching the UID of `nexxus975@gmail.com` user
4. Set the following fields:
   ```json
   {
     "email": "nexxus975@gmail.com",
     "role": "admin",
     "displayName": "Super Admin",
     "teamId": "",
     "createdAt": <current timestamp>,
     "updatedAt": <current timestamp>,
     "activeEventId": ""
   }
   ```

**Note:** First sign in with `nexxus975@gmail.com` in the frontend to get the Firebase Auth UID, then create the Firestore user document.

## 📋 Security Rules Summary

All security rules remain the same:
- ✅ Firestore rules (firestore.rules)
- ✅ Storage rules (storage.rules)
- ✅ Indexes (firestore.indexes.json)

## 🎯 Git Commit

After updating the service account JSON, commit all changes:

```cmd
git add .
git commit -m "chore: migrate to new Firebase project (verify-sih)"
git push
```

## ⚠️ Important Notes

1. **Service Account JSON** - Keep it secret, never commit to git
2. **Super Admin Protection** - `nexxus975@gmail.com` is protected from role changes
3. **All Collections** - Will be empty in new database, you'll need to migrate data if needed
4. **Storage Buckets** - Configure the same bucket structure in new project
5. **Test thoroughly** - Before going live, test all features

## 📦 Data Migration (If Needed)

If you need to migrate existing data from the old database:

1. Export data from old project: `firebase firestore:export gs://smart-kop.appspot.com/backup`
2. Import to new project: `firebase firestore:import gs://verify-sih.appspot.com/backup`

Or use the Firebase Console to export/import collections manually.
