# ADR-016: Upgrade Evolution API v1.8.6 → v2.x

**Status:** Aceite — Em Implementação (Fase 3 concluída)
**Data:** 2026-04-19
**Módulo:** WA (WhatsApp Integration)
**Autor:** André dos Reis
**Score de Impacto:** 140 (Crítico)

---

## Contexto

O sistema está actualmente em **Evolution API v1.8.6** (Railway, imagem `atendai/evolution-api:v1.8.7`), documentada no [ADR-014](./ADR-014-evolution-api-whatsapp-migration.md).

**Problema raiz:** A v1.8.6 entrega `remoteJid` em formato `@lid` (WhatsApp Local Identifier — ex: `110217870221345@lid`) em vez do JID real (`351XXXXXXXXX@s.whatsapp.net`). O `webhookController.js:90` faz apenas `replace('@s.whatsapp.net', '').replace('@c.us', '')`, pelo que o `@lid` passa intacto para a procura de cliente por telefone. Resultado: nenhum match, confirmação SIM/NÃO não é processada, status não muda, admin não é notificado.

A v1.x **não tem toggle** para desactivar LID (confirmado via Evolution Manager e Railway Variables — 13 vars, nenhuma relacionada com LID). Na v2.x, o Baileys subjacente resolve o LID automaticamente para o número real.

**Motivação para upgrade imediato:** O sistema ainda está em fase de testes (sem clientes activos em produção). Upgrades futuros com clientes activos seriam muito mais arriscados — a IA estaria a enviar mensagens, os workers BullMQ a agendar lembretes, e qualquer downtime do WhatsApp bloquearia o core do produto.

---

## Decisão

Adoptar **Evolution API v2.x** (`atendai/evolution-api:v2.1.1` ou mais recente estável, tag fixada — nunca `latest`) com migração controlada em Railway, resolução automática de LID e nova estrutura de payload.

**Infraestrutura:** Railway — novo serviço em paralelo ao v1 + Postgres + Redis (todos no free tier inicialmente).

**Instância:** mantém o nome `marcai` (evita mudar `EVOLUTION_INSTANCE` no código).

**Estratégia de migração:** blue/green — v1 e v2 coexistem até validação estável da v2 em produção; rollback < 15 min possível durante 1 semana.

---

## Diferenças críticas v1.x → v2.x

| Aspecto | v1.x (actual) | v2.x (alvo) |
|---|---|---|
| Imagem Docker | `atendai/evolution-api:v1.8.7` | `atendai/evolution-api:v2.x.x` |
| Base de dados | MongoDB embutido | **PostgreSQL (Prisma ORM)** — obrigatório |
| Cache | Interno | **Redis** recomendado |
| Payload envio | `{ number, textMessage: { text: "..." } }` | `{ number, text: "..." }` |
| Header auth | `apikey` | `apikey` (sem mudança) |
| Webhook event | `event: "messages.upsert"` | `event: "messages.upsert"` (sem mudança) |
| `remoteJid` com LID | `@lid` cru (bug) | JID real resolvido automaticamente |
| Env vars extra | — | `DATABASE_PROVIDER`, `DATABASE_CONNECTION_URI`, `CACHE_REDIS_*` |
| Sessões QR | Volume Docker | PostgreSQL/Redis |

---

## Alternativas Consideradas

### 1. Patch no código v1 para resolver `@lid`
- **Vantagem:** zero mudança de infraestrutura
- **Desvantagem:** LID não contém telefone — requer lookup adicional via Baileys API que a v1 não expõe de forma fiável; solução frágil; não resolve outros bugs latentes da v1
- **Descartada** por inviabilidade técnica

### 2. Manter v1 e aguardar clientes reclamarem
- **Desvantagem:** função core quebrada; produto inviável
- **Descartada**

### 3. Migrar para Z-API novamente ou WhatsApp Business API oficial
- **Desvantagem:** custo recorrente; templates obrigatórios (Meta); já foi descartada no ADR-014
- **Descartada**

### 4. Evolution API v2.x em Railway (adoptada)
- **Vantagem:** mantém stack; resolve LID; custo adicional baixo (~$5-10/mês com Postgres+Redis); melhor observabilidade; suporte activo pela comunidade
- **Desvantagem:** requer Postgres + Redis (complexidade de infra aumenta); janela de migração com risco de ban WhatsApp por re-scan
- **Adoptada**

---

## Consequências

### Positivas
- **Resolve o bug LID** — webhook processa SIM/NÃO correctamente → confirmações e notificações admin voltam a funcionar
- **Stack mais robusta** — Postgres + Redis são padrão industrial; melhor diagnóstico que MongoDB embutido
- **Baileys actualizado** — correcção de dezenas de bugs de parsing WhatsApp
- **Preparação para escala** — v2.x suporta multi-instância no mesmo serviço (útil para futuros multi-número por tenant)

### Negativas / Trade-offs
- **Custo Railway sobe** — Postgres (~$5/mês) + Redis (~$5/mês) somam-se ao serviço Evolution; ainda dentro do orçamento actual
- **Janela de re-scan QR** — desligar v1 e religar v2 causa 5-10 min sem WhatsApp operacional; agendar em horário de baixo tráfego
- **Risco baixo de ban** — múltiplos scans QR no mesmo número em curto período pode disparar heurísticas anti-bot da Meta
- **Mais serviços para monitorizar** — Postgres + Redis passam a ser pontos de falha

---

## Plano de Execução

### Fase 0 — Preparação e Backup
**Objectivo:** garantir rollback possível.
**Ficheiros:** nenhum código alterado.

### Fase 1 — Provisão de Infraestrutura v2.x em Railway
**Objectivo:** subir v2.x em paralelo à v1.
**Ficheiros:** nenhum código alterado.

### Fase 2 — Criar instância `marcai` na v2.x + re-scan QR
**Objectivo:** autenticar o número WhatsApp (`351912462033`) na nova instância.
**Ficheiros:** nenhum código alterado.

### Fase 3 — Alterações de código

**3.1 — `src/utils/evolutionClient.js`** (linhas 24-28)
Diff principal:
```javascript
// antes
{ number: phoneNormalized, textMessage: { text: message } }
// depois
{ number: phoneNormalized, text: message }
```

**3.2 — `src/controllers/webhookController.js`** (bloco pós-validações 1-3, antes do parsing de telefone)
Adicionar fallback defensivo para `@lid` (mesmo que v2 resolva automaticamente):
- Se `remoteJid.endsWith('@lid')` → log warning + ignorar mensagem com `200` (evitar retries do webhook)
- Nota: `400` continua a aplicar-se a dados incompletos pós-validação de JID (`!telefone || !mensagem`)
- Manter parsing actual de `event`, `fromMe`, `conversation`, `extendedTextMessage.text`

**3.3 — `src/middlewares/webhookAuth.js`**
Remover logger temporário de masking (adicionado durante debug da v1).

**3.4 — `.env` local + Render**
Novas credenciais Evolution v2. Não remover variáveis antigas — renomear para `_OLD`.

### Fase 4 — Testes locais
Jest + teste manual end-to-end com telemóvel.

### Fase 5 — Deploy Render + validação produção
Commit → PR → merge → deploy → validação.

### Fase 6 — Decomissionamento da v1
Após 48h estáveis. Pausa do serviço 1 semana antes de eliminar.

---

## Plano de Rollback

Se falhar em qualquer fase pós-deploy:
1. Reverter env vars Render para valores `_OLD`
2. `git revert <sha>` do commit da Fase 3
3. Religar WhatsApp na instância v1 (scan QR)
4. Desligar WhatsApp da instância v2

**Tempo máximo:** 15 min.

---

## Ficheiros Críticos a Modificar

| Ficheiro | Tipo de mudança |
|---|---|
| `src/utils/evolutionClient.js` | Payload `textMessage.text` → `text` |
| `src/controllers/webhookController.js` | Fallback defensivo para `@lid` |
| `src/middlewares/webhookAuth.js` | Remover logger de masking temporário |
| `tests/webhook.test.js` | **Novo** — cobertura auth + fallback LID + fromMe (ADR-016) |
| `.env` (local + Render) | Novas credenciais Evolution v2 |
| `docs/evolution-api-operations.md` | Actualizar para v2 (Postgres, Redis, QR) |
| `.claude/rules/testing.md` | Corrigir path: `src/__tests__/` → `tests/` (regra desactualizada) |

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| v2 tem bug crítico desconhecido | Baixa | Alto | Rollback < 15 min; v1 pausada 1 semana |
| Migração causa ban temporário do número | Média | Alto | Desligar v1 antes de ligar v2; scan QR calmo |
| Postgres Railway free tier insuficiente | Baixa | Médio | Monitorizar uso; plano pago ~$5/mês |
| Payload v2 muda em releases futuras | Média | Médio | Fixar tag `v2.1.1` — nunca `latest` |
| Código com referências hardcoded a v1 | Baixa | Médio | Grep `textMessage` em todo o repo como verificação final |

---

## Links e Referências

- **ADR relacionado:** [ADR-014: Evolution API Migration](./ADR-014-evolution-api-whatsapp-migration.md) (v1.8.7 actual)
- **ADR relacionado:** [ADR-006: Z-API WhatsApp Integration](./ADR-006-z-api-whatsapp-integration.md) (histórico)
- **ADR relacionado:** [ADR-013: Notification Pipeline BullMQ](./ADR-013-notification-pipeline-bullmq.md) (consumidor downstream)
- **Docs oficiais Evolution v2:** https://doc.evolution-api.com/v2/
- **Railway service actual (v1):** `evolution-api-production-d1564.up.railway.app`

---

# Checklist de Execução (Persistente)

> **Propósito:** permitir retomar o trabalho se a janela de contexto fechar. Marcar `[x]` ao concluir cada passo.

## Fase 0 — Preparação e Backup
- [ ] Confirmar que `.env` local tem todos os valores actuais de produção (copiar de Render)
- [ ] Exportar variáveis do Railway actual (13 vars) para ficheiro local `evolution-v1-env-backup.txt`
- [ ] Documentar URL actual: `evolution-api-production-d1564.up.railway.app`
- [ ] Screenshot do Evolution Manager v1 (estado da instância `marcai`, telefone ligado)
- [ ] Registar `EVOLUTION_API_KEY` actual num gestor de segredos
- [ ] Confirmar que não há agendamentos críticos nas próximas 4h
- [x] Criar branch Git `feature/evolution-v2-upgrade` a partir de `main`

## Fase 1 — Provisão Infraestrutura v2 em Railway
- [ ] Criar **novo** serviço Railway (não substituir o actual) a partir do template Evolution v2
- [ ] Provisionar **PostgreSQL** no mesmo projecto Railway (Add → Database → PostgreSQL)
- [ ] Provisionar **Redis** no mesmo projecto Railway (Add → Database → Redis)
- [ ] Configurar env vars do novo serviço:
  - [ ] `AUTHENTICATION_API_KEY=<nova-chave-gerada>` (não reusar v1)
  - [ ] `DATABASE_PROVIDER=postgresql`
  - [ ] `DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}`
  - [ ] `DATABASE_CONNECTION_CLIENT_NAME=evolution_marcai`
  - [ ] `CACHE_REDIS_ENABLED=true`
  - [ ] `CACHE_REDIS_URI=${{Redis.REDIS_URL}}`
  - [ ] `CACHE_REDIS_PREFIX_KEY=evolution`
  - [ ] `CONFIG_SESSION_PHONE_CLIENT=Marcai`
  - [ ] `CONFIG_SESSION_PHONE_NAME=Chrome`
  - [ ] `DEL_INSTANCE=false`
  - [ ] `LANGUAGE=pt-BR`
- [ ] Deploy Railway "Healthy" (green)
- [ ] Anotar nova URL: `https://evolution-api-v2-production-xxxx.up.railway.app`
- [ ] Testar `GET /` → retorna `{ status, version: "2.x.x" }`

## Fase 2 — Instância `marcai` v2 + re-scan QR
- [ ] Aceder ao Evolution Manager v2 (`<nova-url>/manager`)
- [ ] Autenticar com nova `AUTHENTICATION_API_KEY`
- [ ] Criar instância com nome `marcai`
- [ ] Configurar webhook:
  - [ ] URL: `https://<backend-render>.onrender.com/api/webhook/evolution`
  - [ ] Eventos: apenas `MESSAGES_UPSERT`
  - [ ] Header `apikey` = `EVOLUTION_WEBHOOK_SECRET` (distinto da API key)
- [ ] **Desligar** WhatsApp na instância v1 ANTES de ligar na v2
- [ ] Gerar QR code e scanear no telemóvel Marcai (`351912462033`)
- [ ] Confirmar estado `connected` no Manager v2

## Fase 3 — Alterações de Código

### 3.1 `src/utils/evolutionClient.js`
- [x] Alterar payload: `{ number, textMessage: { text: message } }` → `{ number, text: message }`
- [x] Manter header `apikey`
- [x] Manter endpoint `POST /message/sendText/{instance}`
- [x] Manter assinatura `sendWhatsAppMessage(to, message)`
- [x] Verificar tratamento de erros — estrutura de `error.response.data` pode ter mudado

### 3.2 `src/controllers/webhookController.js`
- [x] Adicionar fallback defensivo para `@lid` nas linhas 88-98
- [x] Confirmar que `@g.us` (grupos) continua ignorado
- [x] Manter parsing de `event`, `fromMe`, `conversation`, `extendedTextMessage.text`

### 3.3 `src/middlewares/webhookAuth.js`
- [x] Remover função `mask()` e `console.warn` de debug (adicionados na sessão anterior)
- [x] Manter leitura de `req.headers['apikey']` e `req.body?.apikey`

### 3.4 `.env` local + Render
- [ ] Render: criar `EVOLUTION_API_URL_OLD`, `EVOLUTION_API_KEY_OLD`, `EVOLUTION_WEBHOOK_SECRET_OLD` com valores v1
- [ ] Render: actualizar `EVOLUTION_API_URL` para nova URL v2
- [ ] Render: actualizar `EVOLUTION_API_KEY` para nova chave v2
- [ ] Render: manter `EVOLUTION_INSTANCE=marcai`
- [ ] Render: actualizar `EVOLUTION_WEBHOOK_SECRET` (recomendado gerar novo)
- [ ] `.env` local: espelhar as mesmas mudanças

## Fase 4 — Testes Locais
- [ ] `npm run dev` sobe sem erros
- [ ] `curl http://localhost:5000/api/auth/me` → 401 JSON
- [ ] `npm test -- --testPathPattern=webhook` → todos passam
- [x] Grep `textMessage` em `src/` — deve voltar sem matches (excepto comentários)
- [ ] Teste manual de envio: forçar lembrete via rota admin → mensagem chega ao telemóvel teste
- [ ] Teste manual de recepção: responder "SIM" → logs mostram telefone correcto (sem `@lid`)
- [ ] `agendamento.confirmacao.tipo === 'confirmado'` no MongoDB
- [ ] Admin recebe notificação WhatsApp

## Fase 5 — Deploy Render + Validação Produção
- [ ] Commit de mudanças (pedir ao utilizador — regra de memória: nunca commit automático)
- [ ] Push para `feature/evolution-v2-upgrade`
- [ ] Abrir PR para `main` referenciando ADR-016
- [ ] Aplicar env vars novas em Render ANTES do merge
- [ ] Merge PR
- [ ] Aguardar deploy Render "Live" (~3 min)
- [ ] Teste E2E produção:
  - [ ] Criar agendamento teste 1h no futuro
  - [ ] Forçar lembrete via rota admin
  - [ ] Responder SIM do telemóvel teste
  - [ ] Verificar mudança de status
  - [ ] Verificar notificação admin
- [ ] Monitorizar logs Render durante 30 min pós-deploy

## Fase 6 — Decomissionamento v1 (48h depois)
- [ ] 48h sem incidentes desde Fase 5
- [ ] ≥ 10 mensagens enviadas e ≥ 5 recebidas com sucesso
- [ ] Arquivar variáveis `_OLD` em ficheiro local encriptado
- [ ] Pausar (não eliminar) serviço v1 no Railway
- [ ] Aguardar 1 semana adicional sem necessidade de rollback
- [ ] Eliminar serviço v1 do Railway
- [ ] Remover variáveis `_OLD` de `.env` e Render
- [ ] Actualizar ADR-014 com nota de depreciação apontando para ADR-016

## Critérios de Sucesso Final
- [ ] Fluxo completo SIM → status `confirmado` + notificação admin funcional em produção
- [ ] Fluxo com leads (tipo Avaliacao) funcional via `lead.telefone`
- [x] Zero referências a `textMessage` no código
- [x] `docs/evolution-api-operations.md` actualizado para v2
- [x] ADR-016 committed em `docs/adrs/generated/`
- [x] ADR-014 com nota de depreciação
- [x] `.claude/rules/testing.md` corrigida (path `src/__tests__/` → `tests/`)
