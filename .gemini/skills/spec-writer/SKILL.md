---
name: spec-writer
description: Generates technical implementation spec and plan for one or more features based on PRD, codebase analysis, and iterative clarification. Supports batch mode for generating multiple features from the same wave in parallel.
---

# Feature Specs Writer

Generate implementation-ready technical specifications based on the project's PRD and existing codebase patterns. The skill has two modes:

- **Single-feature mode (default):** operates on one feature at a time, identified by its PRD feature ID (F01, F02...), with an interactive interview (Steps 1–6 below).
- **Batch mode:** operates on multiple features from the same wave in parallel, auto-accepting all interview recommendations. Activated automatically when the input contains multiple IDs, a wave reference, or a mix. See the **Batch Mode** section near the end of this file.

**Output:** TWO files are required:
1. `spec.md` – Technical specification (7 sections)
2. `plan.md` – Implementation plan (phases and steps)

**Output location:** `docs/<feature-id>-<kebab-name>/spec.md` and `docs/<feature-id>-<kebab-name>/plan.md`

---

## Execution Steps (6 Steps)

Note: These are internal agent execution steps. The OUTPUT plan document will have 1-5 phases based on feature complexity.

---

### Step 1: Resolve Input and Pre-Analysis

#### 1.1: Identify the PRD and the target feature

Accept free-form input from the user. The user may reference the feature by ID (`F03`), by name (`Video Upload`), by path (`docs/PRD.md/F03`), or any combination. Resolve the reference:

- Locate the PRD file from the user's reference or look for `docs/PRD.md`, `PRD.md`, or similar conventional locations. If multiple plausible PRDs exist, ask the user which one.
- Identify the target feature within the PRD by ID or name.
- If the input is ambiguous (e.g., "upload" matches multiple features), confirm with the user before proceeding.
- If the referenced feature does not exist in the PRD, list available features from Section 8 and ask the user to clarify.

#### 1.2: Check dependency readiness and Foundation features (greenfield)

Read the PRD's Section 8 (Dependency Graph). For every feature in the target feature's `Dependencies` column, check whether it appears to be implemented in the codebase (source files exist matching the feature's scope). If any dependency is not yet implemented, warn the user: "F depends on F (not yet implemented). Continue anyway?" Proceed only if confirmed.

If the PRD contains a **Foundation Features** subsection in Section 8, apply these additional checks based on the implementation state of each Foundation feature:

- **Foundation state detection (the correct greenfield signal):** for each feature listed in Foundation Features, check whether it appears implemented in the codebase by looking for one or more characteristic output files that the feature is supposed to create — for example, an ORM schema or migration file for a database Foundation, a session/middleware module for an auth Foundation, a root layout/template file for a layout Foundation, or any equivalent artifact in the stack being used (web framework, backend service, mobile app, etc.). Do NOT rely on the mere presence of generic project markers such as a source folder or a package/manifest file — any scaffolding tool (`create-next-app`, `rails new`, `django-admin startproject`, etc.) already creates those, yet the PRD's Foundation features may still be unimplemented.
- **Scenario 1 — greenfield + target feature IS a Foundation feature:** proceed without extra warning. This is the expected path for a greenfield project.
- **Scenario 2 — greenfield + target feature is NOT in Foundation Features:** warn the user: "This appears to be a greenfield project (no Foundation feature is implemented yet). F is not a Foundation feature. Foundation features (F...) set up the shared infrastructure and should be implemented first. Recommend starting with F. Continue with F anyway?" Proceed only if confirmed.
- **Scenario 3 — Partial Foundation (some Foundation features implemented, others pending) and target is not one of the remaining Foundations:** list the pending Foundation features and warn: "Foundation features F, F... are not yet implemented. Implementing F before these may create file conflicts in the scaffolding. Continue anyway?" Proceed only if confirmed.
- **Foundation complete (mature codebase for Foundation purposes):** skip all Foundation-specific checks. The normal dependency readiness check above is enough.

#### 1.3: Codebase Pattern Discovery (two layers)

> Explore the codebase before writing the spec (before the interview in single-feature mode; before applying the Auto-Accept Policy in Batch Mode) to extract patterns. This is mandatory whenever the codebase is non-empty — do not wait for the user to provide paths.

**Layer 1 — Baseline (floor, not ceiling):** at minimum, extract observable patterns in these categories. Examples are illustrative across multiple stacks — the categories are the stack-agnostic intent.

- Runtime and language (any — Node, Python, Ruby, Go, Java, .NET, Rust, PHP, etc.)
- Framework and project layout (any — Next.js/Remix, Django/Flask/FastAPI, Rails, Spring, Phoenix, etc.)
- Database and data access (any — Postgres/MySQL/Mongo/SQLite; Prisma/SQLAlchemy/ActiveRecord/GORM/Entity Framework; raw SQL)
- Authentication strategy and library
- API or entry-point style (REST, GraphQL, RPC, CLI, job queue, event handler — whatever the project uses) and response/error format
- Validation approach (typed schemas, runtime validators, manual checks — whatever the codebase prefers)
- Testing framework and style (unit and integration)
- Error handling (exceptions, Result types, error codes, panic/recover, etc.)
- Folder structure and naming conventions

**Layer 2 — Broad exploration (also mandatory):** beyond the baseline, capture any additional pattern you observe that could inform implementation — architectural decisions, codebase idioms, recurring abstractions, logging/observability, config management, deploy conventions, internationalization, accessibility, anything. Do not restrict yourself to the baseline list. A thorough report in a medium project typically has 8-15 patterns.

#### 1.4: Empty codebase handling

> If the codebase is empty or only has scaffolding (e.g., only `package.json` with defaults, no `src/` implementation yet), skip Layer 1/Layer 2 discovery and instead plan to ask transversal stack questions inline during Step 2 (these questions will only be asked once — on the first feature. Subsequent features will find the answers in the codebase).

**Batch Mode note:** In Batch Mode there is no Step 2 interview. Apply the "Empty codebase bootstrap" row of the Auto-Accept Policy: fall back to industry best practices for the detected stack (or for the scaffolding that exists, if any), and document every bootstrap choice explicitly under the spec's Assumptions/Decisions section.

#### 1.5: Read the PRD feature data

Extract the target feature's full definition from the PRD and load it as context for the spec (used by the interview in single-feature mode, and by the Auto-Accept Policy in Batch Mode):

- Feature name and ID
- Consumes block (if present)
- Provides block (if present)
- Core Scope block (if present)
- Full Scope additions block (if present)
- Capabilities
- Experience
- Error Handling (if present)
- Section 9 per-feature acceptance criteria
- Section 9 Cross-Feature Integration criteria that reference this feature (either as the consumer or the provider)

#### 1.6: Present understanding to the user

```
Based on my analysis, I understand you want to implement:

**Feature:** F<ID>. <Name>
**Technical Summary:** [1–2 sentences derived from PRD Capabilities + Experience]
**Observed codebase patterns:** [summary of Layer 1 + Layer 2 findings, or "empty codebase — will bootstrap"]
**PRD context loaded:** Consumes, Provides, Core Scope, Full Scope, Capabilities, Experience, Error Handling, acceptance criteria

I need to clarify some technical decisions that the PRD and codebase don't already answer.
```

**Batch Mode note:** Sub-agents skip this step — there is no interactive user to present to. The orchestrator's consolidated plan (B.4) covers shared understanding for the batch.

---

### Step 2: Interview

> **Batch Mode override:** In Batch Mode, this entire step is replaced by the Auto-Accept Policy (see Batch Mode section). Sub-agents skip Step 2 and proceed directly to Step 3 with the Auto-Accept defaults applied. Every "ask the user" instruction below becomes "apply the Auto-Accept default and document the choice in the spec's assumptions".

Interview the user relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase or reading the PRD, explore or read instead of asking.

**Scope question (ask first, when applicable):** If the feature has both `Core Scope` and `Full Scope additions` blocks in the PRD, ask: "Should the spec cover Core Scope only, or Core + Full Scope additions?". If only one of the blocks is present, or neither is present, skip this question and assume the full feature scope.

**Anti-redundancy rule:** Do NOT ask about anything already observable in:

- The PRD's feature definition (Consumes, Provides, Core Scope, Capabilities, Experience, Error Handling)
- The PRD's acceptance criteria for this feature
- The codebase patterns discovered in Step 1.3
- A previously generated `spec.md` or `plan.md` for another feature in the same project (when those exist and are relevant)

> Focus the interview on decisions the PRD and codebase **do not** already answer: internal architecture, database schema details (columns, indexes, constraints), endpoint signatures, validation rules not specified in Capabilities, naming of new files, choice between libraries when patterns aren't established, edge cases not covered by Error Handling.

**Partial PRD specifications:** When the PRD mentions a capability but omits a specific detail (e.g., "chunked upload" without chunk size), ask for the missing detail rather than assuming a default.

**Empty codebase bootstrap:** If Step 1.4 flagged empty codebase, ask transversal stack questions inline during this step (framework, ORM, auth, API style, validation, testing, error handling, folder structure). Once the first feature is implemented, the codebase becomes the reference for subsequent features.

---

### Step 3: Summary and Assumptions

After receiving answers:

- Summarize technical decisions made
- List assumptions derived from PRD, codebase patterns, and interview answers
- Explicitly note which PRD blocks informed which parts of the spec (traceability)

**Batch Mode note:** In Batch Mode there are no interview answers. Treat each Auto-Accept default that was applied as if it were an interview answer — list it under assumptions, name the policy row that produced it, and flag it so the user can review and override later. Traceability to PRD blocks works the same way as in single-feature mode.

---

### Step 4: Generate Documents

**Announce:** "Generating TWO documents: SPEC and PLAN..."

**Scaling guidance by complexity:**

- trivial: 1-2 phases, 2-4 steps
- simple: 2-3 phases, 5-8 steps
- medium: 3-4 phases, 10-15 steps
- complex: 4-5 phases, 15-25 steps

Note: SPEC document depth (schemas, indexes, migrations) scales with complexity. PLAN steps are always high-level regardless of complexity.

#### 4.1: Generate SPEC:

- Scale sections based on COMPLEXITY_LEVEL:
  - trivial/simple: Skip API Contracts and Data Model if not applicable
  - medium/complex: All 7 sections required
- Scale depth within sections based on complexity
- Include JSON examples, SQL migrations, test specifications
- If `FEATURE_CROSS_CUTTING` exists: Include integrated cross-cutting concerns in the Scope section:

```
**Included:**
- Core feature functionality
- Integrated from cross-cutting concerns:
```

**PRD → SPEC mapping (apply consistently across all specs):**

| PRD block | Spec.md destination |
|-----------|-------------------|
| Consumes | Scope (input contracts) + API Contracts (when the input arrives via API) |
| Provides | Scope (output contracts) + API Contracts (when the output is exposed via API) |
| Core Scope | Scope → "Included" |
| Full Scope additions | Scope → "Deferred" (when user picked Core only) or "Included" (when user picked Core + Full) |
| Capabilities | Requirements / Business Rules |
| Experience | Requirements / UX Flows |
| Error Handling | Error Handling section |
| Section 9 per-feature acceptance criteria | Testing Strategy → acceptance tests |
| Section 9 Cross-Feature Integration criteria (referencing this feature) | Testing Strategy → integration tests |

#### 4.2: Generate PLAN:

- Prerequisites section
- Phases with numbered steps (1-3 sentences each, high-level)
- Describe WHAT to do, reference spec for HOW

> Use the following template to generate the files: `references/feature-template.md`

**Announce:** "Both documents ready. Proceeding to save..."

---

### Step 5: Validate and Save

**Validate before saving:**

SPEC document:

- [ ] Required sections present (all 7 for medium/complex, skip API/DB if N/A for trivial/simple)
- [ ] Component overview has complete file paths
- [ ] API contracts have JSON examples (if included)
- [ ] Data model has column types, indexes, constraints (if included)
- [ ] Testing strategy has specific test functions
- [ ] PRD blocks mapped correctly per the PRD → SPEC table
- [ ] Consumes/Provides from PRD are reflected in Scope or API Contracts
- [ ] Cross-Feature Integration criteria from PRD Section 9 that reference this feature appear as integration tests

PLAN document:

- [ ] Numbered steps across phases
- [ ] Format: **N. Component** - High-level paragraph (1-3 sentences)
- [ ] Steps describe WHAT, not HOW (spec has details)

**Save both files to `docs/<feature-id>-<kebab-name>/spec.md` and `docs/<feature-id>-<kebab-name>/plan.md`. Create the folder if it doesn't exist. Verify both files with the Read tool.**

---

### Step 6: Output Result

Inform the path of the spec and plan files, the complexity level of the feature, and how many phases are in the plan.

---

## Batch Mode

Generate specs for multiple features of the same wave in parallel, auto-accepting all interview recommendations. Activated automatically when the input contains multiple feature IDs, a wave reference (e.g., "Wave 3"), or a mix.

### B.1: Activation and Orchestration

The orchestrator agent:

1. Reads the PRD's Section 8 to identify all features in the referenced wave
2. Confirms the feature list with the user before proceeding: "I will generate specs for: F01, F02, F03. Continue?"
3. Runs Steps 1.1–1.3 (codebase pattern discovery) once and shares results with all sub-agents
4. Spawns one sub-agent per feature — each runs Steps 1.4, 1.5, 3, 4, 5, 6 independently (Step 2 is skipped)

### B.2: Auto-Accept Policy

Sub-agents replace Step 2 with this policy. For each decision the interview would normally ask:

| Decision area | Auto-Accept default |
|---------------|-------------------|
| Scope (Core vs Full) | Core Scope only, if both blocks exist; full feature otherwise |
| Database schema details | Infer from PRD Capabilities + existing codebase patterns |
| Endpoint signatures | Follow existing API patterns in the codebase |
| Validation rules | Follow existing validation patterns in the codebase |
| File naming | Follow existing naming conventions in the codebase |
| Library choice | Use already-established libraries in the codebase |
| Edge cases | Apply industry best practices for the detected stack |
| Empty codebase bootstrap | Industry best practices for the detected stack; document every choice explicitly |

Every applied default must be listed in the spec's Assumptions/Decisions section with the label `[Auto-Accept]` so the user can review and override.

### B.3: Sub-agent execution

Each sub-agent:

- Skips Steps 1.1–1.3 (done by orchestrator) and Step 2 (replaced by Auto-Accept Policy)
- Runs Step 1.4 (empty codebase check), Step 1.5 (load PRD feature data), Step 3 (assumptions), Step 4 (generate docs), Step 5 (validate and save), Step 6 (output result)
- Documents every Auto-Accept decision in the spec's assumptions section
- Flags all assumptions with `[Auto-Accept]` for easy user review

### B.4: Orchestrator consolidation

After all sub-agents complete, the orchestrator:

1. Summarizes all generated files with their paths
2. Lists all `[Auto-Accept]` decisions across all specs for the user to review
3. Informs the user which decisions may need manual review or override
