# Setup Local — Testes E2E

Passo-a-passo para reproduzir o ambiente local de testes E2E do agente.

## Pré-requisitos

- Node.js 18+
- Python 3.11+ (com venv)
- ngrok instalado e autenticado (`ngrok config add-authtoken ...`)
- Acesso ao MongoDB Atlas do projecto
- Acesso ao Evolution Manager (URL + apikey)
- OpenAI API key OU Google API key

## Variáveis de ambiente

### Backend Node (`./.env`)

```bash
MONGODB_URI=mongodb+srv://<user>:<pwd>@projeto-agenda.5sar5yx.mongodb.net/...
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
FRONTEND_URL=http://localhost:5174
PORT=5001

# Evolution API
EVOLUTION_API_URL=http://76.13.142.240:32768
EVOLUTION_API_KEY=<key>
EVOLUTION_INSTANCE=marcai
EVOLUTION_WEBHOOK_SECRET=<segredo partilhado com Evolution>

# F12 → ia-service Python
IA_SERVICE_ENABLED=true
IA_SERVICE_URL=http://localhost:8000
INTERNAL_SERVICE_TOKEN=<gerar 64-char hex, igual nos 2 serviços>

LOG_LEVEL=info       # ou 'debug' para ver telemetria F12 detalhada
NODE_ENV=development
```

### Python ia-service (`ia-service/.env`)

```bash
LLM_PROVIDER=openai           # ou 'gemini'
OPENAI_API_KEY=sk-...         # ou GOOGLE_API_KEY=...
MARCAI_API_URL=http://localhost:5001
INTERNAL_SERVICE_TOKEN=<MESMO valor que está no backend Node>
MONGODB_URI=<mesmo que o backend Node>

# LangSmith — opcional mas FORTEMENTE recomendado para iterar no agent.
# Quando estes valores estão set, cada invocação do LangChain agent
# (e do extractor F07) aparece em https://smith.langchain.com com
# trace completo, tool calls, latência e tokens.
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...   # gera em smith.langchain.com → Settings
LANGSMITH_PROJECT=marcai-ia-service-local
# LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com  # só se UE region
```

### Tenant Laura no MongoDB

Garantir que o doc `tenant` tem:

```javascript
{
  whatsapp: { instanceName: 'marcai' },
  limites: { leadsAtivo: true, maxLeads: 100 },
  plano: { status: 'ativo' }
}
```

## Sequência de boot

Em 4 terminais separados:

### Terminal 1 — Backend Node

```bash
cd /Users/andrereissilva/Documents/Projetos\ Pessoais/laura-saas-agenda
npm run dev > /tmp/marcai-backend.log 2>&1 &
# ou em foreground:
npm run dev
```

Health check:
```bash
curl http://localhost:5001/api/health
# {"status":"OK", ...}
```

### Terminal 2 — Frontend Vite

```bash
cd /Users/andrereissilva/Documents/Projetos\ Pessoais/laura-saas-agenda/laura-saas-frontend
npm run dev -- --port 5174 > /tmp/marcai-frontend.log 2>&1 &
```

Abrir browser: `http://localhost:5174`

### Terminal 3 — Python ia-service

```bash
cd /Users/andrereissilva/Documents/Projetos\ Pessoais/laura-saas-agenda/ia-service
./.venv/bin/uvicorn ia_service.main:app --port 8000 --host 127.0.0.1 \
  --app-dir src --reload > /tmp/marcai-ia.log 2>&1 &
```

O flag `--reload` é importante — apanha mudanças em `.py` automaticamente.
**Nota:** mudanças em ficheiros `.md` (system prompts) NÃO disparam
reload. Para forçar reload depois de editar um prompt, faz:

```bash
touch ia-service/src/ia_service/services/prompt_renderer.py
```

Health check:
```bash
curl http://localhost:8000/health
# {"status":"ok", "version":"...", "marcai_reachable":true}
```

### Terminal 4 — ngrok

```bash
ngrok http --domain=evolution-excusable-proven.ngrok-free.dev 5001
```

URL pública estável: `https://evolution-excusable-proven.ngrok-free.dev`.

Inspector: `http://localhost:4040` — vê todos os requests que passam
pelo ngrok com body completo.

## Redirecionar webhook Evolution para o ngrok local

⚠️ **Importante:** isto desliga a produção. Quando terminares, faz o
inverso (ver fim deste documento).

```bash
EVOLUTION_API_URL=$(grep '^EVOLUTION_API_URL=' .env | cut -d= -f2-)
EVOLUTION_API_KEY=$(grep '^EVOLUTION_API_KEY=' .env | cut -d= -f2-)
EVOLUTION_WEBHOOK_SECRET=$(grep '^EVOLUTION_WEBHOOK_SECRET=' .env | cut -d= -f2-)

curl -X POST "$EVOLUTION_API_URL/webhook/set/marcai" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://evolution-excusable-proven.ngrok-free.dev/webhook/evolution",
      "headers": { "apikey": "'"$EVOLUTION_WEBHOOK_SECRET"'" },
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Verificar:
```bash
curl -X GET "$EVOLUTION_API_URL/webhook/find/marcai" -H "apikey: $EVOLUTION_API_KEY"
```

`url` deve ser o ngrok.

## Limpar DB antes de cada cenário

Convenção desta sessão: cada teste começa do zero. Limpa Lead +
Mensagens + Conversa + Agendamentos do telefone de teste.

```bash
cd /Users/andrereissilva/Documents/Projetos\ Pessoais/laura-saas-agenda
node --no-warnings --input-type=module -e "
import('dotenv-flow/config').then(async () => {
  const m = await import('mongoose');
  await m.default.connect(process.env.MONGODB_URI);
  const T = (await import('./src/models/Tenant.js')).default;
  const { getTenantDB } = await import('./src/config/tenantDB.js');
  const { getModels } = await import('./src/models/registry.js');
  const t = await T.findOne({ 'whatsapp.instanceName': 'marcai' }).lean();
  const { Lead, Mensagem, Conversa, Agendamento } = getModels(getTenantDB(t._id.toString()));
  const tel = '351912462033';  // ALTERA para o teu telefone
  const lead = await Lead.findOne({ tenantId: t._id, telefone: tel }).lean();
  const conversaId = lead?.conversa;
  await Agendamento.deleteMany({ tenantId: t._id, 'lead.telefone': tel });
  await Mensagem.deleteMany({ tenantId: t._id, telefone: tel });
  if (conversaId) await Conversa.deleteOne({ _id: conversaId });
  await Lead.deleteOne({ tenantId: t._id, telefone: tel });
  console.log('🧹 Reset OK');
  await m.default.disconnect();
});"
```

## Validação durante / após teste

### Ver estado do Lead

```bash
node --no-warnings --input-type=module -e "
import('dotenv-flow/config').then(async () => {
  const m = await import('mongoose');
  await m.default.connect(process.env.MONGODB_URI);
  const T = (await import('./src/models/Tenant.js')).default;
  const { getTenantDB } = await import('./src/config/tenantDB.js');
  const { getModels } = await import('./src/models/registry.js');
  const t = await T.findOne({ 'whatsapp.instanceName': 'marcai' }).lean();
  const { Lead, Mensagem } = getModels(getTenantDB(t._id.toString()));
  const tel = '351912462033';
  const lead = await Lead.findOne({ tenantId: t._id, telefone: tel }).lean();
  console.log('LEAD:', JSON.stringify({
    nome: lead?.nome, status: lead?.status, urgencia: lead?.urgencia,
    score: lead?.qualificacao?.score, motivo: lead?.qualificacao?.motivoInteresse,
  }, null, 2));
  const msgs = await Mensagem.find({ tenantId: t._id, telefone: tel }).sort({ data: 1 }).lean();
  console.log('Mensagens:', msgs.length);
  for (const ms of msgs) {
    console.log(' [' + new Date(ms.data).toISOString().slice(11,19) + '] ' + ms.origem.padEnd(8) + ' | ' + (ms.mensagem||'').slice(0,80));
  }
  await m.default.disconnect();
});"
```

### Ver logs do Python (extractor + agent)

```bash
tail -f /tmp/marcai-ia.log | grep -E "intel_extracted|agent_reply|history_loaded"
```

### Ver traces no LangSmith

Com `LANGSMITH_TRACING=true` set, abre:

```
https://smith.langchain.com/o/<org>/projects/p/marcai-ia-service-local
```

Cada turn aparece como um run `lead_agent_turn` com:

- **Tags:** `tenant:<id>`, `turn:<n>`, `provider:openai|gemini` —
  permitem filtrar por turn number, tenant ou provider.
- **Metadata:** `tenant_id`, `lead_id`, `turn_number`, `lead_nome`,
  `lead_score`, `last_clinic_message_excerpt` — busca por estes
  campos no UI (Run search → Metadata).
- **Tool calls** — vê exactamente quando o agent chama
  `get_available_slots`, `create_appointment`, etc., com inputs e
  outputs.
- **System prompt completo** — confirma que `{{turn_number}}`,
  `{{lead_nome}}` e `{{last_clinic_message}}` foram substituídos como
  esperado.

Para reproduzir um trace localmente, faz **Open in Playground** no
LangSmith e edita o prompt — o output volta a correr com o mesmo
input, sem ter de mandar uma nova mensagem no WhatsApp.

### Confirmar que o tracing está activo

```bash
curl http://localhost:8000/health   # 0.2.0+
grep langsmith_tracing /tmp/marcai-ia.log | head -1
# → "langsmith_tracing_enabled" com project=marcai-ia-service-local
```

### Ver routing decisions do F12

```bash
tail -f /tmp/marcai-backend.log | grep webhook_routed
```

### Ngrok inspector

`http://localhost:4040` — vê cada webhook recebido com body completo.

## Restaurar produção no fim da sessão

⚠️ **Crítico — faz isto antes de fechar tudo, senão a produção continua
sem receber webhooks.**

```bash
EVOLUTION_API_URL=$(grep '^EVOLUTION_API_URL=' .env | cut -d= -f2-)
EVOLUTION_API_KEY=$(grep '^EVOLUTION_API_KEY=' .env | cut -d= -f2-)
EVOLUTION_WEBHOOK_SECRET=$(grep '^EVOLUTION_WEBHOOK_SECRET=' .env | cut -d= -f2-)

curl -X POST "$EVOLUTION_API_URL/webhook/set/marcai" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://laura-saas.onrender.com/webhook/evolution",
      "headers": { "apikey": "'"$EVOLUTION_WEBHOOK_SECRET"'" },
      "byEvents": false,
      "base64": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Verificar:
```bash
curl -X GET "$EVOLUTION_API_URL/webhook/find/marcai" -H "apikey: $EVOLUTION_API_KEY"
```

`url` deve ser `https://laura-saas.onrender.com/webhook/evolution`.

## Parar tudo

```bash
pkill -f "node src/server"     # backend Node
pkill -f "uvicorn ia_service"  # Python ia-service
pkill -f "vite"                # frontend (se quiseres)
pkill ngrok                    # tunnel
```
