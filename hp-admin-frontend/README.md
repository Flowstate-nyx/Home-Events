# Home Productions Admin Dashboard

A modern React-based admin dashboard for the Home Productions event ticketing system.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **React Router** - Client-side routing

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Gold | `#D4AF37` | Primary brand color, buttons, accents |
| Dark Green | `#0d1f1a` | Background, containers |
| Cream | `#F5F0E8` | Text, light elements |

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Navigate to project folder
cd hp-admin-frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

Output will be in the `dist` folder.

## Project Structure

```
src/
├── config/          # API configuration
├── context/         # React contexts (auth)
├── hooks/           # Custom React hooks
├── components/      # Reusable components
│   ├── layout/      # Layout components (sidebar, header)
│   ├── common/      # Generic UI components
│   └── features/    # Feature-specific components
├── pages/           # Page components
├── services/        # API service functions
├── utils/           # Utility functions
└── styles/          # CSS files
```

## API Endpoints

This dashboard connects to the Home Productions backend at:
- **Development**: Proxied through Vite to `https://home-events-production.up.railway.app`
- **Production**: Direct connection to backend URL

## Features (Planned)

- [x] Project setup
- [ ] Login page
- [ ] Auth context & protected routes
- [ ] Dashboard layout
- [ ] Orders management
- [ ] Events management
- [ ] Check-in interface
- [ ] Stats overview
- [ ] Gallery management

## Development Notes

- All API endpoints are defined in `src/config/api.js`
- Tiers are managed within event payloads, not as separate endpoints
- Order status updates use `/api/admin/orders/:id/status`
- Check-in uses `POST /api/checkin` and `GET /api/checkin/verify/:orderNumber`
