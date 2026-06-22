/**
 * ESLint flat config — Marcai backend.
 *
 * Conservative configuration: only enables rules that codify
 * architectural invariants this codebase relies on. Stylistic rules
 * are deliberately NOT enabled — pre-existing source code uses heterogeneous
 * formatting and we don't want this commit to spawn a thousand stylistic
 * warnings. Formatting can be addressed separately if/when adopted.
 *
 * Architectural rules active today:
 *   1. no-restricted-imports on domain modules blocking imports from
 *      src/modules/messaging/** (ADR-022 — Messaging as Cross-Cutting Orchestrator).
 *   2. no-restricted-imports blocking getTenantDBAdmin outside src/modules/admin/
 *      (ADR-024 Gate 4b — the read-only cross-tenant accessor is admin-only).
 *   3. no-restricted-syntax forbidding raw router.<verb> mutations inside
 *      src/modules/admin/ (ADR-024 Gate 4 — mutations must go through the
 *      adminMutation factory; Phase 3).
 *
 * Run with: npm run lint
 */

import js from '@eslint/js';
import globals from 'globals';

// Domain modules (subset of src/modules/) — listed explicitly so adding a new
// one surfaces this file as something to update. Reused by the messaging and
// admin-RO rules so their scopes don't clobber each other.
const DOMAIN_MODULE_GLOBS = [
  'src/modules/agendamento/**/*.js',
  'src/modules/leads/**/*.js',
  'src/modules/clientes/**/*.js',
  'src/modules/financeiro/**/*.js',
  'src/modules/notificacoes/**/*.js',
  'src/modules/ia/**/*.js',
  'src/modules/historico/**/*.js',
  'src/modules/auth/**/*.js',
  'src/modules/users/**/*.js',
];

// Path patterns blocked when imported FROM a domain module.
// Covers both relative ('../messaging/...', '../../messaging/...') and
// absolute-ish ('src/modules/messaging/...', '**/modules/messaging/**')
// import paths used in this codebase.
const MESSAGING_BLOCKED_PATTERNS = [
  '**/modules/messaging/**',
  '**/modules/messaging',
  '../messaging/**',
  '../messaging',
  '../../messaging/**',
  '../../messaging',
  '../../../messaging/**',
  '../../../messaging',
];

const ADR_022_MESSAGE =
  'Domain modules (agendamento, leads, clientes, financeiro, notificacoes, ' +
  'ia, historico, auth, users) MUST NOT import from src/modules/messaging/. ' +
  'Messaging is a cross-cutting orchestrator: the dependency goes one way ' +
  '(messaging → domains), never the inverse. If you need shared logic, ' +
  'expose it via a service in your own module, or via the internal API ' +
  'bridge (F05). See docs/adrs/generated/ADR-022-messaging-module-cross-cutting-orchestrator.md.';

// Gate 4b (ADR-024): getTenantDBAdmin — o acessor read-only cross-tenant do
// painel super-admin — só pode ser importado dentro de src/modules/admin/.
const ADMIN_RO_BLOCKED_PATTERNS = [
  '**/modules/admin/getTenantDBAdmin',
  '**/modules/admin/getTenantDBAdmin.js',
  '../admin/getTenantDBAdmin',
  '../admin/getTenantDBAdmin.js',
  '../../modules/admin/getTenantDBAdmin',
  '../../modules/admin/getTenantDBAdmin.js',
];

const ADMIN_RO_MESSAGE =
  'getTenantDBAdmin (acessor read-only cross-tenant do painel super-admin) só ' +
  'pode ser importado dentro de src/modules/admin/ (ADR-024, Gate 4b). É a ' +
  'única superfície sancionada a atravessar tenants — fora de admin/, usa o ' +
  'isolamento normal { tenantId }. Ver .claude/skills/marcai-superadmin-route.';

const adminRoPattern = { group: ADMIN_RO_BLOCKED_PATTERNS, message: ADMIN_RO_MESSAGE };

export default [
  // Default language options for all JS files
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },

  // ADR-022 + Gate 4b for domain modules: cannot import from messaging/, nor
  // getTenantDBAdmin. Both restrictions live in one rule so neither clobbers
  // the other (flat config: last matching config wins per rule).
  {
    files: DOMAIN_MODULE_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...MESSAGING_BLOCKED_PATTERNS.map((pattern) => ({
              group: [pattern],
              message: ADR_022_MESSAGE,
            })),
            adminRoPattern,
          ],
        },
      ],
    },
  },

  // Gate 4b for the REST of src (non-domain-module, non-admin): getTenantDBAdmin
  // is admin-only. Domain modules are covered above; admin/ is exempt.
  {
    files: ['src/**/*.js'],
    ignores: ['src/modules/admin/**/*.js', ...DOMAIN_MODULE_GLOBS],
    rules: {
      'no-restricted-imports': ['error', { patterns: [adminRoPattern] }],
    },
  },

  // Gate 4 (ADR-024): inside src/modules/admin/, no raw router.<verb> mutations —
  // every mutation must go through the adminMutation factory (transactional
  // audit, Phase 3). Today this blocks all mutation routes, which is correct:
  // Phase 3 (escrita) is not yet authorized.
  {
    files: ['src/modules/admin/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='router'][callee.property.name=/^(post|put|patch|delete)$/]",
          message:
            'Em src/modules/admin/ nenhuma mutação usa router.post/put/patch/delete cru — ' +
            'passa pela factory adminMutation (audit transacional, Fase 3). ' +
            'Ver .claude/skills/marcai-superadmin-route.',
        },
      ],
    },
  },

  // Ignore generated and vendor directories
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'laura-saas-frontend/**',
      'ia-service/**',
      'dist/**',
      'build/**',
      '.git/**',
    ],
  },
];
