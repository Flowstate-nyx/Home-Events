# Railway Deployment Configuration

## Quick Deploy

1. Fork/push this repo to GitHub
2. Create new Railway project
3. Add PostgreSQL addon
4. Deploy from GitHub
5. Set environment variables

## Required Environment Variables

Set these in Railway Dashboard → Variables:

```
DATABASE_URL           → Auto-provided by Railway PostgreSQL
JWT_SECRET             → openssl rand -hex 32
JWT_REFRESH_SECRET     → openssl rand -hex 32
CORS_ORIGIN            → https://homeproductions.art

# Email (for ticket delivery)
EMAIL_HOST             → smtp.hostinger.com
EMAIL_PORT             → 465
EMAIL_USER             → noreply@homeproductions.art
EMAIL_PASS             → <password>
EMAIL_FROM             → noreply@homeproductions.art

# Cloudinary (for images)
CLOUDINARY_CLOUD_NAME  → <your-cloud>
CLOUDINARY_API_KEY     → <your-key>
CLOUDINARY_API_SECRET  → <your-secret>

# Default admin (created on first run)
DEFAULT_ADMIN_EMAIL    → admin@homeproductions.art
DEFAULT_ADMIN_PASSWORD → <strong-password>
```

## Build Settings

Railway auto-detects Node.js.

- Build: `npm install`
- Start: `npm start`
- Node: 18.x

## Health Check

Railway automatically hits `/health`.

Expected response:
```json
{
  "status": "healthy",
  "version": "4.0.0",
  "database": { "status": "healthy" },
  "email": "configured",
  "cloudinary": "configured"
}
```

## PostgreSQL

Railway provisions PostgreSQL automatically.
Migrations run on first startup.

## Troubleshooting

### "Database connection failed"
- Check DATABASE_URL is set
- Check PostgreSQL addon is provisioned

### "JWT_SECRET must be at least 32 characters"
- Generate with: `openssl rand -hex 32`
- Must be at least 32 characters

### "CORS error"
- Set CORS_ORIGIN to your exact frontend domain
- Include https://

### Logs
- Railway Dashboard → Deployments → View Logs
