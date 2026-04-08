# Potential ADR: Estratégia Two-Tier LLM (GPT-3.5 Classificador + GPT-4o-mini Function Calling)

**Module**: AI
**Category**: Architecture / Technology
**Priority**: Must Document (Score: 140)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema implementa uma estratégia de dois níveis para processamento de mensagens via WhatsApp: um modelo mais leve (GPT-3.5-turbo) para classificação de intenção e roteamento, e um modelo mais capaz (GPT-4o-mini) para function calling e execução de ações no sistema (consultar agenda, criar agendamento, etc.). Esta arquitetura foi introduzida em **29 de junho de 2025** (`Add OpenAI integration for intent classification and response generation`) e refinada ao longo de ~5 meses.

A evolução é documentada nos commits: integração inicial com OpenAI para classificação (Jun 2025) → atualização do schema de functions e modelo Conversa (Jul 2025) → roteamento inteligente com delegação para IA (Nov 2025) → arquitetura multi-agente governada v1.1 (Fev 2026). O commit de **21 de fevereiro de 2026** (`feat: add governed multi-agent architecture (v1.1)`) indica que a arquitetura evoluiu para um modelo mais sofisticado com agentes governados.

O arquivo `src/utils/openaiHelper.js` (corrigido em **22 de julho de 2025**: `fix: Correct path to system prompt`) e o modelo `Conversa` introduzido em julho de 2025 são evidências da maturidade crescente da camada de IA.

## Why This Might Deserve an ADR

- **Impact**: Define como o sistema entende e responde a clientes via WhatsApp — core do produto de automação
- **Trade-offs**: Custo operacional de duas chamadas LLM por mensagem vs precisão; latência adicional; dependência total da OpenAI
- **Complexity**: Function calling requer schema de funções bem definido; mudanças no domínio exigem atualização do schema de IA
- **Team Knowledge**: Crítico para qualquer feature conversacional; o padrão de classificação → execução deve ser documentado
- **Future Implications**: Vendor lock-in com OpenAI; custos escalam com volume de mensagens; migração para modelos open-source seria complexa

## Evidence Found in Codebase

### Key Files
- [`src/utils/openaiHelper.js`](../../../../src/utils/openaiHelper.js) — Helper de integração com OpenAI
- [`src/controllers/agenteController.js`](../../../../src/controllers/agenteController.js) — Lógica de roteamento e delegação
- [`src/models/Conversa.js`](../../../../src/models/Conversa.js) — Histórico de conversas para contexto

### Impact Analysis
- Introduzido: 2025-06-29
- Arquitetura multi-agente v1.1: 2026-02-21
- Commits relacionados: ~10 commits ao longo de 8 meses
- Custo: duas chamadas OpenAI por mensagem processada
- Dependência: 100% OpenAI API (sem fallback documentado)

## Questions to Address in ADR (if created)

- Por que dois modelos em vez de um único mais capaz?
- Qual o critério de roteamento entre classificador e executor?
- Como o sistema lida com falhas da API OpenAI?
- Qual o custo estimado por mensagem processada?
- A arquitetura multi-agente v1.1 substitui ou complementa o two-tier?
- Existe plano de fallback para modelo open-source (Ollama, etc.)?

## Related Potential ADRs
- [Z-API WhatsApp Integration](../WA/z-api-whatsapp-integration.md)
