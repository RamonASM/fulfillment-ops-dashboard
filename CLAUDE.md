# Claude Code Instructions - TruLux Fulfillment Ops Dashboard

This file provides guidance to Claude Code when working with this codebase.

---

## VERIFICATION RULES (READ FIRST)

These rules override all other instructions. They exist because AI-generated code often looks correct but doesn't actually work.

### Core Principles

1. **Never implement a feature without a corresponding test**
2. **Never modify existing code without running existing tests first**
3. **Ask clarifying questions before assuming requirements**
4. **Build vertically (one complete feature end-to-end) not horizontally**
5. **Verify each layer works before building the next layer**
6. **One feature at a time - never parallel work on multiple features**

### Before Writing Any Code

- Confirm you understand what's being asked
- State what files you will create or modify
- Identify what could go wrong
- Wait for approval before proceeding

### After Writing Any Code

- Run the linter: `npm run lint`
- Run tests: `npm run test`
- If anything fails, explain why before trying to fix it
- Report the actual output, not what you expect

### Verification Requirements by Layer

**Database changes:**
- Run the migration: `npm run db:migrate`
- Verify the table/column exists
- Test a simple query against it
- COMMIT before moving to next layer

**API/Backend changes:**
- Write a test that calls the endpoint
- Run the test - it must PASS
- Test manually with curl if possible
- COMMIT before moving to UI

**UI changes:**
- Connect to real data (never mocks for production code)
- Verify it works in the browser
- Check browser console for errors
- Check Network tab for failed requests
- COMMIT only when verified

### What NOT To Do

- Do not create mock implementations - build real functionality
- Do not skip error handling
- Do not hardcode API keys or secrets
- Do not assume environment variables exist without checking
- Do not say "this should work" - verify it actually works
- Do not move to the next feature until current feature is verified working
- Do not generate code for multiple features at once
- Do not keep trying the same failed approach repeatedly

### When Stuck

- Stop and explain what's blocking you
- Propose 2-3 alternative approaches
- Wait for direction before proceeding

### Context Refresh

If the conversation is getting long (30+ messages), re-read this file and summarize:
- What we've built so far
- What's currently working
- What's currently broken
- What's left to do

---

## QUALITY GATES CHECKLIST

Use this checklist before marking ANY work as complete:

### Pre-Build Gates
- [ ] Requirements are clear and documented
- [ ] Dependencies are identified
- [ ] Test cases are defined

### Build Gates (Each Layer)
- [ ] Code is written
- [ ] Linter passes: `npm run lint`
- [ ] Tests pass: `npm run test`
- [ ] Manual verification done
- [ ] Committed to git

### Post-Build Gates
- [ ] Happy path works end-to-end
- [ ] Error states are handled gracefully
- [ ] No console errors in browser
- [ ] No network errors in browser dev tools
- [ ] Works after page refresh

---

## PRODUCTION ARCHITECTURE (VERIFIED Dec 24, 2025)

### Domain Structure
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

### Infrastructure
- **Server**: DigitalOcean droplet at 138.197.70.205
- **SSH Access**: `ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205`
- **Code Location**: `/var/www/inventory`
- **Database**: PostgreSQL on localhost:5432
  - User: `user`
  - Database: `inventory_db`
  - Connection string in `.env`
- **Redis**: RUNNING - Used for rate limiting and caching
  - `USE_REDIS_RATE_LIMIT=true` in production `.env`
- **nginx**: `client_max_body_size 50M` for file uploads

### Process Management (Using PM2)
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
1. **Assuming Docker is deployed** - Production uses PM2, not Docker
2. **Assuming production code is up-to-date** - Local may be ahead. Always verify.
3. **Testing against localhost** - Always test against production: api.yourtechassist.us
4. **Making changes without checking production state first** - SSH and verify before proceeding
5. **Forgetting to increase Node memory on production builds** - Use `NODE_OPTIONS='--max-old-space-size=2048'`

---

## AUTOMATIC DOCUMENTATION UPDATES (PROACTIVE BEHAVIOR)

**Claude: You MUST proactively update documentation. This is not optional.**

### Trigger Conditions - Update Docs When:
1. **After deploying to production** → Add Deployment History entry
2. **After fixing a bug that took >30 minutes** → Add to Debugging section
3. **After infrastructure changes** → Update Production Architecture section
4. **After schema changes** → Add to Changelog under Database Quirks
5. **After security changes** → Update Security Status section
6. **After completing a major feature** → Update Current Project Context
7. **When conversation is getting long** → Update everything relevant NOW
8. **When you learn something not documented** → Add it immediately

### How to Update (Do This Automatically)

**After Deployment:**
```markdown
### YYYY-MM-DD @ HH:MM TZ: Brief Title (DEPLOYED)
- **What**: One-line summary
- **Commits**: `abc1234`
- **Changes**: List of changes
- **Status**: DEPLOYED
```

**After Bug Fix:**
```markdown
### Issue: "[symptom]"
**Cause**: What caused it
**Fix**: How to fix
```

### Self-Check Questions (Ask Yourself After Every Major Task)
1. Did I learn something about production not in this file? → **Update now**
2. Did I fix something that could happen again? → **Add to Debugging section**
3. Did I change how something works? → **Update relevant section**
4. Is this conversation getting long? → **Update Current Project Context and Changelog NOW**

**Rule**: If you spent significant time on something, document it BEFORE moving on.

---

## TECH STACK

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, TailwindCSS, Vite |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 15 |
| State Management | Zustand + TanStack Query |
| Testing | Vitest + Playwright |
| Hosting | DigitalOcean (PM2 + nginx) |

### Tech Stack Quick Reference
```
Admin:        apps/web/ → admin.yourtechassist.us (React SPA)
Portal:       apps/portal/ → portal.yourtechassist.us (React SPA)
API:          apps/api/ → api.yourtechassist.us (Express)
Python:       apps/python-importer/, apps/ds-analytics/, apps/ml-analytics/
Database:     PostgreSQL via Prisma ORM
Deployment:   PM2 + nginx on DigitalOcean
```

---

## KEY COMMANDS

```bash
# Development
npm run dev:api          # Start API server
npm run dev:web          # Start admin dashboard
npm run dev:portal       # Start client portal
npm run dev              # Run all in parallel

# Build
npm run build            # Build all packages
npm run build:api        # Build API only

# Lint
npm run lint             # ESLint all files

# Test
npm run test             # Run all tests
npm run test:api         # API tests only
npm run test:e2e         # E2E Playwright tests

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:seed          # Seed database

# Type checking
npm run typecheck        # TypeScript check
```

---

## DIRECTORY STRUCTURE

```
fulfillment-ops-dashboard/
├── .agents/              # Standalone agent prompts
├── .claude/commands/     # Slash command agents
├── apps/
│   ├── api/              # Node.js Express API (deployed via PM2)
│   ├── web/              # Admin dashboard (React)
│   ├── portal/           # Client portal (React)
│   ├── python-importer/  # CSV import script (subprocess)
│   ├── ds-analytics/     # Data science service (FastAPI)
│   └── ml-analytics/     # ML forecasting service (FastAPI)
├── packages/
│   ├── shared/           # Shared types, utilities
│   └── ui/               # Shared UI components
├── deploy/               # PM2 configs, nginx configs, deployment scripts
├── e2e/                  # Playwright E2E tests
└── CLAUDE.md             # THIS FILE - Keep it updated!
```

---

## DEVELOPMENT PHILOSOPHY: TEST-DRIVEN DEVELOPMENT (TDD)

**Effective Date**: December 21, 2025

All new code MUST follow Test-Driven Development principles:

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

### Test Location Conventions
```
apps/api/src/__tests__/              # API unit/integration tests
apps/api/src/__tests__/integration/  # API integration tests
apps/web/src/__tests__/              # Admin frontend tests
apps/portal/src/__tests__/           # Portal frontend tests
apps/python-importer/tests/          # Python importer tests
apps/ds-analytics/tests/             # DS Analytics tests
apps/ml-analytics/tests/             # ML Analytics tests
e2e/                                 # End-to-end Playwright tests
```

---

## COMMIT MESSAGE STANDARDS

Use **Conventional Commits** format for all commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Commit Types

| Type | When to Use | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(import): add CSV column auto-detection` |
| `fix` | Bug fix | `fix(api): handle null quantity in orders import` |
| `docs` | Documentation only | `docs: update CLAUDE.md with deployment history` |
| `style` | Formatting, no code change | `style: fix eslint warnings in dashboard` |
| `refactor` | Code change, no new feature/fix | `refactor(api): extract validation to middleware` |
| `test` | Adding/updating tests | `test(import): add edge case coverage` |
| `chore` | Build, deps, config | `chore: update dependencies` |
| `perf` | Performance improvement | `perf(queries): add index for product lookups` |

### Scope Prefixes

| Scope | Directory/Area |
|-------|----------------|
| `api` | `apps/api/` |
| `web` | `apps/web/` |
| `portal` | `apps/portal/` |
| `import` | Import pipeline |
| `db` | Database/migrations |
| `ml` | ML analytics |
| `python` | Python services |

### Commit Message Rules

1. **Subject line**: Max 72 characters, imperative mood ("add" not "added")
2. **Body**: Wrap at 80 characters, explain "what" and "why" (not "how")
3. **Footer**: Always include `Co-Authored-By` for Claude-assisted commits
4. **Breaking changes**: Add `BREAKING CHANGE:` in footer

### Examples

```bash
# Feature commit
git commit -m "$(cat <<'EOF'
feat(import): add automatic column mapping detection

- Parse CSV headers and match to known column patterns
- Support fuzzy matching for common variations
- Add user confirmation step for ambiguous mappings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Bug fix commit
git commit -m "$(cat <<'EOF'
fix(api): handle missing quantity_packs in orders CSV

When CSV lacks a Quantity column, default to 0 instead of
throwing null constraint violation.

Closes #45

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## PULL REQUEST GUIDELINES

### PR Title Format

Use the same format as commit messages:
```
<type>(<scope>): <description>
```

### PR Description Template

```markdown
## Summary
<!-- 1-3 bullet points describing what this PR does -->

## Changes
<!-- List of files/areas changed -->

## Test Plan
<!-- How to verify this works -->
- [ ] Unit tests pass (`npm run test`)
- [ ] Build passes (`npm run build`)
- [ ] Manual testing completed
- [ ] Edge cases considered

## Screenshots
<!-- If UI changes, include before/after -->

## Related Issues
<!-- Link to issues this addresses -->
Closes #123
```

### PR Checklist

Before requesting review:
- [ ] Branch is up to date with `main`
- [ ] All commits follow conventional commit format
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] No console.log statements left in code
- [ ] No hardcoded secrets or API keys
- [ ] CLAUDE.md updated if needed

---

## DEPLOYMENT PROCESS

### Quick Deploy (Production uses PM2)
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
curl -s https://api.yourtechassist.us/api/health | jq
```

### After Deployment Checklist
- [ ] Verify PM2 process is online: `pm2 list`
- [ ] Check logs for errors: `pm2 logs inventory-api`
- [ ] Test API health: `curl https://api.yourtechassist.us/api/health`
- [ ] Test admin dashboard loads: Visit admin.yourtechassist.us
- [ ] Test portal loads: Visit portal.yourtechassist.us
- [ ] **Update this file** with what was deployed and when

---

## EMERGENCY PROCEDURES

### Hotfix Workflow

When a critical bug is found in production:

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-description

# 2. Make minimal fix (smallest possible change)
# ... edit files ...

# 3. Test locally
npm run build
npm run test

# 4. Commit with hotfix type
git commit -m "fix(critical): description of fix

Hotfix for production issue.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# 5. Push and deploy immediately
git push origin hotfix/critical-bug-description
git checkout main
git merge hotfix/critical-bug-description
git push origin main

# 6. Deploy to production (see Deployment Process above)
```

### Production Rollback

If a deployment breaks production:

```bash
# Option 1: Revert via Git
git checkout main
git revert HEAD  # Reverts last commit
git push origin main
# Then redeploy

# Option 2: Rollback to previous commit on server
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  cd /var/www/inventory &&
  git log --oneline -5 &&          # Find good commit
  git checkout <good-commit-hash> &&
  npm run build &&
  pm2 restart inventory-api
"
```

### Database Emergency

If a migration breaks the database:

```bash
# 1. DO NOT run more migrations
# 2. Document the error message

# Option 1: Manual fix via psql
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  psql -U user -d inventory_db -c 'SELECT * FROM \"_prisma_migrations\" ORDER BY finished_at DESC LIMIT 5;'
"

# Option 2: Restore from backup (if available)
# Contact DigitalOcean support or check automated backups
```

### Incident Response Checklist

When production is broken:

1. **Acknowledge** (within 5 minutes)
   - [ ] Identify the issue
   - [ ] Notify stakeholders if user-facing

2. **Assess** (within 15 minutes)
   - [ ] Determine severity (P0/P1/P2)
   - [ ] Identify root cause or workaround
   - [ ] Decide: rollback vs hotfix

3. **Resolve** (ASAP)
   - [ ] Apply fix or rollback
   - [ ] Verify production is working
   - [ ] Monitor for 30 minutes

4. **Document** (within 24 hours)
   - [ ] Write incident summary in Deployment History
   - [ ] Add to Debugging section if applicable
   - [ ] Update CLAUDE.md if process gap found

### Severity Levels

| Level | Definition | Response |
|-------|------------|----------|
| **P0** | Site down, all users affected | Immediate (drop everything) |
| **P1** | Major feature broken, many users affected | Within 1 hour |
| **P2** | Minor feature broken, workaround exists | Within 24 hours |
| **P3** | Cosmetic issue, no functional impact | Next sprint |

---

## SPECIALIZED AGENTS

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
| `/docs-keeper` | **USE BEFORE CONTEXT COMPACTION** - Updates CLAUDE.md |

### Agent Workflow
```
1. Plan      → Identify which agent is relevant
2. Implement → Use agent for domain expertise
3. Validate  → Run build/test verification
4. Document  → Update CLAUDE.md with learnings
```

### Auto-Trigger Checkpoints

**Claude should proactively suggest agents at these checkpoints:**

| Checkpoint | Agent | Prompt |
|------------|-------|--------|
| After editing 3+ files | `testing-expert` | "Should I run tests?" |
| Before implementing feature | (consider agents) | "Which domain is this?" |
| After completing feature | `docs-keeper` | "Should I update docs?" |
| New API route created | `testing-expert` | "Should I write tests for this endpoint?" |
| Database schema change | `db-expert` | "Need migration assistance?" |

---

## DEBUGGING GUIDE

### Common TypeScript Errors

#### `Type 'X' is not assignable to type 'Y'`
```typescript
// Problem: Type mismatch
const data: User = await fetchData()  // fetchData returns unknown

// Solution 1: Type assertion (if you're sure)
const data = await fetchData() as User

// Solution 2: Type guard (safer)
if (isUser(data)) {
  // data is now typed as User
}
```

#### `Property 'X' does not exist on type 'Y'`
```typescript
// Problem: Accessing property that might not exist
const name = user.profile.name  // profile might be undefined

// Solution: Optional chaining
const name = user?.profile?.name
```

### Common Test Failures

#### `ReferenceError: fetch is not defined`
```typescript
// Problem: Node.js test environment doesn't have fetch
// Solution: Mock in test setup
import { vi } from 'vitest'
global.fetch = vi.fn()
```

### Database Debugging

#### Connection Errors
```bash
# Check database is running
ssh -i ~/.ssh/id_ed25519_deploy root@138.197.70.205 "
  systemctl status postgresql
  psql -U user -d inventory_db -c 'SELECT 1;'
"
```

#### Query Returns Empty
```typescript
// Debug steps
const result = await prisma.product.findMany({
  where: { clientId },
  take: 10
})
console.log('Query result:', { count: result.length, clientId })

// If empty: Check clientId exists, check RLS if applicable
```

### Network Debugging

```typescript
// In browser DevTools → Network tab:
// 1. Filter by "Fetch/XHR"
// 2. Click request → check "Response" tab
// 3. Look for error messages in response body

// In API route, log request details:
console.log('Request:', {
  method: req.method,
  path: req.path,
  body: req.body,
  headers: req.headers
})
```

---

## CURRENT PROJECT CONTEXT

### Active Goal: Everstory Onboarding
- **Objective**: Import Everstory's inventory CSV and display analytics on dashboard
- **Status**: COMPLETE - Full end-to-end testing passed (Dec 24, 2025)
- **Test Results**:
  - Inventory import: 111 rows, 0 errors
  - Orders import: 10,563 rows, 0 errors, ~9.4s
  - System status: 329 products, 24,062 transactions, 17 imports

### Recently Completed (Dec 24, 2025)
- **Codex Risk Audit Remediation** - Scrutinized codebase against deployment risk audit
- **Import Pipeline Fixes** - Fixed Transaction join, savepoint management, nginx file size
- **Full System Validation** - Both inventory and orders imports tested and verified
- Enterprise Code Quality Remediation (Dec 22)
- Zero Defects Remediation (Dec 23)
- Import Lock Resilience (Dec 23)

### Security Status (Dec 21, 2025)
- SQL injection fixed in Python importer (using SQLAlchemy `pg_insert`)
- Redis-backed rate limiting enabled with role-based tiers
- Sensitive endpoints protected (admin, financial, orders, portal)
- Portal auth uses Zod validation
- Production errors sanitized (no column name leakage)
- File paths stored as relative (no absolute path disclosure)
- Python importer validates file paths (blocks traversal attacks)

---

## DEBUGGING COMMON ISSUES

### Issue: "Import completed but dashboard shows 'No data available'"
**Cause**: Post-import analytics didn't run
**Fix**: Upgrade to latest code with analytics fixes, reimport data

### Issue: "API server not responding"
**Cause**: PM2 process crashed or not started
**Fix**: `ssh root@138.197.70.205 "pm2 restart inventory-api"`

### Issue: "502 Bad Gateway" on api.yourtechassist.us
**Cause**: nginx config pointing to wrong port
**Fix**: Verify nginx is proxying to port 3001

### Issue: "Another import is currently processing for this client"
**Cause**: Previous import stuck in `processing` status
**Auto-Recovery**: System cleans up stuck imports every 5 minutes (after 10 min timeout)
**Manual Fix**: `POST /api/imports/admin/force-unlock/:clientId`

### Issue: "ImportError: attempted relative import with no known parent package"
**Cause**: Python file uses relative imports but is run as script
**Fix**: Change `from . import models` to `import models`

### Issue: "savepoint does not exist" or "no transaction is active"
**Cause**: Raw psycopg2 commit/rollback inside SQLAlchemy savepoints
**Fix**: Remove explicit commit/rollback, let SQLAlchemy manage savepoints

### Issue: "413 Request Entity Too Large" on file upload
**Cause**: nginx missing `client_max_body_size`
**Fix**: Add `client_max_body_size 50M;` to nginx config

---

## DATA FLOW

```
CSV Upload (via admin.yourtechassist.us)
    ↓
POST /api/imports (Node.js API)
    ↓
Python Importer (subprocess: apps/python-importer/main.py)
    ↓
PostgreSQL Database (bulk insert via Prisma)
    ↓
Post-Import Analytics
    ├─ createDailySnapshot() → DailySnapshot table
    ├─ refreshRiskScoreCache() → RiskScoreCache table
    └─ aggregateDailyAlertMetrics() → DailyAlertMetrics table
    ↓
Dashboard Widgets Populate (admin.yourtechassist.us)
```

---

## ENVIRONMENT VARIABLES

Required in `.env`:

```bash
# Core - Required
JWT_SECRET=<32+ chars>
DATABASE_URL=postgresql://user:pass@localhost:5432/inventory_db
USE_REDIS_RATE_LIMIT=true

# Optional but recommended
REDIS_URL=redis://localhost:6379
FRONTEND_URL=https://admin.yourtechassist.us
DS_ANALYTICS_URL=http://localhost:8000
ML_SERVICE_URL=http://localhost:8001

# Custom paths (optional)
UPLOAD_DIR=/var/www/inventory/uploads
PYTHON_PATH=/usr/bin/python3
```

---

## COLLABORATION MODEL

- **Gemini**: Planner, risk analysis, acceptance tests
- **Claude (You)**: Primary builder, implementation, testing
- **Codex**: QA, code review, quality gate

### Workflow
1. Gemini provides plan/requirements
2. Claude implements with tests
3. Codex reviews before merge
4. **Claude updates CLAUDE.md after major changes**

---

## PROACTIVE REMINDERS

**Claude should remind the user at these points (without being asked):**

### During Development
- After 5+ file edits: "Consider committing this checkpoint before continuing"
- After adding new API route: "Don't forget to add tests for this endpoint"
- After editing auth logic: "Security-sensitive change - double-check the implementation"

### Before Completing Tasks
- "Have you run `npm run build` to verify TypeScript?"
- "Have you tested this manually?"
- "Are there any edge cases we should handle?"

### End of Session
- "Here's what was completed today: [summary]"
- "Remaining items for next session: [list]"
- "Consider creating a commit with: `git add -A && git commit -m 'description'`"

---

## FEEDBACK LOOP

**The most important thing: Give Claude a way to verify its work.**

### Verification Methods

| Type | Method | When |
|------|--------|------|
| **Build** | `npm run build` | After every change |
| **Tests** | `npm run test` | After every change |
| **Lint** | `npm run lint` | Before commits |
| **Browser** | Check console + network | UI changes |
| **API** | curl or test endpoint | API changes |

### Feedback Signals to Provide

When something doesn't work, tell Claude:
- **Error messages** - Copy exact output
- **Console errors** - From browser DevTools
- **Network failures** - Status codes, response bodies
- **Screenshots** - For UI issues
- **Expected vs Actual** - What should happen vs what happened

---

## CHANGELOG (Small but Important Details)

### Import Lock Resilience (Dec 23, 2025)
- **Stale import timeout**: Reduced from 30 → 10 minutes
- **Scheduled cleanup job**: `cleanup-stale-imports` runs every 5 minutes
- **Graceful shutdown**: SIGTERM/SIGINT handlers release all advisory locks

### Rate Limiting Tiers (Dec 21, 2025)
| Role | Default | Auth | Admin | Financial |
|------|---------|------|-------|-----------|
| anonymous | 20/min | 10/15min | 0 | 0 |
| user | 100/min | 10/15min | 0 | 10/min |
| admin | 500/min | 10/15min | 30/min | 40/min |

### Database Schema Quirks
- `ImportBatch.filePath` stores **relative paths** - relative to monorepo root
- `Product.item_type` is case-sensitive - always use lowercase values
- `DailySnapshot` is created by `createDailySnapshot()` after imports

### Python Importer Details
- Located at `apps/python-importer/`
- Uses virtualenv at `apps/python-importer/venv/`
- Called as subprocess from Node.js API
- **IMPORTANT**: All imports must be absolute (e.g., `import models` not `from . import models`)
- **CRITICAL**: Transaction model has NO `client_id` attribute - must join with Product table
- **CRITICAL**: Don't use raw `connection.commit()` inside SQLAlchemy savepoints

### Build Quirks
- Production builds need `NODE_OPTIONS='--max-old-space-size=2048'` or OOM kills tsc
- `npm run build:api` builds shared package first, then API

### Known Working User Accounts (for testing)
- Admin Dashboard: `sarah.chen@inventoryiq.com` / `demo1234` (account_manager role)
- Portal: `admin@everstory.com` / `everstory1234`

### File Locations Reference
| What | Local Path | Production Path |
|------|-----------|-----------------|
| API code | `apps/api/` | `/var/www/inventory/apps/api/` |
| Admin frontend | `apps/web/dist/` | `/var/www/html/inventory/admin/` |
| Portal frontend | `apps/portal/dist/` | `/var/www/html/inventory/portal/` |
| Python importer | `apps/python-importer/` | `/var/www/inventory/apps/python-importer/` |
| Upload files | `uploads/` | `/var/www/inventory/uploads/` |

---

## DEPLOYMENT HISTORY

### 2025-12-24 @ 14:00 PST: Codex Risk Audit Remediation (DEPLOYED)
- **What**: Addressed remaining gaps from import_deployment_risk_audit_codex.md
- **Changes**:
  - UPLOAD_DIR env var - `import.routes.ts` now uses `process.env.UPLOAD_DIR`
  - PYTHON_PATH env var - Added for custom Python installations
  - ML URL startup warning - Warns if DS_ANALYTICS_URL/ML_SERVICE_URL not configured
- **Status**: DEPLOYED

### 2025-12-24 @ 14:20 PST: ML Analytics Service Deployed
- **What**: Set up ML Analytics service on production
- **Changes**:
  - Created venv at `/var/www/inventory/apps/ml-analytics/venv/`
  - ML Analytics running on port 8001
- **Status**: DEPLOYED and VERIFIED

### 2025-12-24 @ 14:00 PST: Import Pipeline Critical Fixes
- **What**: Fixed Transaction join, savepoint management, nginx config
- **Test Results**:
  - Inventory import: 111 rows, 0 errors
  - Orders import: 10,563 rows, 0 errors
- **Status**: DEPLOYED

---

## IMPORTANT NOTES

- **Do not edit GEMINI.md or AGENTS.md** - Those are for other AI collaborators
- **Python-first policy** for data processing - Use Python for CSV parsing, calculations
- **Keep diffs small** - Small, focused commits are easier to review and deploy
- **Run tests before committing** - `npm run test && npm run typecheck`
- **Update CLAUDE.md after significant work** - Don't let knowledge get lost!

---

**Last Updated**: January 16, 2026
**Last Major Change**: Framework revision - Added verification rules, quality gates, commit standards, emergency procedures
**Everstory Status**: FULLY ONBOARDED - 308 products, 23,126 transactions
