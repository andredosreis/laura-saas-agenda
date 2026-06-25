### FDD: Sistema de Rotas da API

Versão: 1.0
Data: 2026-04-07
Responsável: André dos Reis

---

### 1. Contexto e motivação técnica
Este FDD formaliza os contratos técnicos das rotas transacionais internas da API — Clientes, Agendamentos, Pacotes e Financeiro. Endereça a ausência de validação de input com Zod no backend e estabelece a especificação de payload, respostas e erros necessária para a criação de testes. Auth e Webhook estão fora do escopo deste documento.

---

### 2. Objetivos técnicos
- Atingir 100% de cobertura de validação com Zod bloqueando requests inválidos antes de atingir controllers (retorno 400 padronizado).
- Garantir blindagem irrestrita cross-tenant: falha/ausência de token → 401; acesso a recurso de outro tenant → **404** (nunca 403, para não revelar a existência do recurso).
- Obter P95 das rotas transacionais medido rigorosamente < 500ms.
- Zerar a incidência sistêmica de erros *ValidationErrors* causados por dados malformados na runtime do Mongoose, na produção.

---

### 3. Escopo e exclusões

**Incluído**
- Validação e definição contratual do Sistema de Rotas da API internos.
- Rotas: Clientes, Agendamentos, Pacotes e Financeiro.

**Excluído**
- Fluxos de validação de Autenticação / Tokens de Origem.
- Endpoint assíncrono do Webhook WhatsApp/Evolution e arquitetura GPT da IA.

---

### 4. Fluxos detalhados e diagramas
**Fluxo principal**
1. Request HTTP entra no Express.
2. Middleware de Autenticação (Verifica JWT, Extrai `userId`/`tenantId`/`role` injetando no `req.user`, ou bloqueia 401).
3. Middleware de Autorização `authorize` (RBAC por `role`/plano, ou bloqueia 403). Não filtra por tenant.
4. Middleware de Validação Zod (Valida schema, aciona funcionalidade 'strip' e injeta a varíavel nativa protegida `req.validatedBody`, ou devolve array de logs em 400).
5. Controller (Executa lógica do negócio sobre DB Mongoose, **sempre com `{ tenantId }` na query**; recurso de outro tenant → 404).
6. Error Handler Global (Garante a tratativa e muta o stack trace crítico de erros server-side não previstos numa mensagem padrão vazia).
7. Resposta Transacional Padronizada ao PWA (`{ "success": true, "data": ... }`).

**Fluxos alternativos e exceções**
- Carga corrompida recusa a injeção do Zod, recuando fluxo para o Client antecipadamente como um HTTP 400 limpo da API, omitindo consumo fútil BD.
- Acesso cross-tenant: a query do controller inclui sempre `{ tenantId }`, pelo que um recurso de outro tenant simplesmente não é encontrado → **HTTP 404 limpo** (nunca 403 — não se revela que o recurso existe).

---

### 5. Contratos públicos (assinaturas, endpoints, headers, exemplos)
**Contratos da API Transacional**
- Tipo: endpoint
- Métodos e Rotas padrão:
  - GET /api/{recurso} → 200 + { success: true, data: [...], pagination: {...} }
  - GET /api/{recurso}/:id → 200 + { success: true, data: {...} } | 404
  - POST /api/{recurso} → 201 + { success: true, data: {...} }
  - PUT /api/{recurso}/:id → 200 + { success: true, data: {...} } | 404
  - DELETE /api/{recurso}/:id → 200 + { success: true, data: {...} } | 404

  > Rotas montadas em dual-path: `/api/<recurso>` (legacy) e `/api/v1/<recurso>` (canónico).
- Semântica de status/headers:
  - `Authorization`: `Bearer <JWT>`
  - `Content-Type`: `application/json`
  - Timeout: 500ms(simples) / 2000ms(terceiros).
  - Rate Limiting: 100req/15min gerais, e afunilamento de 10req/15min em vias write/post baseados sob alçada do TenantId (evitando colisão do IP de proxy).
  - Limite de Body size estrito atrelado a < 1MB.

**Exemplo de requisição — POST /api/agendamentos**
```json
{
  "clienteId":  "string (ObjectId MongoDB — obrigatório)",
  "data":       "string (ISO 8601: YYYY-MM-DD — obrigatório)",
  "hora":       "string (HH:MM — obrigatório)",
  "servico":    "string (min 2, max 100 — obrigatório)",
  "pacoteId":   "string (ObjectId — opcional)",
  "notas":      "string (max 500 — opcional)"
}
```

**Exemplo de resposta (201 Created)**
```json
{
  "success": true,
  "data": {
    "id":        "string (ObjectId)",
    "tenantId":  "string (ObjectId)",
    "clienteId": "string (ObjectId)",
    "data":      "string (ISO 8601)",
    "hora":      "string (HH:MM)",
    "servico":   "string",
    "estado":    "agendado",
    "pacoteId":  "string | null",
    "notas":     "string | null",
    "criadoEm":  "string (ISO 8601)"
  }
}
```

---

### 6. Erros, exceções e fallback

- Matriz de erros previstos e tratamentos (contrato fixo `{ success: false, error }`):
  - 400: `{"success": false, "error": "Payload inválido", "detalhes": [{ "campo": "nome", "mensagem": "..."}]}`
  - 401: `{"success": false, "error": "Token ausente ou expirado"}`
  - 403: `{"success": false, "error": "Sem permissão"}` (por role/plano — nunca por tenant)
  - 404: `{"success": false, "error": "Recurso não encontrado"}` (inclui acesso a recurso de outro tenant)
  - 500: `{"success": false, "error": "Erro interno"}`
- Estratégias de resiliência: Timeouts duplos e *Error Handler Global* absorvendo quebras de node não programadas (s/ expor *stack traces* em prop). 
- Invariante estrutural Crítico: **`tenantId` deriva exclusivamente do lado da malha do Servidor atado pelo JWT. Não interage em input ou request.**

---

### 7. Observabilidade

**Métricas**
- Volume quantificado da totalidade do código `5xx` nativo.
- Cargas intensas de `401`/`404` indicando agressividade exploratória ou tentativas de acesso cross-tenant.

**Logs**
- Formato e campos essenciais: Log JSON processado via app pacote central `Pino` (filtrando info/warn/error). Presença injetada obrigatória e simultânea do pilar `tenantId` e `requestId`.
- Restrição severa de dados mascarando explicitamente de forma inquebrável (Masking): campos livres (notações, nomes, anamnese, ou contatos).

**Tracing**
- Spans principais de amostragem na Cloud integrados no console visual da Sentry, disparando na latência do Mongoose estendida acima de > 300ms.
- Correlação transversal da sessão linkada diretamente via header inserido programaticamente no express como `X-Request-Id`.

**Dashboards e alertas**
- Monitoramento do pipeline base enviando triggers e *Email/Slack* vinculando os contadores estritos de desvios (400, 401, 404 cross-tenant e 500 concentrados).

---

### 8. Dependências e compatibilidade

| Componente | Versão mínima | Observações |
| --- | --- | --- |
| Node.js | v18+ | ESM Nativo. Operador interno `crypto.randomUUID()`. |
| Mongo | v6+ / Mongoose v8.1+ | Infra e plugin de esquemas de BD atuais da esteira. |
| zod | Última versão | Middleware validador de payload novo. |
| @sentry/node | v7+ / recente | SDK de interceptação estática. |
| pino / express-rate-limit | Recentes | Ferramental passivo do Request/Pipeline base. |

**Garantias de compatibilidade**
- **Nenhuma Breaking Change será operada visualmente contra a client-side PWA**. Devido ao *Pipeline Filter* orgânico que apenas atua bloqueando no pregate-way (camada da API Zod de pre-processamento). Objetos JSON de resposta legítimos ou antigos mantêm 100% de paridade.

---

### 9. Critérios de aceite técnicos

- `CA-01` — Unit Tests (Supertest) demonstram isolamento imediato da falha do `schema payload` (HTTP 400 + details JSON Array) provando ausência da chamada de mutação dos Controllers.
- `CA-02` — Testes atestam o isolamento multi-tenant: um tenant que tenta aceder a recurso de outro recebe **HTTP 404** (nunca 403 nem 200). `tenantId` do body é ignorado — só conta o do JWT.
- `CA-03` — Obtenção em observabilidade contínua confirmando métrica final engessada do indicador latência real P95 rotineiramente em tempo de < 500ms.
- `CA-04` — `requestId` provado vivo dentro das amarrações logadas JSON (Pino) unindo sua id ao painel/context estático trace do Sentry e header finalizado.
- `CA-05` — Cessação de totalidade contável gerando falhas em Produção causadas em log por `ValidationErrors` nativo retornado nas threads sujas do Mongoose via input errado.

---

### 10. Riscos e mitigação

#### RISCO-01 — Falsos positivos do Zod bloqueando o PWA
- **Probabilidade:** Média
- **Impacto:** Alto — Impedimento central de operações normais criadas nativamente como agendamentos.
- **Mitigação:**
    - Afrouxamentos iterativos na modelagem REGEX nativa monitorando o comportamento reativo perante falsos positivos em produção.
    - Contagem dedicada de incidências `400s` em *Dashboard/Spans* iniciais.
- **Plano de contingência:** Adoção de uma barreira passiva flexível "Feature Flag" isentando de interrupção ou recusa o endpoint em casos críticos, dispensando grandes rollbacks gerais.

#### RISCO-02 — Rate limiting agressivo bloqueando ISPs (CGNAT / Nat Base)
- **Probabilidade:** Média
- **Impacto:** Médio — Travagem acidental contra redes atreladas/compras de Proxy dos clientes.
- **Mitigação:**
    - Abordagem unificadora implementada rate limiter com base no ID único do `tenantId` ao invés da filtragem por IP padrão. Limitando falsos positivos na malha interna operando Web.
    - Setup obrigatório do `trust proxy` (backend atrás do nginx no VPS Contabo) e IP WhiteList visando os IPs fixos da Evolution API Gateway.
- **Plano de contingência:** Modulação passiva por ambiente relaxando limites nas engrenagens ativas por tenants/IDs específicos sob reclamação de instabilidade.

#### RISCO-03 — Desincronização letal entre Schemas Zod PWA vs Backend
- **Probabilidade:** Médio/Alto
- **Impacto:** Alto — Risco orgânico em FullStacks Zod induzindo a aprovação aparente da ação, invalidado internamente num descolamento mudo na versão do Schema de duas partes.
- **Mitigação:**
    - Movimento logístico obrigatório construindo pacote partilhado monolítico da pasta base `/shared/schemas`, alinhando de raiz os pacotes em um código central partilhado pelo react/node.
- **Plano de contingência:** Estruturação defensiva operando `Contract testings` passivos integradores nos CI Pipelines impedindo compilação paralela diferente entre a frente visual e engine.
