---
name: e2e-nav-test
description: >
  Generate and execute E2E test cases for any web application — SPA, server-rendered,
  or hybrid. Analyzes the codebase to discover routes, components, auth flows, forms,
  modals, roles/permissions, and navigation patterns, then produces a structured
  test-cases document with dependency trees and todo checklists. Works with any
  framework: Next.js, React, Vue, Angular, Django, Laravel, Rails, Flask, Go,
  Symfony, Spring, ASP.NET, PHP, and more. Use this skill whenever the user asks to
  "test navigation", "generate e2e tests", "test user flows", "create test cases",
  "run navigation tests", "e2e test plan", "check all flows", "test my app flows",
  "map user journeys", "test my app", or anything related to end-to-end flow testing.
  Also trigger when the user mentions "test-cases.md", "flow coverage", or
  "navigation coverage". Even if they just say "test my app" or "run e2e",
  this skill is likely what they need.
---

# E2E Test Case Generator

Analyze a web application codebase (SPA, server-rendered, or hybrid), generate a structured test plan with dependency awareness, and optionally execute the tests using browser automation.

---

## Phase 1: Codebase Discovery

Before generating any test cases, build a mental model of the entire application.

### Step 1: Detect the framework

Identify what framework and routing system the project uses. The application may be a SPA (single-page app), a server-rendered app with templates, or a hybrid. Look for telltale signs below, then **read `references/framework-discovery.md`** for the detected framework's full checklist — it tells you exactly where to find routes, auth config, templates, roles, and navigation patterns for that specific framework.

**JavaScript SPA frameworks:**
- **Next.js App Router**: `app/` directory with `page.tsx`, `layout.tsx`, route groups `(name)/`
- **Next.js Pages Router**: `pages/` directory
- **React Router**: imports from `react-router-dom`, `<Route>` components
- **Vue Router**: `router/index.ts`, `<router-view>`
- **SvelteKit**: `src/routes/` with `+page.svelte`
- **Angular**: `app-routing.module.ts`, `RouterModule`
- **Nuxt**: `pages/` directory with `.vue` files
- **Astro**: `src/pages/` directory
- **Remix**: `app/` directory with `route.ts` files

**Server-rendered / template-based frameworks:**
- **Django**: `urls.py` route definitions, `templates/` directory with `.html` files, Jinja2/Django template syntax (`{% block %}`, `{{ var }}`)
- **Laravel**: `routes/web.php`, `resources/views/` with `.blade.php` templates
- **Rails**: `config/routes.rb`, `app/views/` with `.erb` or `.haml` templates
- **Go (html/template)**: `*.go` files with `http.HandleFunc`, `templates/` with `.html` or `.tmpl` files
- **Symfony/Twig**: `config/routes.yaml` or annotations, `templates/` with `.html.twig` files
- **Flask**: `@app.route()` decorators, `templates/` with Jinja2 `.html` files
- **Express + templates**: `app.get()` / `router.get()` routes, `views/` with `.ejs`, `.pug`, `.hbs` templates
- **Spring MVC**: `@Controller` + `@RequestMapping`, `src/main/resources/templates/` with Thymeleaf `.html`
- **PHP (plain)**: `.php` files with direct routing or `index.php` entry point
- **ASP.NET MVC/Razor**: `Controllers/`, `.cshtml` Razor views

**Static / no framework:**
- **Plain HTML**: `.html` files with anchor tags, no framework
- **Generic**: no recognizable framework — analyze file structure and infer routing from links, forms, and navigation elements

For **server-rendered apps**, navigation happens via full page loads (not client-side routing). This means:
- Every link click triggers a new HTTP request
- Forms submit via POST and redirect (PRG pattern)
- There is no client-side router state to track
- Routes are defined in backend code, not frontend components
- Test steps should expect full page reloads after navigation actions

Also identify:
- **Auth system**: NextAuth, Clerk, Auth0, Firebase Auth, Django auth, Laravel Sanctum/Breeze, Devise, custom JWT, session-based, or any other
- **UI library**: Headless UI, Radix, shadcn, MUI, Chakra, Bootstrap, Tailwind, plain HTML/CSS, or any other
- **State management**: Context, Redux, Zustand, Pinia, Vuex, server-side sessions, or any other

Report findings to the user before proceeding.

### Step 2: Map all routes and entry points

Read the routing structure and build a complete route map:

- All page routes (static and dynamic)
- Route groups and layouts (shared navigation elements)
- Protected vs public routes
- Redirect rules (middleware, guards, route configs)
- API routes that affect navigation (login endpoints, redirects)

### Step 3: Map in-page flows

For each route, identify interactive flows:

- **Forms**: registration, login, search, CRUD operations, settings
- **Modals/Dialogs**: confirmation dialogs, create/edit forms, detail views
- **Navigation elements**: sidebar, top bar, breadcrumbs, tabs, menus
- **State-driven UI**: loading states, empty states, error states, conditional rendering
- **Drag and drop**: reordering, moving items between containers
- **Bulk operations**: select-all, batch delete, batch move

### Step 4: Identify auth, roles, and permissions

Perform a thorough investigation of user roles and permissions. Roles are often defined in multiple places — check all of them:

**Database layer:**
- Read the schema (Prisma, migrations, SQL files) for role/permission columns, enums, or join tables
- Check seed files for different user types and their role assignments
- Look for permission tables, RBAC (role-based access control) tables, or policy tables

**Application layer:**
- Auth middleware, guards, or route protection that checks roles
- Role checks in components (conditional rendering: `if (user.role === 'admin')`, `{isAdmin && ...}`)
- API route handlers that verify permissions before executing actions
- Constants or enums that define available roles (e.g., `UserRole.ADMIN`, `ROLES = [...]`)

**Configuration layer:**
- Environment variables that define default roles
- Config files with permission matrices
- Feature flags tied to roles

Build a **role matrix** listing every role and which features it can access:

```
| Feature           | admin | user | guest |
|-------------------|-------|------|-------|
| View dashboard    |  yes  | yes  |  no   |
| Create items      |  yes  | yes  |  no   |
| Delete any item   |  yes  |  no  |  no   |
| Access admin panel|  yes  |  no  |  no   |
```

Present this matrix to the user and ask:
- "I found these roles: [list]. Which roles should I generate test cases for? All of them, or specific ones?"

**If multiple roles are selected**, generate a separate test-cases file per role:
- `docs/test-cases-e2e-admin.md`
- `docs/test-cases-e2e-user.md`
- `docs/test-cases-e2e-guest.md`

(Or use the default `docs/test-cases-e2e.md` if there is only one role or the app has no role system.)

Each role's file should include:
- **Role-specific flows**: features unique to that role
- **Shared flows**: common features tested from that role's perspective (no need to re-detail steps if behavior is identical — reference the other file)
- **Access denial tests**: verify the role CANNOT access features reserved for higher roles (e.g., regular user tries to access `/admin` and gets redirected or sees 403)

**If only one role exists** (or no role system at all), proceed with a single file and skip the role selection question.

---

## Phase 2: Build the Dependency Tree

This is the most critical phase. Every test flow has prerequisites. Model them explicitly.

### Dependency rules

1. **A flow depends on another if it cannot be tested without that flow succeeding first.** Example: "Create a prompt" depends on "Login" because you must be authenticated.

2. **If a dependency fails, all flows that depend on it are automatically BLOCKED.** Document this clearly. Example: if Login fails, everything behind auth is BLOCKED.

3. **Independent flows run regardless of other failures.** Example: "Visit landing page" and "Visit signup page" are independent of each other.

4. **Avoid redundant testing.** If Login was already verified as a dependency, subsequent flows that need auth should note "Requires: Login (tested in T01)" but NOT re-test the login steps. They start from an already-authenticated state.

5. **Chain dependencies, don't repeat them.** If "Edit prompt" depends on "Create prompt" which depends on "Login", then "Edit prompt" lists only "Create prompt" as its direct dependency. The transitive dependency on Login is implicit.

### Dependency tree format

Build the tree as a visual hierarchy that shows parent-child relationships at a glance. Use ASCII tree connectors (`├─`, `└─`, `│`) to convey structure. Every test gets a short ID (T01, T02, ...) for easy referencing.

```
T01 Landing Page
 ├─ T02 Signup
 └─ T03 Login
     └─ T04 Dashboard
         ├─ T05 Create Item
         │   ├─ T06 Edit Item
         │   └─ T07 Delete Item
         ├─ T08 Search
         └─ T09 Theme Toggle
 └─ T10 Logout
```

Root nodes (T01) have no dependencies. A child can only execute if its parent passed. Siblings are independent of each other — if T06 fails, T07 still runs. Note that Search (T08) depends on Dashboard (T04), not on Create Item (T05) — place each test under its actual dependency, not under an unrelated sibling.

---

## Phase 3: Generate Test Cases Document

### Output path

- **Single role or no roles**: `docs/test-cases-e2e.md`
- **Multiple roles**: one file per role — `docs/test-cases-e2e-<role>.md` (e.g., `docs/test-cases-e2e-admin.md`, `docs/test-cases-e2e-user.md`)

Ask the user to confirm: "I'll save the test cases to `docs/test-cases-e2e.md` (or per-role files if multiple roles). Want a different location?"

### Document structure

Use this exact structure:

The document must be fully self-contained — anyone reading it should have everything they need to execute the tests without looking elsewhere.

````markdown
# E2E Navigation Test Cases [— Role: <role_name>]

> Auto-generated by e2e-nav-test skill
> Framework: [detected framework]
> Generated: [date]
> Role: [role name, or "Single role / No roles" if not applicable]

End-to-end acceptance tests for [app description].
Tests are ordered by dependency — if a test fails, all dependent tests are automatically **BLOCKED**.

## Prerequisites

- **Start server**: [command discovered from project — e.g., `npm run dev`, `./scripts/init.sh`]
- **Base URL**: `http://localhost:[port]`
- **Test user for this role**: **[email]** / **[password]** (role: [role_name])
- **Screenshots on failure**: saved to `screenshots/` subfolder next to this file
- **Browser mode**: headless

## Detected Stack

- **Framework**: [e.g., Next.js 16 App Router]
- **Auth**: [e.g., NextAuth v5]
- **UI Library**: [e.g., Headless UI, Tailwind CSS]
- **Roles detected**: [list all roles found, or "None"]
- **Routes discovered**: [count]

## Role Matrix

[Include only if multiple roles exist. Shows which features each role can access.]

| Feature           | admin | user | guest |
|-------------------|-------|------|-------|
| View dashboard    |  yes  | yes  |  no   |
| Create items      |  yes  | yes  |  no   |
| Delete any item   |  yes  |  no  |  no   |

[Omit this section entirely for single-role or no-role apps.]

---

## Dependency Tree

```
T01 Landing Page
 ├─ T02 Signup
 └─ T03 Login
     └─ T04 Dashboard
         ├─ T05 Create Item
         │   ├─ T06 Edit Item
         │   └─ T07 Delete Item
         └─ T08 Search
 └─ T09 Logout
```

If a parent test fails, all its children are automatically **BLOCKED** and skipped.

---

## Test Flows

### T01: [Flow Name]

**Dependencies**: None
**Blocks**: T02, T03 (list all direct children)

- [ ] Navigate to /path
- [ ] Verify [element] is visible
- [ ] Perform [action]
- [ ] Verify [expected outcome]

---

### Access Denial Tests

[Include only in multi-role files. Test that this role CANNOT access features reserved for other roles. Use the same T-numbering sequence — just continue after the last regular flow.]

### T10: [Feature] — Access Denied

- [ ] Navigate to [restricted path]
- [ ] Verify redirect to login/home OR 403 error is shown
- [ ] Verify restricted content is NOT visible

---

[Repeat for each flow...]

---

## Observations

[Filled after execution. Empty during generation.]

### Failed Tests

#### T05: Create Item — FAILED at step 3
- **Error**: [concrete error message]
- **Impact**: T06, T07 were BLOCKED
- **Screenshot**: screenshots/t05-create-item-step3.png

### Blocked Tests

| Test | Reason |
|------|--------|
| T06 Edit Item | Parent T05 failed |
| T07 Delete Item | Parent T05 failed |

### Summary

- Total: X
- Passed: X
- Failed: X
- Blocked: X
````

### Writing good test steps

Each step must be concrete and actionable:

- **Navigate to** a specific URL path
- **Verify** a specific element is visible, has text, or has a state
- **Click/Fill/Select** specific elements by their role or visible text
- **Wait for** navigation, loading states, or animations to complete
- **Verify the outcome**: URL changed, element appeared/disappeared, toast message shown

Avoid vague steps like "check the page works" or "verify functionality". Every step should be binary: it either passes or fails.

### Granularity

Each flow should have 3-8 steps. If a flow needs more than 8 steps, split it into sub-flows.

Steps within a flow are sequential. If step 3 fails, steps 4+ in that flow are not executed.

---

## Phase 4: Execute Tests (Optional)

After generating the document, ask the user: "Test cases are ready. Would you like me to execute them now using browser automation?"

If yes:

### Execution rules

1. **Read the Prerequisites section** from the generated test-cases document — it already contains the start command, base URL, and test credentials (discovered during Phase 1). If executing in the same session that generated the document, these values are already known. If executing later, read them from the document.

2. **Ensure the server is running** before any test. If the project has a startup script, use it. If not, run the dev server command discovered above.

3. **Use available browser automation** (playwright-cli or whatever tool is available) in headless mode.

4. **Follow the dependency tree order** — execute root tests first, then their children.

5. **On dependency failure**: mark all child tests as BLOCKED, do not attempt them.

6. **On independent failure**: continue with the next independent test.

7. **Take a screenshot on failure.** Save screenshots in a `screenshots/` subfolder next to the test-cases document. Name the file after the failing test: `screenshots/t05-create-item-step3.png`. Never save screenshots in the project root.

8. **After each navigation**: check browser console for errors — any compilation or runtime error means FAILURE for that step.

### Updating the document after execution

Mark each step with its result:

- `[x]` — passed
- `[ ]` — not executed yet
- `[FAIL]` — failed (add brief reason inline)
- `[BLOCKED]` — skipped because a parent dependency failed

### Observations section

After execution, fill in the Observations section at the bottom of the document using the format shown in the document template above (Failed Tests, Blocked Tests table, Summary counts).

---

## Principles

- **Discover before assuming.** Read actual code, not just file names. A route might exist but redirect. A form might be disabled. An auth check might be client-side only.
- **Respect the dependency tree.** Never execute a flow if its dependency failed. This avoids cascading false failures that obscure the real problem.
- **No redundant login steps.** If login was tested and passed in T01, subsequent flows start from an authenticated browser session. Do not repeat login steps — just note the dependency.
- **Be framework-aware but not framework-dependent.** The discovery phase adapts to the framework, but the output format and execution logic stay the same regardless of stack.
- **Binary outcomes only.** Every step passes or fails. "Partially works" is a failure with a note.

---

## Reference Files

### `references/framework-discovery.md` — Framework Discovery Checklists

Read the section for the detected framework **immediately after Step 1** (Detect the framework). It provides a detailed checklist of where to find routes, auth, templates, roles, forms, and state management for 18 frameworks. Examples of when to read:

- Detected **Django** — read Section 7 to find all `urls.py` files, `@login_required` decorators, template directories, `auth_group`/`auth_permission` tables
- Detected **Laravel** — read Section 8 to find `routes/web.php` vs `routes/api.php`, Blade templates, Spatie permissions, middleware groups
- Detected **Rails** — read Section 9 to find `config/routes.rb`, Devise auth, Turbo/Hotwire behavior, Pundit policies
- Detected **Next.js App Router** — read Section 1 to find middleware redirects, Server Components vs Client Components, Server Actions
- Detected **traditional PHP** — read Section 16 to scan `.php` files, `.htaccess` rewrites, session-based auth

### `references/common-pitfalls.md` — Common Pitfalls

Read when you encounter specific problems during test generation or execution:

**During Phase 1 (Discovery):**
- The app uses OAuth/external login providers (Google, GitHub) — read Section 1.2 for workarounds
- The app is built with Django, Laravel, Rails, or another server-rendered framework — read Section 4 (Server-Rendered Applications) and Section 7 (Framework-Specific Gotchas)
- The app uses rich text editors (TinyMCE, Quill, CKEditor) — read Section 2.2 for interaction strategies
- The app has custom date pickers, auto-complete fields, or file uploads — read Section 2.3-2.5

**During Phase 2 (Dependency Tree):**
- Test data may collide with seed data (unique constraints) — read Section 6.1
- Tests create data that later tests depend on (dynamic IDs) — read Section 6.2

**During Phase 3 (Generating Test Steps):**
- Forms have CSRF tokens (Django, Laravel, Rails, etc) — read Section 2.1
- Search inputs are debounced — read Section 3.1
- Modals/dialogs have animations that delay interaction — read Section 3.2
- The app uses WebSockets or real-time updates — read Section 3.3

**During Phase 4 (Execution):**
- Login works but later tests get 401/redirect to login — read Section 1.1 (session persistence) and Section 1.3 (JWT expiration)
- Server won't start (port in use, missing env vars) — read Section 5
- Tests pass on first run but fail on second run — read Section 6.3
- Form submission does nothing or returns 403 — read Section 2.1 (CSRF) and Section 4.1 (PRG pattern)
- Flash/toast messages are missed — read Section 4.2
- MFA blocks automated login — read Section 1.5
