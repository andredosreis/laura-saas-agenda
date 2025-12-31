# 🔧 FIX: Webhook WhatsApp - Problema de Roteamento

**Data:** 16 de Novembro de 2025
**Status:** 🔴 Bug Crítico Identificado
**Prioridade:** Alta

---

## 📋 Problema

### Comportamento Atual (Errado)

Quando cliente envia **"Olá"** (ou qualquer mensagem que não seja SIM/NÃO), o sistema responde:

```
Olá Andre... Não encontramos nenhum agendamento pendente de confirmação
```

**Isso está errado porque:**
- O cliente não está tentando confirmar um agendamento
- Ele está iniciando uma conversa nova
- A IA (GPT-4o-mini) deveria processar isso

---

## 🔍 Causa Raiz

### Arquitetura Atual

```
Z-API (WhatsApp)
      │
      ├─► POST /webhook/zapi
      │         │
      │         └─► webhookController.js
      │               └─► processarConfirmacaoWhatsapp()
      │                     │
      │                     ├─ Valida se é confirmação (SIM/NÃO)
      │                     ├─ Busca agendamento pendente
      │                     └─ Se não encontrar:
      │                         ❌ ERRO: "Nenhum agendamento pendente"
      │
      └─► POST /api/agente/processar-resposta
                │
                └─► agenteController.js
                      └─► processarRespostaWhatsapp()
                            └─► chatWithLaura() (IA)
```

**Problema:** Z-API só está configurado para enviar para `/webhook/zapi`, que **não** delega para a IA quando não há agendamento pendente.

---

## ✅ Solução 1: Webhook Inteligente (Recomendado)

### Lógica

```
POST /webhook/zapi (ÚNICO ponto de entrada)
      │
      ├─ 1. Valida (fromMe, timestamp)
      │
      ├─ 2. Detecta tipo de mensagem:
      │    │
      │    ├─ É SIM/NÃO? → Busca agendamento pendente
      │    │                │
      │    │                ├─ Encontrou? → Processa confirmação ✅
      │    │                └─ NÃO encontrou? → Delega para IA
      │    │
      │    └─ Outra mensagem → Delega para IA
      │
      └─ 3. IA processa com chatWithLaura()
```

### Implementação

**Arquivo:** `src/controllers/webhookController.js`

**Modificar a função `processarConfirmacaoWhatsapp`:**

```javascript
export const processarConfirmacaoWhatsapp = async (req, res) => {
  try {
    console.log('[Webhook] 📥 Recebido:', JSON.stringify(req.body, null, 2));

    // ========================================
    // VALIDAÇÕES INICIAIS
    // ========================================

    // 🔍 VALIDAÇÃO 1: Ignora mensagens enviadas pelo próprio salão (fromMe: true)
    if (req.body.fromMe === true) {
      console.log('[Webhook] ⏭️ Ignorando mensagem enviada pelo salão (fromMe: true)');
      return res.status(200).json({ message: 'Mensagem do salão ignorada' });
    }

    // 🔍 VALIDAÇÃO 2: Verifica timestamp (só processa mensagens dos últimos 5 minutos)
    const timestampMensagem = req.body.momment || req.body.timestamp || Date.now();
    const idadeMensagem = Date.now() - timestampMensagem;
    const CINCO_MINUTOS = 5 * 60 * 1000;

    if (idadeMensagem > CINCO_MINUTOS) {
      console.log(`[Webhook] ⏭️ Mensagem antiga (${Math.round(idadeMensagem / 1000)}s) - ignorando`);
      return res.status(200).json({ message: 'Mensagem antiga ignorada' });
    }

    // Extrai dados do webhook Z-API
    const telefone = req.body.phone || req.body.data?.phone || req.body.data?.from;
    const mensagem = req.body.text?.message || req.body.data?.body || '';

    if (!telefone || !mensagem) {
      console.warn('[Webhook] ⚠️ Dados incompletos:', { telefone, mensagem });
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Normaliza telefone (remove caracteres especiais)
    const telefoneNormalizado = telefone.replace(/[^\d]/g, '');

    // Normaliza mensagem (lowercase, remove acentos e espaços)
    const mensagemNormalizada = mensagem
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    console.log(`[Webhook] 📱 Telefone: ${telefoneNormalizado}, Mensagem: "${mensagemNormalizada}"`);

    // ========================================
    // ROTEAMENTO INTELIGENTE
    // ========================================

    // 🔍 Detecta se é uma resposta de confirmação (SIM/NÃO)
    const padraoConfirmacao = /^(sim|confirmo|confirmar|ok|certo|confirma|yes|s|nao|não|cancelar|cancel|desmarcar|nope|n)$/;
    const ehRespostaConfirmacao = padraoConfirmacao.test(mensagemNormalizada);

    if (!ehRespostaConfirmacao) {
      // ✅ NÃO é confirmação → Delega para IA
      console.log(`[Webhook] 🤖 Delegando para IA: "${mensagem}"`);
      return await delegarParaIA(req, res);
    }

    // ✅ É uma resposta de confirmação → Continua processando

    // Busca cliente pelo telefone
    const cliente = await Cliente.findOne({
      $or: [
        { telefone: telefoneNormalizado },
        { telefone: `351${telefoneNormalizado}` },
        { telefone: telefoneNormalizado.replace(/^351/, '') }
      ]
    });

    if (!cliente) {
      console.warn(`[Webhook] ⚠️ Cliente não encontrado para telefone: ${telefoneNormalizado}`);
      // Delega para IA (pode ser cliente novo)
      return await delegarParaIA(req, res);
    }

    console.log(`[Webhook] ✅ Cliente encontrado: ${cliente.nome} (${cliente._id})`);

    // Busca agendamento pendente nas próximas 48h
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const doisDias = agora.plus({ days: 2 });

    const agendamento = await Agendamento.findOne({
      cliente: cliente._id,
      'confirmacao.tipo': 'pendente',
      dataHora: {
        $gte: agora.toJSDate(),
        $lte: doisDias.toJSDate()
      }
    }).sort({ dataHora: 1 });

    if (!agendamento) {
      // ✅ NÃO encontrou agendamento pendente → Delega para IA
      console.warn(`[Webhook] ⚠️ Nenhum agendamento pendente para ${cliente.nome} - delegando para IA`);
      return await delegarParaIA(req, res);
    }

    // ========================================
    // PROCESSAMENTO DE CONFIRMAÇÃO
    // ========================================

    // Processa resposta
    let resposta = '';
    let novoStatus = '';

    // Respostas positivas
    if (/^(sim|confirmo|confirmar|ok|certo|confirma|yes|s)$/.test(mensagemNormalizada)) {
      agendamento.confirmacao.tipo = 'confirmado';
      agendamento.confirmacao.respondidoEm = new Date();
      agendamento.confirmacao.respondidoPor = 'cliente';
      agendamento.status = 'Confirmado';
      novoStatus = 'confirmado';

      const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
        .setZone('Europe/Lisbon')
        .toFormat("dd/MM/yyyy 'às' HH:mm");

      resposta = `✅ Obrigada, ${cliente.nome}! Seu agendamento está confirmado para ${dataFormatada}. Aguardamos você! 💆‍♀️✨`;
    }
    // Respostas negativas
    else if (/^(nao|n[aã]o|cancelar|cancel|desmarcar|nope|n)$/.test(mensagemNormalizada)) {
      agendamento.confirmacao.tipo = 'rejeitado';
      agendamento.confirmacao.respondidoEm = new Date();
      agendamento.confirmacao.respondidoPor = 'cliente';
      agendamento.status = 'Cancelado Pelo Cliente';
      novoStatus = 'rejeitado';

      resposta = `❌ Entendido, ${cliente.nome}. Seu agendamento foi cancelado. Se precisar remarcar, é só entrar em contato! 📞`;
    }

    // Salva agendamento
    await agendamento.save();
    console.log(`[Webhook] ✅ Agendamento ${novoStatus}: ${agendamento._id}`);

    // Envia resposta ao cliente
    await sendWhatsAppMessage(telefoneNormalizado, resposta);

    return res.status(200).json({
      success: true,
      tipo: 'confirmacao',
      cliente: cliente.nome,
      agendamento: agendamento._id,
      status: novoStatus
    });

  } catch (error) {
    console.error('[Webhook] ❌ Erro ao processar webhook:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * 🤖 Delega mensagem para IA (chatbot)
 */
async function delegarParaIA(req, res) {
  try {
    console.log('[Webhook] 🤖 Delegando para IA...');

    // Importa a função do agenteController
    const { processarRespostaWhatsapp } = await import('./agenteController.js');

    // Chama a função passando req e res
    return await processarRespostaWhatsapp(req, res);

  } catch (error) {
    console.error('[Webhook] ❌ Erro ao delegar para IA:', error);

    // Fallback: envia mensagem genérica
    const telefone = req.body.phone || req.body.data?.phone;
    if (telefone) {
      await sendWhatsAppMessage(
        telefone.replace(/[^\d]/g, ''),
        'Olá! 👋 Como posso ajudar hoje?'
      );
    }

    return res.status(200).json({
      success: true,
      tipo: 'fallback',
      message: 'Mensagem processada com fallback'
    });
  }
}
```

### Resultado Esperado

```
Cliente: "Olá"
Sistema:
  1. ✅ Valida (não é fromMe, é recente)
  2. ✅ Detecta que NÃO é SIM/NÃO
  3. ✅ Delega para IA
  4. ✅ IA responde: "Olá! Bem-vindo(a) à Clínica de Estética Laura..."

Cliente: "SIM" (após receber lembrete)
Sistema:
  1. ✅ Valida
  2. ✅ Detecta que É confirmação
  3. ✅ Busca agendamento pendente
  4. ✅ Confirma agendamento
  5. ✅ Responde: "Obrigada! Agendamento confirmado..."
```

---

## ✅ Solução 2: Duas Rotas Separadas (Alternativa)

### Lógica

Configurar **dois webhooks** no Z-API (se suportado):

1. `/webhook/zapi` → Confirmações
2. `/webhook/chat` → Conversas IA

### Pros e Contras

**Solução 1 (Webhook Inteligente):**
- ✅ Um único ponto de entrada
- ✅ Mais simples de configurar no Z-API
- ✅ Fallback automático para IA
- ❌ Mais lógica no webhook

**Solução 2 (Duas Rotas):**
- ✅ Separação clara de responsabilidades
- ✅ Código mais limpo
- ❌ Z-API pode não suportar múltiplos webhooks
- ❌ Difícil decidir qual rota usar

**Recomendação:** **Solução 1** (Webhook Inteligente)

---

## 📝 Checklist de Implementação

### Fase 1: Modificar Webhook
- [ ] Adicionar função `delegarParaIA()` em `webhookController.js`
- [ ] Modificar lógica de roteamento (linha 51-58)
- [ ] Testar localmente com ngrok

### Fase 2: Testes
- [ ] **Teste 1:** Enviar "Olá" → Deve acionar IA
- [ ] **Teste 2:** Enviar "SIM" sem agendamento → Deve acionar IA
- [ ] **Teste 3:** Enviar "SIM" COM agendamento → Deve confirmar
- [ ] **Teste 4:** Enviar "NÃO" COM agendamento → Deve cancelar

### Fase 3: Deploy
- [ ] Commit código
- [ ] Push para produção
- [ ] Verificar logs

---

## 🧪 Testes Locais

### Setup

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: ngrok
ngrok http 5000
# URL: https://abc123.ngrok.io
```

### Configurar Z-API Webhook

```bash
curl -X POST https://api.z-api.io/instances/{instance}/token/{token}/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhook/zapi"
  }'
```

### Testes Manuais

```bash
# Simular webhook Z-API
curl -X POST http://localhost:5000/webhook/zapi \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "351912345678",
    "text": {
      "message": "Olá"
    },
    "fromMe": false,
    "timestamp": '$(date +%s000)'
  }'

# Esperado: IA responde "Olá! Bem-vindo..."
```

---

## 📊 Impacto

### Antes (Errado)
```
Cliente: "Olá"
Sistema: "Não encontramos nenhum agendamento pendente" ❌
```

### Depois (Correto)
```
Cliente: "Olá"
Sistema: "Olá! Bem-vindo(a) à Clínica de Estética Laura. Como posso ajudar?" ✅
```

---

## 🔗 Arquivos Afetados

- `src/controllers/webhookController.js` (modificado)
- `src/controllers/agenteController.js` (não modificado, só importado)
- `src/routes/webhookRoutes.js` (não modificado)

---

## 📚 Referências

- [Webhook WhatsApp - Z-API Docs](https://developer.z-api.io/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [docs/ANALISE_COMPLETA.md](./ANALISE_COMPLETA.md)
- [docs/ARQUITETURA.md](./ARQUITETURA.md)

---

**Status:** 📝 Documentado - Aguardando Implementação
**Próximo Passo:** Modificar `webhookController.js` conforme Solução 1
