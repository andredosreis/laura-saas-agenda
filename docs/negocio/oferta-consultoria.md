# Marcai — Oferta de Consultoria (Done-For-You Gerido)

**Estado:** Draft de venda — base para go-to-market
**Data:** 2026-06-24
**Autor:** André dos Reis
**Âmbito:** Como o Marcai é vendido e entregue. Complementa `docs/business-model.md` (estratégia/mercado). Documento vivo — actualizar com dados de vendas reais.

> **Decisão central:** o Marcai **não se vende como "planos de software" self-serve.** Cada cliente exige configuração à medida (prompt, serviços, fluxo de conversão). Vende-se como **serviço gerido (done-for-you):** nós montamos e cuidamos. Os "planos" do `business-model.md` §7 são a versão SaaS-pura que não corresponde a como o produto realmente funciona (ver §5 desse doc).

---

## 1. Posicionamento (a frase que se vende)

> **"A tua recepcionista de IA no WhatsApp — em português, montada à medida do teu negócio e optimizada por nós todos os meses."**

- **Não é** "software de marcações" (Fresha/Noona dão a ferramenta e o dono vira-se).
- **Não é** "AI receptionist" (voz, inglês, EUA, self-serve).
- **É** um serviço gerido: o cliente compra **resultado e tranquilidade**, não uma app para configurar.

Quando se vende, vende-se **resultado**, não software: *"a IA responde em <5 segundos, 24/7, converte os contactos em marcações reais."* Comparação de valor: uma rececionista humana custa €2.500–4.000/mês.

---

## 2. Estrutura de preço

| | **Essencial** (estética/solo) | **Pro** (clínica/equipa) | **Custom** |
|---|---|---|---|
| **Setup (one-time)** | **€490** | **€890** | negociado |
| **Mensalidade gerida** | **€149/mês** | **€299/mês** | negociado |
| **Tráfego (add-on)** | — | — | negociado no diagnóstico |

**O que o setup inclui:** diagnóstico + configuração da IA à medida (prompt, `servicos.md`, fluxo de conversão do negócio) + integração WhatsApp + treino da equipa.
**O que a mensalidade inclui:** IA a correr 24/7, **optimização mensal com as conversas reais**, inbox de handoff (IA↔humano), lembretes e relatório de resultados.

- **Anual = 2 meses grátis** (cashflow + retenção). Trial 7 dias.
- **O setup não é só receita** — paga o teu trabalho real de configurar cada cliente e filtra quem não está comprometido.
- **Proteção de margem:** fair-use de conversas IA por tier (custo dominante = OpenAI). Acima → upgrade ou overage.

Referência de mercado (2026): agências de IA cobram €1.500–5.000 de setup + €500–5.000/mês de retainer; AI receptionists cobram €500–3.500 de onboarding "white-glove". O Marcai está acessível **e** com margem alta (custo/cliente ~€7–12).

---

## 3. Limites de equipa por pacote (o cliente)

Alavanca de preço — mais utilizadores/profissionais = pacote maior. Alinhado com `tenant.limites` no backend.

| | **Essencial** | **Pro** | **Custom** |
|---|---|---|---|
| Utilizadores (login no painel) | até **3** | até **15** | ilimitado |
| Profissionais/agendas | 1–2 | múltiplos | conforme |
| Números WhatsApp | 1 | 1 (múltiplos sob pedido) | múltiplos |
| Conversas IA/mês (fair-use) | ~1.500 | alto | negociado |

> "Utilizadores" = quem entra no painel (recepção, terapeutas). "Fair-use de conversas" protege a margem.

---

## 4. Capacidade operacional (a TUA equipa, para entregar)

Done-for-you consome trabalho, não só servidores.

- **Setup:** ~3–5 dias úteis (espalhados) por cliente.
- **Optimização mensal:** ~1–2 h/cliente.
- ➡️ **Solo, aguentas ~15–25 clientes geridos** antes de a qualidade cair.
- **1.º contratado (~10–12 clientes):** "AI onboarding/operações" — configura tenants e afina prompts. Vendas ficam contigo mais tempo.

Por isto o setup fee + retainer têm de pagar o teu tempo, não só os tokens.

---

## 5. O processo de consultoria (repetível, 4 fases)

1. **Diagnóstico (30–45 min)** — onde perde marcações, tem ads ou não, ticket, serviços, horários. → Define o pacote **e** a fonte de tráfego.
2. **Configuração (3–5 dias)** — criar tenant no super admin, afinar prompt + `servicos.md` + fluxo de conversão, ligar WhatsApp.
3. **Go-live + treino** — equipa aprende o inbox/handoff; a IA começa a responder.
4. **Optimização mensal** — rever conversas reais, afinar a IA, entregar relatório.

> **Fonte de tráfego é decisão de diagnóstico, não de produto.** Trabalha-se com qualquer cenário, conforme o cliente:
> - Cliente já corre anúncios → a IA converte esses leads.
> - Sem ads → a IA trabalha a base existente (reagendamentos, no-shows, reactivação).
> - Precisa de ads → add-on de gestão de tráfego (próprio ou parceiro).

A simulação de "colocar um cliente" no super admin = ensaiar as fases 2–3 (criar tenant, definir plano/limites, criar admin user).

---

## 6. Diferencial (os 4 pontos de venda)

1. **WhatsApp + português** — eles vivem no WhatsApp; a concorrência é voz/inglês/EUA.
2. **Montada à medida e gerida** — não é um bot genérico abandonado; é consultoria contínua.
3. **"IA + você"** — handoff humano nos casos de alto valor. Não se perde o toque humano.
4. **Melhora todos os meses** — afinada com as conversas reais. Um software não faz isto; um serviço faz.

**Prova social:** a Laura (estética) é o primeiro case — usar no pitch.

---

## 7. Mapa de concorrentes (3 frentes)

**Frente A — Booking comoditizado (ferramenta, sem IA de conversão):**
Fresha (#1 mundial, grátis + monetiza pagamentos), Booksy (barbearia), Treatwell, Noona, SimplyBook.me, Vagaro, Mindbody, Phorest. 🇵🇹 **Zappy** (estética PT, sem comissão) — o concorrente local mais directo.

**Frente B — AI receptionist (voz, inglês, EUA):**
AgentZap, CallBird AI, Smith.ai, MyAIFrontDesk, Dialzara. Quase todos por **voz** — não vivem no WhatsApp nem em português.

**Frente C — IA no WhatsApp PT/BR (concorrentes mais directos):**
SleekFlow, Umbler Talk, Blip, Zenvia, WATI, Huggy, Letalk, Maxbot, ManyChat, Respond.io, Botconversa.
⚠️ **Meta WhatsApp Business AI** — IA nativa, **grátis**, já global/BR (FAQ + catálogo). Maior ameaça de fundo.

**Porque nenhum é o que o Marcai faz:** a Frente C é horizontal/self-serve (vendem plataforma para *tu* construíres o bot); a A não tem IA de conversão real; a B é voz/inglês. **Marcai é o único que junta** vertical (estética/clínicas) + português PT + **done-for-you gerido** + ciclo completo (capta → converte → marca → gere → recebe). Contra a Meta grátis: *"o grátis responde FAQ; nós montamos e gerimos uma recepcionista que converte e marca, à medida do teu negócio."*

---

## 8. Fontes (pesquisa 2026)

- [Fresha — Salão](https://www.fresha.com/for-business/salon)
- [Zappy (PT)](https://zappysoftware.com/en)
- [Noona (PT)](https://noona.app/hq/pt/software-salao-de-beleza)
- [GetApp Portugal — salão](https://www.getapp.pt/directory/212/salon/pricing/free/software)
- [SleekFlow — plataformas IA WhatsApp](https://sleekflow.io/pt-br/blog/plataforma-atendimento-ia-whatsapp)
- [Umbler Talk](https://www.umbler.com/br/talk/agente-ia-whatsapp)
- [Meta WhatsApp Business AI (TechCrunch)](https://techcrunch.com/2026/06/03/metas-ai-agent-for-whatsapp-business-is-now-available-globally/)
- [AI Automation Agency Pricing 2026](https://arsum.com/blog/posts/ai-automation-agency-pricing/)
- [AI Receptionist Cost 2026](https://ai-receptionist.com/blog/ai-receptionist-cost-and-pricing-guide/)
