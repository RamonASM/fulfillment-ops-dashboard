# Inventory Intelligence Platform

An AI-powered inventory management dashboard for account managers with a self-service client portal.

## Features

### Account Manager Dashboard
- **Multi-client Overview** - Manage inventory across multiple clients
- **Smart Alerts** - AI-prioritized alerts for stockouts, low stock, and reorder needs
- **Usage Analytics** - Track consumption patterns with 3-mo/12-mo calculations
- **AI Insights** - Risk scoring, demand forecasting, anomaly detection
- **Command Palette** - Quick navigation with `Cmd+K`
- **Data Import** - CSV/XLSX import with auto-mapping

### Client Portal
- **Self-Service Visibility** - Real-time inventory status
- **One-Click Reorder** - Smart quantity suggestions
- **Order Tracking** - Full order request lifecycle
- **Alerts** - Low stock notifications

### AI Features
- Stock risk scoring (0-100)
- Anomaly detection (usage spikes/drops)
- Seasonal pattern recognition
- AI-drafted client communications
- Natural language search

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, TanStack Query, Zustand
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL 15, Redis
- **PWA**: Vite PWA Plugin, Workbox

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis (optional, for caching)
- pnpm or npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd fulfillment-ops-dashboard

# Install dependencies
npm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/portal/.env.example apps/portal/.env

# Edit .env files with your database credentials
```

### Database Setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed demo data
npm run db:seed
```

### Development

```bash
# Start all services (API + Web + Portal)
npm run dev

# Or start individually:
npm run dev:api     # API on http://localhost:3001
npm run dev:web     # Admin dashboard on http://localhost:5173
npm run dev:portal  # Client portal on http://localhost:5174
```

### Demo Credentials

After running `npm run db:seed`:

**Admin Dashboard** (http://localhost:5173)
- `sarah.chen@inventoryiq.com` / `demo1234`
- `mike.torres@inventoryiq.com` / `demo1234`
- `admin@inventoryiq.com` / `demo1234`

**Client Portal** (http://localhost:5174)
- `john.doe@acmecorp.com` / `client1234`
- `bob.wilson@techstart.io` / `client1234`

## Project Structure

```
fulfillment-ops-dashboard/
├── apps/
│   ├── api/                 # Express backend
│   │   ├── prisma/          # Database schema & migrations
│   │   └── src/
│   │       ├── routes/      # API endpoints
│   │       ├── services/    # Business logic
│   │       │   └── ai/      # AI features
│   │       ├── middleware/  # Auth, error handling
│   │       └── jobs/        # Background processing
│   ├── web/                 # Admin dashboard (React)
│   │   └── src/
│   │       ├── components/  # UI components
│   │       ├── pages/       # Route pages
│   │       ├── stores/      # Zustand stores
│   │       └── api/         # API client
│   └── portal/              # Client portal (React)
│       └── src/
│           ├── components/
│           ├── pages/
│           └── stores/
└── packages/
    └── shared/              # Shared TypeScript types
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/me` - Current user

### Clients
- `GET /api/clients` - List clients
- `GET /api/clients/:id` - Get client details
- `GET /api/clients/:id/summary` - Client summary with metrics

### Products
- `GET /api/clients/:clientId/products` - List products
- `GET /api/clients/:clientId/products/:id` - Product details
- `POST /api/clients/:clientId/products` - Create product
- `PATCH /api/clients/:clientId/products/:id` - Update product

### Imports
- `POST /api/imports/analyze` - Analyze file for mapping
- `POST /api/imports/process` - Process import

### AI Features
- `GET /api/ai/risk/:clientId` - Risk scores
- `GET /api/ai/forecast/:productId` - Demand forecast
- `GET /api/ai/anomalies/client/:clientId` - Anomaly detection
- `GET /api/ai/seasonal/client/:clientId` - Seasonal patterns
- `GET /api/ai/drafts/:clientId` - Communication drafts

### Portal API
- `POST /api/portal/auth/login` - Portal login
- `GET /api/portal/dashboard` - Dashboard stats
- `GET /api/portal/products` - Product catalog
- `POST /api/portal/orders/request` - Create order request
- `GET /api/portal/alerts` - Client alerts

## Scripts

```bash
# Development
npm run dev           # Start all services
npm run dev:api       # Start API only
npm run dev:web       # Start admin dashboard only
npm run dev:portal    # Start client portal only

# Build
npm run build         # Build all apps
npm run build:api     # Build API
npm run build:web     # Build admin dashboard
npm run build:portal  # Build client portal

# Database
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:migrate    # Run migrations
npm run db:studio     # Open Prisma Studio
npm run db:seed       # Seed demo data

# Testing
npm run test          # Run unit tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run test:e2e      # Run Playwright E2E tests
npm run test:e2e:ui   # Run E2E tests with Playwright UI

# Utilities
npm run clean         # Clean build artifacts
npm run lint          # Run ESLint
npm run typecheck     # Run TypeScript checks
```

## Testing

### Unit Tests

Unit tests are written with Vitest and located in `apps/api/src/__tests__/`.

```bash
npm run test                    # Run all tests once
npm run test:watch              # Watch mode
npm run test:coverage           # With coverage report
```

**Test Coverage (181 tests):**
- `usage.service.test.ts` - Usage calculations and tiers
- `workflow.service.test.ts` - Order state machine and SLA
- `collaboration.service.test.ts` - Comments, todos, activity
- `feedback.service.test.ts` - Product feedback system
- `alert.service.test.ts` - Stock status and alert generation
- `analytics.service.test.ts` - Metrics and reporting
- `dashboard.service.test.ts` - Dashboard widgets

### E2E Tests

E2E tests use Playwright and are in `e2e/`.

```bash
npm run test:e2e                # Run all E2E tests headless
npm run test:e2e:ui             # Run with Playwright UI
npx playwright show-report      # View test report
```

**Test Suites:**
- `auth.spec.ts` - Login, logout, authentication
- `dashboard.spec.ts` - Main dashboard navigation
- `clients.spec.ts` - Client management flows
- `alerts.spec.ts` - Alert filtering and dismissal
- `orders.spec.ts` - Order management (admin + portal)
- `portal.spec.ts` - Client portal features

## Environment Variables

### API (`apps/api/.env`)
```env
NODE_ENV=development
PORT=3001
DATABASE_URL="postgresql://user:pass@localhost:5432/inventory_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET=your-secret-key
WEB_URL=http://localhost:5173
PORTAL_URL=http://localhost:5174
```

### Web/Portal (`apps/web/.env`, `apps/portal/.env`)
```env
VITE_API_URL=http://localhost:3001
```

## Keyboard Shortcuts (Admin Dashboard)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Command palette |
| `G then H` | Go to Home |
| `G then A` | Go to Alerts |
| `G then C` | Go to Clients |
| `G then I` | Go to Imports |
| `Escape` | Close modals |

## License

UNLICENSED - Private project
