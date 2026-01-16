# Specialized Agents for Inventory Intelligence Platform

This directory contains standalone agent prompts for use with AI coding assistants. Each agent is a deep specialist in a specific domain of the platform.

## Available Agents

| Agent | Domain | Use When |
|-------|--------|----------|
| [`db-expert`](./db-expert.md) | PostgreSQL, Prisma ORM | Schema changes, migrations, query optimization |
| [`api-expert`](./api-expert.md) | Express.js, Routes, Services | New endpoints, auth, middleware, rate limiting |
| [`python-expert`](./python-expert.md) | FastAPI, Pandas, SQLAlchemy | Import processing, data analysis, DS analytics |
| [`ml-expert`](./ml-expert.md) | Prophet, Forecasting | Demand prediction, stockout analysis, model tuning |
| [`admin-ui-expert`](./admin-ui-expert.md) | React, Recharts, TailwindCSS | Dashboard widgets, visualizations, admin features |
| [`portal-ui-expert`](./portal-ui-expert.md) | React, Mobile-first | Client portal, simplified UX, order workflows |
| [`testing-expert`](./testing-expert.md) | Vitest, Playwright | Unit tests, E2E tests, coverage, CI testing |
| [`devops-expert`](./devops-expert.md) | Docker, PM2, nginx | Deployment, infrastructure, CI/CD pipelines |
| [`docs-keeper`](./docs-keeper.md) | CLAUDE.md, READMEs, Changelogs | Documentation updates, knowledge preservation |

## Usage

### In Claude Code (Slash Commands)

The same agents are available as slash commands in `.claude/commands/`:

```bash
# Use the database expert
/db-expert Add a VendorContact model with relations to Product and Client

# Use the API expert
/api-expert Create webhook endpoints for carrier tracking updates

# Use the Python expert
/python-expert Add vendor lead time parsing to CSV imports

# Use the ML expert
/ml-expert Improve forecast accuracy for irregular demand patterns

# Use the Admin UI expert
/admin-ui-expert Create widget showing inventory turnover by location

# Use the Portal UI expert
/portal-ui-expert Design mobile-friendly order history page

# Use the Testing expert
/testing-expert Write unit tests for shipment tracking service

# Use the DevOps expert
/devops-expert Set up automated database backups to S3

# Use the Documentation Keeper (IMPORTANT: use before context compaction!)
/docs-keeper Update CLAUDE.md with changes from this session
```

### In External Tools

Copy the contents of any `.md` file in this directory and use it as a system prompt for your AI assistant of choice.

### In Multi-Agent Workflows

Use multiple agents for complex tasks:

| Task Type | Primary Agent | Supporting Agent |
|-----------|---------------|------------------|
| New database model | db-expert | api-expert |
| New API endpoint | api-expert | db-expert |
| Import enhancements | python-expert | db-expert |
| Forecasting features | ml-expert | python-expert |
| Admin dashboard widget | admin-ui-expert | api-expert |
| Portal feature | portal-ui-expert | api-expert |
| Test coverage | testing-expert | (domain expert) |
| Infrastructure | devops-expert | - |
| After any major work | docs-keeper | - |
| Before context compaction | docs-keeper | - |

## Agent Boundaries

Each agent has clear ownership:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Inventory Intelligence Platform               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   db-expert  │    │  api-expert  │    │python-expert │      │
│  │              │    │              │    │              │      │
│  │ prisma/      │───▶│ routes/      │◀───│ python-      │      │
│  │ schema.prisma│    │ services/    │    │ importer/    │      │
│  │ migrations/  │    │ middleware/  │    │ ds-analytics/│      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                             │                    │              │
│                             ▼                    ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  ml-expert   │    │admin-ui-     │    │portal-ui-    │      │
│  │              │    │expert        │    │expert        │      │
│  │ ml-analytics/│    │              │    │              │      │
│  │ forecasting  │    │ apps/web/    │    │ apps/portal/ │      │
│  └──────────────┘    │ components/  │    │ components/  │      │
│                      └──────────────┘    └──────────────┘      │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │testing-expert│    │devops-expert │                          │
│  │              │    │              │                          │
│  │ __tests__/   │    │ deploy/      │                          │
│  │ e2e/         │    │ .github/     │                          │
│  │ vitest/      │    │ docker/      │                          │
│  │ playwright   │    │ nginx/       │                          │
│  └──────────────┘    └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Patterns

### Database Changes Flow

```
1. db-expert: Design schema, create migration
2. api-expert: Add service methods and routes
3. testing-expert: Add unit tests
4. devops-expert: Deploy migration
```

### Frontend Feature Flow

```
1. api-expert: Create/update API endpoints
2. admin-ui-expert OR portal-ui-expert: Build UI components
3. testing-expert: Add E2E tests
4. devops-expert: Deploy
```

### Data Processing Flow

```
1. python-expert: Implement processing logic
2. db-expert: Optimize queries if needed
3. testing-expert: Add integration tests
4. devops-expert: Deploy Python services
```

## File Locations

| Agent | Primary Files |
|-------|---------------|
| db-expert | `apps/api/prisma/schema.prisma` (1580+ lines, 50+ models) |
| api-expert | `apps/api/src/routes/` (44 files), `apps/api/src/services/` (40+ files) |
| python-expert | `apps/python-importer/main.py`, `apps/ds-analytics/` |
| ml-expert | `apps/ml-analytics/`, `apps/api/src/services/ml-client.service.ts` |
| admin-ui-expert | `apps/web/src/components/` (65+ components) |
| portal-ui-expert | `apps/portal/src/components/` (20+ components) |
| testing-expert | `apps/api/src/__tests__/` (20+ tests), `e2e/` (11 specs) |
| devops-expert | `deploy/`, `.github/workflows/` |
| docs-keeper | `CLAUDE.md`, `.agents/README.md`, `deploy/*.md`, `apps/*/README.md` |

## Service Ports

| Service | Port |
|---------|------|
| API | 3001 |
| Admin Dashboard | 5173 |
| Client Portal | 5174 |
| Python Importer | 3002 |
| DS Analytics | 8001 |
| ML Analytics | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Best Practices

1. **Start with the right agent** - Choose based on the primary domain
2. **Read before writing** - Each agent reads relevant files first
3. **Follow existing patterns** - Agents know project conventions
4. **Chain agents for complex tasks** - Use supporting agents as needed
5. **Test your changes** - Use testing-expert to verify
6. **Deploy carefully** - Use devops-expert for production changes
7. **Document your work** - Use docs-keeper after major changes
8. **Before ending a long session** - Run `/docs-keeper` to preserve knowledge
