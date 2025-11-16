# 🤖 Webhook WhatsApp - Resposta Automática Simples

**Data:** 16 de Novembro de 2025
**Status:** ✅ Implementado
**Versão:** 1.0.1

---

## 📋 Visão Geral

O webhook WhatsApp agora funciona com **dois modos**:

1. **Confirmação de Agendamento** (SIM/NÃO) → Processa confirmações automaticamente
2. **Resposta Automática Simples** (outras mensagens) → Envia saudação ÚNICA e aguarda Laura

**IMPORTANTE:** A IA (GPT-4o-mini) está **DESATIVADA** por enquanto. O sistema **NÃO interage** com clientes além da mensagem automática inicial.

---

## 🎯 Comportamento Atual

### Cenário 1: Cliente Novo (Primeira Mensagem)

```
Cliente: "Olá"

Sistema:
  1. ✅ Valida (fromMe=false, timestamp recente)
  2. ✅ Detecta que NÃO é SIM/NÃO
  3. ✅ Busca cliente no banco
  4. ✅ Cliente não existe OU não tem etapaConversa
  5. ✅ Determina saudação pelo horário:
     - 06:00-11:59 → "Bom dia"
     - 12:00-18:59 → "Boa tarde"
     - 19:00-05:59 → "Boa noite"
  6. ✅ Envia mensagem:
     "Boa tarde! 👋

     Tudo bem? Sou um assistente virtual da Laura.

     Em breve ela entrará em contato para mais informações. 💆‍♀️✨

     _La Estética Avançada_"
  7. ✅ Marca cliente como 'aguardando_laura'
  8. ✅ Se cliente não existe, cria registro temporário

Resultado: ✅ Cliente recebe mensagem automática UMA VEZ
```

---

### Cenário 2: Cliente Existente (Segunda Mensagem)

```
Cliente: "Oi, gostaria de marcar um horário"

Sistema:
  1. ✅ Valida
  2. ✅ Detecta que NÃO é SIM/NÃO
  3. ✅ Busca cliente no banco
  4. ✅ Cliente existe E tem etapaConversa = 'aguardando_laura'
  5. ✅ IGNORA mensagem (não responde)
  6. ✅ Loga: "Cliente já recebeu mensagem automática - ignorando"

Resultado: ✅ NENHUMA resposta enviada (Laura tratará manualmente)
```

---

### Cenário 3: Confirmação de Agendamento

```
Cliente: "SIM" (após receber lembrete 24h antes)

Sistema:
  1. ✅ Valida
  2. ✅ Detecta que É confirmação (padrão SIM/NÃO)
  3. ✅ Busca cliente
  4. ✅ Busca agendamento pendente (próximas 48h)
  5. ✅ Encontrou agendamento
  6. ✅ Atualiza status → 'Confirmado'
  7. ✅ Envia mensagem:
     "✅ Obrigada! Seu agendamento está confirmado para [DATA] às [HORA]..."

Resultado: ✅ Agendamento confirmado automaticamente
```

---

### Cenário 4: Confirmação SEM Agendamento Pendente

```
Cliente: "SIM" (mas sem agendamento nos próximos 2 dias)

Sistema:
  1. ✅ Valida
  2. ✅ Detecta que É confirmação
  3. ✅ Busca cliente
  4. ✅ Busca agendamento pendente
  5. ❌ NÃO encontrou agendamento
  6. ✅ Delega para resposta automática
  7. ✅ Verifica se cliente já tem etapaConversa
  8. ✅ Como já tem, IGNORA (não responde novamente)

Resultado: ✅ Silencioso (Laura tratará manualmente)
```

---

## 🔍 Lógica de Detecção

### Padrão de Confirmação (Regex)

```javascript
const padraoConfirmacao = /^(sim|confirmo|confirmar|ok|certo|confirma|yes|s|nao|não|cancelar|cancel|desmarcar|nope|n)$/;
```

**Mensagens que são confirmações:**
- ✅ "sim", "SIM", "Sim"
- ✅ "confirmo", "confirmar"
- ✅ "ok", "certo"
- ✅ "s" (aceito como "sim")
- ✅ "não", "nao", "n"
- ✅ "cancelar", "cancel"

**Mensagens que NÃO são confirmações:**
- ❌ "Olá"
- ❌ "Bom dia"
- ❌ "Gostaria de agendar"
- ❌ "Quanto custa?"
- ❌ Qualquer mensagem > 1 palavra (que não esteja no padrão)

---

## ⏰ Saudações por Horário

Baseado no **timezone Europe/Lisbon**:

| Horário | Saudação |
|---------|----------|
| 06:00 - 11:59 | Bom dia |
| 12:00 - 18:59 | Boa tarde |
| 19:00 - 05:59 | Boa noite |

---

## 🗄️ Dados Armazenados

### Campo `etapaConversa` (Cliente)

Usado para controlar se já respondemos antes:

```javascript
etapaConversa: String // Valores:
  // - null/undefined: Cliente novo, nunca recebeu mensagem automática
  // - 'aguardando_laura': Já recebeu mensagem automática, aguardando Laura
  // - 'inicial': (legacy, tratado como null)
  // - 'livre': (legacy, tratado como null)
```

### Registro Temporário

Se cliente não existe no banco, criamos registro temporário:

```javascript
{
  nome: 'Visitante (aguardando cadastro)',
  telefone: '351912345678',
  dataNascimento: new Date('2000-01-01'), // Placeholder
  etapaConversa: 'aguardando_laura'
}
```

**Motivo:** Evitar spam. Se mesmo cliente mandar múltiplas mensagens, detectamos que já respondemos.

---

## 📊 Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK WHATSAPP - FLUXO                      │
└─────────────────────────────────────────────────────────────────┘

Mensagem recebida (POST /webhook/zapi)
      │
      ├─ 🔍 VALIDAÇÃO 1: fromMe === true?
      │    └─ SIM → ⏭️ Ignora (mensagem do salão)
      │
      ├─ 🔍 VALIDAÇÃO 2: Mensagem > 5 minutos?
      │    └─ SIM → ⏭️ Ignora (mensagem antiga)
      │
      ├─ 🔍 ROTEAMENTO: É confirmação (SIM/NÃO)?
      │    │
      │    ├─ NÃO → delegarParaIA()
      │    │         │
      │    │         ├─ Busca cliente
      │    │         ├─ Cliente.etapaConversa existe?
      │    │         │    │
      │    │         │    ├─ SIM → ⏭️ Ignora (já respondeu antes)
      │    │         │    └─ NÃO → Envia mensagem automática
      │    │         │              └─ Marca etapaConversa = 'aguardando_laura'
      │    │
      │    └─ SIM → Processa confirmação
      │              │
      │              ├─ Busca cliente
      │              │    └─ Não encontrou → delegarParaIA()
      │              │
      │              ├─ Busca agendamento pendente (48h)
      │              │    └─ Não encontrou → delegarParaIA()
      │              │
      │              ├─ Processa SIM → Confirma agendamento
      │              └─ Processa NÃO → Cancela agendamento
      │
      └─ ✅ Resposta enviada (ou ignorada)
```

---

## 🧪 Exemplos de Teste

### Teste 1: Primeira Mensagem (Manhã)

**Horário:** 09:30 (Europe/Lisbon)

```bash
curl -X POST http://localhost:5000/webhook/zapi \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "351912345678",
    "text": {"message": "Olá"},
    "fromMe": false,
    "timestamp": '$(date +%s000)'
  }'
```

**Resposta Esperada:**
```
Bom dia! 👋

Tudo bem? Sou um assistente virtual da Laura.

Em breve ela entrará em contato para mais informações. 💆‍♀️✨

_La Estética Avançada_
```

---

### Teste 2: Segunda Mensagem (Mesmo Cliente)

```bash
curl -X POST http://localhost:5000/webhook/zapi \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "351912345678",
    "text": {"message": "Quanto custa?"},
    "fromMe": false,
    "timestamp": '$(date +%s000)'
  }'
```

**Resposta Esperada:**
```
(Nenhuma resposta enviada - cliente já tem etapaConversa)
```

**Logs:**
```
[Webhook] ⏭️ Cliente [Nome] já recebeu mensagem automática - ignorando
```

---

### Teste 3: Confirmação de Agendamento

**Pré-requisito:** Cliente deve ter agendamento pendente nas próximas 48h

```bash
curl -X POST http://localhost:5000/webhook/zapi \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "351912345678",
    "text": {"message": "SIM"},
    "fromMe": false,
    "timestamp": '$(date +%s000)'
  }'
```

**Resposta Esperada:**
```
✅ Obrigada, [Nome]! Seu agendamento está confirmado para [DATA] às [HORA]. Aguardamos você! 💆‍♀️✨
```

---

## 🔧 Configuração

### Variáveis de Ambiente

```env
# Z-API WhatsApp
ZAPI_INSTANCE_ID=your_instance_id
ZAPI_TOKEN=your_token
ZAPI_BASE_URL=https://api.z-api.io/instances/{instance}/token/{token}
```

### Webhook Z-API

Configurar webhook no painel Z-API:

```
URL: https://seu-backend.com/webhook/zapi
```

---

## 📝 Vantagens desta Abordagem

✅ **Sem IA (por enquanto):** Economiza custos OpenAI
✅ **Resposta única:** Evita spam com clientes
✅ **Baseada em horário:** Saudação personalizada
✅ **Laura controla:** Todas as conversas são tratadas manualmente após primeira mensagem
✅ **Confirmações automáticas:** Agendamentos são confirmados sem intervenção
✅ **Simples de entender:** Lógica clara e direta

---

## 🚀 Próximos Passos (Futuro)

Quando estiver pronto para ativar IA:

1. **Desabilitar flag `RESPOSTA_AUTOMATICA_SIMPLES`**
2. **Ativar chamada para `agenteController.js`**
3. **Configurar prompts separados:**
   - Agente 1: Agendamentos
   - Agente 2: Informações gerais
4. **Testar respostas da IA**

---

## 📚 Arquivos Relacionados

- `src/controllers/webhookController.js` - Lógica principal
- `src/controllers/agenteController.js` - IA (desativada)
- `src/models/Cliente.js` - Campo `etapaConversa`
- `assets/docs/FIX_WEBHOOK_WHATSAPP.md` - Análise original do problema

---

**Última Atualização:** 16 de Novembro de 2025
**Autor:** André dos Reis
