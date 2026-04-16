# Common Pitfalls in E2E Navigation Testing

Known edge cases, tricky scenarios, and practical workarounds that arise during E2E test generation and execution. Organized by category.

---

## Table of Contents

1. [Auth & Session Management](#1-auth--session-management)
2. [Forms & Input Handling](#2-forms--input-handling)
3. [Timing & Async State](#3-timing--async-state)
4. [Server-Rendered Applications](#4-server-rendered-applications)
5. [Environment & Infrastructure](#5-environment--infrastructure)
6. [Data & State Isolation](#6-data--state-isolation)
7. [Framework-Specific Gotchas](#7-framework-specific-gotchas)

---

## 1. Auth & Session Management

### 1.1 Cookie/Session Persistence Between Steps

**Problem:** Browser automation tools may lose session cookies between navigation steps, causing the user to appear logged out mid-test.

**Symptoms:** Test passes login (T03), but the next test (T04 Dashboard) redirects back to login page.

**Workaround:**
- Ensure the browser instance stays open across all steps within a test flow and across dependent flows.
- Do not close and reopen the browser between dependent tests. If the tool requires reopening, re-authenticate first.
- Verify session persistence after login by checking a protected page immediately.

### 1.2 OAuth / External Provider Redirects

**Problem:** Login flows that redirect to external providers (Google, GitHub, Facebook, Apple) cannot be tested in a standard E2E environment — the external login page is outside your control.

**Symptoms:** Clicking "Login with Google" opens a Google login form that the test cannot interact with (captchas, 2FA, domain restrictions).

**Workaround:**
- Check if the project has a **bypass/dev login** route (common in development mode — e.g., `/api/auth/dev-login`, a test-only endpoint that creates a session without OAuth).
- Check for seed users with **credential-based login** (email + password) that can be used instead of OAuth.
- If the only login method is OAuth and there is no bypass, document this in the test-cases Observations section: "Login requires OAuth (Google). E2E login cannot be automated without a dev bypass. All auth-dependent tests are BLOCKED."
- Suggest the user add a dev-only login route for testing purposes.

### 1.3 JWT Token Expiration Mid-Test

**Problem:** Long-running test suites may exceed the JWT access token lifetime (commonly 15 minutes to 1 hour). The token expires mid-test, and subsequent API calls fail with 401.

**Symptoms:** First few tests pass, but later tests suddenly fail with unauthorized errors despite login having passed.

**Workaround:**
- Check the project's JWT configuration for token lifetime (look for `expiresIn`, `maxAge`, `JWT_EXPIRATION` in env/config).
- If the token lifetime is short (< 30 min), note this in Prerequisites: "Token expires in X minutes — re-authenticate if test suite takes longer."
- If a refresh token mechanism exists, ensure the browser automation allows cookie/storage updates.

### 1.4 CORS Issues (Frontend and Backend on Different Ports)

**Problem:** In development, the frontend might run on `localhost:3000` and the API on `localhost:8000`. Browser security blocks cross-origin requests.

**Symptoms:** Navigation works, but API calls fail silently or return CORS errors in console. Forms submit but nothing happens.

**Workaround:**
- Check if the project uses a proxy (Next.js `rewrites`, Vite `proxy`, webpack `devServer.proxy`).
- If no proxy, ensure the backend has CORS configured for the frontend origin in development.
- Document both URLs in Prerequisites if they differ.

### 1.5 Multi-Factor Authentication (MFA/2FA)

**Problem:** If MFA is enabled for test accounts, the login flow requires a TOTP code or SMS code that cannot be automated easily.

**Symptoms:** Login form succeeds but then asks for a verification code that the test cannot provide.

**Workaround:**
- Check if MFA can be disabled for test/seed accounts.
- Look for test-mode MFA bypass (some auth providers accept a fixed code like `000000` in development).
- If MFA cannot be bypassed, document it as a blocker in Observations.

---

## 2. Forms & Input Handling

### 2.1 CSRF Tokens in Server-Rendered Forms

**Problem:** Server-rendered frameworks (Django, Laravel, Rails, Symfony) inject hidden CSRF tokens into forms. If the test submits a form without the proper token, the server rejects it with 403 Forbidden.

**Symptoms:** Form submission returns 403 or "CSRF token missing/invalid" error.

**Workaround:**
- When using browser automation (playwright-cli, Selenium), this is generally NOT a problem — the browser loads the page with the token already embedded in the form, and submitting via click/fill uses it naturally.
- This only becomes an issue if you try to submit forms via direct HTTP requests (curl, fetch) instead of browser interaction.
- If testing via API directly, extract the CSRF token from the page HTML or cookies first.

### 2.2 Rich Text Editors (TinyMCE, Quill, CKEditor, ProseMirror, Tiptap)

**Problem:** Rich text editors render inside iframes or use `contenteditable` divs. Standard `fill` commands don't work because the input is not a regular `<input>` or `<textarea>`.

**Symptoms:** `fill` command does nothing, or types into the wrong element, or the editor shows empty after typing.

**Workaround:**
- Identify the editor type by looking at imports or DOM structure.
- For **iframe-based editors** (TinyMCE, CKEditor classic): switch to the iframe context first, then interact with the `contenteditable` body inside it.
- For **contenteditable-based editors** (Quill, Tiptap, ProseMirror): click on the editor container to focus it, then use keyboard typing (`type` command) instead of `fill`.
- Some editors expose a JavaScript API — use `eval` to set content programmatically: `editor.setContent('test text')`.
- In test steps, document: "Click on the editor area, then type content" rather than "Fill the editor field."

### 2.3 Custom Date/Time Pickers

**Problem:** Custom date pickers (react-datepicker, flatpickr, MUI DatePicker, etc.) don't use native `<input type="date">`. They render custom dropdown calendars that require clicking specific day cells.

**Symptoms:** `fill` command with a date string doesn't work or fills the underlying hidden input but doesn't update the UI.

**Workaround:**
- Try clicking the date input to open the picker, then navigate to the correct month/year, then click the specific day cell.
- Some pickers accept keyboard input — try clearing the field and typing the date in the expected format.
- As a last resort, use `eval` to set the value programmatically and dispatch a change event.
- In test steps, be explicit: "Click date field > Navigate to [month] > Click day [15]" rather than "Enter date 2024-03-15."

### 2.4 Auto-Complete / Typeahead Fields

**Problem:** Search-as-you-type fields fetch suggestions from an API after a debounce delay. Typing the full value and pressing Enter may not work if the dropdown hasn't appeared yet.

**Symptoms:** Field is filled but no suggestion appears, or the wrong suggestion is selected, or the form submits with the raw text instead of the selected option.

**Workaround:**
- Type a few characters (not the full value), then wait for the dropdown to appear (look for the suggestions container to become visible).
- Click the desired suggestion from the dropdown rather than pressing Enter.
- In test steps: "Type 'Joh' in the search field > Wait for suggestions dropdown > Click 'John Doe' from suggestions."

### 2.5 File Upload Fields

**Problem:** File upload inputs (`<input type="file">`) require a real file path on disk. You can't just type a filename.

**Symptoms:** `fill` command does nothing on file inputs. Upload button doesn't respond to click.

**Workaround:**
- Use the browser automation's dedicated file upload command (e.g., `playwright-cli upload ./path/to/file.pdf`).
- Ensure a test file exists at the expected path before the test runs. Create one in Prerequisites if needed.
- For drag-and-drop upload zones, use the tool's drag-and-drop file API if available, or fall back to the hidden file input.
- In test steps: "Upload file `test-data/sample.pdf` to the upload field" and note the file must exist.

### 2.6 Form Validation on Blur (Not on Submit)

**Problem:** Some forms validate fields when the user leaves the field (blur event), not on submit. If the test fills all fields and clicks submit without triggering blur, validation messages may not appear as expected.

**Symptoms:** Test fills a field with invalid data and clicks submit — expects a validation error but the form submits successfully (or vice versa).

**Workaround:**
- After filling each field, click on the next field (or press Tab) to trigger blur validation before asserting validation messages.
- Test both scenarios: field-level validation (on blur) and form-level validation (on submit).

---

## 3. Timing & Async State

### 3.1 Debounced Search Inputs

**Problem:** Search inputs often debounce by 300-500ms. Typing and immediately asserting results will find nothing because the search hasn't fired yet.

**Symptoms:** Search results area is empty or still showing previous results right after typing.

**Workaround:**
- After typing the search query, wait for the results to appear (look for a specific result element or the loading indicator to disappear).
- Do NOT use fixed delays (`sleep 500ms`). Instead, wait for a visible change: results container populates, loading spinner disappears, or a specific text appears.
- In test steps: "Type 'query' in search field > Wait for results to appear > Verify result list contains [expected item]."

### 3.2 Animations and Transitions Delaying Element Visibility

**Problem:** CSS transitions and animations (fade-in, slide-in, modal open) may cause elements to exist in the DOM but not be interactive yet. Clicking during an animation may fail or click the wrong element.

**Symptoms:** Element is found but click does nothing, or click hits an overlay/backdrop instead of the button.

**Workaround:**
- Wait for the element to be fully visible and enabled before interacting.
- For modals: wait for the backdrop animation to complete and the modal content to be visible.
- For toast notifications: they may auto-dismiss — assert them quickly or wait for them specifically.

### 3.3 WebSocket / Real-Time Updates

**Problem:** Features driven by WebSockets (chat, notifications, live updates) don't trigger HTTP requests that browser automation can intercept. The UI updates asynchronously without navigation.

**Symptoms:** Test performs an action that should trigger a real-time update, but the UI doesn't change within the expected timeframe.

**Workaround:**
- After triggering an action, wait for the specific DOM element to update rather than waiting for a network request.
- If testing chat/messaging, allow extra time for WebSocket delivery.
- Document in test steps: "Wait for notification badge to show count [1]" rather than "Verify notification was sent."

### 3.4 Optimistic UI Updates

**Problem:** Some apps update the UI immediately (optimistic update) and then revert if the API call fails. The test may assert success during the brief optimistic window, but the actual operation failed.

**Symptoms:** Test marks a step as passed (item appeared in the list), but seconds later the item disappears and an error toast shows.

**Workaround:**
- After actions that modify data (create, edit, delete), wait a moment and verify the state is stable — check that no error messages appear.
- If the app shows toast/snackbar notifications, verify both: the expected success message appears AND no error message follows.
- For critical flows, verify the data persisted by refreshing the page and checking again.

### 3.5 Loading Spinners / Skeleton Screens

**Problem:** Many apps show loading indicators (spinners, skeleton placeholders, shimmer effects) before the real content renders. Asserting content while loading states are visible will fail.

**Symptoms:** Test looks for a specific text or element but finds the loading skeleton instead.

**Workaround:**
- Wait for the loading indicator to disappear before asserting content.
- Look for the actual content elements rather than asserting absence of the loader (the loader may be hidden but still in the DOM).

---

## 4. Server-Rendered Applications

### 4.1 POST-Redirect-GET (PRG) Pattern

**Problem:** Server-rendered apps typically handle form submissions via POST, then redirect (302) to a GET page. The test must wait for the redirect to complete before asserting the result page.

**Symptoms:** Test submits a form and immediately asserts — but the page hasn't redirected yet, so assertions fail or check the wrong page.

**Workaround:**
- After clicking the submit button, wait for the URL to change to the expected redirect target.
- Alternatively, wait for a specific element on the result page to appear.
- In test steps: "Click submit > Wait for redirect to /items > Verify success message is visible."

### 4.2 Flash Messages (One-Time Display)

**Problem:** Server-rendered frameworks use flash messages (Django `messages`, Rails `flash`, Laravel `session()->flash()`) that appear once after a redirect and disappear on the next page load.

**Symptoms:** Test submits a form, redirect happens, but by the time the test asserts, the flash message has already been consumed by another navigation.

**Workaround:**
- Assert the flash message IMMEDIATELY after the redirect completes, before any other navigation.
- Do not navigate away or refresh before checking the flash message.
- In test steps, make the flash assertion the very first step after redirect: "Wait for redirect > Verify flash message 'Item created successfully' is visible."

### 4.3 Server-Side Session Timeout

**Problem:** Server-side sessions have a configured timeout (often 30 minutes of inactivity). If the test suite takes too long, the session expires even though the browser still has the session cookie.

**Symptoms:** Similar to JWT expiration — later tests fail with redirect to login despite previous login having passed.

**Workaround:**
- Check session timeout configuration (Django `SESSION_COOKIE_AGE`, Laravel `lifetime` in `session.php`, Rails `expire_after`).
- Document in Prerequisites if the timeout is short.
- For long test suites, add a re-authentication step in the dependency tree if needed.

### 4.4 Full Page Reloads Clearing JavaScript State

**Problem:** In server-rendered apps, every navigation is a full page load. Any JavaScript state (variables, event listeners, in-memory data) is lost between pages. This is expected but can confuse tests written with SPA assumptions.

**Symptoms:** Test expects state to persist after navigation (e.g., a selected filter) but the page reloads and state is reset.

**Workaround:**
- Understand that server-rendered apps rely on URL parameters, cookies, or server-side sessions for state persistence — not JavaScript memory.
- Verify state is in the URL (`/items?filter=active`) or persisted server-side after navigation.
- Do not assume client-side state survives page transitions.

---

## 5. Environment & Infrastructure

### 5.1 Port Already in Use

**Problem:** The dev server cannot start because another process (previous test run, another dev server, unrelated service) is already using the port.

**Symptoms:** Server start command fails with "EADDRINUSE" or "Address already in use."

**Workaround:**
- Before starting the server, check if the port is already occupied.
- If the project has health check scripts, use them to detect a running server before starting a new one.
- Kill orphan processes if needed (look for the project's shutdown script).
- Document the start/stop commands in Prerequisites.

### 5.2 Missing Environment Variables or `.env` File

**Problem:** The project requires environment variables (database URL, API keys, auth secrets) that aren't set. The server starts but crashes or behaves incorrectly.

**Symptoms:** Server starts but pages show 500 errors, database connection fails, or auth doesn't work.

**Workaround:**
- Check for `.env.example`, `.env.sample`, or README setup instructions.
- Verify all required env vars are set before starting the server.
- If the project has a setup/init script, run it first.
- Document required env vars in Prerequisites.

### 5.3 Database Not Migrated or Seeded

**Problem:** The database exists but has no tables (migrations not run) or no test data (seeds not run). Pages load but show empty states or errors.

**Symptoms:** Login fails because no users exist. Dashboard shows empty state because no items are seeded. API returns 500 because a table doesn't exist.

**Workaround:**
- Check for migration and seed commands in the project (Prisma, Django, Laravel, Rails, etc.).
- Run migrations and seeds as part of Prerequisites.
- Document the exact commands: "Run `npm run db:migrate` then `npm run db:seed`."

### 5.4 Wrong Node/Python/Ruby/PHP Version

**Problem:** The project requires a specific runtime version. Running with the wrong version causes cryptic errors.

**Symptoms:** Build fails with syntax errors, dependencies can't install, or the server crashes on startup.

**Workaround:**
- Check for version files: `.node-version`, `.nvmrc`, `.python-version`, `.ruby-version`, `Gemfile` (Ruby version constraint), `composer.json` (PHP version constraint).
- Document the required runtime version in Prerequisites.

---

## 6. Data & State Isolation

### 6.1 Unique Constraint Violations from Seed Data

**Problem:** A test tries to create an item with a name/email/slug that already exists in the seed data. The database rejects it with a unique constraint error.

**Symptoms:** "Create item" test fails with "UNIQUE constraint failed" or "duplicate key value violates unique constraint."

**Workaround:**
- Use unique test data that won't collide with seeds — include timestamps or random suffixes in test values (e.g., "Test Item 1709312456" instead of "Test Item").
- In test steps, use clearly unique values: "Fill name with 'E2E Test Item [timestamp]'."
- Alternatively, check if the project has a database reset command that can be run before tests.

### 6.2 Test Data Leaking Between Flows

**Problem:** Test T05 creates an item that T06 needs to edit. But what if T05's item has a dynamic ID? T06 doesn't know which item to select.

**Symptoms:** T06 can't find the item created by T05, or clicks the wrong item.

**Workaround:**
- Design test steps to find items by visible attributes (name, title) rather than by ID or position.
- In T05's steps, use a recognizable name. In T06's steps: "Find item named 'E2E Test Item' in the list > Click it."
- If items are ordered, note the expected position: "Click the first item in the list" — but this is fragile if seed data changes.

### 6.3 Running Tests Multiple Times Without Reset

**Problem:** Running the test suite a second time fails because the first run already created test data. Unique constraints fire, counts don't match, or flows find unexpected items.

**Symptoms:** Tests pass on first run but fail on second run with duplicate errors or wrong counts.

**Workaround:**
- Include a "cleanup" note in Prerequisites: "Reset the database before running tests: `[command]`."
- Or design tests to be idempotent — use unique data each run and clean up after themselves (delete created items in the last test flow).

---

## 7. Framework-Specific Gotchas

### 7.1 Next.js: Server Components vs Client Components

**Problem:** Next.js App Router uses Server Components by default. Interactive elements (onClick, onChange, useState) only work in Client Components. A test may try to interact with an element that doesn't have event handlers because it's rendered as a Server Component.

**Symptoms:** Clicking a button does nothing — no navigation, no state change, no error. The element exists but is inert.

**Workaround:**
- Check if the component has the `"use client"` directive. If not, it's a Server Component and won't have interactive event handlers.
- During discovery (Phase 1), note which components are client vs server to avoid generating test steps for non-interactive server-rendered elements.

### 7.2 Next.js: Middleware Redirects

**Problem:** Next.js middleware can redirect requests before the page even renders. The test navigates to `/dashboard` but gets redirected to `/login` by middleware.

**Symptoms:** Test navigates to a page and the URL changes unexpectedly. Assertions for the original page fail.

**Workaround:**
- Read the middleware file during discovery to understand redirect rules.
- In test steps, account for redirects: "Navigate to /dashboard > Verify URL is /login (redirect expected for unauthenticated users)."

### 7.3 Django: Admin Site vs Application Routes

**Problem:** Django's built-in admin (`/admin/`) uses a completely separate auth system and UI from the main application. Tests may confuse admin login with application login.

**Symptoms:** Test logs into `/admin/` successfully but then can't access the main application, or vice versa.

**Workaround:**
- Treat admin and application as separate test scopes with separate login flows.
- During discovery, clearly distinguish between admin routes and application routes.

### 7.4 Laravel: Middleware Groups

**Problem:** Laravel applies middleware groups (`web`, `api`, `auth`) to route groups. Routes in the `api` group don't have session/CSRF middleware, while `web` routes do. Testing the wrong group with the wrong assumptions leads to failures.

**Symptoms:** API routes work without CSRF but web routes require it. Session doesn't persist on API routes.

**Workaround:**
- During discovery, note which middleware groups apply to which routes.
- For E2E browser testing, focus on `web` routes (browser handles CSRF automatically).

### 7.5 Rails: Turbo/Turbolinks (Hotwire)

**Problem:** Rails 7+ uses Turbo (formerly Turbolinks) for SPA-like navigation within a server-rendered app. Links don't trigger full page reloads — Turbo intercepts them and replaces the page body via AJAX.

**Symptoms:** Test expects a full page load after clicking a link, but the URL changes without a full reload. Timing assertions based on page load events fail.

**Workaround:**
- Treat Turbo-enabled Rails apps as a hybrid — navigation is client-side (like SPA) but rendering is server-side.
- Wait for Turbo to finish replacing content rather than waiting for page load events.
- Look for `data-turbo="false"` on links that opt out of Turbo (these do full reloads).

### 7.6 SPA: Browser Back/Forward Navigation

**Problem:** In SPAs, the browser back/forward buttons use the History API. Some apps don't properly handle history state, leading to broken back navigation or stale UI.

**Symptoms:** Test clicks back button but the UI doesn't update, or shows a stale version of the previous page.

**Workaround:**
- If back/forward navigation is part of the test flow, explicitly test it and note that it may behave differently from link clicks.
- After back navigation, wait for the UI to fully update before asserting.

### 7.7 PHP (Traditional): No Client-Side Routing

**Problem:** Traditional PHP apps (without frameworks or with minimal frameworks) use file-based routing — each `.php` file is a separate page. There are no route definitions to discover; you have to find all `.php` files and understand their purpose.

**Symptoms:** Discovery phase can't find a central route file because there isn't one.

**Workaround:**
- Scan all `.php` files in the web root.
- Look for `<a href="...">` links and `<form action="...">` targets to map the navigation graph.
- Check `.htaccess` or nginx config for URL rewrites that map clean URLs to PHP files.
