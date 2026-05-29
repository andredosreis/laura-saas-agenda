# Marcai — Modelo de Negócio e Estratégia de Produto

**Estado:** Draft de trabalho
**Data:** 2026-05-29
**Autor:** André dos Reis
**Âmbito:** Posicionamento, mercado, pricing, diferenciais, go-to-market. Documento vivo — actualizar à medida que se valida com dados reais.

> Documento de estratégia (não é ADR). As decisões de arquitectura que daqui decorrem ficam em ADRs próprias (ver §9).

---

## 1. Posicionamento (a categoria)

> **O Marcai não é "software de marcações". É a IA que transforma investimento em anúncios e contactos em marcações reais — para qualquer negócio de agendamento.**

O mercado de booking puro está comoditizado e empurrado para o grátis (Fresha, Noona, EasyWeek monetizam por pagamentos/marketplace). Competir aí é guerra de preço perdida. O diferencial do Marcai é a **IA conversacional em WhatsApp que qualifica, converte e marca sozinha** — algo que os incumbentes não têm nativamente.

Quando se vende, **não se vende software — vende-se resultado**: *"investe X em anúncios → a IA converte → o teu custo por marcação é Y"*. Comparação de valor: uma rececionista humana custa €2.500-4.000/mês; a IA responde em <5 segundos, 24/7.

---

## 2. Mercado-alvo (multi-vertical)

Qualquer negócio **baseado em agendamento + lead-driven + relação por WhatsApp**. Tecnicamente já habilitado: o agente é configurável por tenant (prompt + `servicos.md`), adapta-se a qualquer vertical sem mexer em código.

**Focar primeiro (2-3 verticais), depois expandir:**
- ⭐ Estética / medicina estética (ticket alto, já vivem de anúncios)
- ⭐ Clínicas de saúde: dentista, fisioterapia, psicologia, nutrição, dermatologia
- Depois: veterinários, studios (pilates/personal), barbearias, consultas profissionais

> **Guard-rail:** não atacar todos os verticais ao mesmo tempo — dilui o foco. Dominar estética + clínicas primeiro.

⚠️ Clínicas de saúde lidam com **dados clínicos sensíveis** → cuidado redobrado com GDPR (região UE obrigatória).

---

## 3. O loop de tráfego pago (o go-to-market diferenciador)

```
Anúncio (Click-to-WhatsApp)  →  lead cai no WhatsApp
      →  IA responde <5s, qualifica, converte, marca  →  cliente marcado
```

Dados que sustentam (2026):
- Responder em **<5 min → 100x** mais probabilidade de converter que aos 30 min
- **<1 min** de resposta → ~58% de conversão e +127% de vendas em 3 meses
- Click-to-WhatsApp: **<3 min** do clique à conversa vs 2-4 dias no funil tradicional; **3-5x** mais conversão que clique-para-site
- **66%** de quem inicia conversa no WhatsApp acaba por comprar
- Conversas de serviço **GRÁTIS** desde Nov/2024 (utilizador inicia, janela 72h) → qualificar custa €0 em taxas WhatsApp; só se pagam tokens

O assassino do tráfego pago é a **velocidade de resposta** — nenhum humano responde em 5 segundos às 23h. A IA do Marcai responde. **É isto que faz o tráfego pago dar lucro.**

Camadas de "IA + tráfego pago":
1. IA que **converte** os leads dos anúncios — **o core, já existe.**
2. IA que **cria/gere** as campanhas — upsell/serviço futuro, outra competência.

---

## 4. Diferenciais reais (os moats)

1. **🎯 "A IA que persegue e fecha leads"** — qualifica, dá score, avança o funil, converte. Os outros param em "marcar". O mercado diz que as plataformas tradicionais não resolvem o drop-off de leads "porque está fora do modelo de negócio delas". O do Marcai **é** esse.
2. **📱 WhatsApp-nativo + Português** — a categoria "AI receptionist" é toda por **voz, em inglês, focada nos EUA**. O salão/clínica PT vive no WhatsApp.
3. **🤝 "IA + você"** — a IA trata dos 80% repetitivos; o humano assume os 20% de alto valor (handoff via inbox de Conversas). Mata a objecção "perco o toque humano".
4. **🔄 Self-service do cliente** — reagendar/cancelar/ver pacotes 24/7.

**A construir para cimentar o fosso** (usam dados/infra já existentes):
- **Atribuição Click-to-WhatsApp** (que anúncio gerou cada lead) — fecha o loop de ROI
- **Dashboard de ROI por campanha** (anúncio → lead → qualificado → marcado → receita)
- **Re-engajamento proativo** (IA persegue leads frios, no-shows, clientes inativos)
- **Depósito/sinal na marcação** — reduz no-shows 40-70%
- **Upsell de pacote pela IA** (avulso → pacote)

> **Guard-rail:** o diferencial **não é ter mais features** — é o negócio inteiro (captar → converter → marcar → gerir → receber) num fluxo WhatsApp-first **simples**. Donos querem simplicidade, não 50 dashboards. Não te tornes um GoHighLevel.

---

## 5. A conversão depende do tipo de negócio

O fluxo de conversão **não é único** — é configurável por tenant (via prompt + conhecimento).

- **Laura (estética):** a IA **não dá preços nem fecha pacotes no WhatsApp**. Marca a **avaliação**; a venda fecha-se **presencialmente**; aí o lead vira cliente (gatilho humano).
- **Outro negócio:** pode querer que a IA dê preços, feche pacote e peça sinal pelo WhatsApp.

O produto **não impõe** um fluxo — adapta-se. (Ver `docs/fdd-conversas-inbox.md` §3.)

---

## 6. Concorrência (valores 2026, ver fontes)

**Mercado A — booking comoditizado (sem IA):**
| Produto | Preço/mês | Nota |
|---|---|---|
| Fresha | $19.95 + grátis | monetiza pagamentos + 20% marketplace |
| Booksy | $29.99 + $20/staff | Unlimited $119.99 |
| Noona (PT) | €12 / €17 / €22 + grátis | relatórios já no €17 |
| EasyWeek (PT) | grátis + pagos | lembretes WhatsApp incluídos |

**Mercado B — AI receptionist (o mercado certo do Marcai):**
| Produto | Preço/mês | Canal |
|---|---|---|
| AgentZap | $99 / $249 / $499 | voz |
| CallBird AI | $99 | voz |
| Smith.ai | $200+ | voz |
| Média | $99-249 (range $49-499) | **quase todos por VOZ** |

**Leitura:** o Básico (sem IA) competiria com planos GRÁTIS → inviável. O produto de IA compete no Mercado B ($99-499), onde quase ninguém faz por WhatsApp em português.

---

## 7. Pricing e tiers

**Decisão:** **sem tier Básico.** Competir com o grátis na comodidade não compensa o custo computacional. Entrar já pelo produto de IA.

| | **Pro** ⭐ (entrada) | **Elite** | **Custom** |
|---|---|---|---|
| Preço sugerido | **€99-129** | **€199-299** | negociado |
| Marcações + clientes + lembretes | ✅ | ✅ | ✅ |
| IA WhatsApp (booking) | ✅ | ✅ | ✅ |
| IA conversão de leads | ✅ | ✅ | ✅ |
| Relatórios financeiros | ✅ | ✅ avançado | ✅ |
| Utilizadores / WhatsApp | 3 / 1 | ilimitado / múltiplos | conforme |
| Fair-use IA (conversas/mês) | ~1500 | alto/ilimitado | conforme |

- **Anual = 2 meses grátis** (cashflow + retenção). Trial 7 dias (já no modelo).
- **Proteção de margem:** fair-use de conversas IA por tier; acima → upgrade ou overage. Alinha preço com custo (tokens).

### Custo-de-servir (estimativa — validar com LangSmith)
- **Variável dominante:** OpenAI. Conversa de marcação ≈ €0.03-0.05; salão movimentado ≈ €3-8/mês. Lembretes não usam IA (custo zero). WhatsApp grátis (user-initiated).
- **Fixo (partilhado):** Atlas M10 (~€55, quando sair do free ≈30 tenants) + VPS Contabo (~€8-20) + domínio.

| Nº tenants | Custo/tenant | Margem @ €99 |
|---|---|---|
| 10 | ~€12 | ~88% |
| 30+ | ~€7 | ~93% |

> **Nota Atlas:** o limite real do free/Flex é **~500 collections** (~12/tenant → ~40 tenants máx), não o espaço. Saltar para **M10 dedicado** (não Flex) ao aproximar dos ~30 tenants. Nunca cluster-por-cliente (ver ADR-001).

---

## 8. Objectivos de produto (roadmap de alto nível)

1. **Inbox de Conversas** (handoff IA↔humano) — `docs/fdd-conversas-inbox.md`
2. **Painel super-admin** (gerir tenants, onboarding por vertical) — ADR-024
3. **Atribuição Click-to-WhatsApp + dashboard de ROI** (sustenta o pitch de tráfego pago)
4. **Re-engajamento proativo + depósito/sinal + upsell** (geração de receita)
5. **Consolidação no VPS Contabo** (infra) — ADR-023

---

## 9. Decisões técnicas relacionadas (ADRs)

- **ADR-001** — Database-per-tenant (um cluster, muitos tenants)
- **ADR-023** — Consolidação da infra num VPS único (Contabo)
- **ADR-024** — Painel super-admin multi-tenant
- **ADR-025** — WhatsApp Business API oficial vs Baileys (condiciona o tráfego pago)

---

## Fontes (pesquisa 2026)

- [GlossGenius — custo de software de salão](https://glossgenius.com/blog/how-much-does-salon-booking-software-cost)
- [Fresha — Best Salon Software 2026](https://www.fresha.com/for-business/salon/best-salon-software)
- [Noona — Preços](https://noona.app/hq/pricing)
- [AgentZap — AI Receptionist Pricing 2026](https://agentzap.ai/blog/ai-receptionist-pricing-complete-cost-guide-2025)
- [CloudTalk — AI Receptionists for Salons & Spas 2026](https://www.cloudtalk.io/blog/best-ai-receptionist-for-salons-spas/)
- [Zoca — Salon Booking Funnel drop-offs](https://zoca.com/post/salon-booking-funnel-drop-offs)
- [Zenoti — What salon clients want 2026 (survey)](https://www.zenoti.com/thecheckin/ai-receptionist-survey-results)
- [Sbl.so — Meta Click-to-WhatsApp Ads & AI Lead Qualification](https://sbl.so/blog/click-to-whatsapp-ads/)
- [EchoLeads — WhatsApp conversion benchmarks 2026](https://echoleads.ai/blog/whatsapp-conversion-rates-above-45-60-benchmark-2026)
- [Bedifly — Meta Ads + WhatsApp Automation 2026](https://bedifly.com/unlock-lead-generation-with-meta-ads-and-whatsapp-automation-in-2026/)
- [Respond.io — Click-to-WhatsApp Ads guide](https://respond.io/blog/click-to-whatsapp-ads)
