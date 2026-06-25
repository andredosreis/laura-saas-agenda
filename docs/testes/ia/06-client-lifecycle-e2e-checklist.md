# Client Lifecycle — Checklist de Testes E2E

**Data prevista**: proxima sessao fora do expediente
**Branch**: `feature/f12-messaging-orchestrator`
**Pre-requisitos**: ngrok + backend (5001) + ia-service (8100) + webhook redirecionado

## Setup

```bash
# 1. Garantir que existe um Cliente no tenant marcai com telefone de teste
#    (criar manualmente no frontend ou via script se nao existir)

# 2. Limpar historico do telefone de teste
node scripts/tools/cleanup-test-phone-data.js

# 3. Iniciar servicos
ngrok http 5001 --domain=evolution-excusable-proven.ngrok-free.dev
npm run dev                    # backend porta 5001
cd ia-service && uvicorn src.ia_service.main:app --port 8100 --reload  # ia-service

# 4. Redirecionar webhook
bash scripts/tools/webhook-redirect-local.sh

# 5. Verificar .env
#    IA_SERVICE_URL=http://localhost:8100
```

## Testes — Client Lifecycle Phase 1

### Routing

- [ ] **CL-01**: Mensagem de telefone com Cliente existente → log mostra `route: CLIENT_LIFECYCLE_PENDING`
- [ ] **CL-02**: Mensagem de telefone sem Cliente nem Lead → log mostra `route: IA_LEAD` (nao CLIENT)
- [ ] **CL-03**: Mensagem de telefone com Lead activo (sem Cliente) → log mostra `route: IA_LEAD`

### Happy Path — Novo Agendamento

- [ ] **CL-04**: Cliente envia "ola" → agente responde com nome do cliente ("Ola, [Nome]!")
- [ ] **CL-05**: Cliente pergunta "quais os servicos?" → agente lista servicos sem inventar
- [ ] **CL-06**: Cliente pede "quero marcar sessao" → agente pergunta dia de preferencia
- [ ] **CL-07**: Cliente diz "quinta-feira" → agente chama `get_available_slots` e lista horarios
- [ ] **CL-08**: Cliente escolhe "as 10h" → agente chama `create_client_appointment` e confirma
- [ ] **CL-09**: Agendamento criado na BD com `criadoPorIA: true` e `cliente: <clienteId>`
- [ ] **CL-10**: Verificar que `scheduleNotifications` foi chamado (log ou BD)

### Consultar Agendamentos

- [ ] **CL-11**: Cliente pergunta "quando e a minha proxima sessao?" → agente mostra agendamentos
- [ ] **CL-12**: Cliente sem agendamentos futuros → agente diz "nao tem sessoes agendadas"

### Guard-rails

- [ ] **CL-13**: Cliente pede "dores de cabeca" → redireciona para medico (fora do scope)
- [ ] **CL-14**: Cliente pede "dores nas costas" → aceita (dentro do scope)
- [ ] **CL-15**: Cliente tenta conversa social → protocolo off-topic 3 fases
- [ ] **CL-16**: Cliente insiste off-topic → `iaAtiva` nao se aplica (e Cliente, nao Lead) — verificar comportamento
- [ ] **CL-17**: Cliente pergunta preco → "a partir de 40 EUR" + avaliacao gratuita

### Datas

- [ ] **CL-18**: Cliente diz "segunda" → data correcta no calendario (consultar tabela)
- [ ] **CL-19**: Cliente diz "dia 30" → dia da semana correcto

### Fallback

- [ ] **CL-20**: Parar ia-service → cliente envia mensagem → recebe greeting generico (fallback)
- [ ] **CL-21**: Reiniciar ia-service → proxima mensagem → agente responde normalmente

### Anti-repetitividade

- [ ] **CL-22**: Verificar que 2 respostas seguidas NAO comecam com a mesma frase

### Slot Conflict

- [ ] **CL-23**: Marcar slot ja ocupado → agente recebe 409 e propoe alternativas

## Teardown

```bash
# OBRIGATORIO — restaurar producao
bash scripts/tools/webhook-restore-prod.sh

# Restaurar .env
# IA_SERVICE_URL=http://localhost:8000

# Parar servicos locais
```

## Notas

- O telefone de teste deve estar registado como **Cliente** (nao apenas Lead) no tenant marcai
- Se o telefone tem Lead E Cliente, o router prioriza Cliente (step 5 do messageRouter)
- A funcionalidade de reagendar/cancelar e Phase 2 — nao testar nesta sessao
