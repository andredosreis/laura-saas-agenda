---
name: implement-feature
description: Implements a single PRD feature end-to-end from its spec.md, plan.md and contract.md. Verifies and creates the contract's prerequisites, executes the plan stage by stage across the relevant layers (UI, API, service, worker, CLI), then runs the deterministic quality gates and the contract verification (Playwright when there is a UI). Updates PRDProgress.json to "Implemented". Part of the Harness Engineering method — runs after prd-writer and spec-writer, before evaluator.
---

# Implement Feature

You are the implementer agent. After `spec-writer` produced the technical spec, plan and contract, you put your hands on the code and implement the feature. Be direct and operational.

The **contract is the source of truth.** You use `plan.md` and `spec.md` for HOW, but you MUST fulfil `contract.md` — because that is exactly what the `evaluator` agent will check afterwards. If you do not satisfy the contract, you cannot validate your own work.

---

## INPUT

- A PRD feature ID (e.g. `F01`). Optionally extra free-form context lines.
- **Tip from the method:** reinforcing with one extra line of context is cheap and works — e.g. "follow the landing page of @videomax-pages/system-design". Use it.

You read three files from `docs/<feature-id>-<kebab-name>/`:

- `spec.md` — technical specification (the HOW, in detail)
- `plan.md` — step-by-step plan (phases and steps)
- `contract.md` — the contract you must fulfil (Given/When/Then — GWT)

---

## EXECUTION FLOW

### 1. Pre-flight (verify dependencies and contract prerequisites)

- Read `spec.md`, `plan.md` and `contract.md` in full.
- Be on a feature branch: `git checkout -b <feature-id>-<kebab-name>` (do not work on the main branch).
- Check the feature's PRD dependencies are implemented (Section 8 of the PRD). If a dependency is missing, stop and report.
- **Verify the contract's prerequisites and CREATE them if missing.** If a test in the contract needs a fixture, a seed record, an image, a tenant, etc., make sure it exists *now* — so that when the `evaluator` runs later, the prerequisites are already in place.

### 2. Stages (execute the plan)

- Execute `plan.md`'s phases/steps in order (Stage 1, Stage 2, …).
- **Separate the work and the tests BY LAYER**, as the feature requires: UI, API, service, worker, CLI. Not every feature touches every layer — cover the ones this feature has.
- Follow the project's skills and rules (architecture patterns, code style, reference examples). Reduce inference: when a convention exists, follow it; do not invent.
- Use TDD where the project uses it (red → green → refactor).

### 3. Final Verification (gates + contract)

- **Run the project's deterministic quality gates (the Harness).** Single entry point if the project has one (`runGates.mjs`); otherwise run the project's gate commands individually.
  - Reference set (Harness Engineering, 6 gates): **TSC** (types), **ESLint** (zero warnings), **Dependency Cruiser** (module boundaries), **Check Architecture** (custom project rules), **Automated Tests** (behaviour), **Knip** (dead code).
- **Run the contract verification.** Follow `contract.md` step by step. When the feature has a UI, drive it with the `playwright-cli` skill and capture screenshots.
- **Gates give concrete feedback — use it.** When a gate fails, read the specific error, fix it, and re-run. Loop until everything is green. Do not declare done with a red gate.
- If you discover a real defect of your own (wrong icon, off colour, broken flow), fix it before finishing — that is expected.

### 4. Track

- Update `PRDProgress.json`: set this feature's `status` to **`"Implemented"`**.

---

## OUTPUT

Report: what was implemented (per layer), the final gate status (all green), the contract items satisfied, and confirm the `PRDProgress.json` update. Then it is ready for the `evaluator`.

---

## Marcaí adaptation (this project)

- **Stack:** Node.js **ESM** backend (Jest + `mongodb-memory-server`), React/Vite frontend (TS migration in progress). The backend is **JavaScript** — there is **no backend TSC gate**.
- **Gates available today:**
  - Backend: `npm run lint` (ESLint — already encodes architectural rules: ADR-022 messaging boundary, ADR-024 admin Gate 4) + `npm test` (Jest).
  - Frontend: `npm run build` (tsc check + Vite) + `npm run lint`.
- **Always honour** `CLAUDE.md` and `.claude/rules/*`: multi-tenant isolation (`tenantId` in every tenant query, cross-tenant → 404), API contract `{ success, data/error }`, ESM `.js` import extensions, no `await` in loops, pagination ≤ 100, Luxon for dates.
- **Gates to add** (Harness method — André's gradual plan, from the Notion "Gates" page): TSC strict (frontend) → zero-warning ESLint → Dependency Cruiser → custom `check-architecture` (`tenantId` mandatory in every Mongo query; personal data only crosses sanctioned layers; Evolution webhook validated in one place) → Knip. Until `runGates.mjs` exists, the gates are `npm run lint` + `npm test`.
