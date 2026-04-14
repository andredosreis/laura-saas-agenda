# ADR-006: Z-API como Gateway WhatsApp para Notificações e Automação

**Status:** Accepted — Migração para Evolution API planeada (ADR pendente)  
**Data:** 2025-06-09  
**Módulo:** WA  
**Autor:** André dos Reis  
**Score de Impacto:** 145 (Crítico)

---

## Contexto

O WhatsApp é o canal de comunicação primário entre profissionais e clientes no mercado alvo da Laura (Portugal e Brasil). A proposta de valor central do produto — lembretes automáticos e chatbot de agendamento — depende inteiramente da capacidade de enviar e receber mensagens WhatsApp de forma programática.

A API oficial do WhatsApp Business (Meta) requer aprovação de conta de negócio, tem custos por mensagem enviada, e tem restrições de templates que limitam mensagens outbound. Para a fase inicial com um cliente activo, uma solução de menor custo e maior flexibilidade era necessária.

A integração foi introduzida em Junho de 2025 (`Add WhatsApp confirmation message on new appointment creation`) e evoluiu de envio simples para um sistema bidirecional com webhook, roteamento inteligente e delegação para IA ao longo de ~6 meses.

---

## Decisão

Adoptar a **Z-API** como gateway WhatsApp na fase inicial, integrando via HTTP REST para envio de mensagens e via webhook para recepção.

A integração segue o padrão:
- **Envio:** `src/services/zapiClient.js` faz chamadas HTTP para a API Z-API com autenticação por `ZAPI_INSTANCE_ID` + `ZAPI_TOKEN`
- **Recepção:** webhook `POST /webhook/whatsapp` recebe mensagens do Z-API e processa sincronamente (ver trade-offs)
- **CORS para webhooks:** Rota de webhook configurada sem verificação de `Origin` (webhooks não enviam header `Origin`)

---

## Alternativas Consideradas

### 1. WhatsApp Business API oficial (Meta)
- **Vantagem:** Estabilidade e suporte oficial; sem risco de ban de conta por uso de cliente não-oficial
- **Desvantagem:** Custo por mensagem enviada (modelo de conversação da Meta); aprovação de conta de negócio com tempo de espera; templates obrigatórios para mensagens outbound limitam a flexibilidade do chatbot
- **Descartada** por custo e restrições incompatíveis com o modelo de chatbot conversacional

### 2. Evolution API (self-hosted, Docker)
- **Vantagem:** Custo zero (self-hosted); compatível com WhatsApp Web; maior controlo sobre dados; planeada como migração futura no HLD (ADR-002 do HLD)
- **Desvantagem:** Requer infraestrutura Docker própria (servidor VPS); maior complexidade operacional; ainda é um cliente não-oficial do WhatsApp
- **Não adoptada na fase inicial** por requerer infraestrutura Docker não disponível no tier Render free; **planeada como migração futura**

### 3. Twilio WhatsApp API
- **Vantagem:** API estável, suporte empresarial, sem risco de ban
- **Desvantagem:** Custo por mensagem; dependência de intermediário entre Twilio e Meta; latência adicional
- **Descartada** por custo e modelo de preços incompatível com a fase inicial

---

## Consequências

### Positivas
- **Custo zero por mensagem** na fase inicial — Z-API cobra mensalidade fixa, não por mensagem
- **Flexibilidade total de conteúdo** — sem restrições de templates para mensagens outbound
- **Implementação rápida** — API REST simples, integração em dias
- **Bidirecional** — suporte a webhook para recepção de mensagens, habilitando o chatbot conversacional

### Negativas / Trade-offs
- **Risco de ban de conta** — Z-API usa o protocolo WhatsApp Web (cliente não-oficial); o WhatsApp pode banir números que detectem automação não-oficial; **mitigação:** limitar volume de mensagens, usar boas práticas de timing
- **Processamento síncrono sem fila** — webhooks processados directamente no Express, incluindo chamadas à OpenAI (~1-3s); em pico de mensagens simultâneas, pode causar timeout no webhook e degradação do servidor; **melhoria planeada:** BullMQ
- **Dependência de vendor:** mudança de contrato documentada em `fix: Aceita ZAPI_TOKEN ou ZAPI_INSTANCE_TOKEN para compatibilidade` — o Z-API alterou o nome da variável de autenticação sem aviso prévio
- **Complexidade de CORS para webhooks:** Webhooks não enviam header `Origin` — CORS configurado para não bloquear requests sem Origin nesta rota específica (6 commits de fix em 01/11/2025)

### Plano de migração documentado
A migração para Evolution API (self-hosted via Docker) está documentada no HLD como ADR-002 e planeada para a Fase 2 (Maio 2026). Os principais drivers da migração são:
- Eliminar custo mensal do Z-API
- Maior controlo sobre dados e infraestrutura
- Eliminar dependência de vendor externo para funcionalidade core

---

## Links e Referências

- **Integração inicial:** 2025-06-09
- **Commits relacionados:** ~20 commits entre Jun 2025 e Nov 2025
- **CORS fix commits:** 6 commits em 01/11/2025
- **Ficheiros chave:**
  - `src/services/zapiClient.js` — Cliente HTTP para Z-API
  - `src/controllers/whatsappController.js` — Processamento de webhooks
  - `src/routes/whatsappRoutes.js` — Rotas de webhook
- **ADRs relacionados:**
  - [ADR-007: Two-Tier LLM Strategy](./ADR-007-two-tier-llm-strategy.md)
