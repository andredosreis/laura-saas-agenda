# Potential ADR: Processamento Síncrono de Webhooks WhatsApp (sem fila)

**Module**: WA
**Category**: Architecture / Performance
**Priority**: Consider (Score: 85)
**Date Identified**: 2026-04-08

---

## What Was Identified

Os webhooks do WhatsApp são processados de forma **síncrona** dentro do processo Express, sem uso de fila de mensagens (como BullMQ ou RabbitMQ). Isso significa que o processamento de cada mensagem recebida — incluindo chamadas à API OpenAI (latência ~1-3s) — bloqueia a resposta do webhook e ocorre no mesmo processo do servidor HTTP.

Esta arquitetura é identificada explicitamente no roadmap de melhorias do projeto como um ponto de atenção: "Implementar BullMQ para processamento assíncrono de webhooks" está listado como melhoria pendente.

## Why This Might Deserve an ADR

- **Impact**: Em alto volume de mensagens simultâneas, pode causar timeout no webhook do Z-API e degradação do servidor
- **Trade-offs**: Simplicidade de implementação vs resiliência; sem fila, mensagens perdidas em caso de crash do servidor não são reprocessadas
- **Complexity**: Baixa agora; alta se implementar fila (requer Redis + BullMQ + worker separado)
- **Future Implications**: BullMQ está planejado no roadmap — esta decisão será revisada

## Evidence Found in Codebase

### Key Files
- [`src/controllers/whatsappController.js`](../../../../src/controllers/whatsappController.js) — Processamento síncrono
- [`src/controllers/agenteController.js`](../../../../src/controllers/agenteController.js) — Chamada OpenAI síncrona

### Impact Analysis
- Presente desde: 2025-06-28 (implementação inicial do webhook)
- Melhoria planejada: BullMQ (roadmap)
- Risco: timeout em pico de mensagens simultâneas

## Questions to Address in ADR (if created)

- Qual o volume atual de mensagens processadas?
- Existe SLA de resposta ao webhook do Z-API?
- Quando BullMQ será implementado?

## Related Potential ADRs
- [Z-API WhatsApp Integration](../must-document/WA/z-api-whatsapp-integration.md)
