# Potential ADRs Index

## Analysis Progress

### Analyzed Modules
- **TENANT**: Multi-Tenancy Engine — 2026-04-08 — 2 high, 1 medium priority
- **AUTH**: Authentication & Authorization — 2026-04-08 — 2 high, 3 medium priority
- **WA**: WhatsApp Integration — 2026-04-08 — 1 high, 1 medium priority
- **AI**: AI / NLP Layer — 2026-04-08 — 1 high priority
- **NOTIF**: Notifications Engine — 2026-04-08 — 1 high priority
- **INFRA**: DevOps & Infrastructure — 2026-04-08 — 1 high, 2 medium priority
- **API**: REST API Gateway — 2026-04-08 — 1 high priority
- **DATA**: Data Layer — 2026-04-08 — 1 high, 2 medium priority

### Pending Analysis
- **SCHED**: Scheduling Core
- **CRM**: Client Relationship Management
- **PKG**: Packages & Sessions
- **FIN**: Financial Management
- **FE-CORE** / **FE-DASH** / **FE-SCHED** / **FE-CRM** / **FE-PKG** / **FE-FIN** / **FE-SETTINGS**: Frontend modules

---

## High Priority ADRs (must-document/) — 10 total

### Module: TENANT
| Title | Category | Score | File |
|-------|----------|-------|------|
| Database-per-Tenant Architecture via Mongoose useDb() | Architecture | 150 | [link](./must-document/TENANT/database-per-tenant-architecture.md) |
| Model Registry Pattern — Factory getModels(db) | Architecture/ORM | 110 | [link](./must-document/TENANT/model-registry-factory-pattern.md) |

### Module: AUTH
| Title | Category | Score | File |
|-------|----------|-------|------|
| JWT Authentication com Access Token de 1 hora | Security/Architecture | 140 | [link](./must-document/AUTH/jwt-authentication-strategy.md) |
| RBAC com Sistema Duplo — Role Hierarchy + Granular Permissions | Security/Architecture | 100 | [link](./must-document/AUTH/rbac-dual-system-role-permissions.md) |

### Module: WA
| Title | Category | Score | File |
|-------|----------|-------|------|
| Z-API como Gateway WhatsApp para Notificações e Automação | Technology/Integration | 145 | [link](./must-document/WA/z-api-whatsapp-integration.md) |

### Module: AI
| Title | Category | Score | File |
|-------|----------|-------|------|
| Estratégia Two-Tier LLM (GPT-3.5 Classificador + GPT-4o-mini Function Calling) | Architecture/Technology | 140 | [link](./must-document/AI/two-tier-llm-strategy.md) |

### Module: NOTIF
| Title | Category | Score | File |
|-------|----------|-------|------|
| Web Push (VAPID) + PWA como Estratégia de Notificações Mobile | Architecture/Technology | 135 | [link](./must-document/NOTIF/web-push-pwa-notification-strategy.md) |

### Module: INFRA
| Title | Category | Score | File |
|-------|----------|-------|------|
| Deploy Split — Backend no Render, Frontend no Vercel | Infrastructure/Architecture | 130 | [link](./must-document/INFRA/split-deploy-render-vercel.md) |

### Module: API
| Title | Category | Score | File |
|-------|----------|-------|------|
| Express 4 como Framework REST da API | Technology/Framework | 115 | [link](./must-document/API/express-4-rest-framework.md) |

### Module: DATA
| Title | Category | Score | File |
|-------|----------|-------|------|
| MongoDB com Mongoose como Banco de Dados e ORM | Technology/Infrastructure | 150 | [link](./must-document/DATA/mongodb-mongoose-orm.md) |

---

## Medium Priority ADRs (consider/) — 9 total

### Module: TENANT
| Title | Category | Score | File |
|-------|----------|-------|------|
| Topologia Two-Tier — Dados Globais (Tenant/User) vs Dados Isolados | Architecture/Security | 95 | [link](./consider/TENANT/shared-vs-isolated-data-topology.md) |

### Module: AUTH
| Title | Category | Score | File |
|-------|----------|-------|------|
| Plan Feature Gating via Middleware (requirePlan + checkLimit) | Architecture/Business | 95 | [link](./consider/AUTH/plan-feature-gating-middleware.md) |
| Rate Limiting nas Rotas Públicas de Autenticação | Security | 90 | [link](./consider/AUTH/rate-limiting-public-routes.md) |

### Module: WA
| Title | Category | Score | File |
|-------|----------|-------|------|
| Processamento Síncrono de Webhooks WhatsApp (sem fila) | Architecture/Performance | 85 | [link](./consider/WA/synchronous-webhook-processing.md) |

### Module: INFRA
| Title | Category | Score | File |
|-------|----------|-------|------|
| CRON de Lembretes Co-localizado no Processo Express | Architecture/Reliability | 90 | [link](./consider/INFRA/cron-colocated-in-api-process.md) |
| ES Modules (ESM) no Backend Node.js | Architecture | 80 | [link](./consider/INFRA/es-modules-backend.md) |

### Module: DATA
| Title | Category | Score | File |
|-------|----------|-------|------|
| Ausência de Framework Formal de Migrations de Schema | Architecture/Operations | 90 | [link](./consider/DATA/no-formal-migration-framework.md) |

---

## Summary
- **High Priority**: 10 ADRs (must-document)
- **Medium Priority**: 7 ADRs (consider)
- **Total**: 17 ADRs
- **Modules Analyzed**: 8 de 19
- **Source**: Git history desde 2025-04-25 + análise de código
