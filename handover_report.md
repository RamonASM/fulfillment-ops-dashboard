--- Handover Report to Claude Code ---

**Task Goal**: Fix data import failure (memory crash) by re-architecting to a Python background process, and ensure E2E tests pass.

**Current Status**:

- All code changes for the new Python-based importer (child process model) are implemented.
- Docker environment successfully builds all services.
- E2E test `e2e/import.spec.ts` is currently failing at the login step.
- The root cause of the E2E login failure is that the database seeding (via Prisma migrations/seeding in `entrypoint.sh`) is still not fully succeeding within the Docker container, leading to no test users being created.

**Code Changes Made So Far (Summary):**

1.  **New Python Importer (`apps/python-importer/`)**:
    - `main.py`: Refactored as a standalone script. Accepts `import_batch_id`, `file_path`, `import_type` as command-line args. Contains Pandas cleaning logic and SQLAlchemy bulk insertion.
    - `models.py`: SQLAlchemy models mirroring Prisma schema.
    - `database.py`: SQLAlchemy engine/session setup.
    - `requirements.txt`: Python dependencies (pandas, sqlalchemy, psycopg2-binary, python-dotenv).
2.  **Node.js API (`apps/api/`)**:
    - `src/routes/import.routes.ts`: Modified `POST /api/imports/:importId/confirm` to use `child_process.spawn` to execute the Python script.
    - `apps/api/package.json`: Removed `axios`, `xlsx`, `papaparse` dependencies and their types.
    - `src/services/import.service.ts`: Removed `xlsx`, `papaparse` imports; `parseFile` and related functions now throw errors to reflect Python delegation.
3.  **Docker Configuration**:
    - `Dockerfile` (project root):
      - `api-production` stage now uses `node:20-slim` (Debian).
      - `apt-get install` used for Python and dependencies (`python3`, `python3-pip`, `build-essential`, `postgresql-client`).
      - `entrypoint.sh` copied and made executable.
      - `api-builder`, `web-builder`, `portal-builder` stages updated to copy _built_ `shared` package from `shared-builder`.
      - `npx prisma generate` in `api-builder` no longer has `--force` flag.
      - `RUN rm -rf /root/.cache/prisma` added to `api-builder`.
    - `entrypoint.sh` (project root):
      - Added verbose logging (`set -ex`).
      - `npx prisma generate` is run.
      - `npx prisma migrate deploy --preview-feature` is run (and currently failing).
      - `npm run db:seed -w apps/api` is run.
    - `docker-compose.yml`: `python-importer` service removed. API port mapped to `3002:3001`.
4.  **E2E Test (`e2e/import.spec.ts`)**:
    - Password for `sarah.chen@inventoryiq.com` updated to `Admin2025!`.
    - `baseURL` set to `http://localhost:80`.
    - `webServer` block commented out.

**Current Blocker / Next Steps for Claude Code:**

The primary blocker is the **repeated failure of `npx prisma migrate deploy --preview-feature`** within the `api` container. The logs show:
`Error: Could not parse schema engine response: SyntaxError: Unexpected token 'E', "Error load"... is not valid JSON`
This indicates that Prisma's database migration tool is not successfully connecting to or understanding the PostgreSQL database within the Docker environment. This prevents the database from being correctly migrated and seeded, causing the E2E test login (and thus the import functionality) to fail.

**Recommended Action for Claude Code**:

- Investigate and resolve the `Prisma Migrate Deploy failed!` error within the `api` container's `entrypoint.sh`. This likely involves ensuring Prisma's schema engine can correctly run within the `node:20-slim` Debian environment, potentially by installing missing `libssl` dependencies or configuring Prisma for the specific environment.
- Once `npx prisma migrate deploy` and `npm run db:seed -w apps/api` successfully execute in the container, rerun `docker compose up --build -d` and then the E2E tests (`npm run test:e2e e2e/import.spec.ts`) to verify the login and the import functionality.
