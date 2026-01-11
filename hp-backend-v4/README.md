# Home Productions Backend v4.0 (ES Modules)

## Quick Deploy to Railway

### Step 1: Replace Files in GitHub

Replace ALL files in the `hp-backend-v4` folder with these new files.

### Step 2: Set Railway Variables

Go to Railway → Your Service → Variables tab.

**Required Variables:**

| Name | Value |
|------|-------|
| DATABASE_URL | Use Reference: `${{Postgres.DATABASE_URL}}` |
| JWT_SECRET | `323227453721ef3b525ad96505e0852eaabc5c5b7dde4466425de82be341809b` |
| JWT_REFRESH_SECRET | `8e4f4f44ca70c360baa9b590038de542e619270cb4afe45f37f0196ca2968b47` |
| NODE_ENV | `production` |
| CORS_ORIGIN | `https://homeproductions.art` |
| DEFAULT_ADMIN_EMAIL | Your email |
| DEFAULT_ADMIN_PASSWORD | Your chosen password |

### Step 3: Verify Railway Settings

1. **Root Directory:** `hp-backend-v4`
2. **Build Command:** (leave empty or `npm install`)
3. **Start Command:** `npm start`

### Step 4: Deploy

Push to GitHub. Railway auto-deploys.

### Step 5: Test

Visit: `https://YOUR-RAILWAY-URL/health`

Should show:
```json
{"status":"healthy","version":"4.0.0"}
```

## File Structure

```
hp-backend-v4/
├── package.json          ← Has "type": "module"
├── index.js              ← Uses import (ES Modules)
├── config/
│   └── env.js
├── db/
│   ├── pool.js
│   ├── migrate.js
│   └── migrations/
│       └── 001_schema.sql
├── middleware/
│   ├── auth.js
│   ├── rateLimit.js
│   └── errorHandler.js
├── routes/
│   ├── auth.js
│   ├── events.js
│   ├── orders.js
│   ├── checkin.js
│   ├── gallery.js
│   ├── newsletter.js
│   ├── webhook.js
│   └── admin/
│       ├── index.js
│       ├── events.js
│       ├── orders.js
│       ├── gallery.js
│       ├── upload.js
│       └── stats.js
├── services/
│   ├── inventory.js
│   ├── order.js
│   ├── email.js
│   ├── qr.js
│   └── audit.js
└── utils/
    ├── logger.js
    └── crypto.js
```
