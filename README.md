# Smart Kopargaon Hackathon (SKH)

Production-oriented monorepo for the **Smart Kopargaon Hackathon** platform: premium React (Vite, JavaScript) frontend, Express API for privileged operations, and Firebase (Auth, Firestore, Storage).

## Structure

| Path | Description |
|------|-------------|
| `frontend/` | React app — public site, auth, dashboards, Framer Motion, Tailwind |
| `backend/` | Express REST API — verifies Firebase ID tokens, RBAC, Firestore writes |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore index definitions (extend as queries grow) |
| `storage.rules` | Firebase Storage security rules |
| `firebase.json` | Firebase CLI — deploy rules & indexes from repo root |

## Quick start

### 1. Firebase

1. Create a Firebase project and enable **Authentication** (Email/Password + Google), **Firestore**, and **Storage**.
2. Add a web app and copy keys into `frontend/.env` (see `frontend/.env.example`).
3. From repo root **`F:\skh`** (where `firebase.json` lives), deploy:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
   Or paste **Firestore rules**, **Storage rules**, and **indexes** in the Firebase Console if the CLI cannot reach Google APIs.

### Production checklist

- **Frontend:** `npm run build` in `frontend/`, deploy `dist/` to Vercel; set **`VITE_API_URL`** to your API origin (required for profile sync and privileged actions).
- **Backend:** set **`NODE_ENV=production`**, **`CORS_ORIGIN`** to your real site URL(s) (comma-separated, no spaces). The server **exits on boot** if production is set without `CORS_ORIGIN` (avoids accidental open CORS). Set **`FIREBASE_SERVICE_ACCOUNT_JSON`** on Railway.
- **Firebase:** deploy **Firestore** and **Storage** rules. **Storage rules** use **`firestore.get`** to tie uploads to team membership — this requires the **Blaze** plan on the Firebase project.
- **First admin:** Authentication → copy UID → Firestore `users/{uid}` → `role: "admin"` (or promote via API once one admin exists).

### Security (enforced in this repo)

- **API:** Participant actions use **`profile.teamId`** from the verified token’s user document (not client-supplied `teamId`) for problem selection and submission metadata, reducing IDOR risk. Submission URLs must be **`https:`** only. Judge scores are validated server-side; mentor notes require assignment on the team.
- **CORS:** Production allows only origins listed in **`CORS_ORIGIN`**.
- **Errors:** 5xx responses do not echo raw internal error text in production.
- **Firestore / Storage:** Client writes to sensitive collections are denied; Storage paths under `submissions/{teamId}/` are limited to that team’s members (plus admin read) via rules + Firestore linkage.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_* keys
npm run dev
```

Build: `npm run build` — deploy the `dist/` folder to **Vercel** (SPA rewrites are in `frontend/vercel.json`).

### 3. Backend (Railway)

```bash
cd backend
npm install
cp .env.example .env
```

Set `FIREBASE_SERVICE_ACCOUNT_JSON` to the **single-line JSON** of a Firebase service account with Firestore access. Set `CORS_ORIGIN` to your Vercel URL(s), comma-separated.

**Razorpay (entry fee):** set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from the Razorpay Dashboard (Settings → API Keys). Set `RAZORPAY_WEBHOOK_SECRET` from **Settings → Webhooks** after you add an endpoint URL `https://<your-api-host>/api/webhooks/razorpay` and enable at least **payment.captured**. The server verifies the checkout signature on **`POST /api/participant/verify-razorpay-payment`** and re-validates amount and `notes.teamId` with Razorpay’s REST API; the webhook is optional redundancy when the user closes the tab before verify runs.

```bash
npm run dev
```

## Multi-event editions (`eventId`)

The API resolves scope in this order: **`x-sk-event-id` header** → query `eventId` → user profile **`activeEventId`** → Firestore **`config/platform.defaultEventId`** (falls back to legacy **`config/event`** when no `events/{id}` doc exists).

1. **Admin:** create editions under **Admin → Events** (`POST /api/admin/events`) or seed `events/{eventId}` in Firestore with `lifecyclePhase`, `listedPublic`, etc.
2. **Default edition:** set **`config/platform.defaultEventId`** so new users get a sensible **`activeEventId`** on first API login.
3. **Problem statements & teams:** prefer documents with **`eventId`** matching the edition; the participant API creates teams with **`eventId`** and gates actions using merged config + lifecycle for that edition.
4. **Frontend:** the edition picker updates **`activeEventId`** via **`PATCH /api/users/active-event`** and sends **`x-sk-event-id`** on privileged requests.

Deploy **`firestore.indexes.json`** after adding composite indexes for `eventId` queries.

## Platform flow (enforced on the API)

1. **Sign up** — Firebase Auth; Firestore `users/{uid}` is created automatically on the **first authenticated API call**: `GET /api/users/me` uses the **Admin SDK** to insert the profile if missing (so you are not dependent on client rules or manual Console steps). The app calls this after sign-in; keep **`VITE_API_URL`** pointed at your deployed API in production.
2. **Team** — Create or join via **`POST /api/participant/*`** (not client Firestore), so team integrity stays server-controlled.
3. **Event registration** — Team lead/member calls **`POST /api/participant/register-team-event`** while the admin-configured registration window is open.
4. **Entry fee** — If enabled in **`config/event`**, team `paymentStatus` starts as **`pending`**. Teams pay via **Razorpay** (`POST /api/participant/create-razorpay-order` → Checkout → **`POST /api/participant/verify-razorpay-payment`**) using the amount from config only (never client-supplied). **`POST /api/webhooks/razorpay`** (signed with `RAZORPAY_WEBHOOK_SECRET`) can mark **`paid`** if the browser never calls verify. Admins can still set **`paid`** / **`waived`** via **`POST /api/admin/record-team-payment`**. `GET /api/event-config` exposes **`razorpayKeyId`** and **`razorpayConfigured`** when keys are set (Key ID is public by design).
5. **Problem selection** — **`POST /api/participant/select-problem`** updates the team and atomically adjusts **`selectionCount`** on problem statements (clients cannot write `problemStatements` or privileged team fields).
6. **Submissions** — Files upload to **Storage**; **`POST /api/participant/submission-metadata`** writes Firestore submission docs after checks (deadline, registration, fee, problem chosen).
7. **Jury** — Admin sets user role to **judge**, then **`POST /api/admin/assign-judge-problems`** sets `users/{judgeId}.assignedProblemStatementIds`. Judges load teams via **`GET /api/judges/assignments`** (only teams whose `problemStatementId` is in that list). **`POST /api/judges/evaluations`** refuses evaluations outside that scope.

Firestore rules deny client writes on **teams**, **submissions**, and **evaluations** (use the API). Tighten Storage rules further with signed URLs on Blaze when you lock down upload paths.

## Roles

Firestore `users/{uid}` documents should include `role`: `participant` | `admin` | `judge` | `mentor`. The first admin can be promoted manually in the Firebase console; afterward use the Admin panel (or `PATCH /api/admin/users/:uid/role`). Judges additionally have **`assignedProblemStatementIds`**: an array of problem statement document IDs the admin assigns via **`POST /api/admin/assign-judge-problems`**.

## Collections (reference)

- `events/{eventId}` — per-edition metadata: `name`, `slug`, **`lifecyclePhase`**, `listedPublic`, optional overrides merged with `config/event` for deadlines/fees
- `config/platform` — **`defaultEventId`** (string) for bootstrapping **`activeEventId`**
- `config/event` — legacy singleton settings (still merged when no per-event override exists): registration window, `entryFeeEnabled`, `entryFeeAmount`, `submissionDeadline`, etc.
- `users` — profile + `role`, `teamId`, **`activeEventId`**, **`assignedProblemStatementIds`** (judges only)
- `teams` — `name`, **`eventId`**, `inviteCode`, `leaderId`, `memberIds`, `problemStatementId`, **`eventRegistered`**, **`paymentStatus`**, **`razorpayLastOrderId`**, **`razorpayOrderId`** / **`razorpayPaymentId`** (after verify), **`paymentProvider`**, `judgeIds`, `mentorIds`, `shortlisted`
- `problemStatements` — published challenges + **`selectionCount`**, **`assignedJudgeIds`**
- `submissions` — keyed by `teamId`, artifact URLs
- `announcements` — news feed
- `evaluations` — `judgeId_teamId` style docs from jury workflow
- `mentorNotes` — `mentorId_teamId` mentor logs

## License

Use and modify for the hackathon and university operations as needed.

<!-- deploy: trigger Railway rebuild — 2026-08-07 -->
