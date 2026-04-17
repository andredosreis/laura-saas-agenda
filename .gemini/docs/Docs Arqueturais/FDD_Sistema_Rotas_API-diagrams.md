# Diagramas Mermaid - Sistema de Rotas da API

## Visão Geral
Sistema de rotas da API com isolamento rigoroso de acesso via `tenantId` em arquitetura multi-tenant. Incorpora validação estrita contida pre-runtime baseada no Zod e deflexões defensivas orientadas a proteger as lógicas dos controllers e estabilidade das operações nativas do MongoDB.

## Elementos Identificados

### Fluxos externos
- App Frontend PWA
- Endpoints REST Transacionais

### Processos internos
- Middleware de Autenticação (verificação nativa de JWT)
- Middleware de Autorização (restrição base cross-tenant)
- Middleware de Validação Zod (retirada de fields sujos)
- Error Handler Global Central
- Controllers de Domínio (Agendamentos, Pacotes, Clientes)

### Variações de comportamento
- Feature Flag para barramento em Zod (Plano B mitigador)
- Limitações de Rate Limiting moldadas por permissões de rede (CGNAT / Whitelist)

### Contratos públicos
- Pasta fonte agnóstica de Schemas `/shared/schemas`
- Respostas tabuladas em Padrões JSON de Erro

## Diagramas

### Fluxo Principal e Validação Estrita
Este diagrama sequencial explora em detalhe a linha férrea das barreiras que atuam antes do domínio transacional. Fundamental para o raciocínio dos QAs visualizarem em que momento as interceptações `401`, `403` e `400` defletem do fluxo de persistência BD.

```mermaid
sequenceDiagram
    participant PWA as Client PWA
    participant Exp as Express Route
    participant Auth as Middleware Auth
    participant Ten as Middleware Tenant
    participant Zod as Middleware Zod
    participant Ctr as API Controller
    participant DB as MongoDB Atlas

    PWA->>Exp: POST request
    Exp->>Auth: Verifica Token
    
    alt JWT Ausente Expirado
        Auth-->>PWA: 401 Unauthorized
    else JWT Valido
        Auth->>Ten: Injeta Contexto
        Ten->>Ten: Checa target tenantId
    end
    
    alt Risco Cross-tenant
        Ten-->>PWA: 403 Forbidden
    else Autorizado
        Ten->>Zod: Repassa body limpo
        Zod->>Zod: Executa Zod Strip
    end

    alt Payload Falho
        Zod-->>PWA: 400 Bad Request
    else Dados 100% estritos
        Zod->>Ctr: req.validatedBody
        Ctr->>DB: Mutacao do Documento
        DB-->>Ctr: Result Callback
        Ctr-->>PWA: 201 Created
    end
```

**Notas**:
- Nenhuma validação depende de dados mascarados presentes ou declarados ativamente pelo 'Body' da chamada.
- O campo vital `tenantId` provém do server-side via injeção.

---

### Roteamento de Erros e Exceções
Abordagem comportamental top-down traçando o fim de vida de requisições incompletas. Este diagrama serve como gabarito ao acionar instrumentação visual do Sentry na leitura de quedas na fila lógica.

```mermaid
flowchart TD
    Req[Req HTTP Endpoint] --> A{Valida JWT Auth}
    
    A -->|Invalido| E401[401 Unauthorized]
    A -->|Valido| T{Valida Owner Tenant}
    
    T -->|Nao Pertence| E403[403 Forbidden]
    T -->|Pertence| Z{Valida Via Zod}
    
    Z -->|Formatacao Ruim| E400[400 Bad Request Payload]
    Z -->|Valido Completo| C[Controller de Transacao]
    
    C --> DB[(MongoDB Colecoes)]
    
    DB -->|Surge Validation Error| EG[Erro Global Handler]
    C -->|Exception de Lógica| EG
    
    EG --> E500[500 Internal Error]
```

**Notas**:
- O `Error Global Handler` esconde as faturas técnicas da nuvem transformando rastreios críticos em `500` simplificado.
- Somente a camada `Zod` retorna array detalhado na interface transacional expondo os dados incorretos da chamada.

---

### Mitigações de Riscos Arquiteturais
Flutograma modelador de como as decisões técnicas engolem resposabilidades com relação as adversidades limitantes por ISP da web (como blocos de CGNAT comuns em 4G). Útil na consulta do suporte / onboarding de contas.

```mermaid
flowchart LR
    Z[Restricao Absoluta Zod] --> F{Feature Flag State}
    F -->|Ativo| Z2[Schema Rígido Nativo]
    F -->|Desligado Emergencia| Z1[Bypass da Etapa / Ignora]
    
    R[Balanceia Rate Limit] --> L{Isolamento e Proxy}
    L -->|Regra Aplicada Limitada| T[Por tenantId Request]
    L -->|Regra Confiante Absoluta| W[Evolution ISP Whitelist]
```

**Notas**:
- `tenantId Request Rate Limit` blinda que dezenas de marcações num café de rede única colidam com o limite padrão pelo Express baseando-se por IP publico.

---

### Sincronia Contratual Partilhada
Ilustração referencial de onde as chaves base pre-formam blocos de confiança atrelados simultaneamente. Aborda o "Risco-03" relatado documentando a fonte da verdade da tipagem.

```mermaid
classDiagram
    class SharedSchemas {
        +agendamentoSchema Struct
        +clienteSchema Struct
    }
    
    class FrontendPWA {
        +Interrompe Formulario HTML
        +Sinaliza Erro UI Client
    }
    
    class BackendAPI {
        +Deflete Chamada de Rota
        +Injeta req.validatedBody
    }
    
    SharedSchemas <|-- FrontendPWA
    SharedSchemas <|-- BackendAPI
```

**Notas**:
- Padrão arquitetural voltado inteiramente ao impedimento do erro silenciado visual e falha lógica de backend (`400 Bad Request` disparada atoa entre o PWA e Server desatualizados).
