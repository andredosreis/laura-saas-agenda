# ADR-007: Estratégia Two-Tier LLM — Classificador + Function Calling

**Status:** Accepted — Arquitectura multi-agente v1.1 em evolução  
**Data:** 2025-06-29 (multi-agente v1.1: 2026-02-21)  
**Módulo:** AI  
**Autor:** André dos Reis  
**Score de Impacto:** 140 (Crítico)

---

## Contexto

O chatbot WhatsApp da Laura precisa de entender mensagens em linguagem natural de clientes (ex: "queria marcar para amanhã às 3 da tarde") e transformá-las em acções concretas no sistema (criar agendamento, consultar disponibilidade, cancelar). Duas capacidades distintas são necessárias:

1. **Classificação de intenção:** Determinar rapidamente o que o cliente quer (agendar, consultar, cancelar, conversa livre)
2. **Execução de acção:** Extrair parâmetros estruturados e chamar funções do sistema

Usar um único modelo poderoso para ambas as tarefas seria mais caro (custo por token) e mais lento (latência). Usar um modelo fraco para ambas sacrificaria precisão nas acções.

A integração inicial foi introduzida em Junho de 2025 e evoluiu para uma arquitectura multi-agente governada em Fevereiro de 2026 (`feat: add governed multi-agent architecture (v1.1)`).

---

## Decisão

Adoptar uma **estratégia Two-Tier LLM** com modelos especializados por função:

**Tier 1 — Classificador (GPT-3.5-turbo):**
- Propósito: classificar a intenção da mensagem recebida
- Saída: categoria de intenção (`AGENDAR`, `CONSULTAR_DISPONIBILIDADE`, `CANCELAR`, `CONVERSA_LIVRE`, `FORA_DO_ESCOPO`)
- Justificação: GPT-3.5 é suficiente para classificação binária/categórica; custo ~10x menor que GPT-4o-mini; latência menor

**Tier 2 — Executor com Function Calling (GPT-4o-mini):**
- Propósito: extrair parâmetros e invocar funções do sistema
- Invocado apenas quando Tier 1 classifica como acção (não para conversa livre)
- Funções expostas: `criar_agendamento`, `consultar_disponibilidade`, `cancelar_agendamento`, `consultar_historico`
- Justificação: Function Calling requer modelo com maior capacidade de raciocínio estruturado

**Arquitectura multi-agente v1.1 (Fev 2026):**
Evolução para agentes governados com orquestrador central que coordena o fluxo entre Tier 1 e Tier 2, com contexto de conversa persistido em `src/models/Conversa.js`.

---

## Alternativas Consideradas

### 1. Modelo único (GPT-4o-mini para tudo)
- **Vantagem:** Simplicidade — uma única chamada, uma única integração
- **Desvantagem:** Custo ~3x maior por mensagem processada (GPT-4o-mini para classificação simples é desperdício); latência maior em todas as mensagens incluindo as que não requerem Function Calling
- **Descartada** por custo operacional desproporcional

### 2. Modelo único (GPT-3.5 para tudo)
- **Vantagem:** Menor custo possível
- **Desvantagem:** GPT-3.5 tem performance inferior em Function Calling com múltiplos parâmetros e datas em linguagem natural; erros de extracção de parâmetros resultariam em agendamentos incorrectos
- **Descartada** por insuficiência para Function Calling complexo

### 3. Modelo open-source self-hosted (Ollama + LLaMA)
- **Vantagem:** Custo zero por query; sem dependência de vendor; dados não saem da infraestrutura
- **Desvantagem:** Requer GPU ou servidor dedicado (inviável no Render free tier); qualidade de Function Calling em modelos open-source menores é inferior; latência maior em hardware commodity
- **Descartada** por inviabilidade de infraestrutura na fase actual; identificada como opção futura de longo prazo

---

## Consequências

### Positivas
- **Custo optimizado:** Apenas mensagens que requerem acção acionam o modelo mais caro; conversa livre e classificações simples ficam no Tier 1
- **Precisão na extracção:** GPT-4o-mini com Function Calling extrai datas, horas e nomes com alta fidelidade do português coloquial
- **Contexto persistido:** `Conversa.js` mantém histórico de interacção para o modelo entender referências anteriores ("esse horário que falei")
- **Extensibilidade:** Adicionar novas funções ao Tier 2 não afecta a lógica de classificação do Tier 1

### Negativas / Trade-offs
- **Duas chamadas de API por mensagem:** Latência combinada de ~1-4s por mensagem processada (Tier 1 ~0.5s + Tier 2 ~1-3s); processamento síncrono pode causar timeout no webhook Z-API
- **Dependência total da OpenAI:** Sem fallback documentado se a API estiver indisponível — mensagens do WhatsApp não são processadas durante outages da OpenAI
- **Custo escala com volume:** Cada mensagem WhatsApp recebida resulta em pelo menos uma chamada de API paga — sem volume cap documentado; **mitigação necessária:** rate limiting por tenant no endpoint de webhook
- **Vendor lock-in:** Migração para outro provider (Anthropic, Gemini, Mistral) requereria reescrever schemas de Function Calling

### Risco operacional crítico
> **Sem fallback para falhas da OpenAI.** Se a API estiver indisponível, o chatbot falha silenciosamente — o cliente não recebe resposta. A mitigação imediata é implementar um fallback estático: detectar falha da OpenAI e responder com mensagem padrão ("Desculpe, o assistente está temporariamente indisponível. Por favor contacte directamente pelo telefone X").

---

## Links e Referências

- **Integração inicial:** 2025-06-29
- **Arquitectura multi-agente v1.1:** 2026-02-21
- **Commits relacionados:** ~10 commits ao longo de 8 meses
- **Ficheiros chave:**
  - `src/utils/openaiHelper.js` — Helper de integração com OpenAI
  - `src/controllers/agenteController.js` — Lógica de roteamento e delegação
  - `src/models/Conversa.js` — Histórico de conversas para contexto
- **ADRs relacionados:**
  - [ADR-006: Z-API WhatsApp Integration](./ADR-006-z-api-whatsapp-integration.md)
