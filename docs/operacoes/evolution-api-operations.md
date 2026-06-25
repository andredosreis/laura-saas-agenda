# Evolution API — Operações e Manutenção (v2.x · VPS Contabo)

> **Infra actual:** Evolution API corre na stack Docker do VPS Contabo (ADR-023),
> atrás do nginx. **Não** é Railway, e o backend **não** é Render — essa topologia
> foi descontinuada. Ver `docker-compose.prod.yml`.

## Infraestrutura

| Componente | Localização | Endereço |
|---|---|---|
| Evolution API | Docker no Contabo (`marcai-evolution`) | Público: `https://<WA_DOMAIN>` · Interno: `http://evolution-api:8080` |
| Backend (Node.js) | Docker no Contabo (`marcai-backend`) | Público: `https://<API_DOMAIN>` · Interno: `http://backend:5000` |
| Postgres (dados Evolution) | Docker no Contabo (`marcai-postgres`) | Interno: `postgres:5432` |
| Redis (cache Evolution, db 6) | Docker no Contabo (`marcai-redis`) | Interno: `redis:6379` |
| Imagem Docker | `evoapicloud/evolution-api:v2.3.7` | — |
| Instância WhatsApp (partilhada) | `marcai` | `EVOLUTION_INSTANCE` |

- `<WA_DOMAIN>` = valor de `WHATSAPP_DOMAIN` no `.env` do Contabo (ex.: `wa.marcai.pt`).
- `<API_DOMAIN>` = domínio público do backend no nginx (ex.: `api.marcai.pt`).
- Só o nginx está exposto à internet (80/443). Evolution/backend/redis/postgres
  comunicam pela rede interna `marcai` por **nome de serviço** — nenhum publica
  porta no host.

---

## Segredos — nunca hardcoded

Todas as chaves vivem no `.env` do Contabo (não commitado). Antes de correr os
comandos abaixo, exporta-os para o shell (a partir do VPS, ou de uma máquina com
acesso ao domínio público):

```bash
export WA="https://<WA_DOMAIN>"          # Evolution (público, via nginx)
export API="https://<API_DOMAIN>"        # backend (público, via nginx)
export APIKEY="<EVOLUTION_API_KEY>"      # = AUTHENTICATION_API_KEY da Evolution
export INSTANCE="marcai"                 # ou o instanceName do tenant
```

> Onde ler os valores reais: no Contabo, na pasta do stack, `grep -E 'WHATSAPP_DOMAIN|EVOLUTION_API_KEY|EVOLUTION_INSTANCE|EVOLUTION_WEBHOOK_SECRET' .env`.

### Variáveis de ambiente relevantes

`.env` (lido por backend, ia-service e pela própria Evolution via `docker-compose.prod.yml`):
```
WHATSAPP_DOMAIN=wa.exemplo.pt
EVOLUTION_API_KEY=<chave>              # AUTHENTICATION_API_KEY da Evolution
EVOLUTION_INSTANCE=marcai             # instância partilhada por omissão
EVOLUTION_WEBHOOK_SECRET=<chave>      # validado pelo backend em /webhook/evolution
```

`EVOLUTION_API_URL` **não** se define no `.env` — é fixado no compose como
`http://evolution-api:8080` (topologia interna, não segredo) para backend e ia-service.

---

## 1. Verificar Estado da Conexão

```bash
curl -s "$WA/instance/fetchInstances" -H "apikey: $APIKEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
inst = data[0]['instance'] if isinstance(data, list) else data
print('Status:', inst.get('status') or inst.get('connectionStatus'))
print('Número:', inst.get('owner', 'N/A'))
print('Nome:', inst.get('profileName', 'N/A'))
"
```

- `open` → WhatsApp ligado, tudo a funcionar
- `connecting` → A ligar, aguarda alguns segundos
- `close` → Desligado, precisa de escanear QR code de novo

---

## 2. Ligar WhatsApp (Escanear QR Code)

### Passo 1 — Criar instância (só na primeira vez)
```bash
curl -s -X POST "$WA/instance/create" \
  -H "apikey: $APIKEY" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"$INSTANCE\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}"
```

### Passo 2 — Obter QR Code e escanear
```bash
curl -s "$WA/instance/connect/$INSTANCE" -H "apikey: $APIKEY" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
b64 = data.get('base64', '')
if b64:
    open('/tmp/qr_evolution.png', 'wb').write(base64.b64decode(b64.split(',')[1]))
    print('QR guardado em /tmp/qr_evolution.png — abre e escaneia com o WhatsApp')
else:
    print('Estado:', json.dumps(data))
" && open /tmp/qr_evolution.png
```

**No WhatsApp:** Definições → Dispositivos Vinculados → Vincular um Dispositivo → escaneia o QR.

> O QR expira em ~20 segundos. Se não conseguires a tempo, corre o comando novamente.

---

## 3. Desligar WhatsApp (Desconectar Número)

```bash
curl -s -X DELETE "$WA/instance/logout/$INSTANCE" -H "apikey: $APIKEY" | python3 -c "
import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))
"
```

Após este comando o WhatsApp fica desligado. Para ligar de novo vai ao **Passo 2** acima.

---

## 4. Trocar de Número WhatsApp

Se precisares de ligar um número diferente (ex: passar da conta pessoal para conta da clínica):

```bash
# 1. Desliga o número actual
curl -s -X DELETE "$WA/instance/logout/$INSTANCE" -H "apikey: $APIKEY"

# 2. Aguarda 3 segundos e gera novo QR
sleep 3
curl -s "$WA/instance/connect/$INSTANCE" -H "apikey: $APIKEY" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
b64 = data.get('base64', '')
if b64:
    open('/tmp/qr_evolution.png', 'wb').write(base64.b64decode(b64.split(',')[1]))
    print('Escaneia com o NOVO número')
" && open /tmp/qr_evolution.png
```

---

## 5. Apagar Instância Completamente (recomeçar do zero)

```bash
curl -s -X DELETE "$WA/instance/delete/$INSTANCE" -H "apikey: $APIKEY"
```

Depois recria com o **Passo 1** do ponto 2.

---

## 6. Configurar Webhook (após recriar instância)

O webhook diz à Evolution API para onde enviar as mensagens recebidas. O backend
valida cada pedido em `POST /webhook/evolution` comparando o header `apikey` com
`EVOLUTION_WEBHOOK_SECRET` (ver `src/middlewares/webhookAuth.js`) — por isso o
secret enviado pela Evolution tem de ser igual a `EVOLUTION_WEBHOOK_SECRET`.

```bash
curl -s -X POST "$WA/webhook/set/$INSTANCE" \
  -H "apikey: $APIKEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"webhook\": {
      \"enabled\": true,
      \"url\": \"$API/webhook/evolution\",
      \"headers\": { \"apikey\": \"$APIKEY\" },
      \"byEvents\": false,
      \"base64\": false,
      \"events\": [\"MESSAGES_UPSERT\"]
    }
  }"
```

> **Nota v2.3.7:** o corpo do `webhook/set` é aninhado em `{"webhook": {...}}`. Em
> versões mais antigas era plano (`{"url":..., "events":[...]}`). Confirma a versão
> em `docker compose ps` / `GET $WA` se a Evolution rejeitar o payload.

---

## 7. Testar Envio de Mensagem

```bash
curl -s -X POST "$WA/message/sendText/$INSTANCE" \
  -H "apikey: $APIKEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"351912462033","text":"✅ Teste — Evolution API v2 (Contabo) a funcionar!"}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Resultado:', data.get('status', 'ENVIADO OK'))
"
```

Substitui `351912462033` pelo número de destino (formato: `351` + número sem espaços).

---

## 8. Testar Webhook (segurança)

Confirma que o webhook do backend rejeita pedidos sem a chave correcta:

```bash
# Deve devolver 401 (sem apikey)
curl -s -X POST "$API/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert"}' | python3 -c "import sys,json; print(json.load(sys.stdin))"

# Deve devolver 200 (autenticado; evento ignorado)
curl -s -X POST "$API/webhook/evolution" \
  -H "apikey: <EVOLUTION_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"event":"other.event"}' | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

---

## 9. Checklist de Diagnóstico (quando algo não funciona)

```
[ ] Stack Docker de pé?
    No Contabo: docker compose -f docker-compose.prod.yml ps
    → marcai-evolution, marcai-backend, marcai-postgres, marcai-redis = Up

[ ] Evolution API online?
    curl -s "$WA" → {"status":200,"version":"2.3.7",...}

[ ] Instância conectada?
    → Verificar estado (ponto 1) — deve ser "open"

[ ] Webhook configurado?
    curl -s "$WA/webhook/find/$INSTANCE" -H "apikey: $APIKEY"
    → url deve ser "https://<API_DOMAIN>/webhook/evolution"

[ ] Variáveis no .env do Contabo correctas?
    grep -E 'WHATSAPP_DOMAIN|EVOLUTION_API_KEY|EVOLUTION_INSTANCE|EVOLUTION_WEBHOOK_SECRET' .env
    (EVOLUTION_API_URL é interno e fixado no compose: http://evolution-api:8080)

[ ] Após alterar o .env, reiniciar os serviços?
    docker compose -f docker-compose.prod.yml up -d backend ia-service
    (a Evolution só relê env em restart: docker compose ... up -d evolution-api)

[ ] Logs em tempo real?
    docker logs -f marcai-evolution   |   ou o painel Dozzle em logs.<dominio>
```

---

## 10. Fluxo Completo de Mensagens

```
ENVIO (agendamento criado / resposta da IA):
  backend (Node.js, marcai-backend)
    → POST http://evolution-api:8080/message/sendText/<instance>   (rede interna)
    → Evolution → WhatsApp do cliente

RECEPÇÃO (cliente responde):
  WhatsApp do cliente
    → Evolution (marcai-evolution) detecta mensagem
    → POST https://<API_DOMAIN>/webhook/evolution   (via nginx, header apikey)
    → backend valida (EVOLUTION_WEBHOOK_SECRET) e processa
```

---

## 11. Painel de Gestão Visual (Evolution Manager)

```
https://<WA_DOMAIN>/manager
```

Permite ver instâncias, estado da ligação e enviar mensagens de teste. Login com a
`EVOLUTION_API_KEY` (AUTHENTICATION_API_KEY). É um complemento — o fluxo de
provisionamento (criar instância → QR → webhook) faz-se por API (secções 2 e 6).

---

## 12. Multi-tenant: instância partilhada vs dedicada

Hoje o `evolutionClient.js` cai para `EVOLUTION_INSTANCE` (`marcai`) quando o tenant
não tem instância própria. O modelo `Tenant.whatsapp.instanceName` (índice único,
sparse) foi desenhado para **uma instância por tenant** — a Evolution resolve o
tenant a partir de `req.body.instance` no webhook.

Ao activar um cliente novo, decide:
- **Dedicada** → `instanceName` = slug do tenant; cria instância própria (secção 2)
  e configura o webhook dessa instância (secção 6). Isolamento real por cliente.
- **Partilhada** → reusa `marcai`. Atalho; todos partilham o mesmo número/instância.

Este passo de activação **não existe ainda** no fluxo de registo — é o que o painel
super-admin (ADR-024) terá de automatizar. Ver o teste-documento
`tests/tenant-provisioning.test.js` (teste 6) que prova que um tenant nasce sem
WhatsApp provisionado.
