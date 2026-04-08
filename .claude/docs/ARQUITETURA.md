# Diagramas de Arquitetura — Laura SaaS Agenda

Este documento contém a representação visual (C4 Models e Sequência) definidos no High-Level Design (HLD) e no Feature Design Doc (FDD).

## 1. Diagrama de Contexto (Nível 1 - Visão Global)
Representação macro de como os atores interagem com a plataforma SaaS e os serviços externos que compõem a esteira.

```mermaid
graph TD
    %% Estilos
    classDef usuario fill:#1f3b4d,stroke:#fff,stroke-width:2px,color:#fff;
    classDef sistema fill:#1168bd,stroke:#fff,stroke-width:2px,color:#fff;
    classDef externo fill:#999,stroke:#fff,stroke-width:2px,color:#fff;

    %% Atores
    Prof[Profissional de Saúde/Estética]:::usuario
    Cli[Cliente da Clínica]:::usuario

    %% Core
    Sys[Laura SaaS Agenda \nMulti-tenant]:::sistema

    %% Externos
    WPP[WhatsApp]:::externo
    OpenAI[OpenAI / GPT-4o-mini]:::externo
    Push[Servidor Web Push]:::externo

    %% Ligações
    Prof -->|Gere agenda e fluxo pelo PWA| Sys
    Cli -->|Comunica e agenda| WPP
    WPP -->|Dispara Webhooks| Sys
    Sys -->|Envia mensagens/lembretes| WPP
    Sys -->|Interpreta intenção de\nagendamento (NLP)| OpenAI
    Sys -->|Gera avisos| Push
    Push -->|Notificação silenciosa| Prof
```

---

## 2. Diagrama de Container (Nível 2 - Topologia)
Visão interna dos blocos de software (onde rodam) e integrações. Mostra a separação entre Cloud Serverless e a infraestrutura externa.

```mermaid
graph TD
    classDef container fill:#1168bd,stroke:#0b4884,stroke-width:2px,color:#fff
    classDef db fill:#00684a,stroke:#00402e,stroke-width:2px,color:#fff
    classDef server fill:#4f4f4f,stroke:#2d2d2d,stroke-width:2px,color:#fff

    subgraph Nuvem[Ambiente Cloud / Vercel]
        PWA[Frontend PWA\n React / Vite / Tailwind ]:::container
        API[Core API Backend\n Node.js / Express / Zod ]:::container
        Cron[Job Scheduler\n CRON de Lembretes ]:::container
    end
    
    DB[(MongoDB Atlas\n NoSQL Database )]:::db

    subgraph Infra[Infra Auto-Hospedada]
        EvoAPI[Gateway Evolution API\n Docker Container ]:::server
    end
    
    OpenAI[Provider de IA\n GPT-4o-mini API ]:::server

    %% Fluxos Internos
    PWA <-->|REST API JSON\n Auth JWT| API
    API <-->|Mongoose Queries| DB
    Cron -.->|Aciona Rotina Interna| API
    
    %% Fluxos Externos
    API <-->|Webhooks & Rest| EvoAPI
    API <-->|Function Calls| OpenAI
```

---

## 3. Diagrama de Sequência e Barreiras (Fluxo do FDD)
Demonstração técnica da triagem pre-controller (Invariantes em pipeline) garantindo o Isolamento de Tenant e o barramento por Payload Sujo explicitado no FDD da API.

```mermaid
sequenceDiagram
    participant PWA as Client (PWA)
    participant Exp as Express Route
    participant Auth as Auth Middleware
    participant Ten as Tenant Middleware
    participant Zod as Zod Validation
    participant Ctr as Controller
    participant DB as MongoDB Atlas

    PWA->>Exp: POST /api/agendamentos (Payload + Header JWT)
    Exp->>Auth: Verifica Token
    
    alt Token Inválido/Ausente
        Auth-->>PWA: 401 Unauthorized
    else Token Válido
        Auth->>Ten: Injeta req.user (userId, tenantId)
        Ten->>Ten: Atesta Autoridade no Tenant
    end
    
    alt Forjado (Cross-tenant)
        Ten-->>PWA: 403 Forbidden
    else Aprovado
        Ten->>Zod: Encaminha Payload Bruto
        Zod->>Zod: Executa Schema Strip 
    end

    alt Object/Tipagem Incorreta
        Zod-->>PWA: 400 Bad Request (Return Array Errors)
    else Payload Sanitizado 100%
        Zod->>Ctr: req.validatedBody (Clean data)
        Ctr->>DB: Query (Save Document via Mongoose)
        DB-->>Ctr: Result Confirmed
        Ctr-->>PWA: 201 Created { data: {...} }
    end
```
