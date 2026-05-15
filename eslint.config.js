/**
 * ESLint flat config — Marcai backend.
 *
 * Conservative configuration: only enables rules that codify
 * architectural invariants this codebase relies on. Stylistic rules
 * are deliberately NOT enabled — pre-existing source code uses heterogeneous
 * formatting and we don't want this commit to spawn a thousand stylistic
 * warnings. Formatting can be addressed separately if/when adopted.
 *
 * The single architectural rule active today:
 *   no-restricted-imports on src/modules/<domain>/** blocking imports
 *   from src/modules/messaging/**. Codifies ADR-022 ("Messaging Module
 *   as Cross-Cutting Orchestrator") as an executable invariant.
 *
 * Run with: npm run lint
 */

import js from '@eslint/js';
import globals from 'globals';

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

  // ADR-022 enforcement: domain modules cannot import from messaging/
  // Listed explicitly per domain so the rule's intent is obvious from the
  // config alone (and so adding a new domain module surfaces this file
  // as something to update).
  {
    files: [
      'src/modules/agendamento/**/*.js',
      'src/modules/leads/**/*.js',
      'src/modules/clientes/**/*.js',
      'src/modules/financeiro/**/*.js',
      'src/modules/notificacoes/**/*.js',
      'src/modules/ia/**/*.js',
      'src/modules/historico/**/*.js',
      'src/modules/auth/**/*.js',
      'src/modules/users/**/*.js',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: MESSAGING_BLOCKED_PATTERNS.map((pattern) => ({
            group: [pattern],
            message: ADR_022_MESSAGE,
          })),
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
