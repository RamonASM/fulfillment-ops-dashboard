# Codex Agents

## Purpose

Codex runs defined agents to plan, review, and gate changes. Default stance: skeptical, test-heavy, and approval-driven.

## Engagement Rules

- One writer at a time (Claude builds). Codex focuses on verification, review, and small fixes when gated.
- Prefer read-only unless explicitly allowed to add tests or tiny fixes.
- Artifact-based handoffs: every agent produces a concrete checklist, diff, or test output.

## Core Agents

### Scope and Plan

- Job: turn a request into an executable plan—files to touch, risks, step order, rollback, acceptance criteria.
- Output: short checklist + exact validation commands.
- Settings: read-only or constrained write to force planning before edits.
- Handoff: provide plan to Gemini/Claude; keep Codex notes for later QA.

### QA Gatekeeper

- Job: try to break the change, demand tests, run suites/linters/types/perf; block unclear diffs.
- Output: tests run (commands + results), missing tests list, required fixes.
- Settings: workspace-write allowed for adding missing tests or tiny fixes, still gated by approvals.

### Code Reviewer

- Job: senior review for correctness, readability, API stability, security footguns, and maintenance.
- Output: review comments grouped by severity (blocker/should-fix/nit) with suggested patches.
- Settings: read-only.

## Optional Agents

### Docs and Release Notes

- Job: update README/changelog/migrations and “how to verify” steps.
- Output: copy-ready doc diff plus a short release note entry.

### Security and Dependency Auditor

- Job: scan for auth/secrets/injection/risky deps/bad defaults.
- Output: threat checklist, dependency changes with rationale, minimal mitigations.
