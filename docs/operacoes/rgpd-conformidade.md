# Marcai — Plano de Conformidade RGPD

**Estado:** Draft de trabalho — plano operacional
**Data:** 2026-06-25
**Autor:** André dos Reis
**Âmbito:** Como o Marcai cumpre o RGPD enquanto SaaS multi-tenant para clínicas/estética em PT/UE. Plano de engenharia + organização. Documento vivo.
**Relacionado:** ADR-031 (ficha+consentimento self-service), ADR-024 (super-admin), ADR-025 (WhatsApp oficial vs Baileys), ADR-026 (arquivamento R2), `docs/negocio/oferta-consultoria.md`, CLAUDE.md (isolamento multi-tenant)

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

A **CNPD** é explícita: tratar **dados de saúde para a prestação do serviço NÃO exige consentimento** (base = contrato / Art. 9(2)(h)). **Consentimento explícito** é obrigatório para:
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
| **Fornecedor de email** | Emails transacionais (verificação, reset) | _a confirmar_ | DPA; preferir UE |
| **Meta / WhatsApp** | Canal de mensagens | UE/EUA | ⚠️ via Baileys (não-oficial) — ver §7 |

**Acção:** publicar esta lista (página/anexo do DPA) + **30 dias de pré-aviso** para novos sub-processadores + direito de objecção da clínica (padrão Fresha).
**A confirmar:** identificar o fornecedor de email real e garantir região/SCCs; confirmar minimização do que vai para OpenAI.

---

## 4. Direitos dos titulares (e como o Marcai os suporta)

A clínica (controller) responde aos pedidos; o Marcai (processor) **dá as ferramentas** (como a Fresha). Prazo legal: **1 mês**.

| Direito | Suporte no Marcai |
|---|---|
| **Acesso / Portabilidade** | Export dos dados do cliente (JSON/CSV) — endpoint `GET /gdpr/clientes/:id/export` |
| **Apagamento / Esquecimento** | `POST /gdpr/clientes/:id/apagar` → marca `pendingDeletion` → job BullMQ anonimiza após período de graça |
| **Rectificação** | Edição da ficha no painel (já existe) |
| **Retirar consentimento** | Registo `ConsentLog (withdrawn)` + despoleta restrição/anonimização |
| **Oposição a marketing** | Toggle opt-out por cliente |

⚠️ **Excepção fiscal:** faturas/transações têm **retenção legal obrigatória** (lei fiscal PT). Apagamento = **anonimizar a PII** (nome/telefone/email/anamnese) mas **manter o registo financeiro** de-identificado. Nunca apagar dados fiscais por pedido de esquecimento.

---

## 5. Consentimento (onde é preciso)

- Capturado no **formulário self-service** (ADR-031): anamnese + consentimento no mesmo acto, checkbox **não pré-marcado**, granular (saúde ≠ marketing), ligado à **versão** da política.
- Registado em **`ConsentLog`** (append-only) — prova de quem aceitou o quê e quando.
- **Revogável** a qualquer momento (a clínica/ o titular).

---

## 6. Retenção e minimização

- **Política de retenção configurável por tenant** (default sector: **24 meses** de inactividade → anonimizar).
- **Job BullMQ semanal** (já temos Redis+BullMQ): anonimiza clientes inactivos > período, mantendo estatística agregada e dados fiscais.
- **Minimização:** enviar à IA (OpenAI/Google) o mínimo necessário; nunca anamnese completa sem necessidade.

---

## 7. WhatsApp (ponto crítico)

- **Opt-in** obrigatório para mensagens iniciadas pelo negócio (lembretes/marketing); ter o número não chega. Registar em `ConsentLog (whatsapp_optin)`.
- **Regra Meta de 15-Jan-2026:** só bots **task-specific** (marcação/suporte) na API; chatbots genéricos banidos. **A IA do Marcai é task-specific → conforme em princípio.**
- ⚠️ **Gap:** o Marcai usa **Evolution/Baileys (não-oficial)**. Para um caminho RGPD totalmente defensável, a **API oficial via BSP (UE)** é preferível — liga à **ADR-025**. Registar como risco assumido entretanto.

---

## 8. Segurança (medidas técnicas e organizativas)

- Isolamento multi-tenant (DB-per-tenant) — inviolável (CLAUDE.md).
- Acesso **need-to-know** a dados de saúde (ADR-031) + **audit de leitura**.
- JWT (access 1h + refresh 7d), rate limiting, helmet, CORS restrito (já existe).
- Cifra em repouso (Atlas) + cifra em trânsito (TLS).
- Backups cifrados off-site (R2, ADR-030).
- **Notificação de breach:** processo para avisar a clínica **≤72h** (padrão Fresha).

---

## 9. DPIA (Avaliação de Impacto)

**IA + dados de saúde + profiling = alto risco → DPIA recomendada/obrigatória.** Documentar: finalidades, fluxos de dados (incl. OpenAI/Google), riscos, medidas de mitigação (minimização, need-to-know, anonimização). Fase 4 da ADR-031.

---

## 10. Arquitectura técnica (stack real do Marcai)

> Corrige o plano genérico (que assumia SQLAlchemy/Celery): aqui é **Node/Express + Mongoose + BullMQ**.

- **Modelo `ConsentLog`** (Mongoose, tenant DB via `registry.js`) — append-only.
- **Módulo `src/modules/gdpr/`** (ADR-011): `gdprController` + `gdprRoutes` + `gdprSchemas` (Zod), montado em `app.js` (`/gdpr`), dual-mount `/api` + `/api/v1`. Tudo tenant-scoped `{ tenantId }`, contrato `{ success, data/error }`.
  - `POST /gdpr/consent` — regista consentimento/retirada.
  - `GET /gdpr/clientes/:id/export` — portabilidade.
  - `POST /gdpr/clientes/:id/apagar` — marca para anonimização.
- **Campos no `Cliente`:** `anonimizado`, `pendingDeletion`, `deletionRequestedAt`.
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
