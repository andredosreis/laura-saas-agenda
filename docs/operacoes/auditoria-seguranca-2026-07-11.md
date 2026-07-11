# Auditoria de Segurança Marcai — 2026-07-11

Auditoria técnica do backend Node/Express, frontend React/PWA, microserviço Python de IA e configuração Docker/Nginx.

| Campo | Valor |
|---|---|
| Data | 2026-07-11 |
| Branch | `main` |
| Commit analisado | `cdf1663` |
| Branch de trabalho | `main` — alterações locais ainda sem commit |
| Tipo | Auditoria estática, análise de dependências e testes locais |
| Risco global | **Alto** |
| Estado | Remediação aplicada parcialmente; todos os P0 mitigados e P1/P2 residuais documentados |

> Este documento não é um pentest de produção. Não foram executados ataques contra serviços reais, não foram validadas regras de firewall/cloud nem foram examinados dados reais. As conclusões abaixo resultam do código e configuração presentes no repositório, dos manifests/lockfiles e da suite de testes local.

### Actualização de remediação — 2026-07-11

Foi aplicada uma primeira wave de hardening após a auditoria:

- **Mitigados:** SEC-001 a SEC-007, SEC-014 e SEC-015. A integração Z-API de SEC-001 foi removida integralmente; apenas a Evolution permanece activa.
- **Parcialmente mitigados:** SEC-009 (backend sem advisories altos/críticos; frontend e Python pendentes), SEC-010 (CSP adicionada; tokens ainda em `localStorage`) e SEC-011 (containers non-root; socket Docker ainda exposto ao Dozzle).
- **Abertos:** SEC-008, SEC-012, SEC-013 e SEC-016.

As alterações incluem remoção integral do webhook Z-API legacy, remoção da migração HTTP, Push associado ao JWT/tenant, RBAC granular, validação do utilizador/tenant actual em cada JWT, revogação por `authVersion`, refresh tokens hasheados com consumo atómico, redaction de logs, limites no FastAPI, respostas de erro genéricas e execução non-root dos containers. O audit de produção do backend ficou em **0 críticos, 0 altos e 2 moderados**, ambos no caminho `node-cron` 3 → `uuid`; a correcção automática exige uma major do `node-cron` e deve ser validada separadamente.

## Estado detalhado da implementação na `main`

> **Atenção operacional:** todo o trabalho está directamente no worktree da branch `main`, baseado no commit `cdf1663`. Não foi criado commit, tag, branch de segurança ou push remoto. Antes de qualquer operação Git destrutiva, estas alterações devem ser preservadas.

### Backend — autenticação e sessões

- `authenticate` deixou de confiar apenas nas claims do JWT e passa a carregar o utilizador actual da base de dados.
- Utilizadores inexistentes/inactivos, divergência de tenant, tenant inactivo e plano fora de `ativo|trial` são bloqueados.
- Role e permissões downstream são obtidas do registo actual, evitando privilégios antigos durante toda a duração do token.
- `authVersion` foi adicionado ao utilizador e ao access token para revogar sessões após logout global, alteração ou recuperação de password.
- `authVersion`, hashes de password, refresh tokens e tokens de recuperação são removidos do objecto seguro devolvido pela API.
- Refresh tokens novos são guardados apenas como SHA-256; o campo plaintext existe temporariamente apenas para consumir sessões anteriores.
- A rotação passou a consumir o refresh token atomicamente, evitando duas respostas válidas em pedidos concorrentes.

### Backend — autorização e isolamento

- Foi criado `requirePermission(permission)` e aplicado às rotas de clientes, agendamentos, pacotes, compras, pagamentos, caixa, transações, fechamentos, utilizadores, leads, conversas, histórico, dashboard, analytics, horários e configuração.
- A identidade das subscrições Web Push é derivada exclusivamente do JWT; `tenantId + userId` passaram a fazer parte do registo e índice.
- A rota HTTP de migração deixou de ser montada por `app.js`; migrações ficam limitadas ao fluxo operacional por script.
- O bypass acidental de `admin` em `authorize` foi removido; apenas `superadmin` ignora restrições de role.
- Permissões persistidas são mescladas sobre os defaults da role, preenchendo chaves novas sem sobrescrever `false` explícito.
- Foram introduzidas permissões semânticas para `gerenciarHistorico`, `editarFinanceiro` e `registrarPagamentos`.

### WhatsApp e Z-API

- A integração Z-API não é mais utilizada e foi removida do runtime.
- Foram removidos `/api[/v1]/whatsapp/webhook`, schema, middleware, controller e helpers exclusivos desse fluxo.
- Foram eliminados `functionDispatcher.js`, `langchainTools.js`, `openaiHelper.js`, o script manual antigo e `tests/test_zapi.js`.
- A origem Z-API foi removida da whitelist CORS e as variáveis Z-API foram retiradas do exemplo/guia de deploy.
- Novos tenants usam `provider: evolution` por defeito. O valor `zapi` permanece apenas no enum para permitir leitura/migração de documentos históricos; não existe cliente ou endpoint Z-API activo.
- O teste de regressão confirma que o endpoint antigo devolve `404`.

### Logs, email e privacidade

- Request bodies deixaram de ser registados em produção e, fora de produção, exigem opt-in explícito.
- Foi adicionada redaction recursiva para passwords, tokens, segredos e chaves Web Push aninhadas.
- O serviço de email já não escreve corpo ou token nos logs.
- A ausência de Resend já não interrompe o arranque por defeito. O boot só é fatal quando `EMAIL_REQUIRED=true`; corpos e tokens continuam fora dos logs.
- Eventos WhatsApp `@lid` deixaram de persistir o payload integral; ficam apenas metadados mínimos e identificadores em hash.

### Frontend

- O `userId` hardcoded foi removido do serviço de Push.
- Foram adicionados CSP, `Referrer-Policy` e `Permissions-Policy` no Vercel.
- O modal de colaboradores expõe `gerenciarHistorico`, `editarFinanceiro` e `registrarPagamentos`, com os mesmos defaults do backend e compatibilidade com registos antigos.
- O build de produção passou após as alterações.
- Access e refresh tokens continuam no `localStorage`; a migração para cookie HttpOnly permanece pendente.
- As dependências do frontend ainda não foram actualizadas nem re-auditadas após o levantamento inicial.

### Serviço de IA

- Requests receberam limites Pydantic para tenant, instância, telefone, mensagem e IDs.
- A transcrição valida MIME/base64 e limita o áudio codificado a 15 MB.
- Excepções internas deixaram de ser devolvidas como `str(exc)`; callers recebem mensagem genérica.
- O container passou a executar com utilizador dedicado non-root.
- As dependências Python continuam pendentes de actualização e novo `pip-audit`.

### Containers e dependências

- Backend e IA passaram a executar non-root; os ficheiros do backend são copiados com ownership do utilizador `node`.
- O socket Docker do Dozzle ainda precisa de proxy/allowlist ou remoção.
- Dependências directas do backend foram actualizadas, incluindo Axios, Sentry, BullMQ, LangChain, Morgan, `qs` e `express-rate-limit`.
- O audit de produção do backend passou de 18 findings para 2 moderados; ambos dependem da migração major de `node-cron` 3 para 4.

### Testes e estado de validação

- Backend completo: 76 suites e 619 testes passaram.
- Testes focados no code review: 56/56 passaram.
- Serviço de IA: 92 passaram e 1 ficou `xfail`.
- Frontend: build de produção concluído.
- Lint backend: 0 erros e 4 warnings preexistentes em scripts de manutenção.
- Lint frontend: 0 erros e 6 warnings preexistentes de hooks/fast-refresh.
- `git diff --check`: sem erros.
- Vinte e dois ficheiros de teste foram adaptados para criar utilizadores reais e permissões persistidas, compatíveis com o novo `authenticate`.
- A suite backend completa foi executada depois das adaptações e ficou integralmente verde.

### Checklist antes de concluir/commit na `main`

1. [x] Corrigir o bypass de `admin` e confirmar defaults/overrides de `requirePermission`.
2. [x] Executar a suite backend completa: 76 suites, 619 testes, tudo verde.
3. [x] Repetir lint, build frontend e testes IA.
4. [ ] Repetir audits do frontend/Python quando as dependências forem actualizadas.
5. [ ] Rever o diff integral, especialmente autenticação, RBAC e lockfile.
6. [ ] Criar um commit único ou commits temáticos na `main`, conforme a estratégia escolhida pelo responsável do repositório.

### Remediação do code review posterior

| # | Finding do review | Tratamento aplicado | Validação |
|---:|---|---|---|
| 1 | Boot quebrava sem `RESEND_API_KEY` | `initEmailService` só lança quando `EMAIL_REQUIRED=true`; sem provider faz degrade sem registar body/token | 2 testes de configuração passaram |
| 2 | Terapeuta bloqueado no histórico | Criada `gerenciarHistorico`; terapeuta/admin/gerente recebem `true`, sem conceder `editarClientes` ao terapeuta | POST real de histórico por terapeuta retornou 201 |
| 3 | Admin fazia bypass de `authorize` | Bypass restaurado para apenas `superadmin` | Teste unitário confirma admin → 403 quando role não permitida |
| 4 | Permissões parciais não recebiam chaves novas | Merge `{ ...defaultsDaRole, ...permissoesPersistidas }`; `false` explícito prevalece | Fixture legacy sem `criarClientes` conseguiu usar default de admin |
| 5 | Login e sessão divergiam sobre plano | Login e middleware aceitam apenas `ativo|trial`; suspensão bloqueia novos logins e sessões activas | Testes de suspensão e login passaram |
| 6 | Superadmin Push produzia 500 | Subscribe/unsubscribe/status sem tenant devolvem 403 controlado | Teste de superadmin passou |
| 7 | Escrita financeira usava `verFinanceiro` | Criadas `editarFinanceiro` e `registrarPagamentos`; rotas de transação, caixa, pagamentos, compras e fechamentos separadas por operação | Teste leitura=true/escrita=false retorna 403; suite financeira passou |
| 8 | Recepcionista bloqueado no pagamento avulso | Endpoint usa `registrarPagamentos`; default da recepção é `true` | Pedido chega ao controller e retorna 404 do recurso, não 403 de RBAC |
| 9 | IDs mudaram para ObjectId | `req.user.userId`, `req.user.tenantId` e `req.tenantId` permanecem strings | Teste de tipos passou |
| 10 | `await` serial no loop WhatsApp | Envio de lembretes usa `Promise.all` sobre agendamentos elegíveis | Lint sem erros e suite completa verde |

As três permissões novas também foram adicionadas ao modal de colaboradores no frontend, incluindo defaults por role e preenchimento de chaves ausentes em registos antigos.

---

## 1. Sumário executivo

O sistema tem uma base de segurança razoável: isolamento por base de dados de tenant nas rotas principais, validação Zod, Helmet, limites de payload, autenticação timing-safe para webhooks internos, protecção dedicada do painel super-admin e anti-replay no webhook Evolution.

Apesar disso, foram confirmadas superfícies que permitem contornar essas protecções. As cinco prioridades máximas são:

1. Um webhook Z-API legacy está exposto sem autenticação e consegue criar dados e disparar mensagens WhatsApp.
2. As permissões granulares dos colaboradores existem no modelo, mas não são aplicadas na maioria das rotas.
3. As subscrições Web Push são públicas e aceitam um `userId` arbitrário.
4. Uma rota de migração destrutiva está disponível a admins e aceita um tenant alvo indicado no body.
5. Bodies, dados pessoais e tokens de recuperação podem aparecer nos logs.

### Distribuição dos findings

| Prioridade | Quantidade | Tratamento recomendado |
|---|---:|---|
| P0 — imediato | 5 | Conter antes do próximo deploy público |
| P1 — alta | 7 | Corrigir na sprint de segurança seguinte |
| P2 — hardening | 4 | Incorporar no roadmap técnico |

### Decisão de lançamento

**Não recomendado lançar ou ampliar a exposição pública antes de concluir os P0.** Se o sistema já estiver em produção, devem ser aplicadas primeiro medidas de contenção: desactivar o webhook legacy e a rota HTTP de migração, proteger as subscrições Push e parar o registo de bodies/tokens.

---

## 2. Âmbito e metodologia

### Componentes analisados

- Backend Node.js/Express em `src/`.
- Frontend React/Vite/PWA em `laura-saas-frontend/`.
- Serviço FastAPI/LangChain em `ia-service/`.
- Docker Compose, Dockerfiles, Nginx, Vercel e gestão de segredos no repositório.
- Autenticação, autorização, isolamento multi-tenant, webhooks, logs, Push, dependências e operações de IA com efeitos reais.

### Verificações executadas

- Mapeamento de todas as rotas Express e respectivos middlewares.
- Pesquisa de usos de `tenantId`, modelos globais e modelos `req.models` por tenant.
- Pesquisa de segredos versionados sem imprimir valores sensíveis.
- Revisão dos fluxos JWT, refresh, reset de password, convite e verificação de email.
- `npm audit --omit=dev --json` no backend e frontend.
- `pip-audit` sobre o ambiente bloqueado pelo `uv.lock` do serviço de IA.
- Execução de sete suites de segurança e isolamento: **55 testes passaram**.

### Limitações

- Não foi testada a configuração efectiva do VPS, MongoDB Atlas, Vercel, DNS ou firewall.
- Não foram confirmadas as permissões reais das credenciais Mongo/Redis/Postgres.
- Não foi testada a robustez do segredo Evolution/Z-API em produção.
- Não foi executado DAST, fuzzing, SAST especializado ou análise histórica completa de segredos no Git.
- A explorabilidade de advisories de dependências depende do caminho de código utilizado; os totais do audit não equivalem automaticamente a vulnerabilidades remotas exploráveis.

---

## 3. Findings P0 — correcção imediata

### SEC-001 — Webhook Z-API legacy sem autenticação

**Severidade:** Crítica  
**Estado:** Resolvido — endpoint e código legacy removidos  
**CWE:** CWE-306 — Missing Authentication for Critical Function

**Evidência**

- `src/modules/ia/whatsappRoutes.js:18-20` monta `POST /webhook` sem `authenticate` nem `validateWebhook`.
- O comentário afirma que o token é validado no payload, mas o schema `zapiWebhookSchema` não contém token e o controller não faz essa validação.
- `src/modules/ia/whatsappController.js:58-98` aceita telefone/texto, consulta/cria `Cliente` no modelo global e chama `sendWhatsAppMessage`.
- A rota fica disponível nos dois mounts: `/api/whatsapp/webhook` e `/api/v1/whatsapp/webhook`.

**Impacto**

- Envio de mensagens para números escolhidos pelo atacante.
- Custos de WhatsApp e chamadas de IA.
- Criação ou alteração de clientes fora do isolamento DB-per-tenant.
- Spam, dano reputacional e poluição da base global legacy.

**Correcção recomendada**

1. Remover a rota se a integração Z-API já não estiver em uso.
2. Se ainda for necessária, usar um segredo independente, comparação timing-safe e validação de assinatura/timestamp.
3. Resolver o tenant exclusivamente pela instância configurada no servidor; nunca pelo body.
4. Aplicar anti-replay, rate limit e limites de tamanho/frequência.
5. Usar `getTenantDB`/`getModels` em vez de modelos globais.

**Critério de aceitação**

**Implementação:** concluída. A rota `/whatsapp/webhook`, o middleware, schema, controller e helpers exclusivos da Z-API foram removidos. Novos tenants usam `provider: evolution` por defeito.

- Pedidos sem assinatura, com assinatura errada, replay ou instância desconhecida devolvem `401/403` e não criam dados nem enviam mensagens.

---

### SEC-002 — RBAC e permissões granulares não são aplicados

**Severidade:** Alta  
**Estado:** Resolvido; middleware revisto e suite completa verde  
**CWE:** CWE-862 — Missing Authorization

**Evidência**

- `src/models/User.js:63-97` define permissões como `deletarClientes`, `verFinanceiro`, `deletarPacotes` e `editarConfiguracoes`.
- Não existe middleware que consulte `req.user.permissoes` ou recarregue as permissões da base de dados.
- `src/modules/clientes/clienteRoutes.js:19-25` permite todas as operações, incluindo `DELETE`, a qualquer utilizador autenticado.
- `src/modules/financeiro/pacoteRoutes.js:19-26`, `pagamentoRoutes.js:21-31` e `caixaRoutes.js:20-27` repetem o mesmo padrão.
- `PUT /api/auth/tenant` exige apenas autenticação (`src/modules/auth/authRoutes.js:50`), embora a permissão `editarConfiguracoes` exista.
- `requirePlan` está definido, mas não é usado nas rotas de produto; funcionalidades/limites de plano não são uma fronteira de backend consistente.

**Impacto**

Um terapeuta ou recepcionista pode chamar a API directamente para consultar ou alterar dados financeiros, eliminar clientes/pacotes e modificar configurações do tenant, mesmo quando a sua ficha diz explicitamente que não tem essas permissões.

**Correcção recomendada**

1. Criar `requirePermission(permission)` e carregar utilizador/estado actual do servidor.
2. Aplicar permissões a cada leitura/mutação; não depender da navegação do frontend.
3. Criar uma matriz única `rota × role × permissão × plano`.
4. Negar por omissão e testar todas as roles parametricamente.
5. Alinhar os nomes `terapeuta` e `profissional`, hoje inconsistentes em algumas rotas.

**Critério de aceitação**

- Cada permissão `false` produz `403` na rota correspondente e nenhuma mutação é executada.
- Alterar role/permissões invalida imediatamente ou em poucos segundos o acesso anterior.

---

### SEC-003 — Subscrições Web Push públicas e associáveis a qualquer utilizador

**Severidade:** Alta  
**Estado:** Resolvido e coberto por teste negativo  
**CWE:** CWE-639 — Authorization Bypass Through User-Controlled Key

**Evidência**

- `src/modules/notificacoes/notificationRoutes.js:16-18` expõe subscribe, unsubscribe e status sem `authenticate`.
- `src/modules/notificacoes/notificationController.js:6-24` aceita `userId`, endpoint e chaves do cliente.
- Os alertas posteriores procuram subscrições pelo `userId`; por exemplo, `src/modules/leads/leadInternalRoutes.js:579-595` e `src/modules/clientes/clienteInternalRoutes.js:692-708`.

**Impacto**

- Associação de uma subscrição controlada pelo atacante ao ID de um admin/cliente conhecido.
- Possível recepção de notificações destinadas à vítima.
- Enumeração parcial de estado por `GET /status`.
- Crescimento não autenticado da collection de subscrições.

**Correcção recomendada**

- Exigir JWT nas três rotas.
- Ignorar `userId` no body/query e usar apenas `req.user.userId`.
- Para destinatários sem conta, emitir token curto, assinado, de finalidade única.
- Guardar `tenantId` na subscrição e filtrar sempre por `tenantId + userId`.
- Aplicar rate limit e validação de origem.

---

### SEC-004 — Migração destrutiva disponível através da API

**Severidade:** Alta  
**Estado:** Resolvido — rota removida do runtime  
**CWE:** CWE-269 — Improper Privilege Management

**Evidência**

- `src/routes/migrationRoutes.js:9` permite `POST /api[/v1]/migration/run` a `admin` e `superadmin`.
- `src/controllers/migrationController.js:8-11` aceita `targetTenantId` do body.
- As operações `updateMany` em `:23-47` alteram documentos globais sem tenant; a correcção de `servicoAvulsoValor` nem usa filtro de tenant.

**Impacto**

- Atribuição massiva de documentos legacy ao tenant errado.
- Alterações irreversíveis ou difíceis de reconciliar.
- Um admin comum consegue actuar fora do seu âmbito normal.

**Correcção recomendada**

- Remover a rota do runtime de produção.
- Executar migrações como scripts operacionais versionados, com dry-run, backup, idempotência e aprovação explícita.
- Se existir uma necessidade excepcional de API, restringir a superadmin com step-up MFA, allowlist de ambiente e auditoria transaccional.

---

### SEC-005 — Exposição de tokens e dados pessoais em logs

**Severidade:** Alta  
**Estado:** Resolvido no código; revisão operacional de retenção do Dozzle pendente  
**CWE:** CWE-532 — Insertion of Sensitive Information into Log File

**Evidência**

- `src/middlewares/requestLogger.js:23-40` regista o body completo e faz apenas redaction rasa por nome de chave.
- Dados aninhados como `subscription.keys.auth`, observações clínicas, mensagens, telefones e informação financeira não são removidos.
- `src/services/emailService.js:40-45` regista o conteúdo integral do email quando Resend não está configurado. Os emails incluem tokens de reset, convite e verificação.
- `src/modules/messaging/controllers/webhookController.js:65-81` regista e persiste o payload completo de eventos `@lid`; a collection tem TTL, mas o log Dozzle pode ter retenção diferente.
- A execução dos testes confirmou visualmente que links de reset/verificação completos são escritos no output quando o email está em modo simulado.

**Impacto**

- Tomada de conta por alguém com acesso aos logs enquanto o token for válido.
- Exposição de dados pessoais e potencialmente dados de saúde/serviços, com risco RGPD.
- Maior impacto de uma credencial Dozzle comprometida ou de uma falha num colector de logs.

**Correcção recomendada**

1. Não registar request bodies em produção; usar allowlist de metadados (`method`, rota normalizada, status, duração, request ID, tenant/user pseudonimizados).
2. Implementar redaction recursiva no logger como defesa adicional.
3. Nunca registar o corpo de emails ou URLs com tokens, mesmo em desenvolvimento partilhado.
4. Definir `EMAIL_REQUIRED=true` apenas nos ambientes onde email é requisito de disponibilidade; sem provider, manter degrade seguro e nunca registar tokens.
5. Remover a captura temporária `@lid` assim que terminar o diagnóstico; limitar acesso e retenção entretanto.
6. Se os logs estiveram acessíveis a terceiros, invalidar tokens pendentes e rever acessos ao painel de logs.

---

## 4. Findings P1 — alta prioridade

### SEC-006 — JWT mantém role e estado antigos durante uma hora

**Severidade:** Alta, especialmente para superadmin
**Estado:** Resolvido com revalidação em DB e `authVersion`  

`src/middlewares/auth.js:25-53` valida a assinatura e confia em `role`, `tenantId` e outros claims sem confirmar que o utilizador e tenant continuam activos. O access token dura uma hora (`src/modules/auth/authController.js:23-45`). Desactivar um utilizador, suspender um tenant ou despromover um superadmin não revoga imediatamente o access token já emitido.

**Recomendação:** introduzir `tokenVersion/securityStamp`, validar estado actual em rotas sensíveis, usar access tokens mais curtos e exigir step-up/MFA para o painel super-admin.

### SEC-007 — Refresh tokens armazenados em texto simples e rotação não atómica

**Severidade:** Média/Alta
**Estado:** Resolvido para novas sessões; compatibilidade temporária com tokens legacy  

`src/models/User.js:176-182` guarda o JWT de refresh integral. `authController.js:406-447` verifica a string e faz `$pull` e `$push` em operações separadas. Uma leitura indevida da base permite usar sessões ainda válidas; pedidos concorrentes podem explorar a janela entre validação e rotação.

**Recomendação:** guardar hash SHA-256/HMAC, consumir o token atomicamente, limitar famílias/dispositivos e detectar reutilização de token antigo.

### SEC-008 — Verificação de email não é uma fronteira de acesso

**Severidade:** Média
**Estado:** Aberto  

O registo devolve access e refresh tokens antes da verificação. O login não bloqueia `emailVerificado=false`. Assim, a verificação é informativa e não prova titularidade antes do uso da conta.

**Recomendação:** permitir apenas onboarding limitado até à verificação, bloquear login/ações sensíveis ou usar um token de sessão restrito.

### SEC-009 — Dependências com advisories conhecidos

**Severidade:** Alta  
**Data do audit:** 2026-07-11
**Estado:** Parcial — backend sem altos/críticos; frontend e Python pendentes  

#### Backend

`npm audit --omit=dev` reportou **18 vulnerabilidades**: 3 altas e 15 moderadas.

| Dependência relevante | Versão instalada | Risco/nota |
|---|---:|---|
| `axios` | 1.15.0 | Directa; advisories altos de proxy, prototype-pollution gadgets e consumo de recursos; corrigir para `>=1.16.0` |
| `@sentry/node` | 10.50.0 | Cadeia OpenTelemetry moderada; update disponível |
| `bullmq` | 5.74.1 | Cadeia `uuid`; update disponível |
| `express-rate-limit` | 8.3.2 | Cadeia `ip-address`; update disponível |
| `morgan` | 1.10.1 | Log forging; update disponível |
| `node-cron` | 3.0.3 | Cadeia `uuid`; correcção exige major |
| `qs` | 6.15.1 | DoS em cenário específico; update disponível |

#### Frontend

O audit reportou **21 vulnerabilidades**: 14 altas, 6 moderadas e 1 baixa. Parte pertence à toolchain de build, mas há dependências directas afectadas.

| Dependência relevante | Versão instalada | Risco/nota |
|---|---:|---|
| `axios` | 1.13.2 | Directa; actualizar para `>=1.16.0` |
| `react-router-dom` | 7.12.0 | Directa; advisories na cadeia `react-router`; usar release corrigida posterior a 7.15.0 |
| `vite` | 6.4.1 | Toolchain; path traversal/file read no dev server |
| `postcss` | 8.5.6 | Toolchain; update disponível |

#### Serviço Python

`pip-audit` encontrou **14 vulnerabilidades em 8 packages**.

| Package | Instalada | Mínimo sugerido pelo audit |
|---|---:|---:|
| `cryptography` | 48.0.0 | 48.0.1 |
| `idna` | 3.13 | 3.15 |
| `langchain` | 1.2.17 | 1.3.9 |
| `langgraph-checkpoint` | 4.0.3 | 4.1.1 |
| `langgraph-sdk` | 0.3.14 | 0.3.15 |
| `langsmith` | 0.8.3 | 0.8.18 |
| `pydantic-settings` | 2.14.0 | 2.14.2 |
| `starlette` | 1.0.0 | 1.3.1 cobre o conjunto reportado; validar compatibilidade com FastAPI |

**Recomendação:** actualizar em PRs separados por componente, regenerar locks, executar suites completas e repetir os audits. Não usar `npm audit fix --force` sem rever mudanças major.

### SEC-010 — Tokens no localStorage sem Content Security Policy

**Severidade:** Média
**Estado:** Parcial — CSP aplicada; tokens continuam no `localStorage`  

`laura-saas-frontend/src/services/api.js:27-29,49-52,87-97` guarda e lê access/refresh tokens no `localStorage`. Não foram encontrados `dangerouslySetInnerHTML`, `eval` ou sinks XSS directos, o que reduz o risco actual, mas qualquer XSS futuro ou dependência comprometida consegue extrair ambos os tokens.

`laura-saas-frontend/vercel.json:29-44` define `nosniff` e `X-Frame-Options`, mas não define CSP, `Referrer-Policy` ou `Permissions-Policy`.

**Recomendação:** refresh token em cookie `HttpOnly`, `Secure`, `SameSite`; access token em memória; CSP restritiva com rollout `Report-Only`; se cookies forem usados para mutações, adicionar protecção CSRF/origin.

### SEC-011 — Containers root e socket Docker exposto ao Dozzle

**Severidade:** Média/Alta
**Estado:** Parcial — containers non-root; socket Dozzle pendente  

- O `Dockerfile` do backend diz “utilizador não-root”, mas não contém `USER`.
- `ia-service/Dockerfile` também executa como root.
- `docker-compose.prod.yml:35-43` usa `amir20/dozzle:latest` e monta `/var/run/docker.sock`. O sufixo `:ro` não transforma a API do daemon numa API read-only; o impacto de comprometer esse container pode atingir o host.
- Imagens `latest` não são reprodutíveis.

**Recomendação:** utilizadores não-root, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, limites de recursos, imagens/digests fixos e Docker socket proxy com endpoints allowlisted.

### SEC-012 — Operações da IA dependem de confirmação semântica do LLM

**Severidade:** Média
**Estado:** Aberto  

As tools capturam `tenant_id`, `lead_id` e `cliente_id` por closure, uma boa defesa contra troca directa de tenant. Porém, marcar, remarcar, cancelar, alterar pipeline e alertar a equipa ainda dependem do modelo interpretar correctamente a intenção do texto WhatsApp. Prompt injection ou erro do modelo pode produzir uma chamada válida mas não desejada.

Além disso, quando LangSmith tracing está activo, conversas e metadados podem ser enviados a um terceiro. O domínio inclui observações clínicas e informação potencialmente sensível.

**Recomendação:** implementar estado de confirmação determinístico no backend para mutações, idempotency keys, políticas por tool e auditoria. Rever DPA, retenção, região e redaction de PII para todos os fornecedores LLM/tracing.

---

## 5. Findings P2 — hardening

### SEC-013 — Rate limiting apenas parcial e em memória

**Estado:** Aberto  

Os limiters cobrem login, registo, refresh e forgot-password, mas não existe uma política global consistente para webhooks, Push, reset/verify e rotas administrativas. O storage default de `express-rate-limit` é por processo, sendo reiniciado em deploys/restarts e não partilhado entre réplicas.

**Recomendação:** Redis store, chaves por IP + conta/tenant conforme o fluxo, limites específicos para endpoints caros e rate limit após autenticação do webhook para não facilitar DoS por terceiros.

### SEC-014 — Limites de payload incompletos no serviço de IA

**Estado:** Resolvido no serviço; quotas por tenant permanecem como hardening  

`ProcessLeadRequest.mensagem`, `ProcessClientRequest.mensagem` e `TranscribeRequest.audio_base64` não têm `max_length`. O endpoint de transcrição pode provocar grande consumo de memória e custo do provider se o service token for comprometido ou usado indevidamente.

**Recomendação:** limites Pydantic, limite de body no proxy/Uvicorn, validação estrita de MIME/base64 e quota por tenant.

### SEC-015 — Erros internos expostos pelo FastAPI a callers internos

**Estado:** Resolvido  

`ia-service/src/ia_service/routers/process.py:45-52,82-89` devolve `detail=str(exc)`. Embora o serviço esteja numa rede interna e autenticado, detalhes de providers, URLs ou estrutura interna podem propagar-se para logs/callers.

**Recomendação:** devolver erro genérico com correlation ID e manter detalhes apenas no logger com redaction.

### SEC-016 — Superfície legacy duplicada

**Estado:** Aberto  

O dual-mount `/api/*` e `/api/v1/*` mantém duas URLs para quase todas as rotas. Isto aumenta inventário, documentação e tempo necessário para retirar endpoints antigos.

**Recomendação:** definir prazo de depreciação, telemetria de utilização e remover o mount legacy quando os clientes estiverem migrados.

---

## 6. Controlos positivos confirmados

| Controlo | Evidência/estado |
|---|---|
| DB-per-tenant | `authenticate` injecta `getTenantDB(decoded.tenantId)` e `req.models`; controllers principais filtram também `tenantId` |
| Webhook Evolution | Segredo obrigatório, comparação timing-safe e fail-closed |
| Anti-replay | `ProcessedMessage` com unique index/TTL e deduplicação semântica curta |
| Superadmin | Router-level `authenticate + requireSuperadmin`, auditoria e testes sweep |
| Validação | Zod em grande parte das rotas públicas; schemas strict nos fluxos de autenticação |
| Mass assignment | Controllers principais usam campos explícitos em várias mutações críticas |
| Passwords | bcrypt com custo 12 e regras de password forte |
| Segredos no repositório | Não foram encontrados `.env`, chaves privadas ou credenciais reais tracked; `.gitignore` e `.dockerignore` cobrem os ficheiros de ambiente |
| Headers API | Helmet activo |
| Payload API | 10 KB na API normal e 1 MB no webhook Evolution |
| Isolamento testado | Suite multi-tenant confirmou 404/leitura isolada nos caminhos cobertos |

---

## 7. Plano de remediação

### Wave 0 — contenção, antes do próximo deploy

- [x] Desactivar/remover o webhook Z-API legacy ou exigir assinatura válida.
- [x] Remover a rota HTTP de migração do runtime de produção.
- [x] Proteger `/notifications/*` e derivar identidade apenas do JWT.
- [x] Parar de registar request bodies e conteúdos de emails.
- [x] Tornar email fatal apenas com `EMAIL_REQUIRED=true`; sem provider, fazer degrade sem expor corpo/tokens.
- [ ] Rever acessos/retenção do Dozzle e invalidar tokens pendentes se houver suspeita de exposição.

### Wave 1 — autorização e regressão

- [x] Implementar `requirePermission` e matriz de autorização.
- [x] Proteger configuração, clientes, pacotes, financeiro, leads e conversas por permissão.
- [x] Aplicar enforcement de plano no backend.
- [ ] Criar testes negativos paramétricos para todas as roles.
- [x] Criar testes específicos para webhook legacy, Push IDOR e migração.

### Wave 2 — sessões e supply chain

- [x] Implementar revogação/tokenVersion e validação de estado actual.
- [x] Hashear refresh tokens e tornar rotação/reuse detection atómica.
- [ ] Exigir verificação de email para acesso completo.
- [ ] Activar MFA/step-up para superadmin.
- [ ] Actualizar dependências Node, frontend e Python; backend parcialmente concluído (sem altos/críticos).

### Wave 3 — hardening de plataforma e IA

- [ ] Migrar refresh token para cookie HttpOnly; CSP já adicionada.
- [ ] Reduzir capabilities/socket Docker; containers já executam non-root.
- [ ] Centralizar rate limits em Redis.
- [ ] Adicionar quotas de IA; limites de mensagem/áudio já aplicados.
- [ ] Adicionar confirmação determinística e auditoria para tools com efeitos reais.
- [ ] Rever RGPD/DPA e redaction dos dados enviados a LLMs/LangSmith.

---

## 8. Testes executados

Comando:

```bash
npm test -- --runInBand \
  tests/auth.test.js \
  tests/auth-validation.test.js \
  tests/auth-extended.test.js \
  tests/multiTenant.test.js \
  tests/admin-superadmin.test.js \
  tests/lead-internal-auth.test.js \
  tests/webhook-replay-protection.test.js
```

Resultado:

```text
Test Suites: 7 passed, 7 total
Tests:       55 passed, 55 total
```

Os testes confirmam os controlos que cobrem, mas não invalidam os findings deste relatório. Em particular, não há cobertura adequada para:

- autorização baseada em `User.permissoes`;
- regressão que volte a expor o webhook Z-API removido;
- subscrição Push associada a outro utilizador;
- migração cross-tenant;
- access token após suspensão/despromoção;
- redaction recursiva e ausência de tokens nos logs;
- prompt injection/confirmação de tools com mutação.

### Validação após a remediação e code review

- Backend completo: **76/76 suites e 619/619 testes passaram**.
- Testes focados no code review: **56/56 passaram**.
- Serviço de IA: **92 passaram e 1 xfailed**.
- Frontend: build de produção concluído com sucesso.
- Lint backend: **0 erros** e 4 warnings preexistentes em scripts de manutenção.
- Lint frontend: **0 erros** e 6 warnings preexistentes.
- `git diff --check`: sem erros de whitespace.
- Audit de dependências de produção do backend: **0 críticos, 0 altos e 2 moderados**.

Durante os testes da IA, o envio opcional de traces ao LangSmith falhou por DNS/rede restrita, mas o processo terminou com exit code 0 e todos os testes locais esperados passaram. A suite backend ainda usa `--forceExit` e emite avisos de handles assíncronos/Mongoose depreciação; são dívidas de qualidade, não falhas funcionais desta remediação.

---

## 9. Critério de encerramento da auditoria

O risco pode ser reclassificado de **Alto** para **Moderado** quando:

1. Todos os P0 estiverem corrigidos e cobertos por testes negativos.
2. A matriz RBAC estiver aplicada no backend.
3. Dependências directas altas estiverem actualizadas ou formalmente mitigadas.
4. Tokens de reset/verificação e PII deixarem de aparecer nos logs.
5. Suspensão/despromoção revogar acesso dentro de um SLA definido.

Após essas alterações deve ser feita uma nova revisão do diff, execução das suites completas e, antes de clientes adicionais, um teste dinâmico autenticado em ambiente staging.
