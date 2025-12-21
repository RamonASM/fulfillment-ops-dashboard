# Claude Code Instructions

## 🚨 READ THIS FIRST - Production Architecture

### Domain Structure (VERIFIED Dec 20, 2025)
- **admin.yourtechassist.us** - Admin dashboard (React SPA)
  - Routes `/api/*` requests to backend API
  - Frontend files: `apps/web/dist/`
- **portal.yourtechassist.us** - Client portal (React SPA)
  - Routes `/api/*` requests to backend API
  - Frontend files: `apps/portal/dist/`
- **Shared API Backend** - Single Node.js Express server
  - Accessible via both domains at `/api/` path
  - NOT at api.yourtechassist.us (that subdomain is configured but not actively used)
  - Backend code: `apps/api/`

### Infrastructure (VERIFIED)
- **Server**: DigitalOcean droplet at 138.197.70.205
- **SSH Access**: `ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205`
- **Code Location**: `/var/www/inventory`
- **Database**: PostgreSQL on localhost:5432
  - User: `user`
  - Database: `inventory_db`
  - Connection string in `.env`
- **Redis**: NOT RUNNING (using in-memory fallback for rate limiting)
  - REDIS_URL commented out in `.env`
  - BullMQ queues use Redis when available, fallback to memory otherwise

### Process Management (VERIFIED - Using PM2)
- **PM2** is the active process manager in production
- Main process: `inventory-api` (Node.js Express API)
- Configuration: `deploy/ecosystem.config.js`
- Check status: `ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "pm2 list"`

### CRITICAL - Always Check First
```bash
# Before making assumptions about production, verify its state:
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "pm2 list && cd /var/www/inventory && git log -1 --oneline"
```

### Common Mistakes to AVOID
1. ❌ **Assuming Redis is running** - It's not. Code uses in-memory fallback.
2. ❌ **Assuming Docker is deployed** - Production uses PM2, not Docker (Docker configs exist but for local dev)
3. ❌ **Assuming production code is up-to-date** - Local may be ahead. Always verify git status.
4. ❌ **Assuming api.yourtechassist.us is used** - API is at admin/portal domains under `/api/` path
5. ❌ **Making changes without checking production state first** - SSH and verify before proceeding

---

## 📋 KEEP THIS FILE UPDATED

**IMPORTANT**: After completing major work, update this file with:

### When to Update CLAUDE.md
1. ✅ **After deploying to production** - Document what was deployed, when, and any config changes
2. ✅ **After infrastructure changes** - New services, changed domains, deployment method switches
3. ✅ **After fixing recurring issues** - Add to "Common Mistakes" section
4. ✅ **After major feature completion** - Update "Current Project Context"
5. ✅ **When something takes >2 hours to figure out** - Document it so it's never lost again

### How to Update
Add a dated entry under the relevant section:

```markdown
### Deployment History
- **2025-12-20**: Added post-import analytics (createDailySnapshot, refreshRiskScoreCache, aggregateDailyAlertMetrics)
- **2025-12-XX**: [Your change here]
```

**Rule**: If you spent significant time debugging or building something, it belongs in CLAUDE.md.

---

## Current Project Context

### Active Goal: Everstory Onboarding
- **Objective**: Import Everstory's inventory CSV and display analytics on dashboard
- **Status**: Import system working, post-import analytics added (Dec 20, 2025)
- **Last Major Work**: Fixed analytics pipeline to generate snapshots/risk scores after import
- **Blocker**: Need to test imports generate dashboard data correctly

### Tech Stack
- **Frontend**: React 18, TypeScript, TailwindCSS, Vite
  - Admin: `apps/web/` → admin.yourtechassist.us
  - Portal: `apps/portal/` → portal.yourtechassist.us
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
  - API: `apps/api/` → serves both frontends at `/api/`
- **Database**: PostgreSQL 15
- **Python Services**:
  - CSV Importer: `apps/python-importer/` (runs as subprocess from Node.js)
  - DS Analytics: `apps/ds-analytics/` (FastAPI, not yet deployed)
  - ML Analytics: `apps/ml-analytics/` (FastAPI, not yet deployed)

---

## Project Structure

```
fulfillment-ops-dashboard/
├── apps/
│   ├── api/              # Node.js Express API (deployed via PM2)
│   ├── web/              # Admin dashboard (React, deployed to admin.yourtechassist.us)
│   ├── portal/           # Client portal (React, deployed to portal.yourtechassist.us)
│   ├── python-importer/  # CSV import script (subprocess)
│   ├── ds-analytics/     # Data science service (FastAPI, not deployed)
│   └── ml-analytics/     # ML forecasting service (FastAPI, not deployed)
├── packages/
│   ├── shared/           # Shared types, utilities
│   └── ui/               # Shared UI components
├── deploy/               # PM2 configs, nginx configs, deployment scripts
└── CLAUDE.md            # THIS FILE - Keep it updated!
```

---

## Deployment Process

### Quick Deploy (Production is Using PM2)
```bash
# 1. Commit changes locally
git add .
git commit -m "feat: your change description"
git push origin main

# 2. Deploy to production
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  cd /var/www/inventory &&
  git pull origin main &&
  npm ci &&
  npm run db:generate &&
  npm run build &&
  pm2 restart inventory-api &&
  pm2 save
"

# 3. Verify deployment
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "pm2 logs inventory-api --lines 50"
curl -s https://admin.yourtechassist.us/api/ | jq
```

### After Deployment Checklist
- [ ] Verify PM2 process is online: `pm2 list`
- [ ] Check logs for errors: `pm2 logs inventory-api`
- [ ] Test API health: `curl https://admin.yourtechassist.us/api/`
- [ ] Test admin dashboard loads: Visit admin.yourtechassist.us
- [ ] Test portal loads: Visit portal.yourtechassist.us
- [ ] **Update this file** with what was deployed and when

---

## Deployment History

### 2025-12-20 @ 23:04 PST: Post-Import Analytics + Schema Update (DEPLOYED)
- **What**: Added 3 analytics functions to run after CSV import + database schema update
  - `createDailySnapshot()` - Generates daily snapshot for trend charts
  - `refreshRiskScoreCache()` - Pre-calculates risk scores for portfolio risk
  - `aggregateDailyAlertMetrics()` - Aggregates alert metrics for alert trends
  - Added `diagnosticLogs` and `metadata` fields to `ImportBatch` model
- **Commits**:
  - `e80d4cb` - fix: Add post-import analytics and update CLAUDE.md
  - `3eb1d8a` - fix: Add diagnosticLogs and metadata fields to ImportBatch schema
- **Files Changed**:
  - `apps/api/src/services/import.service.ts` (added analytics calls)
  - `apps/api/prisma/schema.prisma` (added diagnosticLogs, metadata fields)
  - `apps/web/src/components/widgets/WidgetDataStatus.tsx` (new component for empty states)
  - `apps/api/prisma/check-recent-imports.ts` (new diagnostic script)
  - `CLAUDE.md` (complete rewrite with verified production architecture)
- **Deployment Process**:
  1. Schema changes pushed to database with `npm run db:push`
  2. Prisma client regenerated with `npm run db:generate`
  3. TypeScript build completed successfully
  4. PM2 restarted `inventory-api` process
- **Impact**: Dashboard widgets now populate with data immediately after import
- **Status**: ✅ DEPLOYED to production at 04:04 UTC (23:04 PST Dec 20)
- **Verification**: API running healthy, logs showing successful restart

---

## Data Flow

```
CSV Upload (via admin.yourtechassist.us)
    ↓
POST /api/imports (Node.js API)
    ↓
Python Importer (subprocess: apps/python-importer/main.py)
    ↓
PostgreSQL Database (bulk insert via Prisma)
    ↓
Post-Import Analytics (NEW - added Dec 20, 2025)
    ├─ createDailySnapshot() → DailySnapshot table
    ├─ refreshRiskScoreCache() → RiskScoreCache table
    └─ aggregateDailyAlertMetrics() → DailyAlertMetrics table
    ↓
Dashboard Widgets Populate (admin.yourtechassist.us)
```

---

## Debugging Common Issues

### Issue: "Import completed but dashboard shows 'No data available'"
**Cause**: Post-import analytics didn't run (pre-Dec 20 code)
**Fix**: Upgrade to latest code with analytics fixes, reimport data
**Verify**: Check database for DailySnapshot records:
```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  cd /var/www/inventory/apps/api &&
  node -e \"const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.dailySnapshot.count().then(c => console.log('Snapshots:', c))\"
"
```

### Issue: "API server not responding"
**Cause**: PM2 process crashed or not started
**Fix**:
```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "pm2 restart inventory-api"
```
**Verify**: `pm2 list` should show `inventory-api` as `online`

### Issue: "Redis connection error"
**Cause**: Redis isn't running (and doesn't need to be)
**Fix**: Code already uses in-memory fallback, but check `.env` has REDIS_URL commented out
**Note**: This is expected behavior, not an error

### Issue: "Import fails immediately"
**Cause**: Python environment not set up or database connection issue
**Fix**:
```bash
# Check Python is accessible
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "which python3"

# Check database connection
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  cd /var/www/inventory/apps/api &&
  grep DATABASE_URL .env
"
```

---

## Testing & Verification Commands

### Check Production Status
```bash
# All-in-one status check
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  echo '=== PM2 Status ===' &&
  pm2 list &&
  echo '' &&
  echo '=== Git Status ===' &&
  cd /var/www/inventory &&
  git log -1 --oneline &&
  echo '' &&
  echo '=== Database Status ===' &&
  cd apps/api &&
  node -e \"const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); Promise.all([p.product.count(), p.importBatch.count(), p.dailySnapshot.count()]).then(([products, imports, snapshots]) => console.log(\\\`Products: \\\${products}, Imports: \\\${imports}, Snapshots: \\\${snapshots}\\\`))\"
"
```

### Test Import Workflow
1. Upload CSV via admin.yourtechassist.us/imports
2. Monitor logs: `ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "pm2 logs inventory-api --lines 100"`
3. Look for analytics messages:
   - `✓ Created daily snapshot for newly imported products`
   - `✓ Pre-calculated risk scores for imported products`
   - `✓ Aggregated alert metrics after import`
4. Check dashboard widgets show data (not "No data available")

---

## Collaboration Model

- **Gemini**: Planner, risk analysis, acceptance tests
- **Claude (You)**: Primary builder, implementation, testing
- **Codex**: QA, code review, quality gate

### Workflow
1. Gemini provides plan/requirements
2. Claude implements with tests
3. Codex reviews before merge
4. **Claude updates CLAUDE.md after major changes** ← NEW RULE

---

## Development Commands

### Local Development
```bash
# Start API server
npm run dev:api

# Start admin dashboard
npm run dev:web

# Start client portal
npm run dev:portal

# Run all in parallel (if using concurrently)
npm run dev
```

### Testing
```bash
# Run API tests
npm run test:api

# Run E2E tests
npm run test:e2e

# Type checking
npm run typecheck
```

### Database
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
```

---

## Important Notes

- **Do not edit GEMINI.md or AGENTS.md** - Those are for other AI collaborators
- **Python-first policy** for data processing - Use Python for CSV parsing, calculations
- **Keep diffs small** - Small, focused commits are easier to review and deploy
- **Run tests before committing** - `npm run test && npm run typecheck`
- **Update CLAUDE.md after significant work** - Don't let knowledge get lost!

---

**Last Updated**: December 20, 2025
**Last Major Change**: Added post-import analytics pipeline (createDailySnapshot, refreshRiskScoreCache, aggregateDailyAlertMetrics)
**Next Update Due**: After next production deployment or major feature completion
