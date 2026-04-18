# Evolution API — Operações e Manutenção

## Infraestrutura

| Componente | Localização | URL |
|---|---|---|
| Evolution API | Railway (Docker) | `https://evolution-api-production-d1564.up.railway.app` |
| Backend (Node.js) | Render | `https://laura-saas.onrender.com` |
| Instância WhatsApp | `marcai` | — |
| Imagem Docker | `atendai/evolution-api:v1.8.7` | — |

**API Key (Evolution):** `b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f`

---

## Variáveis de Ambiente

### Render (backend Node.js)
```
EVOLUTION_API_URL=https://evolution-api-production-d1564.up.railway.app
EVOLUTION_API_KEY=b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f
EVOLUTION_INSTANCE=marcai
EVOLUTION_WEBHOOK_SECRET=b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f
```

### Railway (Evolution API)
```
SERVER_TYPE=http
SERVER_PORT=8080
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
LOG_LEVEL=VERBOSE
LOG_COLOR=true
LOG_BAILEYS=error
DEL_INSTANCE=false
STORE_MESSAGES=true
STORE_MESSAGE_UP=true
STORE_CONTACTS=true
STORE_CHATS=true
```

---

## 1. Verificar Estado da Conexão

```bash
curl -s "https://evolution-api-production-d1564.up.railway.app/instance/fetchInstances" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" | python3 -c "
import sys, json
data = json.load(sys.stdin)
inst = data[0]['instance']
print('Status:', inst['status'])
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
curl -s -X POST "https://evolution-api-production-d1564.up.railway.app/instance/create" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"marcai","qrcode":true}'
```

### Passo 2 — Obter QR Code e escanear
```bash
curl -s "https://evolution-api-production-d1564.up.railway.app/instance/connect/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" | python3 -c "
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
curl -s -X DELETE "https://evolution-api-production-d1564.up.railway.app/instance/logout/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" | python3 -c "
import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))
"
```

Após este comando o WhatsApp fica desligado. Para ligar de novo vai ao **Passo 2** acima.

---

## 4. Trocar de Número WhatsApp

Se precisares de ligar um número diferente (ex: passar da conta pessoal para conta da clínica):

```bash
# 1. Desliga o número actual
curl -s -X DELETE "https://evolution-api-production-d1564.up.railway.app/instance/logout/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f"

# 2. Aguarda 3 segundos e gera novo QR
sleep 3

curl -s "https://evolution-api-production-d1564.up.railway.app/instance/connect/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" | python3 -c "
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
curl -s -X DELETE "https://evolution-api-production-d1564.up.railway.app/instance/delete/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f"
```

Depois recria com o **Passo 1** do ponto 2.

---

## 6. Configurar Webhook (após recriar instância)

O webhook diz à Evolution API para onde enviar as mensagens recebidas (respostas SIM/NÃO dos clientes).

```bash
curl -s -X POST "https://evolution-api-production-d1564.up.railway.app/webhook/set/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://laura-saas.onrender.com/webhook/evolution",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

---

## 7. Testar Envio de Mensagem

```bash
curl -s -X POST "https://evolution-api-production-d1564.up.railway.app/message/sendText/marcai" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" \
  -H "Content-Type: application/json" \
  -d '{"number":"351912462033","textMessage":{"text":"✅ Teste — Evolution API a funcionar!"}}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Resultado:', data.get('status', 'enviado') if 'status' in data else 'ENVIADO OK')
"
```

Substitui `351912462033` pelo número de destino (formato: `351` + número sem espaços).

---

## 8. Testar Webhook (segurança)

Confirma que o webhook rejeita pedidos sem a chave correcta:

```bash
# Deve devolver 401
curl -s -X POST "https://laura-saas.onrender.com/webhook/evolution" \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert"}' | python3 -c "import sys,json; print(json.load(sys.stdin))"

# Deve devolver 200 (evento ignorado mas autenticado)
curl -s -X POST "https://laura-saas.onrender.com/webhook/evolution" \
  -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f" \
  -H "Content-Type: application/json" \
  -d '{"event":"other.event"}' | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

---

## 9. Checklist de Diagnóstico (quando algo não funciona)

```
[ ] Evolution API online?
    curl https://evolution-api-production-d1564.up.railway.app
    → deve devolver {"status":200,"version":"1.8.6",...}

[ ] Instância conectada?
    → Verificar estado (ponto 1) — deve ser "open"

[ ] Webhook configurado?
    curl -s "https://evolution-api-production-d1564.up.railway.app/webhook/find/marcai" \
      -H "apikey: b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f"
    → deve mostrar url: "https://laura-saas.onrender.com/webhook/evolution"

[ ] Variáveis no Render correctas?
    EVOLUTION_API_URL=https://evolution-api-production-d1564.up.railway.app
    EVOLUTION_API_KEY=b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f
    EVOLUTION_INSTANCE=marcai
    EVOLUTION_WEBHOOK_SECRET=b56b644bc387907ee06f9104cec84d65be293359ce0f5e200d82d5798cb4c27f

[ ] Render fez redeploy depois de alterar variáveis?
    → No Render: Manual Deploy → Deploy latest commit
```

---

## 10. Fluxo Completo de Mensagens

```
ENVIO (agendamento criado):
  Render (Node.js)
    → POST /message/sendText/marcai (Railway Evolution API)
    → WhatsApp do cliente

RECEPÇÃO (cliente responde SIM/NÃO):
  WhatsApp do cliente
    → Evolution API (Railway) detecta mensagem
    → POST /webhook/evolution (Render)
    → agendamento actualizado para Confirmado/Cancelado
```

---

## 11. Painel de Gestão Visual (Evolution Manager)

Acede ao painel web da Evolution API:
```
https://evolution-api-production-d1564.up.railway.app/manager
```

Permite ver instâncias, estado da ligação, e enviar mensagens de teste manualmente.
