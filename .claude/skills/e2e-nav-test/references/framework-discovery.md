# Framework Discovery Checklists

Where to find routes, auth, templates, and navigation patterns for each framework. Use this as a checklist during Phase 1 (Codebase Discovery) after detecting the framework. Read only the section for the detected framework.

---

## Table of Contents

1. [Next.js (App Router)](#1-nextjs-app-router)
2. [Next.js (Pages Router)](#2-nextjs-pages-router)
3. [React (CRA / Vite + React Router)](#3-react-cra--vite--react-router)
4. [Vue / Nuxt](#4-vue--nuxt)
5. [SvelteKit](#5-sveltekit)
6. [Angular](#6-angular)
7. [Django](#7-django)
8. [Laravel](#8-laravel)
9. [Ruby on Rails](#9-ruby-on-rails)
10. [Flask](#10-flask)
11. [Express.js (with templates)](#11-expressjs-with-templates)
12. [Go (net/http + templates)](#12-go-nethttp--templates)
13. [Symfony / Twig](#13-symfony--twig)
14. [Spring Boot MVC](#14-spring-boot-mvc)
15. [ASP.NET MVC / Razor Pages](#15-aspnet-mvc--razor-pages)
16. [PHP (Traditional / No Framework)](#16-php-traditional--no-framework)
17. [Remix](#17-remix)
18. [Astro](#18-astro)

---

## 1. Next.js (App Router)

### Routes
- `app/` directory — each `page.tsx` is a route
- Route groups: `app/(group)/` — parentheses in folder names group routes without affecting URL
- Dynamic segments: `app/[slug]/page.tsx`, `app/[...catch]/page.tsx`
- Parallel routes: `app/@modal/`, `app/@sidebar/`
- Intercepting routes: `app/(.)photo/`, `app/(..)settings/`
- `app/not-found.tsx` — custom 404 page
- `app/error.tsx` — error boundary per route segment

### Layouts & Navigation
- `app/layout.tsx` — root layout (wraps everything)
- `app/(group)/layout.tsx` — group-specific layouts
- `app/loading.tsx` — loading UI per segment
- `app/template.tsx` — re-renders on navigation (unlike layout)
- Look for `<Link>` imports from `next/link`
- Look for `useRouter()` from `next/navigation` for programmatic navigation
- Look for `redirect()` from `next/navigation` in server components/actions

### Auth & Middleware
- `middleware.ts` (or `.js`) at project root — intercepts ALL requests, common for auth redirects
- Check `matcher` config inside middleware to see which routes are protected
- NextAuth: `app/api/auth/[...nextauth]/route.ts` or `auth.ts` at root
- Clerk: `middleware.ts` with `clerkMiddleware()`
- Look for `auth()` or `getServerSession()` calls in server components and route handlers

### API Routes
- `app/api/*/route.ts` — each exports HTTP methods (`GET`, `POST`, `PUT`, `DELETE`)
- Server Actions: `"use server"` directive in functions — these handle form submissions without API routes

### Forms & Interactivity
- Components with `"use client"` are interactive (have event handlers, state)
- Server Components (default) are NOT interactive — no onClick, no useState
- Server Actions can be used in `<form action={serverAction}>` even in Server Components
- Check for `useFormState`, `useFormStatus`, `useActionState` hooks

### State Management
- React Context: look for `createContext` and `<Provider>` wrappers
- Zustand/Redux: look for store files, `useStore` hooks
- URL state: `useSearchParams()`, `usePathname()`

---

## 2. Next.js (Pages Router)

### Routes
- `pages/` directory — each file is a route (`pages/about.tsx` = `/about`)
- Dynamic: `pages/[id].tsx`, `pages/[...slug].tsx`
- `pages/_app.tsx` — wraps all pages (like root layout)
- `pages/_document.tsx` — custom HTML document
- `pages/404.tsx` — custom 404
- `pages/500.tsx` — custom 500

### Auth & Middleware
- `middleware.ts` at project root (same as App Router)
- NextAuth: `pages/api/auth/[...nextauth].ts`
- `getServerSideProps` — runs on every request, often checks auth
- `getStaticProps` — runs at build time (no auth checks)

### API Routes
- `pages/api/*.ts` — each file is an API endpoint

---

## 3. React (CRA / Vite + React Router)

### Routes
- Look for `react-router-dom` imports
- Route definitions: `<Route path="/about" element={<About />} />`
- Check `createBrowserRouter` or `<BrowserRouter>` setup
- Routes may be in a dedicated file (`routes.tsx`, `App.tsx`, `router.ts`)
- Nested routes: `<Route>` inside `<Route>` with `<Outlet />`
- Lazy routes: `React.lazy(() => import('./pages/About'))`

### Layouts & Navigation
- `<Outlet />` — renders child routes (like Next.js layout)
- `<Link to="/path">` — client-side navigation
- `useNavigate()` — programmatic navigation
- `<NavLink>` — link with active state styling

### Auth
- No built-in auth — look for custom implementations
- Common patterns: `AuthContext`, `PrivateRoute` component, `RequireAuth` wrapper
- Protected routes: `<Route element={<RequireAuth />}> <Route path="/dashboard" ... /> </Route>`
- Look for token storage: `localStorage.getItem('token')`, `sessionStorage`, cookies
- Look for API interceptors (Axios interceptors) that add auth headers

### State Management
- Context: `createContext`, `useContext`
- Redux: `store.ts`, `configureStore`, `useSelector`, `useDispatch`
- Zustand: `create()` from `zustand`
- React Query / TanStack Query: `useQuery`, `useMutation`

---

## 4. Vue / Nuxt

### Vue (standalone) Routes
- `router/index.ts` or `router.ts` — Vue Router config
- Route definitions: `{ path: '/about', component: About }`
- Navigation guards: `router.beforeEach()` — auth checks
- Per-route guards: `beforeEnter` in route config
- In-component guards: `beforeRouteEnter`, `beforeRouteLeave`

### Nuxt Routes
- `pages/` directory — file-based routing (like Next.js)
- `pages/[id].vue` — dynamic routes
- `layouts/` — layout components (`layouts/default.vue`)
- `middleware/` — route middleware (auth checks)
- `nuxt.config.ts` — middleware registration, route rules
- `server/api/` — API routes

### Auth
- `@nuxtjs/auth-next` module — check `nuxt.config.ts` for module registration
- Custom auth: look for Pinia/Vuex stores with auth state
- Route middleware: `middleware/auth.ts` with `defineNuxtRouteMiddleware`
- `navigateTo()` for redirects in middleware

### Forms & Interactivity
- `v-model` — two-way data binding on inputs
- `@submit.prevent` — form submission handler
- `v-if` / `v-show` — conditional rendering (roles, auth state)

---

## 5. SvelteKit

### Routes
- `src/routes/` — file-based routing
- `+page.svelte` — page component
- `+page.ts` / `+page.server.ts` — load functions (data fetching)
- `+layout.svelte` — layout (like Next.js layout)
- `+error.svelte` — error page
- `[param]/` — dynamic routes
- `(group)/` — route groups

### Auth & Middleware
- `hooks.server.ts` — server hooks, runs on every request (like middleware)
- `+page.server.ts` — load function can check auth and throw redirects
- `+layout.server.ts` — layout-level auth checks
- Look for `locals.user` pattern in hooks

### API Routes
- `src/routes/api/*/+server.ts` — API endpoints with `GET`, `POST` exports

### Forms
- `<form method="POST">` with `+page.server.ts` actions
- `use:enhance` directive for progressive enhancement
- `$page.form` for form data access

---

## 6. Angular

### Routes
- `app-routing.module.ts` or `app.routes.ts` (standalone) — main route config
- Lazy-loaded modules: `loadChildren: () => import('./feature/feature.module')`
- Feature routing modules: `*-routing.module.ts`
- Route config: `{ path: 'about', component: AboutComponent }`

### Auth & Guards
- Route guards: `canActivate`, `canDeactivate`, `canLoad`
- Guard files: `*.guard.ts` — implement `CanActivate` interface
- Auth interceptor: `*.interceptor.ts` — adds auth headers to HTTP requests
- Look for `HttpInterceptor` implementations

### Navigation
- `<router-outlet>` — renders child routes
- `routerLink="/path"` — link directive
- `Router.navigate(['/path'])` — programmatic navigation

### Forms
- Reactive forms: `FormGroup`, `FormControl`, `FormBuilder`
- Template-driven forms: `ngModel`, `#form="ngForm"`
- Validators: `Validators.required`, custom validators

### State
- Services with `@Injectable()` — singleton state
- NgRx: `Store`, `Actions`, `Reducers`, `Effects`
- RxJS: `BehaviorSubject`, `Observable` patterns

---

## 7. Django

### Routes
- `urls.py` — URL patterns (project-level and app-level)
- `urlpatterns = [path('about/', views.about, name='about')]`
- Include app URLs: `path('api/', include('myapp.urls'))`
- Namespace: `app_name = 'myapp'` in app's `urls.py`
- Check ALL `urls.py` files across all apps — not just the root one

### Auth
- `settings.py` > `AUTHENTICATION_BACKENDS` — auth backends
- `settings.py` > `AUTH_USER_MODEL` — custom user model
- `settings.py` > `LOGIN_URL`, `LOGIN_REDIRECT_URL`, `LOGOUT_REDIRECT_URL`
- `settings.py` > `MIDDLEWARE` — look for `AuthenticationMiddleware`, `SessionMiddleware`
- `@login_required` decorator on views
- `LoginRequiredMixin` on class-based views
- `PermissionRequiredMixin` — role/permission checks
- `@permission_required('app.can_edit')` decorator
- Custom permissions in models: `class Meta: permissions = [...]`
- Groups and permissions: `auth_group`, `auth_permission` tables

### Templates
- `templates/` directory (project-level or app-level)
- `settings.py` > `TEMPLATES` > `DIRS` — template directories
- Template syntax: `{% extends "base.html" %}`, `{% block content %}`, `{{ variable }}`
- Template tags: `{% url 'name' %}` — URL resolution in templates
- `{% if user.is_authenticated %}` — auth checks in templates
- `{% if perms.app.can_edit %}` — permission checks in templates

### Forms
- `forms.py` — form definitions (`ModelForm`, `Form`)
- CSRF: `{% csrf_token %}` in every `<form>` tag
- `{{ form.as_p }}` / `{{ form.field }}` — form rendering

### Admin
- `admin.py` — registered models
- `/admin/` — separate auth system and UI
- `@admin.register(Model)` or `admin.site.register(Model)`

### Roles & Permissions
- `auth_user` table: `is_staff`, `is_superuser` flags
- `auth_group` table: named groups
- `auth_permission` table: per-model permissions (add, change, delete, view)
- `auth_user_groups`: user-group assignments
- Custom permissions: defined in model's `Meta.permissions`
- `user.has_perm('app.permission_codename')` — code-level checks

---

## 8. Laravel

### Routes
- `routes/web.php` — web routes (with session, CSRF middleware)
- `routes/api.php` — API routes (stateless, typically token auth)
- `routes/auth.php` — auth routes (if using Laravel Breeze/Fortify)
- `routes/channels.php` — broadcast channels
- Route groups: `Route::middleware(['auth'])->group(function() { ... })`
- Resource routes: `Route::resource('posts', PostController::class)`

### Auth
- `config/auth.php` — guards, providers, password reset config
- `app/Http/Middleware/Authenticate.php` — auth middleware
- `app/Http/Middleware/` — all middleware files
- `app/Http/Kernel.php` — middleware groups (`web`, `api`, `auth`)
- Breeze/Jetstream/Fortify: check `composer.json` for auth package
- Sanctum: `config/sanctum.php` — SPA/API token auth
- `app/Models/User.php` — user model, relationships, roles
- `@auth` / `@guest` Blade directives — auth checks in templates
- `$this->middleware('auth')` in controllers
- `Gate::define()` / `Policy` classes — authorization

### Templates (Blade)
- `resources/views/` — `.blade.php` templates
- `@extends('layout')` — template inheritance
- `@section('content')` / `@yield('content')` — sections
- `@component` / `<x-component>` — Blade components
- `@csrf` — CSRF token in forms
- `@can('permission')` / `@role('admin')` — permission checks in views

### Controllers
- `app/Http/Controllers/` — all controllers
- Resource controllers: `index`, `create`, `store`, `show`, `edit`, `update`, `destroy` methods

### Roles & Permissions
- Spatie Permission package: `config/permission.php`, `HasRoles` trait on User model
- `roles` table, `permissions` table, `model_has_roles`, `role_has_permissions` pivot tables
- Bouncer package: similar structure
- Custom: `role` column on users table, or `roles` relationship
- `$user->hasRole('admin')`, `$user->can('edit posts')` — code checks
- `@can('edit', $post)` — Blade authorization

---

## 9. Ruby on Rails

### Routes
- `config/routes.rb` — all route definitions
- `resources :posts` — RESTful routes (index, show, new, create, edit, update, destroy)
- `namespace :admin do ... end` — namespaced routes
- `root 'home#index'` — root route
- Run `rails routes` to see all resolved routes

### Auth
- Devise: `config/initializers/devise.rb`, `devise_for :users` in routes
- Custom: `before_action :authenticate_user!` in controllers
- `current_user` helper — available in controllers and views
- `app/controllers/application_controller.rb` — base controller with auth filters
- Session config: `config/initializers/session_store.rb`

### Templates (ERB / HAML)
- `app/views/` — organized by controller name
- `app/views/layouts/application.html.erb` — main layout
- `<%= yield %>` — content insertion point
- `<%= link_to 'About', about_path %>` — link helper
- `<% if user_signed_in? %>` — auth checks (Devise)
- `<%= form_with model: @post do |f| %>` — form builder
- Turbo/Hotwire: `data-turbo-action`, `turbo_frame_tag` — SPA-like behavior in server-rendered app

### Roles & Permissions
- Rolify gem: `roles` table, `has_role?(:admin)`, `add_role(:editor)`
- CanCanCan gem: `app/models/ability.rb` defines permissions, `authorize!` in controllers, `can?` in views
- Pundit gem: `app/policies/` — policy classes per model
- Custom: `role` column on users, `enum role: [:user, :admin]`

---

## 10. Flask

### Routes
- `@app.route('/path')` decorators on view functions
- Blueprints: `bp = Blueprint('auth', __name__)`, `@bp.route('/login')`
- `app.register_blueprint(auth_bp, url_prefix='/auth')`
- Routes may be spread across multiple files — follow blueprint registrations

### Auth
- Flask-Login: `@login_required` decorator, `current_user`, `LoginManager`
- `login_user()` / `logout_user()` — session management
- `app.config['SECRET_KEY']` — session encryption key
- Custom: check for session-based or JWT-based auth in middleware/decorators

### Templates (Jinja2)
- `templates/` directory
- `{% extends "base.html" %}`, `{% block content %}`, `{{ variable }}`
- `url_for('blueprint.view_function')` — URL generation
- `{% if current_user.is_authenticated %}` — auth checks

### Roles
- Flask-Principal: role-based permissions
- Custom: `role` column on user model, custom decorators (`@admin_required`)

---

## 11. Express.js (with templates)

### Routes
- `app.get('/path', handler)` / `app.post('/path', handler)` in main app file
- Router files: `const router = express.Router()` in separate files
- `app.use('/api', apiRouter)` — route mounting
- Check `app.js`, `server.js`, `index.js`, and `routes/` directory

### Auth
- Passport.js: `passport.use(new Strategy())`, `passport.authenticate('local')`
- Custom middleware: `function isAuthenticated(req, res, next) { ... }`
- `express-session` — session config
- JWT: `jsonwebtoken` package, custom middleware to verify tokens

### Templates
- `views/` directory
- EJS: `.ejs` files, `<%= variable %>`, `<%- include('partial') %>`
- Pug: `.pug` files, indentation-based syntax
- Handlebars: `.hbs` files, `{{variable}}`, `{{> partial}}`
- `app.set('view engine', 'ejs')` — engine configuration

---

## 12. Go (net/http + templates)

### Routes
- `http.HandleFunc("/path", handler)` — standard library
- Gorilla Mux: `r.HandleFunc("/path", handler).Methods("GET")`
- Chi: `r.Get("/path", handler)`
- Gin: `r.GET("/path", handler)`
- Echo: `e.GET("/path", handler)`
- Check `main.go` and `routes.go` or `router.go` files

### Auth
- Custom middleware: `func AuthMiddleware(next http.Handler) http.Handler`
- Session: `gorilla/sessions` package
- JWT: `golang-jwt/jwt` package
- Look for middleware chains in router setup

### Templates
- `html/template` package — standard library
- `templates/` or `views/` directory with `.html` or `.tmpl` files
- `{{.Variable}}` — template syntax
- `{{template "partial" .}}` — template inclusion
- `{{if .User}}` — conditional rendering

---

## 13. Symfony / Twig

### Routes
- `config/routes.yaml` — YAML route definitions
- Annotations/Attributes: `#[Route('/path')]` on controller methods
- `src/Controller/` — controller classes
- Run `php bin/console debug:router` to see all routes

### Auth
- `config/packages/security.yaml` — security configuration (firewalls, access control, providers)
- `src/Security/` — authenticators, voters, user providers
- `#[IsGranted('ROLE_ADMIN')]` attribute on controllers
- `security.yaml` > `access_control` — URL-based access rules
- `security.yaml` > `role_hierarchy` — role inheritance

### Templates (Twig)
- `templates/` directory with `.html.twig` files
- `{% extends 'base.html.twig' %}`, `{% block body %}`, `{{ variable }}`
- `{{ path('route_name') }}` — URL generation
- `{% if is_granted('ROLE_ADMIN') %}` — permission checks
- `{{ csrf_token('action') }}` — CSRF tokens

### Roles
- `src/Entity/User.php` — `getRoles()` method
- Database: `roles` JSON column on user table
- `role_hierarchy` in `security.yaml` — ROLE_ADMIN includes ROLE_USER, etc.
- Voters: `src/Security/Voter/` — fine-grained permission checks

---

## 14. Spring Boot MVC

### Routes
- `@Controller` classes with `@RequestMapping`, `@GetMapping`, `@PostMapping`
- `@RestController` — API endpoints (return JSON)
- `src/main/java/**/controller/` — controller package
- Check `WebMvcConfigurer` implementations for view resolvers and interceptors

### Auth
- Spring Security: `SecurityFilterChain` bean or `WebSecurityConfigurerAdapter`
- `SecurityConfig.java` — defines which URLs require auth
- `.authorizeHttpRequests(auth -> auth.requestMatchers("/admin/**").hasRole("ADMIN"))`
- `@PreAuthorize("hasRole('ADMIN')")` — method-level security
- `UserDetailsService` implementation — loads user data
- `src/main/resources/application.properties` or `.yml` — security settings

### Templates (Thymeleaf)
- `src/main/resources/templates/` — `.html` files with Thymeleaf
- `th:href="@{/path}"` — URL expressions
- `th:if="${#authorization.expression('hasRole(''ADMIN'')')}"` — security checks in templates
- `th:each="item : ${items}"` — iteration
- `<form th:action="@{/submit}" method="post">` with automatic CSRF

### Roles
- `authorities` or `roles` table in database
- `UserDetails.getAuthorities()` — returns granted authorities
- `@RolesAllowed`, `@Secured`, `@PreAuthorize` annotations
- Role hierarchy: `RoleHierarchy` bean

---

## 15. ASP.NET MVC / Razor Pages

### Routes
- `Controllers/` — MVC controllers with `[Route]` attributes
- `Pages/` — Razor Pages (file-based routing, `.cshtml` files)
- `Program.cs` or `Startup.cs` — route configuration (`app.MapControllerRoute()`)
- Areas: `Areas/Admin/Controllers/` — grouped routes

### Auth
- `[Authorize]` attribute on controllers/actions
- `[Authorize(Roles = "Admin")]` — role-based
- `[AllowAnonymous]` — exemptions
- `Program.cs` — `builder.Services.AddAuthentication()`, `AddAuthorization()`
- Identity: `Microsoft.AspNetCore.Identity` — user/role management
- Claims-based auth: `User.Claims`, `User.IsInRole("Admin")`

### Templates (Razor)
- `.cshtml` files — C# + HTML syntax
- `@if (User.Identity.IsAuthenticated)` — auth checks
- `@if (User.IsInRole("Admin"))` — role checks
- `<form asp-action="Create" asp-controller="Items">` — tag helpers
- `@Html.AntiForgeryToken()` — CSRF protection
- `_Layout.cshtml` — shared layout
- `_ViewStart.cshtml` — layout assignment

### Roles
- `AspNetRoles` table, `AspNetUserRoles` pivot table
- `UserManager<User>`, `RoleManager<Role>` — role management services
- `[Authorize(Policy = "RequireAdmin")]` — policy-based authorization

---

## 16. PHP (Traditional / No Framework)

### Routes
- No central route file — each `.php` file is a route
- `index.php` — often the entry point, may use `$_GET['page']` for routing
- `.htaccess` — Apache URL rewrites (`RewriteRule ^about$ about.php`)
- `nginx.conf` — Nginx rewrites
- Scan all `.php` files in the web root (`public/`, `www/`, `htdocs/`)
- Follow `<a href="page.php">` links and `<form action="submit.php">` targets

### Auth
- `session_start()` — session initialization
- `$_SESSION['user']` — session-based auth
- `header('Location: login.php')` — redirects for unauthenticated users
- Check for `include 'auth_check.php'` patterns at the top of protected pages

### Templates
- PHP itself IS the template engine: `<?php echo $variable; ?>`, `<?= $variable ?>`
- Some projects use Smarty, Blade (standalone), or Twig (standalone)
- Look for `include`, `require`, `include_once` for partial templates

### Roles
- `role` column in users table (often checked with raw SQL queries)
- `$_SESSION['role']` — role stored in session
- `if ($_SESSION['role'] === 'admin')` — inline role checks

---

## 17. Remix

### Routes
- `app/routes/` — file-based routing
- `app/routes/_index.tsx` — root route
- `app/routes/about.tsx` — `/about`
- `app/routes/posts.$id.tsx` — dynamic: `/posts/:id`
- `app/routes/_layout.tsx` — layout routes
- Nested routes via folder structure or dot notation

### Auth
- `loader` functions — run on server, can check auth and redirect
- `action` functions — handle form submissions
- `redirect()` from `@remix-run/node` — server-side redirects
- Session: `createCookieSessionStorage()` in a session utility file
- Look for `requireUser()` or `getUser()` helper functions called in loaders

### Forms
- `<Form method="post">` — Remix form component (client-side enhanced)
- `action` exports in route files handle POST
- `useActionData()` — form submission results
- `useFetcher()` — non-navigation form submissions

---

## 18. Astro

### Routes
- `src/pages/` — file-based routing
- `.astro` files — Astro components (server-rendered by default)
- `.md` / `.mdx` — Markdown pages
- `[param].astro` — dynamic routes
- `[...slug].astro` — catch-all routes

### Interactivity
- Astro is static by default — no client-side JS unless opted in
- `client:load`, `client:visible`, `client:idle` — hydration directives
- Islands architecture: interactive components embedded in static pages
- Framework components: React, Vue, Svelte components inside `.astro` files

### Auth
- No built-in auth — check for integrations (Astro Auth, Lucia, custom)
- `src/middleware.ts` — middleware for auth checks
- API routes: `src/pages/api/*.ts`
