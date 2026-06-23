# ADR-025: WhatsApp Business API Oficial vs Baileys para Tráfego Pago

**Status:** Accepted — Decisão tomada (híbrido por provider); implementação diferida até o tráfego pago arrancar
**Data:** 2026-05-29
**Módulo:** IA / MESSAGING / INFRA
**Autor:** André dos Reis
**Score de Impacto:** 150 (Alto)

---

## Contexto

O Marcai integra WhatsApp via **Evolution API**, que por baixo usa **Baileys** — uma biblioteca **não-oficial** que faz engenharia reversa do WhatsApp Web (ver ADR-014, ADR-016, ADR-021). Funciona bem para o uso actual (clientes/leads orgânicos) e tem custo zero por mensagem.

A estratégia de negócio (ver `docs/business-model.md`) aposta em **tráfego pago via Click-to-WhatsApp ads** (Meta): anúncios que abrem uma conversa de WhatsApp, onde a IA do Marcai qualifica e converte. Este é o go-to-market diferenciador.

Esta ambição colide com limitações do Baileys:

1. **Risco de banimento.** Dirigir volume de anúncios para um número Baileys (não-oficial) aumenta materialmente o risco de bloqueio pela Meta. Um número banido = paragem total de comunicação desse tenant. Inaceitável quando há dinheiro de anúncios a correr.

2. **Atribuição Click-to-WhatsApp (`ctwa_clid`).** O identificador que liga cada lead ao anúncio/campanha de origem é entregue de forma fiável pela **API oficial (WhatsApp Cloud API)**, através do payload de referral da mensagem. No Baileys essa atribuição não é garantida — e sem ela **não se consegue fechar o loop de ROI** (anúncio → lead → marcado → receita), que é o pilar do pitch comercial.

3. **Conformidade e escala.** A API oficial dá número verificado (green tick possível), templates aprovados para mensagens iniciadas pelo negócio, e limites de envio que escalam com a reputação. O Baileys vive num limbo de ToS.

**Nota de custo (Nov/2024+):** as conversas de **serviço iniciadas pelo utilizador** (o caso do Click-to-WhatsApp) são **gratuitas** na API oficial, com janela de 72h. Ou seja, o modelo de negócio não incorre em taxas de WhatsApp por conversa — o custo variável continua a ser os tokens de IA.

---

## Decisão

**Adoptar a WhatsApp Business API oficial (Meta Cloud API) para os tenants que correm tráfego pago**, mantendo a possibilidade de Evolution/Baileys para tenants orgânicos — um modelo **híbrido por provider, atrás da abstração de envio já existente**.

- A integração de WhatsApp já está abstraída (`evolutionClient` / `send_message`; o `Tenant.whatsapp.provider` é um enum). Adicionar `cloud_api` como provider mantém o resto do sistema inalterado.
- Para Cloud API, usar preferencialmente um **BSP (Business Solution Provider) com presença/dados na UE** (ex: 360dialog) para simplificar verificação Meta, templates e conformidade GDPR.
- O ramo de routing, os agentes (lead/cliente) e o pipeline **não mudam** — só muda o transporte de entrada/saída e o enriquecimento com `ctwa_clid`.

A decisão de migrar **todos** os tenants para Cloud API (vs manter híbrido permanente) fica em aberto — reavaliar quando a operação de tráfego pago estabilizar.

---

## Alternativas Consideradas

### 1. Manter só Baileys (Evolution)
- **Vantagem:** zero mudança, custo zero por mensagem
- **Desvantagem:** risco de banimento com volume de anúncios; sem atribuição `ctwa_clid` → sem ROI fechável; não-conforme com ToS
- **Descartada** para tráfego pago — é precisamente o que esta ADR resolve

### 2. Migrar TUDO para Cloud API imediatamente
- **Vantagem:** uma só integração; conformidade total; atribuição em todos
- **Desvantagem:** custo de migração para tenants que não fazem anúncios e estão bem no Baileys; verificação Meta + templates para todos de uma vez
- **Não adoptada agora** — preferível híbrido e migrar por necessidade (quem corre anúncios primeiro)

### 3. Cloud API directamente na Meta (sem BSP)
- **Vantagem:** sem intermediário, custo potencialmente menor
- **Desvantagem:** mais fricção de setup (verificação, gestão de templates, webhooks), menos suporte; questões de residência de dados/GDPR a tratar por conta própria
- **Considerada** — viável, mas um BSP UE acelera o arranque; reavaliar à escala

### 4. Híbrido permanente (Baileys orgânico + Cloud API para anúncios)
- **Vantagem:** custo otimizado por tenant; migração só onde é preciso
- **Desvantagem:** manter duas integrações de WhatsApp (mais complexidade/manutenção)
- **Adoptada como ponto de partida** — a abstração de provider torna o custo de manter ambos aceitável

---

## Consequências

### Positivas
- **Tráfego pago viável e seguro** — número oficial reduz risco de banimento sob volume de anúncios
- **ROI fechável** — `ctwa_clid` permite atribuir cada lead à campanha → dashboard anúncio→receita (pilar comercial)
- **Conformidade** — número verificado, templates aprovados, dentro do ToS
- **Sem taxa de WhatsApp** no fluxo principal (conversas user-initiated são grátis); custo variável continua a ser só tokens
- **Mudança contida** — graças à abstração de provider, agentes/routing/pipeline não mudam

### Negativas / Trade-offs
- **Setup mais pesado** — verificação Meta Business, registo de número, aprovação de templates (para mensagens iniciadas pelo negócio, ex: re-engajamento proativo)
- **Duas integrações** a manter no modelo híbrido (Baileys + Cloud API)
- **Templates para outbound proativo** — re-engajamento de leads frios/no-shows (negócio inicia) exige templates aprovados e pode ter custo de conversa de marketing/utility
- **Dependência de BSP** (se escolhido) — custo e lock-in parcial
- **Migração de número** — um tenant que já usa um número no Baileys e queira passá-lo a oficial tem um processo de migração de número (cuidado para não perder histórico/sessão)

### Pontos de atenção
> - **Re-engajamento proativo** (negócio inicia a conversa) cai fora da janela grátis de 72h → exige template aprovado e pode ter custo por conversa. Modelar isto no fair-use/pricing.
> - **GDPR:** dados pessoais de saúde (clínicas) + atribuição de anúncios → garantir BSP/Meta com tratamento UE e DPA assinado.

---

## Plano (quando o tráfego pago avançar)

1. **Provider abstraction** — adicionar `cloud_api` ao `Tenant.whatsapp.provider`; implementar adaptador de envio/recepção atrás da interface existente.
2. **Onboarding Cloud API** — escolher BSP UE (ex: 360dialog), verificar Meta Business, registar número, aprovar templates base.
3. **Webhook + atribuição** — receber `ctwa_clid`/referral no inbound; persistir origem (campanha/anúncio) na `Conversa`/`Lead`.
4. **Piloto** — um tenant com anúncios reais; medir entregabilidade, atribuição e custo.
5. **Dashboard de ROI** — anúncio → lead → qualificado → marcado → receita (liga ao `business-model.md` §4).
6. **Decisão híbrido vs total** — reavaliar após piloto.

---

## Links e Referências

- **Estratégia que motiva esta ADR:** `docs/business-model.md` (§3 loop de tráfego pago, §4 atribuição)
- **ADRs relacionados:**
  - [ADR-014: Evolution API WhatsApp Migration](./ADR-014-evolution-api-whatsapp-migration.md)
  - [ADR-016: Evolution API v2 Upgrade](./ADR-016-evolution-api-v2-upgrade.md)
  - [ADR-021: Evolution Instance per Tenant](./ADR-021-evolution-instance-per-tenant.md)
  - [ADR-023: Consolidação no VPS Contabo](./ADR-023-consolidacao-vps-contabo.md)
- **Conceitos:** Meta Click-to-WhatsApp Ads, `ctwa_clid` (referral attribution), WhatsApp Cloud API, conversas de serviço gratuitas (Nov/2024+)
