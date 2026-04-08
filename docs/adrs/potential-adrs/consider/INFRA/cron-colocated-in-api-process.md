# Potential ADR: CRON de Lembretes Co-localizado no Processo Express

**Module**: INFRA
**Category**: Architecture / Reliability
**Priority**: Consider (Score: 90)
**Date Identified**: 2026-04-08

---

## What Was Identified

O job CRON de envio de lembretes de agendamento (`node-cron`) é iniciado diretamente dentro do processo Express em `src/server.js`, executando às 19h (Europe/Lisbon). Não há worker separado, fila de mensagens ou serviço dedicado de agendamento.

Este padrão tem uma consequência crítica no ambiente de produção: o **Render free tier coloca o serviço em sleep após 15 minutos de inatividade**. Se o processo estiver em sleep às 19h, o CRON **nunca disparará**. Os lembretes de agendamento para o dia seguinte, portanto, podem silenciosamente não ser enviados em produção.

O CRON foi introduzido com o commit de **28 de junho de 2025** (`Add node-cron for scheduling daily reminders`).

## Why This Might Deserve an ADR

- **Impact**: Lembretes de agendamento via WhatsApp são uma feature core do produto — falha silenciosa afeta diretamente a proposta de valor
- **Trade-offs**: Simplicidade (zero infraestrutura extra) vs confiabilidade (zero garantia de execução no free tier)
- **Complexity**: Separar o CRON requer um worker independente (Render Background Worker) ou substituição por scheduler externo (cron job do Render, GitHub Actions, etc.)
- **Team Knowledge**: Nenhum desenvolvedor perceberia que o CRON falha silenciosamente sem monitoramento ativo
- **Future Implications**: Este é um bug latente de produção que escala com o crescimento de agendamentos; no plano pago do Render o problema desaparece mas o design ainda é frágil

## Evidence Found in Codebase

### Key Files
- [`src/server.js`](../../../../src/server.js) — CRON iniciado no mesmo processo

### Code Evidence
```javascript
// src/server.js — CRON dentro do processo HTTP
cron.schedule('0 19 * * *', async () => {
  await enviarLembretes(); // Falha silenciosamente se processo estiver em sleep
}, {
  timezone: 'Europe/Lisbon'
});
```

### Impact Analysis
- Introduzido: 2025-06-28
- Ambiente: Render free tier (cold start + sleep após inatividade)
- Risco: lembretes podem não disparar em produção durante períodos de baixo tráfego
- Solução documentada no roadmap: BullMQ ou Render Background Worker

## Questions to Address in ADR (if created)

- O CRON de lembretes está funcionando de forma confiável em produção hoje?
- Qual é o plano para resolver este problema (Render pago, Background Worker, cron externo)?
- Há outros CRONs no sistema além do de lembretes?

## Related Potential ADRs
- [Split Deploy Render+Vercel](../must-document/INFRA/split-deploy-render-vercel.md)
- [Processamento Síncrono de Webhooks WA](../WA/synchronous-webhook-processing.md)
