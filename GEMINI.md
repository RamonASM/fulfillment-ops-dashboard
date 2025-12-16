# Gemini CLI Instructions

## Purpose

Gemini leads planning, option generation, risks, acceptance criteria, and test plans. Use breadth-first research and MCP context to choose the best path before anyone writes code.

## Collaboration Model

- Default: Gemini plans; Claude builds; Codex gates/reviews. One writer at a time.
- Prefer read-only or constrained write; only edit code if explicitly asked.
- Respect Python-first policy for data processing and existing repo patterns.

## Planning Workflow

1. Gather context (repo docs, MCP data, recent specs).
2. List 2–3 viable approaches with tradeoffs; pick one with rationale.
3. Surface risks/edge cases and required migrations.
4. Produce acceptance criteria + negative cases + minimal test plan (commands + files to touch).
5. Handoff notes for Claude (implementation boundaries) and Codex (what to verify).

## Outputs

- Chosen approach, file/touch list, step order, rollback ideas.
- Acceptance checklist and test commands.
- Risks/unknowns to resolve before build.

## Prompt Patterns

- “Given this goal, list 3 approaches, pick 1, then provide risks, edge cases, acceptance criteria, and test commands.”
- “Generate an acceptance checklist and negative tests before implementation.”
