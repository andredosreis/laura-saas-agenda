# Diagramas Mermaid — Sistema de Rotas da API
**FDD — Laura SaaS Agenda**

> **Versão:** 1.0  
> **Autor:** André dos Reis  
> **Contexto:** Diagramas técnicos do FDD de Rotas Transacionais Isoladas  
> **Stack:** Node.js + Express + MongoDB + Zod + JWT (multi-tenant)

---

## Visão Geral

Sistema de rotas da API com isolamento rigoroso de acesso via `tenantId` em arquitectura multi-tenant. Incorpora validação estrita pré-runtime baseada no Zod e deflexões defensivas orientadas a proteger as lógicas dos controllers e estabilidade das operações nativas do MongoDB.

### Elementos do Sistema

**Fluxos externos**
- App Frontend PWA
- Endpoints REST Transacionais (Agendamentos, Clientes, Pacotes, Financeiro)

**Processos internos**
- Middleware de Autenticação — verificação nativa de JWT
- Middleware de Autorização — restrição cross-tenant por `tenantId`
- Middleware de Validação Zod — strip e limpeza de fields inválidos
- Error Handler Global Central — oculta stack traces, propaga `requestId`
- Controllers de Domínio — Agendamentos, Pacotes, Clientes, Financeiro

**Contratos públicos**
- Pasta `/shared/schemas` — fonte única de verdade para schemas Zod
- Respostas padronizadas em JSON com códigos HTTP uniformes

---

## Diagrama 1 — Fluxo Principal e Validação Estrita

Diagrama sequencial que explora a linha de barreiras que actuam antes do domínio transacional. Fundamental para QAs visualizarem em que momento as interceptações `401`, `403` e `400` deflectem do fluxo de persistência no MongoDB.

```mermaid
sequenceDiagram
    participant PWA as Client PWA
    participant Exp as Express Route
    participant Auth as Middleware Auth
    participant Ten as Middleware Tenant
    participant Zod as Middleware Zod
    participant Ctr as API Controller
    participant DB as MongoDB Atlas

    PWA->>Exp: POST /api/agendamentos + Bearer JWT
    Exp->>Auth: Verifica Token JWT

    alt JWT Ausente ou Expirado
        Auth-->>PWA: 401 Unauthorized
    else JWT Válido
        Auth->>Ten: Injeta req.user + tenantId
        Ten->>Ten: Checa target tenantId
    end

    alt Risco Cross-tenant
        Ten-->>PWA: 403 Forbidden
    else Tenant Autorizado
        Ten->>Zod: Repassa body para validação
        Zod->>Zod: Executa strip e valida schema
    end

    alt Payload Inválido
        Zod-->>PWA: 400 Bad Request + array de erros
    else Dados 100% válidos
        Zod->>Ctr: req.validatedBody + req.user.tenantId
        Ctr->>DB: Mutação do documento
        DB-->>Ctr: Result callback
        Ctr-->>PWA: 201 Created + { data: {...} }
    end
```

**Notas técnicas:**
- O `tenantId` provém exclusivamente do JWT server-side — nunca do body da chamada
- O Zod executa `strip()` removendo campos não declarados no schema antes de passar ao controller
- O controller recebe apenas `req.validatedBody` — nunca `req.body` directamente

---

## Diagrama 2 — Roteamento de Erros e Excepções

Fluxo top-down traçando o fim de vida de requisições incompletas ou com falha. Serve como gabarito para instrumentação visual do Sentry na leitura de quedas na cadeia lógica.

```mermaid
flowchart TD
    Req[Request HTTP Endpoint] --> A{Valida JWT Auth}

    A -->|Inválido ou Ausente| E401[401 Unauthorized]
    A -->|Válido| T{Valida Owner Tenant}

    T -->|Não Pertence| E403[403 Forbidden]
    T -->|Pertence| Z{Valida Via Zod}

    Z -->|Formatação Inválida| E400[400 Bad Request + Array de Erros]
    Z -->|Válido e Limpo| C[Controller de Transacção]

    C --> DB[(MongoDB Collections)]

    DB -->|ValidationError Mongoose| EG[Error Global Handler]
    C -->|Exception de Lógica| EG

    EG --> Log[Pino Log + requestId]
    EG --> Sentry[Sentry Span + requestId]
    EG --> E500[500 Internal Server Error]
```

**Notas técnicas:**
- O `Error Global Handler` oculta stack traces em produção — o cliente recebe apenas `500` simplificado
- O `requestId` propaga-se do handler para o Pino e Sentry simultaneamente — permite rastrear o erro exacto nos logs
- Apenas a camada Zod retorna array detalhado de erros expondo os campos incorrectos da chamada
- `ValidationError` do Mongoose em produção indica falha no Zod — nunca deve ocorrer se CA-05 estiver a passar

---

## Diagrama 3 — Mitigações de Riscos Arquitecturais

Fluxograma modelador de como as decisões técnicas tratam adversidades de rede (CGNAT) e gestão de emergência da validação Zod.

```mermaid
flowchart LR
    Z[Restrição Zod Activa] --> F{Feature Flag State}
    F -->|Activo — Normal| Z2[Schema Rígido Nativo]
    F -->|Desligado — Emergência| Z1[Bypass Temporário]

    Z1 --> Warn[⚠️ Apenas debug — nunca produção activa]

    R[Rate Limiting Express] --> L{Estratégia de Isolamento}
    L -->|Rotas Autenticadas| T[Limite por tenantId]
    L -->|Webhook Evolution API| W[Whitelist IP Evolution]
```

**Notas técnicas:**
- O bypass do Zod via Feature Flag é restrito a ambientes de debug — nunca deve ser activado em produção activa
- Rate limiting por `tenantId` é mais preciso que por IP em arquitectura multi-tenant — evita falsos positivos por CGNAT
- IPs da Evolution API devem estar em whitelist explícita para não serem bloqueados pelo rate limiter

---

## Diagrama 4 — Sincronia Contratual Partilhada

Diagrama de classes que documenta a fonte única de verdade dos schemas Zod. Endereça o RISCO-03 — schemas desincronizados entre frontend e backend.

```mermaid
classDiagram
    class SharedSchemas {
        +agendamentoSchema Zod
        +clienteSchema Zod
        +pacoteSchema Zod
        +financeiroSchema Zod
    }

    class FrontendPWA {
        +Valida formulário HTML
        +Sinaliza erro UI ao utilizador
    }

    class BackendAPI {
        +Deflecte chamada de rota inválida
        +Injeta req.validatedBody limpo
    }

    SharedSchemas <|-- FrontendPWA
    SharedSchemas <|-- BackendAPI
```

**Notas técnicas:**
- Ambos frontend e backend importam os schemas da pasta `/shared/schemas`
- Uma alteração num schema propaga automaticamente nos dois lados
- Elimina a classe de bugs onde o PWA envia payload válido para o frontend mas inválido para o backend
- Testes de contrato devem comparar schemas de ambos os lados como critério de aceite

---

## Sumário dos Códigos HTTP por Camada

| Camada | Código | Condição |
|--------|--------|----------|
| Middleware Auth | `401` | JWT ausente, expirado ou inválido |
| Middleware Tenant | `403` | tenantId inválido ou cross-tenant |
| Middleware Zod | `400` | Payload malformado ou campos inválidos |
| Controller | `201` | Recurso criado com sucesso |
| Controller | `200` | Operação realizada com sucesso |
| Controller | `404` | Recurso não encontrado no tenant |
| Error Handler | `500` | Erro interno — stack trace ocultado |

---

*Diagramas gerados com base no FDD de Rotas Transacionais da Laura SaaS Agenda.*  
*Colocar em `/docs/diagramas-rotas-api.md` no repositório.*
