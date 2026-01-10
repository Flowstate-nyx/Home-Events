# Home Productions Backend v4.0

Production-safe event ticketing system with JWT authentication, PostgreSQL database, and atomic inventory management.

## Features

- ✅ **JWT Authentication** - Access tokens (15m) + refresh tokens (7d)
- ✅ **PostgreSQL Database** - Full schema with migrations
- ✅ **Atomic Inventory** - SELECT FOR UPDATE prevents overselling
- ✅ **Email Outbox** - Decoupled email sending with retry
- ✅ **QR Codes** - Hashed storage, scan-once enforcement
- ✅ **Cloudinary** - Image upload for events and galleries
- ✅ **Audit Logging** - All admin actions tracked
- ✅ **Rate Limiting** - Configurable limits on all endpoints

## Architecture

```
backend/
├── index.js                 # Express server entry point
├── config/
│   └── env.js               # Environment validation (crash on missing)
├── db/
│   ├── pool.js              # PostgreSQL connection pool
│   ├── migrate.js           # Migration runner
│   └── migrations/
│       └── 001_schema.sql   # Full database schema
├── middleware/
│   ├── auth.js              # JWT authentication
│   ├── rateLimit.js         # Rate limiting
│   └── errorHandler.js      # Global error handler
├── routes/
│   ├── auth.js              # Login/logout/refresh
│   ├── events.js            # Public event listing
│   ├── orders.js            # Order creation
│   ├── checkin.js           # Ticket check-in
│   ├── gallery.js           # Public gallery
│   ├── newsletter.js        # Newsletter subscribe
│   ├── webhook.js           # Payment webhooks
│   └── admin/
│       ├── index.js         # Admin router
│       ├── events.js        # Event CRUD
│       ├── orders.js        # Order management
│       ├── gallery.js       # Gallery CRUD
│       ├── upload.js        # Cloudinary upload
│       └── stats.js         # Dashboard statistics
├── services/
│   ├── inventory.js         # Transactional inventory
│   ├── order.js             # Order lifecycle
│   ├── email.js             # Email outbox
│   ├── qr.js                # QR generation
│   └── audit.js             # Audit logging
└── utils/
    ├── logger.js            # Structured logging
    └── crypto.js            # Hashing utilities
```

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/events` | List active events |
| GET | `/api/events/:id` | Get event details |
| GET | `/api/gallery` | List published galleries |
| GET | `/api/gallery/:id` | Get gallery with images |
| POST | `/api/orders` | Create order |
| GET | `/api/orders/:number` | Get order by number |
| POST | `/api/checkin` | Check-in ticket |
| POST | `/api/newsletter/subscribe` | Subscribe to newsletter |
| POST | `/api/webhook/payment` | Payment webhook |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, get tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke all tokens |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/auth/me` | Get current user |

### Admin (JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/events` | List all events |
| POST | `/api/admin/events` | Create event |
| PUT | `/api/admin/events/:id` | Update event |
| DELETE | `/api/admin/events/:id` | Delete event |
| GET | `/api/admin/orders` | List orders |
| PUT | `/api/admin/orders/:id/status` | Update order status |
| POST | `/api/admin/orders/:id/resend-email` | Resend ticket email |
| GET | `/api/admin/gallery` | List all galleries |
| POST | `/api/admin/gallery` | Create gallery |
| PUT | `/api/admin/gallery/:id` | Update gallery |
| DELETE | `/api/admin/gallery/:id` | Delete gallery |
| POST | `/api/admin/upload/sign` | Get signed upload URL |
| GET | `/api/admin/stats` | Dashboard statistics |

## Database Schema

### Tables

- **users** - Admin accounts with bcrypt passwords
- **refresh_tokens** - Hashed refresh tokens with expiry
- **events** - Event details with status lifecycle
- **ticket_tiers** - Ticket types with inventory tracking
- **orders** - Immutable order records (only status changes)
- **checkins** - Separate check-in audit trail
- **email_outbox** - Decoupled email queue with retry
- **galleries** - Photo galleries linked to events
- **gallery_images** - Individual gallery images
- **newsletter_subscribers** - Email list
- **settings** - Key-value configuration
- **audit_logs** - Admin action history

### Key Constraints

```sql
-- Inventory cannot oversell
CONSTRAINT tier_sold_not_exceed_quantity CHECK (sold <= quantity)

-- Order status lifecycle
CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded'))

-- Single check-in per order
CONSTRAINT unique_order_checkin UNIQUE (order_id)
```

## Environment Variables

### Required (App crashes without these)

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
```

### Recommended

```bash
PORT=8080
NODE_ENV=production
CORS_ORIGIN=https://homeproductions.art

# Email
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_USER=noreply@homeproductions.art
EMAIL_PASS=<password>
EMAIL_FROM=noreply@homeproductions.art

# Cloudinary
CLOUDINARY_CLOUD_NAME=<cloud>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

# Default admin
DEFAULT_ADMIN_EMAIL=admin@homeproductions.art
DEFAULT_ADMIN_PASSWORD=<password>
```

## Deployment

### Railway

1. Create Railway project
2. Add PostgreSQL addon (provides DATABASE_URL)
3. Deploy from GitHub
4. Set environment variables
5. Migrations run automatically

### Manual

```bash
npm install
npm run migrate  # Run migrations
npm start        # Start server
```

## Security Features

- **JWT with Refresh Rotation** - Access tokens expire in 15 minutes
- **Bcrypt Hashing** - 12 rounds for passwords
- **Rate Limiting** - 10 auth attempts per 15 minutes
- **QR Hashing** - QR codes stored as SHA-256 hashes
- **Atomic Check-in** - Database-level single-scan enforcement
- **SELECT FOR UPDATE** - Prevents inventory race conditions
- **Helmet.js** - Security headers
- **CORS** - Configurable origin restriction

## Order Lifecycle

```
┌─────────┐     ┌────────┐     ┌───────────┐
│ pending │ ──▶ │  paid  │ ──▶ │ checked_in│
└─────────┘     └────────┘     └───────────┘
     │               │
     ▼               ▼
┌───────────┐  ┌──────────┐
│ cancelled │  │ refunded │
└───────────┘  └──────────┘
```

## Email Outbox Pattern

1. Payment confirmed → Email queued in `email_outbox`
2. Background worker processes queue every 30 seconds
3. Failed emails retry up to 5 times
4. Status tracked: pending → processing → sent/failed

## Health Check

```bash
curl https://your-backend.up.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "version": "4.0.0",
  "database": {
    "status": "healthy",
    "connected": true
  },
  "email": "configured",
  "cloudinary": "configured"
}
```

## License

UNLICENSED - Proprietary
