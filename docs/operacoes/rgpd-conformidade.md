# Marcai — Plano de Conformidade RGPD

**Estado:** Draft de trabalho — plano operacional
**Data:** 2026-06-25 (act. 2026-07-19)
**Autor:** André dos Reis
**Âmbito:** Como o Marcai cumpre o RGPD enquanto SaaS multi-tenant para clínicas/estética em PT/UE. Plano de engenharia + organização. Documento vivo.
**Relacionado:** ADR-031 (ficha+consentimento self-service), ADR-024 (super-admin), ADR-025 (WhatsApp oficial vs Baileys), ADR-026 (arquivamento R2), `docs/negocio/oferta-consultoria.md`, CLAUDE.md (isolamento multi-tenant), **`rgpd-matriz-juridica.md` (matriz por finalidade + questões abertas Q1–Q14)**, **`rgpd-perguntas-jurista.md` (pacote apresentável para enviar ao jurista)**

> ⚠️ **Não é aconselhamento jurídico.** A redacção do DPA, política de privacidade e DPIA deve ser **revista por um jurista de protecção de dados em PT** (CNPD, dados de saúde). Este documento é o plano técnico/operacional que sustenta essa redacção.

---

## 1. O modelo legal (a base de tudo)

No multi-tenant, os papéis são:

| Papel | Quem | Responsabilidade |
|---|---|---|
| **Responsável (controller)** | **A clínica** (cada tenant) | Define finalidades, obtém consentimento onde necessário, responde a pedidos dos titulares |
| **Processador (processor)** | **O Marcai** | Trata dados **só por instrução** da clínica, com segurança, sub-processadores controlados, e **dá ferramentas** para a clínica cumprir |
| **Sub-processadores** | Atlas, Contabo, OpenAI, Google, etc. | Tratam dados por instrução do Marcai |

➡️ **Consequência nº1:** a entrega RGPD mais importante para vender a clínicas é um **DPA (Acordo de Tratamento de Dados) que a clínica assina** — não fluxos de consentimento do utilizador final. É assim que a Fresha/Freshworks fazem.

---

## 2. Base legal (corrige um mito comum)

Rigor necessário *(corrigido 2026-07-19)*: a base do **Art. 6** e a condição do **Art. 9** avaliam-se **separadamente, por finalidade** — matriz completa em `rgpd-matriz-juridica.md`. Para marcações/ficha base (dados comuns), a base é o **contrato (Art. 6(1)(b))** — sem consentimento. Para **dados de saúde**, o Art. 9(2)(h) (prestação de cuidados) só cobre tratamento por/sob responsabilidade de **profissional sujeito a sigilo** (Art. 9(3)) — ⚠️ numa clínica de estética isso é contestável (matriz Q1), pelo que a via escolhida para a anamnese é o **consentimento explícito (Art. 9(2)(a))**. **Consentimento** é obrigatório para:
- **Marketing** (newsletters, promoções).
- **Canal WhatsApp** para mensagens iniciadas pelo negócio.
- **Anamnese numa clínica de estética** — aqui a base mais limpa e defensável é mesmo **consentimento explícito (Art. 9(2)(a))**, capturado no formulário self-service (ver ADR-031).

| Tratamento | Base legal | Consentimento? |
|---|---|---|
| Marcações, ficha base, lembretes de serviço | Contrato | Não |
| Anamnese / dados de saúde (estética) | Consentimento explícito (Art. 9(2)(a)) | **Sim** |
| Marketing / campanhas | Consentimento (Art. 6(1)(a)) | **Sim** |
| Mensagens WhatsApp iniciadas pelo negócio | Consentimento / opt-in | **Sim** |

---

## 3. Sub-processadores (lista a publicar)

André confirmou: **toda a infra está na UE**; só a IA usa fornecedores fora, mas com entidade UE e salvaguardas.

| Sub-processador | Finalidade | Localização | Salvaguarda |
|---|---|---|---|
| **MongoDB Atlas** | Base de dados (DB-per-tenant) | **Região UE** | DPA Atlas; obrigatório UE (CLAUDE.md) |
| **Contabo (VPS)** | Backend + ia-service + Evolution + Redis | **UE (Alemanha)** | DPA Contabo |
| **Cloudflare R2** | Backup off-site + arquivo de mensagens (ADR-026/030) | UE (config) | DPA Cloudflare; cifra em repouso |
| **Vercel** | Hosting do frontend (PWA) | EUA (empresa) / edge | DPA + SCCs; trata sobretudo estático |
| **OpenAI** | IA conversacional | EUA | DPA + **SCCs** + opção retenção-zero; **minimizar** dados enviados |
| **Google (Gemini)** | IA + transcrição de áudio | **Google Ireland (UE)** | DPA + SCCs; residência de dados UE |
| **LangSmith** | Tracing/avaliações da IA | **Endpoint UE** | DPA; região EU obrigatória |
| **Sentry** | Observabilidade/erros | EUA/UE (região EU disponível) | DPA + SCCs; usar região EU |
| **Resend** | Emails transacionais (verificação, reset, alertas) | EUA | DPA + SCCs; ⚠️ avaliar alternativa UE (matriz Q10). Já configurado no projecto (`RESEND_API_KEY`) |
| **Meta / WhatsApp** | Canal de mensagens | UE/EUA | ⚠️ via Baileys (não-oficial) — ver §7 |

**Acção:** publicar esta lista (página/anexo do DPA) + **30 dias de pré-aviso** para novos sub-processadores + direito de objecção da clínica (padrão Fresha).
**A confirmar:** garantir DPA+SCCs do Resend (ou migrar para fornecedor UE — matriz Q10); confirmar minimização do que vai para OpenAI.

---

## 4. Direitos dos titulares (e como o Marcai os suporta)

A clínica (controller) responde aos pedidos; o Marcai (processor) **dá as ferramentas** (como a Fresha). Prazo legal: **1 mês**.

| Direito | Suporte no Marcai |
|---|---|
| **Acesso (Art. 15) / Portabilidade (Art. 20)** | Direitos **distintos** (R9): `GET /gdpr/clientes/:id/export?tipo=acesso\|portabilidade` — acesso = universo completo com **allowlists** por coleção (inclui `Lead` e `NoticeReceipt`; nunca dumps crus); portabilidade = fatia estreita fornecida pelo titular. Cada export regista um **`PedidoTitular`** (audit + prazo Art. 12(3)) |
| **Apagamento / Esquecimento** | `POST /gdpr/clientes/:id/apagar` → abre `PedidoTitular (apagamento)` + retirada `dados_saude` (fecha o gate R4) → marca `pendingDeletion` → job BullMQ **pseudonimiza** após período de graça e conclui o pedido. ⚠️ Terminologia: é pseudonimização (EDPB), não anonimização — redacção do DPA em conformidade (matriz Q11) |
| **Rectificação** | Edição da ficha no painel (já existe) |
| **Retirar consentimento** | Registo `ConsentLog (withdrawn)` → **cessa o uso** (R4: `/clinico` deixa de servir a anamnese; escrita bloqueada). Os dados ficam armazenados até novo consentimento ou pedido de apagamento — retirar ≠ apagar (F07 é acção separada) |
| **Oposição a marketing** | Toggle opt-out por cliente |

⚠️ **Excepção fiscal:** faturas/transações têm **retenção legal obrigatória** (lei fiscal PT). Apagamento = **anonimizar a PII** (nome/telefone/email/anamnese) mas **manter o registo financeiro** de-identificado. Nunca apagar dados fiscais por pedido de esquecimento.

**Âmbito do apagamento (RECONCILIATION R5, 2026-07-07; alargado por R9, 2026-07-20):** o apagamento cobre o mesmo universo que o export — além do `Cliente`, apaga `Conversa`/`Mensagem` (conteúdo WhatsApp é PII e pode conter dados de saúde), anonimiza `Lead` com o mesmo telefone, limpa o texto livre do `HistoricoAtendimento` e (R9) `Agendamento.observacoes` + `leadData` embutido, `Transacao.observacoes` e `Pagamento.observacoes` — mantendo valores, datas, referências e `Transacao.descricao` (fiscal; matriz Q8). Fora do alcance do serviço, tratado operacionalmente:
- **Arquivo R2 de mensagens (ADR-026):** os objectos arquivados da conversa do titular apagado devem ser eliminados no sweep de arquivo — incluir no runbook do job de arquivamento.
- **Backups cifrados (R2, ADR-030):** não são reescritos por pedido de apagamento (prática aceite); os dados apagados desaparecem por **expiração da rotação de backups**. ➡️ **Acção:** documentar a janela de retenção de backups (alvo: ≤ 35 dias) na política de privacidade/DPA — é essa janela que torna a posição defensável.

---

## 5. Consentimento (onde é preciso)

- Capturado no **formulário self-service** (ADR-031): anamnese + consentimento no mesmo acto, checkbox **não pré-marcado**, granular (saúde ≠ marketing), ligado à **versão** da política.
- Registado em **`ConsentLog` v2** (append-only, RECONCILIATION R6/R7, desenhado 2026-07-20): `versao` + `textoHash` (hash do texto efectivamente apresentado) sempre carimbados pelo servidor; marcador explícito `actor` titular-vs-funcionário (declarações assistidas exigem `evidencia`); entrega do aviso registada à parte em **`NoticeReceipt`**. Concessão de comunicações só por acção do titular (R8 — formulário F04) ou declaração assistida com evidência; pedidos dos titulares terão registo próprio (`PedidoTitular`, passo 4). Ver matriz jurídica §3.
- **Revogável** a qualquer momento (a clínica/ o titular).

---

## 6. Retenção e minimização

- **Política de retenção configurável por tenant** (default: **24 meses** de inactividade → anonimizar). ⚠️ O default de 24 meses não tem norma sectorial identificada — fundamentar/ajustar com o jurista (matriz Q2). Nota terminológica: o que o F07 executa é **pseudonimização** (EDPB), não anonimização — a redacção do DPA tem de reflectir isso (matriz Q11).
- **Job BullMQ semanal** (já temos Redis+BullMQ): anonimiza clientes inactivos > período, mantendo estatística agregada e dados fiscais.
- **Minimização:** enviar à IA (OpenAI/Google) o mínimo necessário; nunca anamnese completa sem necessidade.

---

## 7. WhatsApp (ponto crítico)

- **Opt-in** obrigatório para mensagens iniciadas pelo negócio (lembretes/marketing); ter o número não chega. Registar em `ConsentLog (whatsapp_optin)`.
- **Política Meta (anunciada 15-Out-2025, efectiva Jan-2026):** assistentes de IA **de uso geral** de terceiros banidos da WhatsApp Business API; bots **task-specific** (marcação/suporte) permitidos. **Actualização Jun-2026:** a Comissão Europeia impôs **medidas provisórias** ([IP/26/1276](https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1276)) que obrigam a Meta a repor o acesso dos assistentes de uso geral nos termos pré-15-Out-2025 enquanto decorre a investigação antitrust. Em **qualquer** dos regimes, a IA do Marcai é task-specific → não afectada. *(Nota: matéria de concorrência/ToS da plataforma, não de RGPD — mantida aqui só como contexto operacional do canal.)*
- ⚠️ **Gap:** o Marcai usa **Evolution/Baileys (não-oficial)**. Para um caminho RGPD totalmente defensável, a **API oficial via BSP (UE)** é preferível — liga à **ADR-025**. Registar como risco assumido entretanto.

---

## 8. Segurança (medidas técnicas e organizativas)

- Isolamento multi-tenant (DB-per-tenant) — inviolável (CLAUDE.md).
- Acesso **need-to-know** a dados de saúde (ADR-031) + **audit de leitura**.
- JWT (access 1h + refresh 7d), rate limiting, helmet, CORS restrito (já existe).
- Cifra em repouso (Atlas) + cifra em trânsito (TLS).
- Backups cifrados off-site (R2, ADR-030).
- **Notificação de breach** *(corrigido 2026-07-19)*: o Marcai (processor) avisa a clínica **sem demora injustificada** após ter conhecimento (Art. 33(2) — sem prazo fixo). As **72h** são o prazo da **clínica** (controller) para a CNPD (Art. 33(1)) — o aviso do Marcai tem de chegar a tempo de a clínica o cumprir; meta operacional interna: primeiras horas, nunca um "SLA de 72h".

---

## 9. DPIA (Avaliação de Impacto)

**IA + dados de saúde + profiling = alto risco → DPIA recomendada/obrigatória.** Documentar: finalidades, fluxos de dados (incl. OpenAI/Google), riscos, medidas de mitigação (minimização, need-to-know, anonimização). Fase 4 da ADR-031.

---

## 10. Arquitectura técnica (stack real do Marcai)

> Corrige o plano genérico (que assumia SQLAlchemy/Celery): aqui é **Node/Express + Mongoose + BullMQ**.

- **Modelo `ConsentLog`** (Mongoose, tenant DB via `registry.js`) — append-only.
- **Módulo `src/modules/gdpr/`** (ADR-011): `gdprController` + `gdprRoutes` + `gdprSchemas` (Zod), montado em `app.js` (`/gdpr`), dual-mount `/api` + `/api/v1`. Tudo tenant-scoped `{ tenantId }`, contrato `{ success, data/error }`.
  - `POST /gdpr/consent` — regista consentimento/retirada (v2: `actor`/`evidencia`/`textoHash` — R7).
  - `GET /gdpr/clientes/:id/export?tipo=acesso|portabilidade` — acesso/portabilidade com allowlists (R9).
  - `POST /gdpr/clientes/:id/apagar` — abre `PedidoTitular` + marca para pseudonimização.
- **Modelos:** `ConsentLog` v2, `NoticeReceipt`, `PedidoTitular`, `FichaToken`, `AcessoClinicoLog`.
- **Campos no `Cliente`:** `anonimizado`, `pendingDeletion`, `deletionRequestedAt`, `notaOperacional` (R10 — nota operacional fora do alcance da IA).
- **Job BullMQ** de retenção/anonimização (padrão dos jobs existentes).

---

## 11. Checklist MVP — antes de onboard de clínicas pagantes

**Legal/organizativo (maior desbloqueio, menos código):**
- [ ] **DPA** (a clínica assina) — redacção revista por jurista.
- [ ] **Política de privacidade (PT)** + versionamento.
- [ ] **Lista de sub-processadores** publicada (§3) + processo de pré-aviso.
- [ ] Confirmar **residência UE** de todos + identificar fornecedor de email + SCCs onde aplicável.

**Técnico (Fase 0–1 da ADR-031):**
- [ ] `ConsentLog` + módulo `gdpr/` + registo de consentimento.
- [ ] **Opt-in WhatsApp** capturado e registado.
- [ ] **Export + apagar** (mesmo semi-manual pelo painel ao início).
- [ ] Acesso **need-to-know** + ficha clínica gated + badge + estado do consentimento.

**Fase 2+ (depois das primeiras vendas):**
- [ ] Formulário self-service tokenizado (o diferencial).
- [ ] Job de retenção/anonimização automático (BullMQ).
- [ ] **DPIA** documentada.
- [ ] Avaliar migração para **WhatsApp API oficial** (ADR-025).

---

## 12. Fontes

- [Fresha — Data Protection Addendum](https://terms.fresha.com/data-protection)
- [Booksy — GDPR para salões](https://biz.booksy.com/en-gb/blog/ensuring-your-salon-is-gdpr-compliant-a-step-by-step-guide)
- [CNPD — Consentimento](https://www.cnpd.pt/organizacoes/areas-tematicas/consentimento/)
- [WhatsApp Business API & GDPR 2026](https://qualimero.com/en/blog/whatsapp-data-protection)
- [GDPR Art. 17 — Direito ao apagamento](https://gdpr-info.eu/art-17-gdpr/)
- [CNPD — Violação de dados (breach)](https://www.cnpd.pt/organizacoes/outras-obrigacoes/violacao-de-dados-ou-data-breach/)
- [EDPB — Anonymisation & pseudonymisation](https://www.edpb.europa.eu/topics/ai-and-technology/anonymisationpseudonymisation_en) (relevante para F07 — pseudonimização continua dado pessoal)
- [Comissão Europeia — medidas provisórias Meta/WhatsApp, Jun-2026 (IP/26/1276)](https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1276)
- [CIVA Art. 52.º — prazo de conservação (10 anos)](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/ra/pages/ivara52-0808.aspx)
