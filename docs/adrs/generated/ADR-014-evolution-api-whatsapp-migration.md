# ADR-014: Migração Z-API → Evolution API (Self-Hosted via Railway)

**Status:** Accepted — Implementado em Abril 2026  
**Data:** 2026-04-18  
**Módulo:** WA  
**Autor:** André dos Reis  
**Score de Impacto:** 150 (Crítico)

---

## Contexto

O plano mensal do Z-API expirou e não foi renovado. O sistema depende inteiramente do WhatsApp para confirmações de agendamento, lembretes automáticos (BullMQ) e recepção de respostas SIM/NÃO dos clientes — funcionalidade core do produto.

A Z-API estava integrada via HTTP REST com webhook de entrada (`POST /webhook/zapi`), autenticado por `x-api-token`. O ADR-006 documentou esta integração e já previa a migração para Evolution API como passo seguinte.

A necessidade de migração foi acelerada pela expiração do contrato, tornando o sistema de notificações completamente inoperacional.

---

## Decisão

Adoptar **Evolution API v1.8.7** self-hosted em **Railway** como gateway WhatsApp permanente.

**Hosting:** Railway (Docker service) — URL permanente, não depende do computador do utilizador estar ligado (~$5/mês, dentro do free tier inicial do Railway).

**Instância:** `marcai` — nome fixo, persistido em volume Docker no Railway.

**Autenticação:** `apikey` header (não `x-api-token` como no Z-API).

**Payload de envio (v1.x):**
```javascript
POST /message/sendText/marcai
{ "number": "351XXXXXXXXX", "textMessage": { "text": "mensagem" } }
```

**Payload do webhook recebido (v1.x):**
```javascript
{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "351XXXXXXXXX@s.whatsapp.net", "fromMe": false },
    "message": { "conversation": "SIM" },
    "messageTimestamp": 1234567890
  }
}
```

**Ficheiros alterados:**
- `src/utils/evolutionClient.js` — substitui `zapi_client.js`; mesma assinatura `sendWhatsAppMessage(to, message)`
- `src/middlewares/webhookAuth.js` — header `apikey` em vez de `x-api-token`; variável `EVOLUTION_WEBHOOK_SECRET`
- `src/controllers/webhookController.js` — parsing do payload Evolution API; suporte a leads (tipo Avaliacao) via `lead.telefone`
- `src/routes/webhookRoutes.js` — rota `/webhook/evolution`

**Variáveis de ambiente (Render):**
```
EVOLUTION_API_URL=https://evolution-api-production-d1564.up.railway.app
EVOLUTION_API_KEY=<chave>
EVOLUTION_INSTANCE=marcai
EVOLUTION_WEBHOOK_SECRET=<chave>
```

---

## Alternativas Consideradas

### 1. Renovar plano Z-API
- **Vantagem:** Zero esforço de migração
- **Desvantagem:** Custo mensal recorrente; dependência de vendor para funcionalidade core; vulnerabilidade a alterações de contrato (já aconteceu — ADR-006)
- **Descartada** por custo e dependência

### 2. Evolution API local + Cloudflare Tunnel
- **Vantagem:** Custo zero total
- **Desvantagem:** URL do tunnel muda a cada restart (Quick Tunnel); se o computador desligar ou internet cair, o WhatsApp para para todos os tenants; impraticável para produção
- **Descartada** por falta de fiabilidade

### 3. Evolution API no Railway (decisão adoptada)
- **Vantagem:** URL permanente; sempre ligado; custo baixo; controlo total sobre a instância; sem dependência de vendor externo
- **Desvantagem:** Custo Railway (~$5/mês); se o Railway tiver downtime, o WhatsApp para; ainda é cliente não-oficial do WhatsApp (risco de ban)
- **Adoptada** como melhor equilíbrio entre custo, fiabilidade e controlo

### 4. WhatsApp Business API oficial (Meta)
- **Vantagem:** Estabilidade; zero risco de ban
- **Desvantagem:** Custo por mensagem; templates obrigatórios para outbound; processo de aprovação demorado
- **Descartada** por custo e restrições incompatíveis com o modelo de chatbot

---

## Consequências

### Positivas
- **Sempre disponível** — não depende do computador do utilizador
- **URL permanente** — webhook configurado uma vez, não muda
- **Custo previsível** — Railway cobra por uso, free tier cobre a fase actual
- **Controlo total** — dados da instância persistidos em volume Docker no Railway
- **Suporte a leads** — webhook agora confirma agendamentos de tipo Avaliacao via `lead.telefone`

### Negativas / Trade-offs
- **Risco de ban** — Evolution API usa protocolo WhatsApp Web (não-oficial); mitigação: volume baixo de mensagens, boas práticas de timing
- **Custo Railway** — a partir de certo volume de uso, Railway começa a cobrar; **plano de migração:** VPS próprio (Hetzner ~€4/mês) quando houver mais tenants
- **Versão fixada em v1.8.7** — actualizar para v2.x requer migração do payload (`textMessage.text` → `text`); documentado para não fazer upgrade sem testes

### Diferenças críticas Z-API → Evolution API

| Aspecto | Z-API | Evolution API v1.x |
|---|---|---|
| Header autenticação | `x-api-token` | `apikey` |
| Payload envio | `{ text: "..." }` | `{ textMessage: { text: "..." } }` |
| Webhook evento | qualquer | `event: "messages.upsert"` |
| Telefone entrada | `phone` | `data.key.remoteJid` → strip `@s.whatsapp.net` |
| Mensagem entrada | `text.message` | `data.message.conversation` |

---

## Documentação Operacional

Criado `docs/evolution-api-operations.md` com procedimentos completos:
- Verificar estado da conexão
- Ligar/desligar WhatsApp (QR Code)
- Trocar número
- Configurar webhook
- Testar envio e recepção
- Checklist de diagnóstico

---

## Links e Referências

- **Data da implementação:** 2026-04-18
- **Railway service:** `evolution-api-production-d1564.up.railway.app`
- **Imagem Docker:** `atendai/evolution-api:v1.8.7`
- **Ficheiros chave:**
  - `src/utils/evolutionClient.js`
  - `src/middlewares/webhookAuth.js`
  - `src/controllers/webhookController.js`
  - `docs/evolution-api-operations.md`
- **ADRs relacionados:**
  - [ADR-006: Z-API WhatsApp Integration](./ADR-006-z-api-whatsapp-integration.md)
  - [ADR-013: Notification Pipeline BullMQ](./ADR-013-notification-pipeline-bullmq.md)
  - [ADR-012: Docker Containerization](./ADR-012-docker-containerization-strategy.md)
