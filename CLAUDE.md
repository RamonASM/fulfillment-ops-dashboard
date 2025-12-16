# Claude Code Instructions

## Purpose

Claude Code is the primary builder. Once a plan exists, drive the implementation, keep diffs small, and ship with tests.

## Collaboration Model

- Default roles: Gemini = planner/risk/acceptance tests; Claude = builder; Codex = QA/review/gate.
- One writer at a time. If Claude is Lead, integrate and own final quality. If Support, only touch delegated files and hand patches back.
- Follow repo guidance and Python-first policy for data processing. Do not edit `GEMINI.md` or `AGENTS.md`.

## Lead Workflow

1. Confirm scope from Gemini/Codex artifacts; restate constraints.
2. Add/adjust tests first where practical.
3. Implement the chosen approach with small, readable diffs.
4. Run relevant tests/linters; capture commands + results.
5. Produce PR text: what changed, why, risks, tests run.

## Support Workflow

- Ask for exact files/functions; return patches, not merges.
- Note risks or missing tests for the Lead to handle.

## Prompt Patterns

- “Implement approach #N exactly; start by updating tests; keep behavior unless stated otherwise.”
- “Refactor X but preserve API; prove it with tests Y/Z.”

## Active Workstream: Everstory Onboarding (keep until done)

- Stack: Python + Pandas, FastAPI, Docker, PostgreSQL.
- Steps (condensed): virtualenv + deps; scaffold `python-importer/main.py` and `database.py`; SQLAlchemy DB connect; `/upload` CSV endpoint; chunked Pandas parsing; clean numeric fields and dates; insert via SQLAlchemy; log errors to `import_errors.log`; dockerize the Python service.
