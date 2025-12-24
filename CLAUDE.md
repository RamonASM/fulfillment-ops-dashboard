# Claude Code Instructions

## 🚨 READ THIS FIRST - Production Architecture

### Domain Structure (VERIFIED Dec 21, 2025)
- **admin.yourtechassist.us** - Admin dashboard (React SPA)
  - For admin/account managers
  - Frontend files: `apps/web/dist/` → `/var/www/html/inventory/admin/`
- **portal.yourtechassist.us** - Client portal (React SPA)
  - For clients
  - Frontend files: `apps/portal/dist/` → `/var/www/html/inventory/portal/`
- **api.yourtechassist.us** - API Backend
  - Node.js Express server
  - Backend code: `apps/api/`
  - Both frontends call this API

### Infrastructure (VERIFIED Dec 24, 2025)
- **Server**: DigitalOcean droplet at 138.197.70.205
- **SSH Access**: `ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205`
- **Code Location**: `/var/www/inventory`
- **Database**: PostgreSQL on localhost:5432
  - User: `user`
  - Database: `inventory_db`
  - Connection string in `.env`
- **Redis**: RUNNING - Used for rate limiting and caching
  - `USE_REDIS_RATE_LIMIT=true` in production `.env`
  - Rate limiters use Redis for distributed rate limiting across PM2 instances
- **nginx**: `client_max_body_size 50M` for file uploads (added Dec 24, 2025)

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
1. ❌ **Assuming Docker is deployed** - Production uses PM2, not Docker (Docker configs exist but for local dev)
2. ❌ **Assuming production code is up-to-date** - Local may be ahead. Always verify git status.
3. ❌ **Testing against localhost** - Always test against production: api.yourtechassist.us
4. ❌ **Making changes without checking production state first** - SSH and verify before proceeding
5. ❌ **Forgetting to increase Node memory on production builds** - Use `NODE_OPTIONS='--max-old-space-size=2048'`

---

## 📋 AUTOMATIC DOCUMENTATION UPDATES (PROACTIVE BEHAVIOR)

**Claude: You MUST proactively update documentation. This is not optional.**

### Trigger Conditions - Update Docs When:
1. ✅ **After deploying to production** → Add Deployment History entry
2. ✅ **After fixing a bug that took >30 minutes** → Add to Debugging section
3. ✅ **After infrastructure changes** → Update Production Architecture section
4. ✅ **After schema changes** → Add to Changelog under Database Quirks
5. ✅ **After security changes** → Update Security Status section
6. ✅ **After completing a major feature** → Update Current Project Context
7. ✅ **When conversation is getting long** → Update everything relevant NOW (before context compaction)
8. ✅ **When you learn something not documented** → Add it immediately

### How to Update (Do This Automatically)

**After Deployment:**
```markdown
### YYYY-MM-DD @ HH:MM TZ: Brief Title (DEPLOYED)
- **What**: One-line summary
- **Commits**: `abc1234`
- **Changes**: List of changes
- **Status**: ✅ DEPLOYED
```

**After Bug Fix:**
```markdown
### Issue: "[symptom]"
**Cause**: What caused it
**Fix**: How to fix
```

**After Discovering Quirk:**
Add to the Changelog section under appropriate category.

### Self-Check Questions (Ask Yourself After Every Major Task)
1. Did I learn something about production not in this file? → **Update now**
2. Did I fix something that could happen again? → **Add to Debugging section**
3. Did I change how something works? → **Update relevant section**
4. Is this conversation getting long? → **Update Current Project Context and Changelog NOW**

**Rule**: If you spent significant time on something, document it BEFORE moving on.

---

## Development Philosophy: Test-Driven Development (TDD)

**Effective Date**: December 21, 2025

From this point forward, all new code MUST follow Test-Driven Development principles:

### TDD Workflow
1. **Write tests FIRST** - Before implementing any feature or fix
2. **Run tests to see them fail** - Verify the test is testing the right thing
3. **Write minimal code to pass** - Only implement what's needed
4. **Refactor** - Clean up while keeping tests green
5. **Repeat** - For each new requirement

### Testing Requirements by Code Type

| Code Type | Required Tests | Framework |
|-----------|---------------|-----------|
| API Routes | Integration tests | Vitest + Supertest |
| Services | Unit tests | Vitest |
| React Components | Component tests | Vitest + React Testing Library |
| Python Scripts | Unit tests | pytest |
| E2E Workflows | End-to-end tests | Playwright |

### Before Merging Any PR
- [ ] All new code has corresponding tests
- [ ] Tests run and pass locally
- [ ] Test coverage does not decrease
- [ ] No skipped tests without documented reason

### Test Location Conventions
```
apps/api/src/__tests__/           # API unit/integration tests
apps/api/src/__tests__/integration/  # API integration tests
apps/web/src/__tests__/           # Admin frontend tests
apps/portal/src/__tests__/        # Portal frontend tests
apps/python-importer/tests/       # Python importer tests
apps/ds-analytics/tests/          # DS Analytics tests
apps/ml-analytics/tests/          # ML Analytics tests
e2e/                              # End-to-end Playwright tests
```

### Why TDD?
- **Fewer bugs** - Tests catch issues before deployment
- **Better design** - Writing tests first forces better architecture
- **Confidence** - Refactor without fear of breaking things
- **Documentation** - Tests serve as living documentation

---

## Current Project Context

### Active Goal: Everstory Onboarding
- **Objective**: Import Everstory's inventory CSV and display analytics on dashboard
- **Status**: ✅ COMPLETE - Full end-to-end testing passed (Dec 24, 2025)
- **Last Major Work**: Fixed critical import bugs, full system validation (Dec 24, 2025)
- **Test Results**:
  - Inventory import: 111 rows, 0 errors ✅
  - Orders import: 10,563 rows, 0 errors, ~9.4s ✅
  - System status: 329 products, 24,062 transactions, 17 imports

### Recently Completed (Dec 24, 2025)
- **Codex Risk Audit Remediation** - Scrutinized codebase against deployment risk audit, fixed 4 remaining gaps
- **Import Pipeline Fixes** - Fixed Transaction join, savepoint management, nginx file size
- **Full System Validation** - Both inventory and orders imports tested and verified
- Enterprise Code Quality Remediation (Dec 22) - 10 critical/high priority fixes
- Zero Defects Remediation (Dec 23) - Comprehensive error handling fixes
- Import Lock Resilience (Dec 23) - Auto-recovery and admin controls

### Security Status (Dec 21, 2025)
- ✅ SQL injection fixed in Python importer (using SQLAlchemy `pg_insert`)
- ✅ Redis-backed rate limiting enabled with role-based tiers
- ✅ Sensitive endpoints protected (admin, financial, orders, portal)
- ✅ Portal auth uses Zod validation
- ✅ Production errors sanitized (no column name leakage)
- ✅ File paths stored as relative (no absolute path disclosure)
- ✅ Python importer validates file paths (blocks traversal attacks)

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

## Specialized Agents

This project has 9 specialized agents available as slash commands:

| Agent | Use For |
|-------|---------|
| `/db-expert` | Schema changes, Prisma migrations, query optimization |
| `/api-expert` | New endpoints, auth, middleware, rate limiting |
| `/python-expert` | CSV imports, DS analytics, data processing |
| `/ml-expert` | Prophet forecasting, stockout prediction |
| `/admin-ui-expert` | Dashboard widgets, Recharts, admin features |
| `/portal-ui-expert` | Client portal, mobile-first, simplified UX |
| `/testing-expert` | Vitest, Playwright, coverage, CI testing |
| `/devops-expert` | Docker, PM2, nginx, deployment, CI/CD |
| `/docs-keeper` | **USE BEFORE CONTEXT COMPACTION** - Updates CLAUDE.md, changelogs, READMEs |

Standalone prompts also available in `.agents/` directory for use with other AI tools.

See `.agents/README.md` for detailed usage and agent interaction patterns.

---

## Project Structure

```
fulfillment-ops-dashboard/
├── .agents/              # Standalone agent prompts (NEW)
├── .claude/commands/     # Slash command agents (NEW)
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

### 2025-12-24 @ 14:00 PST: Codex Risk Audit Remediation (DEPLOYED)
- **What**: Addressed remaining gaps from import_deployment_risk_audit_codex.md scrutiny
- **Commits**:
  - `68d230d` - docs: Update CLAUDE.md with Dec 24 import pipeline fixes
  - `450f077` - fix: Address remaining deployment risk audit gaps
- **Changes**:
  - **UPLOAD_DIR env var** - `import.routes.ts` now uses `process.env.UPLOAD_DIR` with fallback
  - **PYTHON_PATH env var** - Added to Python path detection for custom installations
  - **ML URL startup warning** - Warns at startup if DS_ANALYTICS_URL/ML_SERVICE_URL not configured
  - **item_type CHECK constraint** - Already existed in `migrations/20251223_add_itemtype_constraint`
- **Audit Results** (already fixed, no changes needed):
  - Import concurrency: PostgreSQL advisory locks ✅
  - importType="both": Properly rejected, user selection required ✅
  - Orders quantity: Multiple fallbacks ensure non-null ✅
  - Error visibility: Full UI display in ImportModal ✅
  - ML offline: Graceful degradation ✅
  - item_type normalization: Python validates + coerces ✅
- **Production Health**:
  - Database: up (329 products, 6 clients)
  - Redis: up
  - DS Analytics: up
  - ML Analytics: down (not deployed)
- **Status**: ✅ DEPLOYED to production at 22:00 UTC (14:00 PST Dec 24)

---

### 2025-12-24 @ 14:00 PST: Import Pipeline Critical Fixes (DEPLOYED)
- **What**: Fixed critical bugs blocking orders import - Transaction join, savepoint management, nginx config
- **Commits**:
  - `3f74cf3` - Fix savepoint handling in bulk_operations.py
  - `2b26c19` - Fix Transaction row count using Product join
- **Root Causes & Fixes**:
  1. **Transaction row count verification failed** - Transaction model has no `clientId`, must join with Product table
     - `apps/python-importer/main.py` lines ~1220, ~1480
     - Changed: `db.query(models.Transaction).filter(models.Transaction.client_id == ...)`
     - To: `db.query(models.Transaction).join(models.Product).filter(models.Product.client_id == ...)`
  2. **Savepoint errors ("savepoint does not exist")** - Raw psycopg2 `commit()`/`rollback()` in COPY functions was releasing SQLAlchemy savepoints
     - `apps/python-importer/bulk_operations.py` - removed explicit commit/rollback from `bulk_insert_products_copy()` and `bulk_insert_transactions_copy()`
     - Let SQLAlchemy's `begin_nested()` savepoint handle transaction management
  3. **nginx 413 Request Entity Too Large** - api.yourtechassist.us missing file size limit
     - `/etc/nginx/sites-available/yourtechassist` - added `client_max_body_size 50M;`
- **Test Results**:
  - Inventory import: 111 rows, 0 errors ✅
  - Orders import: 10,563 rows, 0 errors, ~9.4 seconds ✅
- **Production Status**:
  - API: online (PM2)
  - Database: 329 products, 24,062 transactions, 17 imports
  - Everstory client: 308 products, 23,126 transactions
- **Status**: ✅ DEPLOYED to production

---

### 2025-12-23 @ 20:20 PST: Import Lock Resilience - Auto-Recovery & Admin Controls (DEPLOYED)
- **What**: Prevents "Another import is currently processing" errors from blocking users indefinitely
- **Commit**: `6fe293b` - feat: Add import lock resilience - auto-recovery and admin controls
- **Changes**:
  - **Scheduled Cleanup Job** (every 5 min) - Automatically finds and marks stuck imports as failed
    - `apps/api/src/jobs/scheduler.ts` - added `cleanup-stale-imports` job
  - **Reduced Stale Timeout** - 30 minutes → 10 minutes for better UX
    - `apps/api/src/routes/import.routes.ts` - `STALE_LOCK_TIMEOUT_MS` reduced
  - **Graceful Shutdown Handler** - Releases locks when PM2 restarts
    - `apps/api/src/index.ts` - added SIGTERM/SIGINT handlers
  - **Admin Force-Unlock Endpoint** - Manual override for stuck locks
    - `POST /api/imports/admin/force-unlock/:clientId` - clears all locks for a client
    - `GET /api/imports/admin/lock-status/:clientId` - diagnostic endpoint
  - **Frontend Recovery UI** - Better UX when import blocked
    - `apps/web/src/components/ImportModal.tsx` - shows recovery options, force-unlock button for admins
- **How It Works Now**:
  1. Normal: Import runs, completes, lock released
  2. Crash/Timeout: Within 10 min → user waits or admin force-unlocks; After 10 min → auto-recovery
  3. PM2 Restart: Graceful shutdown marks imports as failed, releases locks
- **Status**: ✅ DEPLOYED to production at 04:20 UTC (20:20 PST Dec 23)
- **Verification**: API healthy, PM2 online, scheduler job registered

---

### 2025-12-23 @ 10:45 PST: Post-Deployment Defect Sweep (DEPLOYED)
- **What**: Focused fixes after Zero Defects deployment - 3 issues identified, all resolved
- **Commit**: `7eb3090` - fix: Post-deployment defect sweep - focused fixes
- **Fixes Applied**:
  - Added PostgreSQL CHECK constraint for itemType (evergreen, event, completed only)
  - Fixed health.service.ts port defaults (8001/8002 → 8000 to match Python services)
  - Added DS_ANALYTICS_URL and ML_ANALYTICS_URL to dev .env.example
- **Investigation Results** (no fixes needed):
  - ML service offline: UI handles gracefully with setup wizard
  - Import type detection: Reliable auto-detection + user override
  - Orphan visibility: Hidden by default (intentional design)
  - Import lock robustness: 3-level fallback, 30-min cleanup works perfectly
- **Database**: Verified 637 products with valid itemType values (578 evergreen, 59 event)
- **Status**: ✅ DEPLOYED to production at 18:45 UTC (10:45 PST Dec 23)

---

### 2025-12-23 @ 10:21 PST: Zero Defects Remediation (DEPLOYED)
- **What**: Comprehensive error handling and silent failure fixes for iOS-level reliability
- **Commit**: `e6175ab` - fix: Zero Defects remediation - comprehensive error handling fixes
- **Files Changed**:
  - `apps/api/scripts/cleanup/delete-failed-imports.ts` - NEW: Script to delete failed import batches
  - `apps/api/scripts/cleanup/cleanup-orphans.ts` - NEW: Script to cleanup orphan products
  - `apps/python-importer/main.py` - Fixed bare except clause at line 687 (date parsing)
  - `apps/api/src/routes/import.routes.ts` - Fixed lock release with retry + emergency disconnect
  - `apps/api/src/routes/import.routes.ts` - Fixed file cleanup error handling with DiagnosticLog tracking
  - `apps/api/src/routes/import.routes.ts` - Fixed mapping corrections now stored in ImportBatch.metadata
  - `apps/api/src/lib/error-tracker.ts` - NEW: Centralized error tracking module
  - `apps/api/src/routes/diagnostic.routes.ts` - Added /errors endpoint for error monitoring
- **Silent Failure Fixes**:
  - Python importer: Bare `except:` now properly catches and logs with `log_diagnostic()`
  - Lock release: Added retry mechanism + emergency Prisma disconnect to prevent 30-min deadlocks
  - File cleanup: Failures now logged to DiagnosticLog table for monitoring
  - Mapping corrections: User corrections now persisted to ImportBatch.metadata for audit trail
- **New Infrastructure**:
  - `error-tracker.ts` - trackError(), getRecentErrors(), getErrorCount(), getErrorDetails(), cleanupOldErrors()
  - `GET /api/diagnostics/errors` - Error summary endpoint (admin only)
  - `GET /api/diagnostics/errors/:category` - Detailed error logs by category
  - `POST /api/diagnostics/errors/cleanup` - Cleanup old error logs
- **Production Cleanup Executed**:
  - Deleted 90 failed import batches (Dec 12-23, 2025 range)
  - Root causes: missing quantity_packs column, file format issues, Python import errors
  - Remaining: 6 completed + 8 completed_with_errors (clean data)
- **Database Status**: 637 products, 6 clients, 0 failed imports
- **Status**: ✅ DEPLOYED to production at 18:21 UTC (10:21 PST Dec 23)

---

### 2025-12-22: Enterprise Code Quality Remediation (DEPLOYING)
- **What**: Comprehensive code quality audit and remediation - 10 critical/high priority fixes
- **Commits**: `cf02848` - Enterprise code quality remediation
- **Tier 1 Critical Fixes**:
  - `MLInsightsSummaryWidget.tsx` - Replaced mock data with real API call + graceful fallback
  - `scheduler.ts` - Added mutex lock pattern to prevent concurrent job execution (race condition fix)
  - `shipment.routes.ts` - Added comprehensive Zod validation for all endpoints
  - `usage.service.ts` - Combined two separate transactions into single atomic transaction
  - Multiple files - Removed all `any` type casts with proper TypeScript interfaces
- **Tier 2 High Priority Fixes**:
  - `auth.routes.ts`, `portal/auth.routes.ts` - Added auth rate limiting (10 attempts/15 min)
  - `validation-schemas.ts` - Reverted pagination limit from 1000 → 100 (security)
  - `audit.routes.ts` - Added `requireClientAccess` middleware for authorization
  - `portal/auth.routes.ts` - Fixed password minimum from 1 → 10 characters
- **New TypeScript Interfaces Added**:
  - `ProductWithEnhancedMetrics` (ClientDetail.tsx)
  - `EnhancedLocationPerformance`, `RegionalPerformanceSummary`, `StateSummary` (ClientAnalytics.tsx)
  - `PendingOrder`, `UsageCalculationTier`, `UsageConfidence` types
- **Status**: 🟡 PENDING DEPLOYMENT

---

### 2025-12-22 @ 22:05 PST: QA Audit Fixes - Import Concurrency, ML UX, Dead Code Cleanup (DEPLOYED)
- **What**: Fixed multiple issues from deep QA audit - advisory locks, ML readiness UX, dead code removal
- **Commits**:
  - `33d6398` - QA audit fixes (import concurrency, ML UX, cleanup)
  - `b5c10cf` - fix: Rename error property to message in ML readiness catch block
  - `416d084` - fix: Correct logger.error signature in ML readiness endpoint
- **Changes**:
  - **Import Concurrency**: Added PostgreSQL advisory locks for per-client import locking (race-condition safe)
    - `apps/api/src/routes/import.routes.ts` - added `acquireClientImportLock()` and `releaseClientImportLock()`
  - **ML Readiness UX**: New endpoint and frontend states for better ML offline experience
    - `apps/api/src/routes/ml.routes.ts` - added `/api/ml/readiness` endpoint with data progress
    - `apps/web/src/pages/MLAnalytics.tsx` - 3 new UX states: Setup Wizard, Gathering Data, Ready
    - Witty progress messages like "Teaching our AI the ways of your inventory..."
  - **Zero Quantity Warning**: Python importer now warns when no quantity columns found
    - `apps/python-importer/main.py` - added warning to `errors_encountered`
  - **Dead Code Removed**:
    - Deleted `apps/api/src/lib/import-queue.ts` (unused BullMQ queue)
    - Deleted `apps/api/src/workers/import-worker.ts` (unused worker)
    - Deleted redundant backfill scripts for item_type normalization
  - **Deployment Script**: Added item_type normalization step to deploy.sh
  - **.gitignore**: Added venv patterns
- **Status**: ✅ DEPLOYED to production at 06:05 UTC (22:05 PST Dec 21)
- **Verification**: API healthy, PM2 online, build successful

---

### 2025-12-21 @ 20:46 PST: Pagination Limit Fix + Python Import Fixes (DEPLOYED)
- **What**: Fixed pagination limit errors (max 100 → max 1000) across all route files
- **Commits**:
  - `6c1f5b7` - fix: Use shared paginationSchema in product.routes.ts
  - `861b50b` - fix: Update pagination limits and remove deprecated pandas warning
  - `4ddf0fc` - fix: Increase pagination limit from 100 to 1000
  - `e40310e` - fix: Ensure quantity_packs is always set in orders import
  - `4a38f30` - fix: Correct monorepo_root calculation in file path validation
- **Root Cause Analysis**:
  - Products endpoint was using inline schema with `max(100)` instead of shared `paginationSchema`
  - Order and alert routes also had inline `max(100)` overrides
  - Python importer had path validation calculating wrong monorepo root (2 levels instead of 3)
  - Orders import failed when `quantity_packs` column was missing from CSV
- **Files Changed**:
  - `apps/api/src/routes/product.routes.ts` - Refactored to use shared `paginationSchema`
  - `apps/api/src/routes/order.routes.ts` - Changed `max(100)` to `max(1000)`
  - `apps/api/src/routes/alert.routes.ts` - Changed `max(100)` to `max(1000)`
  - `apps/api/src/lib/validation-schemas.ts` - Already had `max(1000)` (baseline)
  - `apps/python-importer/main.py` - Fixed path validation, added quantity_packs fallback, removed deprecated `infer_datetime_format`
- **Status**: ✅ DEPLOYED to production at 04:46 UTC (20:46 PST Dec 21)
- **Verification**: Products endpoint returns 308 products with `limit=500`

---

### 2025-12-21 @ 18:55 PST: P0/P1 Security + Health Endpoints + Python Hardening (DEPLOYED)
- **What**: Comprehensive security and reliability improvements from codebase audit
- **Commits**:
  - `22b3243` - P0/P1 security fixes + health endpoints + TDD philosophy
  - `5704c97` - docs: Fix domain structure in CLAUDE.md
  - `c660515` - security: Fix CORS and add circuit breaker to Python services
- **P0 Critical Security Fixes**:
  - Password reset email now uses `sendPasswordResetEmail()` with SendGrid
  - Column mapping validation with Zod schema
  - adminLimiter applied to `/api/clients` and `/api/audit`
- **P1 Reliability Fixes**:
  - 8 comprehensive health check endpoints:
    - `/api/health` - Full system status
    - `/api/health/live` - Liveness probe
    - `/api/health/ready` - Readiness probe
    - `/api/health/db` - Database health (2ms latency, 440 products)
    - `/api/health/redis` - Redis health (0ms latency)
    - `/api/health/disk` - Storage health (112 files)
    - `/api/health/email` - Email service status
    - `/api/health/services` - Python services status
  - CORS in Python services now uses environment-based origins (not `["*"]`)
  - Circuit breaker pattern added to ML Analytics (matches DS Analytics)
- **Files Created**:
  - `apps/api/src/services/health.service.ts`
  - `apps/api/src/routes/health.routes.ts`
- **Status**: ✅ DEPLOYED to production at 23:55 UTC (18:55 PST Dec 21)
- **Verification**: All health endpoints returning correct status
- **Known Issues**:
  - Email shows "degraded" - needs SENDGRID_API_KEY in production .env
  - Python services show "down" - DS/ML Analytics not yet deployed

---

### 2025-12-21 @ 17:15 PST: Python Importer Fix + CSRF Fix (DEPLOYED)
- **What**: Fixed critical Python import error that was blocking all CSV imports
- **Root Cause**: `bulk_operations.py` line 22 had `from . import models` (relative import) but `main.py` imports it as a module, not a package
- **Fix**: Changed to `import models` (absolute import)
- **Files Changed**:
  - `apps/python-importer/bulk_operations.py` (line 22 import fix)
  - `apps/api/src/routes/auth.routes.ts` (CSRF token issuance on login)
  - `apps/api/src/routes/portal/auth.routes.ts` (CSRF token issuance on login)
  - `.claude/settings.local.json` (cleaned up malformed permissions)
- **Also Fixed**:
  - CSRF token errors on delete operations - backend now issues CSRF token on login
  - Item_type case sensitivity - ran SQL to normalize 111 products (Evergreen → evergreen)
  - Settings file had malformed git commit message causing parse errors
- **Status**: ✅ DEPLOYED to production
- **Verification**: `python -c 'import bulk_operations'` returns SUCCESS on production

---

### 2025-12-21 @ 08:08 PST: Security Hardening (DEPLOYED)
- **What**: Critical security fixes from security review
- **Commit**: `6232025` - Security hardening: Fix critical vulnerabilities from security review
- **Changes**:
  - Fixed SQL injection in `apps/python-importer/bulk_operations.py`
    - Replaced f-string SQL with SQLAlchemy `pg_insert` + `on_conflict_do_update`
    - Added `_sanitize_string()` helper for input sanitization
  - Fixed Redis rate limiting in `apps/api/src/lib/rate-limiters.ts`
    - Corrected `sendCommand` signature for ioredis v5 + rate-limit-redis v4
    - Added 5 new role-based rate limiters: admin, user management, financial, orders, portal
  - Applied rate limiters to sensitive endpoints in `apps/api/src/index.ts`
  - Added Zod validation to portal auth in `apps/api/src/routes/portal/auth.routes.ts`
  - Sanitized production errors in `apps/api/src/middleware/error-handler.ts`
  - Changed to relative file paths in `apps/api/src/routes/import.routes.ts`
  - Added path validation to Python importer in `apps/python-importer/main.py`
- **Environment**: Added `USE_REDIS_RATE_LIMIT=true` to production `.env`
- **Status**: ✅ DEPLOYED to production at 16:08 UTC (08:08 PST Dec 21)
- **Verification**: API healthy, Redis rate limiting active in logs

---

### 2025-12-21 @ 07:25 PST: Analytics in Active Import Path + Full Feature Deploy (DEPLOYED)
- **What**: CRITICAL FIX - Analytics now properly called after imports
  - Previous deployment added analytics to `import.service.ts` which was NEVER CALLED
  - This deployment adds analytics to `import.routes.ts` (the ACTUAL import path)
- **Commits**:
  - `42e9541` - fix: Add post-import analytics to active import path + orphan reconciliation
  - `07b02eb` - fix: Add missing middleware exports (getCsrfTokenHandler)
  - `e979d57` - fix: Add missing lib modules (redis, api-response, etc.)
  - `167b130` - fix: Disable Redis rate limiting until proper configuration
- **Files Changed**:
  - `apps/api/src/routes/import.routes.ts` (added analytics calls to ACTIVE import path)
  - `apps/api/src/routes/orphan-reconciliation.routes.ts` (NEW)
  - `apps/api/src/services/orphan-reconciliation.service.ts` (NEW)
  - `apps/api/src/lib/rate-limiters.ts` (fixed Redis compatibility)
  - `apps/api/src/lib/redis.ts`, `api-response.ts`, `validation-schemas.ts` (NEW)
  - `apps/web/src/pages/OrphanReconciliation.tsx` (NEW)
  - `apps/web/src/pages/admin/AnalyticsSettings.tsx` (NEW)
  - `packages/shared/package.json` (added lucide-react ^0.460.0)
- **Issue Fixed**:
  - Analytics functions were in `import.service.ts` but that file was NEVER CALLED
  - `import.routes.ts` spawns Python and does post-processing but was MISSING analytics
- **Status**: ✅ DEPLOYED to production at 15:25 UTC (07:25 PST Dec 21)
- **Verification**: API running healthy on PM2, using in-memory rate limiting

---

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

### Issue: "502 Bad Gateway" on api.yourtechassist.us
**Cause**: nginx config at `/etc/nginx/sites-available/yourtechassist` may be pointing to wrong port
**Fix**: Verify nginx is proxying to port 3001 (not 3002):
```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "grep proxy_pass /etc/nginx/sites-available/yourtechassist"
# Should show: proxy_pass http://localhost:3001
```
If wrong, fix with: `sed -i 's/localhost:3002/localhost:3001/' /etc/nginx/sites-available/yourtechassist && nginx -t && systemctl reload nginx`

### Issue: "Git pull shows success but code not updated"
**Cause**: HEAD is detached from main branch (common after checkout to specific commit)
**Fix**: Checkout main then pull:
```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "cd /var/www/inventory && git checkout main && git pull origin main"
```
**Verify**: `git log -1 --oneline` should show expected commit

### Issue: "Another import is currently processing for this client"
**Cause**: A previous import is stuck in `processing` or `pending` status, blocking new imports
**Auto-Recovery**: System cleans up stuck imports every 5 minutes (after 10 min timeout)
**Manual Fix for Admins**:
```bash
# Option 1: Use the admin force-unlock endpoint
curl -X POST https://api.yourtechassist.us/api/imports/admin/force-unlock/{clientId}

# Option 2: SSH and run cleanup directly
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  cd /var/www/inventory/apps/api &&
  node -e \"
    const {PrismaClient} = require('@prisma/client');
    const p = new PrismaClient();
    p.importBatch.updateMany({
      where: { status: { in: ['processing', 'pending'] } },
      data: { status: 'failed', completedAt: new Date() }
    }).then(r => console.log('Cleaned up:', r.count));
    p.\\\$executeRaw\\\`SELECT pg_advisory_unlock_all()\\\`.then(() => console.log('Locks released'));
  \"
"
```
**Verify**: User can now start a new import

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

### Issue: "ImportError: attempted relative import with no known parent package"
**Cause**: Python file uses relative imports (e.g., `from . import models`) but is run as a script, not a package
**Fix**: Change relative imports to absolute imports in the Python file:
```python
# WRONG (relative import)
from . import models

# RIGHT (absolute import)
import models
```

### Issue: "ZodError: Number must be less than or equal to 100" on pagination
**Cause**: Route file has inline schema with `max(100)` instead of using shared `paginationSchema`
**Fix**: Ensure all route files use `paginationSchema` from `validation-schemas.ts`:
```typescript
// WRONG (inline schema with limit)
const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// RIGHT (use shared paginationSchema)
import { paginationSchema } from '../lib/validation-schemas.js';
const querySchema = paginationSchema.extend({ ... });
```
**Files to check**: `product.routes.ts`, `order.routes.ts`, `alert.routes.ts`

### Issue: "null value in column 'quantity_packs' violates not-null constraint"
**Cause**: Orders CSV doesn't have a "Quantity" column, so `quantity_packs` is never set
**Fix**: Python importer must ALWAYS set `quantity_packs` before insert:
```python
if 'quantity_packs' not in df.columns:
    if 'quantity_units' in df.columns:
        df['quantity_packs'] = df['quantity_units'].fillna(0).astype(int)
    else:
        df['quantity_packs'] = 0
```

### Issue: "File path outside allowed directories" during import
**Cause**: `monorepo_root` in `main.py` calculated incorrectly (wrong number of `os.path.dirname()` calls)
**Fix**: Count directory levels from script to monorepo root:
```python
# main.py is at apps/python-importer/main.py
# Need 3 levels up: main.py → python-importer → apps → monorepo root
monorepo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```
**Why**: `main.py` adds the package directory to `sys.path` and imports modules directly. Relative imports only work when running as a package with `-m` flag.

### Issue: "CSRF token missing" on delete/POST operations
**Cause**: Backend wasn't issuing CSRF token on login, or frontend not sending it
**Fix**: Ensure `auth.routes.ts` issues CSRF token cookie on login:
```typescript
const csrfToken = generateCsrfToken();
res.cookie('csrf_token', csrfToken, { httpOnly: false, ... });
```
**Verify**: Check browser cookies after login - should see `csrf_token` cookie

### Issue: "Transaction has no attribute 'client_id'" or "Transaction has no attribute 'clientId'"
**Cause**: Transaction model doesn't have clientId at all - it relates to clients through Product
**Fix**: Join Transaction with Product to filter by client:
```python
# WRONG - Transaction has no client_id
db.query(models.Transaction).filter(models.Transaction.client_id == client_id)

# RIGHT - Join with Product to get client
db.query(models.Transaction).join(
    models.Product,
    models.Transaction.product_id == models.Product.id
).filter(models.Product.client_id == client_id)
```
**Where**: `apps/python-importer/main.py` - row count verification functions

### Issue: "savepoint does not exist" or "no transaction is active"
**Cause**: Raw psycopg2 `connection.commit()` or `connection.rollback()` inside SQLAlchemy savepoints releases the savepoint unexpectedly
**Fix**: Remove explicit commit/rollback from bulk operations, let SQLAlchemy manage savepoints:
```python
# WRONG - breaks savepoint management
try:
    cursor.copy_expert(...)
    connection.commit()  # This releases the SQLAlchemy savepoint!
except:
    connection.rollback()  # This also breaks savepoint state!

# RIGHT - let SQLAlchemy handle it
try:
    cursor.copy_expert(...)
    # Don't commit - let outer savepoint handle it
except:
    # Don't rollback - let SQLAlchemy savepoint handle it
    raise
```
**Where**: `apps/python-importer/bulk_operations.py` - COPY functions

### Issue: "413 Request Entity Too Large" on file upload
**Cause**: nginx missing `client_max_body_size` directive for API server block
**Fix**: Add to nginx config:
```bash
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  sed -i '/server_name api.yourtechassist.us/a\    client_max_body_size 50M;' /etc/nginx/sites-available/yourtechassist &&
  nginx -t && systemctl reload nginx
"
```
**Verify**: `curl -I https://api.yourtechassist.us` should show nginx accepting larger bodies

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

## 📝 Changelog (Small but Important Details)

This section tracks smaller details, quirks, and knowledge that shouldn't be forgotten.

### Import Lock Resilience (Dec 23, 2025)
- **Stale import timeout**: Reduced from 30 → 10 minutes in `STALE_LOCK_TIMEOUT_MS`
- **Scheduled cleanup job**: `cleanup-stale-imports` runs every 5 minutes
- **Graceful shutdown**: SIGTERM/SIGINT handlers release all advisory locks before exit
- **New admin endpoints**:
  - `POST /api/imports/admin/force-unlock/:clientId` - clears stuck import locks
  - `GET /api/imports/admin/lock-status/:clientId` - diagnostic info about lock state
- **Frontend recovery UI**: When "Another import processing" error occurs, shows options to wait, view import history, or force-unlock (admin only)

### Enterprise Remediation (Dec 22, 2025)
- **Pagination limit reverted**: 1000 → 100 in `validation-schemas.ts` (security fix)
- **Portal password minimum**: Changed from 1 → 10 characters in `portal/auth.routes.ts`
- **Auth rate limiting**: Now applied to `/login` and `/refresh` endpoints (10 attempts/15 min)
- **Shipment routes**: Now have comprehensive Zod validation (was manual type casting)
- **Scheduler mutex**: Jobs now use lock pattern to prevent concurrent execution
- **Usage service**: Two separate transactions combined into single atomic transaction
- **Audit routes**: Client activity endpoint now requires `requireClientAccess`
- **Type safety**: All `any` casts removed from audit.routes.ts, ClientAnalytics.tsx, ClientDetail.tsx

### Rate Limiting Tiers (Added Dec 21, 2025)
| Role | Default | Auth | Upload | AI | Report | Admin | Financial | Orders |
|------|---------|------|--------|----|----|-------|-----------|--------|
| anonymous | 20/min | 10/15min | 20/hr | 10/min | 5/5min | 0 | 0 | 0 |
| user | 100/min | 10/15min | 40/hr | 20/min | 10/5min | 0 | 10/min | 20/min |
| account_manager | 200/min | 10/15min | 60/hr | 30/min | 15/5min | 10/min | 20/min | 40/min |
| operations_manager | 300/min | 10/15min | 80/hr | 45/min | 20/5min | 20/min | 30/min | 60/min |
| admin | 500/min | 10/15min | 100/hr | 60/min | 25/5min | 30/min | 40/min | 80/min |

### Database Schema Quirks
- `ImportBatch.filePath` stores **relative paths** (as of Dec 21) - relative to monorepo root
- `Product.item_type` is case-sensitive - always use lowercase values
- `DailySnapshot` is created by `createDailySnapshot()` after imports
- `RiskScoreCache` is pre-calculated by `refreshRiskScoreCache()` after imports

### Python Importer Details
- Located at `apps/python-importer/`
- Uses virtualenv at `apps/python-importer/venv/`
- Called as subprocess from Node.js API
- `bulk_upsert_products()` uses SQLAlchemy `pg_insert` for SQL injection safety
- `validate_file_path()` blocks path traversal and restricts to `/uploads` directory
- **IMPORTANT**: All imports must be absolute (e.g., `import models` not `from . import models`)
  - `main.py` adds package dir to `sys.path` and imports modules directly
  - Relative imports will fail with `ImportError: attempted relative import with no known parent package`
- **CRITICAL**: Transaction model has NO `client_id` or `clientId` attribute
  - Must join with Product table to filter by client: `db.query(Transaction).join(Product).filter(Product.client_id == ...)`
- **CRITICAL**: Don't use raw `connection.commit()` or `connection.rollback()` inside SQLAlchemy savepoints
  - Let SQLAlchemy's `begin_nested()` manage the savepoint lifecycle
  - Raw commits/rollbacks will release the savepoint and cause "savepoint does not exist" errors

### Build Quirks
- Production builds need `NODE_OPTIONS='--max-old-space-size=2048'` or OOM kills tsc
- `npm run build:api` builds shared package first, then API
- Pre-commit hooks use lint-staged with different tsconfig - may need `--no-verify` for quick fixes

### Environment Variables (Production)
```bash
# Critical - must be set
JWT_SECRET=<32+ chars>
DATABASE_URL=postgresql://user:pass@localhost:5432/inventory_db
USE_REDIS_RATE_LIMIT=true

# Optional but recommended
REDIS_URL=redis://localhost:6379
FRONTEND_URL=https://admin.yourtechassist.us
DS_ANALYTICS_URL=http://localhost:8000  # For ML/DS analytics features
ML_SERVICE_URL=http://localhost:8000    # Alternative to DS_ANALYTICS_URL

# New in Dec 24, 2025 (optional)
UPLOAD_DIR=/var/www/inventory/uploads   # Custom upload directory
PYTHON_PATH=/usr/bin/python3            # Custom Python path
```

### Known Working User Accounts (for testing)
- Admin Dashboard: `sarah.chen@inventoryiq.com` / `demo1234` (account_manager role)
- Portal: `admin@everstory.com` / `everstory1234`

### File Locations Reference
| What | Local Path | Production Path |
|------|-----------|-----------------|
| API code | `apps/api/` | `/var/www/inventory/apps/api/` |
| API dist | `apps/api/dist/` | `/var/www/inventory/apps/api/dist/` |
| Admin frontend | `apps/web/dist/` | `/var/www/html/inventory/admin/` |
| Portal frontend | `apps/portal/dist/` | `/var/www/html/inventory/portal/` |
| Python importer | `apps/python-importer/` | `/var/www/inventory/apps/python-importer/` |
| Upload files | `uploads/` | `/var/www/inventory/uploads/` |
| PM2 ecosystem | `deploy/ecosystem.config.js` | `/var/www/inventory/ecosystem.config.js` |
| Production .env | N/A | `/var/www/inventory/.env` |

---

**Last Updated**: December 24, 2025
**Last Major Change**: Codex Risk Audit Remediation - UPLOAD_DIR, PYTHON_PATH env vars, ML URL startup warning
**Everstory Status**: ✅ FULLY ONBOARDED - 308 products, 23,126 transactions imported and verified
**Audit Status**: ✅ All deployment risks from import_deployment_risk_audit_codex.md addressed
