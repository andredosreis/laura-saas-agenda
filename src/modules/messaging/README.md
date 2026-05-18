# src/modules/messaging/ — Cross-cutting Orchestrator

This module is the **single entry point for inbound WhatsApp messages** and the routing layer that decides which handler processes each one.

It is **NOT a domain module.** It is an orchestrator that sits above the domain modules (`agendamento/`, `leads/`, `clientes/`, etc.) and coordinates them. Domain modules **must not** import from this module — the dependency flows one way only (`messaging/` → domains), never the inverse.

> ⚠️ **Architectural boundary enforced by ESLint.** Attempting to `import` from `src/modules/messaging/**` in any file under `src/modules/<domain>/**` fails `npm run lint` with a message pointing to ADR-022. The rule is configured in `eslint.config.js`.

## Layout

```
src/modules/messaging/
├── controllers/      # webhookController.js — POST /webhook/evolution entry point
├── routing/          # messageClassifier.js (pure), messageRouter.js (pure)
├── handlers/         # one per Route value (legacy confirmation, IA lead, manual silent, etc.)
├── webhookState.js   # parallel state fetch helper (tenant, lead, client, pending appt)
└── README.md         # this file
```

## What this module is allowed to import

- `src/models/*` (Mongoose schemas — shared artefact per ADR-002 model registry)
- `src/utils/*` (cross-cutting helpers: `iaServiceClient`, `evolutionClient`, `logger`)
- `src/services/*` (external service clients)
- `src/middlewares/*` (auth, validate, rate-limit)
- `src/config/*` (DB-per-tenant resolution per ADR-001)

## What this module is NOT allowed to import

- Controllers from other domain modules (e.g., `src/modules/agendamento/agendamentoController.js`)
  - If you need domain behaviour, expose it via a `service` (pure function) in that module's `services/` folder, or call the internal HTTP endpoint (F05 internal bridge).

## What is NOT allowed to import from this module

- Anything under `src/modules/<domain>/**`. Enforced by ESLint `no-restricted-imports` rule in `eslint.config.js`.

## References

- **ADR-022** — `docs/adrs/generated/ADR-022-messaging-module-cross-cutting-orchestrator.md`
- **F12 SDD** — `docs/F12-ia-legacy-handoff-coordinator/spec.md`
- **F12 Plan** — `docs/F12-ia-legacy-handoff-coordinator/plan.md`
- **PRD §1.1 Routing Matrix** — `.claude/docs/Docs Arqueturais/PRD_Marcai_CRM_Leads.md`
- **ADR-011 Modular Monolith** — `docs/adrs/generated/ADR-011-modular-monolith-agendamento-financeiro.md` (the principle this module formalises an exception to)
