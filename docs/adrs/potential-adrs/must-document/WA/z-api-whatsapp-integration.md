# Potential ADR: Z-API como Gateway WhatsApp para Notificações e Automação

**Module**: WA
**Category**: Technology / Integration
**Priority**: Must Document (Score: 145)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema integra WhatsApp como canal primário de comunicação com clientes usando a **Z-API** como gateway. A integração foi introduzida em **9 de junho de 2025** (`Add WhatsApp confirmation message on new appointment creation`) e expandida progressivamente ao longo de ~6 meses. O padrão evoluiu de simples envio de mensagens para um sistema bidirecional com webhook receptor, roteamento inteligente e delegação para IA.

A linha do tempo revela uma evolução arquitetural clara: envio unidirecional (Jun 2025) → webhook receptor + OpenAI (Jun-Jul 2025) → sistema de confirmação de agendamentos (Out 2025) → roteamento inteligente com delegação para IA (Nov 2025). Os múltiplos commits de fix em CORS no período de outubro-novembro de 2025 (`fix: Permite webhook Z-API sem bloqueio CORS`, `fix: Corrige ordem de middleware CORS`) revelam a complexidade operacional de receber webhooks de terceiros sem `Origin` header.

A compatibilidade entre `ZAPI_TOKEN` e `ZAPI_INSTANCE_TOKEN` (`fix: Aceita ZAPI_TOKEN ou ZAPI_INSTANCE_TOKEN para compatibilidade`) indica que houve mudança de versão/contrato na API do Z-API, evidenciando dependência de fornecedor externo.

## Why This Might Deserve an ADR

- **Impact**: Canal de comunicação principal com clientes — afeta agendamentos, lembretes, confirmações e automação conversacional
- **Trade-offs**: Z-API é um wrapper não-oficial da API do WhatsApp (risco de ban de conta); Evolution API foi mencionada como alternativa no HLD
- **Complexity**: Processamento síncrono de webhooks no Express (sem fila) — identificado como gargalo em roadmap de melhorias
- **Team Knowledge**: Qualquer feature de comunicação com cliente passa por este módulo; CORS para webhooks sem Origin é não-óbvio
- **Future Implications**: Migração para Evolution API (mencionada no HLD como ADR 002) ou WhatsApp Business API oficial

## Evidence Found in Codebase

### Key Files
- [`src/services/zapiClient.js`](../../../../src/services/zapiClient.js) — Cliente HTTP para Z-API
- [`src/controllers/whatsappController.js`](../../../../src/controllers/whatsappController.js) — Processamento de webhooks
- [`src/routes/whatsappRoutes.js`](../../../../src/routes/whatsappRoutes.js) — Rotas de webhook

### Impact Analysis
- Introduzido: 2025-06-09
- Commits relacionados: ~20 commits ao longo de 6 meses
- Última mudança significativa: 2025-11-16 (roteamento inteligente)
- Problemas CORS documentados: 6 commits de fix em 01/11/2025
- Risco identificado: processamento síncrono sem fila de mensagens

## Questions to Address in ADR (if created)

- Por que Z-API em vez de WhatsApp Business API oficial ou Evolution API?
- Como o sistema lida com falhas no webhook (retry, dead letter)?
- Qual a estratégia de migração para Evolution API mencionada no HLD?
- Como é feito o tratamento de rate limits do WhatsApp?
- Por que processamento síncrono em vez de fila (BullMQ)?

## Related Potential ADRs
- [Two-Tier LLM Strategy para WhatsApp](../AI/two-tier-llm-strategy.md)
- [Processamento Síncrono de Webhooks](../../consider/WA/synchronous-webhook-processing.md)
