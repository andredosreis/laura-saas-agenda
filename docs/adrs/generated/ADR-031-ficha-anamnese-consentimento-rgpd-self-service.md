# ADR-031: Ficha de Anamnese e Consentimento RGPD Self-Service (via WhatsApp)

**Status:** Accepted (2026-07-07)
**Data:** 2026-06-25 (proposta) · 2026-07-07 (aceite, após specs F01–F10 + validação competitiva)
**Módulo:** CLIENTES + GDPR (backend `src/`) + Frontend + MESSAGING (envio do link) — cross-cutting
**Autor:** André dos Reis (proposta)
**Relacionado:** ADR-024 (painel super-admin), ADR-025 (WhatsApp oficial vs Baileys), ADR-011 (modular monolith), `docs/negocio/oferta-consultoria.md`, `docs/operacoes/rgpd-conformidade.md` (a criar), modelo `Cliente` (campos de anamnese), CLAUDE.md (isolamento multi-tenant)

> Esta ADR propôs um desenho faseado, aceite a 2026-07-07. A execução está especificada no PRD `docs/produto/PRD-privacidade-consentimento.md` (F01–F10, specs em `docs/produto/features/features-rgpd/`, decisões cross-feature em `RECONCILIATION.md` R1–R5).

---

## Contexto

No modelo multi-tenant do Marcai, **cada clínica é o responsável pelo tratamento (controller)** e **o Marcai é o processador (processor)**. A ficha de anamnese guarda **dados de saúde — categoria especial do Art. 9 RGPD** (alergias, histórico médico, diabetes, hipertensão, medicação, etc.), já presentes no modelo `Cliente` mas **sub-utilizados** e sem um mecanismo próprio de recolha nem de consentimento.

Problemas do estado actual:
1. **Sem mecanismo de consentimento** para dados de saúde — recolher anamnese hoje seria a clínica a transcrever à mão, sem prova de consentimento ligada aos dados.
2. **Sem controlo de acesso fino** — qualquer utilizador do tenant veria dados clínicos sensíveis (fraco em RGPD).
3. **Sem sinalização** na ficha de que aquela parte é clínica/sensível, nem do estado do consentimento.

Oportunidade: transformar isto num **diferencial** — o cliente preenche a ficha **sozinho, pelo telemóvel**, e dá o consentimento RGPD no mesmo fluxo, com o link enviado **pelo WhatsApp** (alinhado com o posicionamento WhatsApp-first). Poucos concorrentes PT fazem isto bem; é conformidade embutida + poupança de tempo para a clínica.

---

## Decisão (proposta)

### 1. Recolha self-service com consentimento no ponto de recolha
Um **formulário público tokenizado** (sem login do cliente): a clínica/IA envia um link por WhatsApp (`/ficha/<token>`); o cliente preenche a anamnese e **dá consentimento explícito** no mesmo ecrã. O consentimento é o momento de recolha — timestamp + versão da política + ligado exactamente àqueles dados.

- **Base legal:** consentimento explícito (Art. 9(2)(a)) — a escolha mais limpa e defensável para clínica de estética. Checkbox **não pré-marcado**, granular (dados de saúde ≠ marketing), ligado à **versão** da política.
- **Segurança da superfície pública:** token com expiração, single-purpose, **scoped ao tenant**, sem enumeração, rate-limited, HTTPS, sem PII no URL além do token.

### 2. Registo de consentimento (prova)
Novo modelo `ConsentLog` (append-only) na BD do tenant (DB-per-tenant). Campos: `clienteId`/`leadId`, `tipo` (`dados_saude` | `marketing` | `politica_privacidade` | `whatsapp_optin`), `versao`, `accao` (`granted` | `withdrawn`), `origem` (`formulario` | `booking` | `whatsapp` | `painel`), `timestamp`, `ip?`, `userAgent?`. Sem rotas de update/delete (imutável). Versionamento do texto da política.

### 3. Acesso "need-to-know" aos dados clínicos
A parte clínica da ficha é visível **apenas ao dono/admin e ao terapeuta que atende** o cliente. A recepcionista vê a ficha base (nome, contacto, marcações) mas **não a anamnese**. **Enforced no backend** (a UI reflecte, não substitui) — coerente com o isolamento do CLAUDE.md, agora estendido a nível de campo para categoria especial.

### 4. Apresentação na ficha (UX)
Separador **"Clínico"** *gated* (só abre para quem tem acesso), com:
- Badge **"🔒 Dados clínicos sensíveis"** — sinaliza visualmente a sensibilidade.
- **Estado do consentimento:** Pendente / Dado a DD-MM-AAAA / Retirado.
- **Audit de leitura:** abrir a ficha clínica fica registado (quem viu e quando) — defensável numa auditoria.

### 5. Direitos do titular
O consentimento é **revogável**. Retirar consentimento marca o estado e despoleta o fluxo do módulo `gdpr/` (restrição/anonimização/eliminação). Liga a export (portabilidade) e erasure.

### Princípios
1. **Consentimento no ponto de recolha** — o titular dá os dados e consente no mesmo acto.
2. **Acesso mínimo necessário** — categoria especial só para quem precisa.
3. **Sinalizar sempre** — quem vê dados clínicos sabe que são sensíveis; o acesso fica registado.
4. **WhatsApp-first** — o link da ficha vai pelo canal que o cliente já usa.
5. **Não destrutivo / faseado** — cada fase entrega valor isolado e é reversível.

### Faseamento proposto
- **Fase 0 — Fundações de consentimento.** Modelo `ConsentLog` + módulo `src/modules/gdpr/` + registo de consentimento + versionamento da política. (Liga ao MVP de RGPD em `rgpd-conformidade.md`.)
- **Fase 1 — Acesso need-to-know + ficha gated.** Enforcement no backend + separador "Clínico" com badge, estado do consentimento e audit de leitura.
- **Fase 2 — Formulário self-service (o diferencial).** Formulário público tokenizado + envio do link por WhatsApp; grava anamnese + `ConsentLog`.
- **Fase 3 — Direitos do titular.** Revogação, export (portabilidade) e erasure/anonimização ligados.
- **Fase 4 (opcional) — DPIA documentada** (IA + dados de saúde) + retenção automática (job BullMQ).

---

## Alternativas Consideradas

1. **Anamnese só preenchida pela clínica no painel (status quo manual).** Rejeitada — fricção, erro de transcrição e consentimento frágil (sem prova ligada aos dados).
2. **Um único consentimento genérico no booking.** Rejeitada — consentimento de dados de saúde tem de ser **específico e granular**; um checkbox genérico não é válido para o Art. 9.
3. **Acesso clínico aberto a todo o staff.** Rejeitada — fraco em RGPD para categoria especial.
4. **Coleção separada e cifrada para a anamnese.** Considerada; adiada — por agora mantém-se nos campos do `Cliente` (cifra em repouso é garantida pelo Atlas). Reavaliar se o volume/risco o justificar.

---

## Consequências

**Positivas:**
- **Diferencial de venda** — ficha + consentimento self-service via WhatsApp; conformidade embutida.
- **Defensável** — consentimento com prova, acesso mínimo, sinalização e audit.
- **Menos trabalho manual** e dados mais exactos (vêm do próprio titular).
- Base para a **DPIA** e para os direitos do titular (export/erasure).

**Negativas / a vigiar:**
- **Nova superfície pública** (formulário) — exige token robusto, rate limiting e revisão de segurança.
- **RBAC fino** — "terapeuta que atende" exige saber quem atende o cliente (cruzar com Agendamento); definir na Fase 1.
- **Audit de leitura** gera volume — definir retenção desses registos.
- **Entrega do link por WhatsApp** depende do canal; o uso de Baileys (não-oficial) tem risco — liga à **ADR-025** (ir para a API oficial reforça este fluxo).
- **Redacção legal** (texto de consentimento, política, DPIA) deve ser revista por jurista de protecção de dados em PT (CNPD, dados de saúde). A engenharia (modelos, módulo, jobs, UI) é interna.

**Recomendação de prioridade:** maior valor de conformidade na **Fase 0–1** (consentimento + acesso/sinalização); o **diferencial comercial** está na **Fase 2** (self-service via WhatsApp). Aceitar este ADR antes de implementar.

---

## Validação competitiva (2026-07-07)

Pesquisa sobre 8 players EU/globais (Fresha, Booksy, Treatwell, Phorest, Timely, Zenoti, SimplyBook.me, Setmore) + BR (Clinicorp, iClinic, Amplimed, Simples Dental, Trinks, Belasis, Avec) + PT (Zappy, DOC.PT):

- **O diferencial confirma-se:** nenhum player envia a anamnese por WhatsApp de forma nativa/automática — os canais são SMS, email e in-app; no BR clínico o máximo é link manual via WhatsApp Web (Clinicorp, Simples Dental). A combinação "anamnese self-service + consentimento RGPD + WhatsApp" não existe em nenhum player analisado.
- **Referências a estudar:** Phorest (validade/renovação de formulários + smart reminders, audit de "cada ação", retenção configurável) e Zenoti (recepção sem acesso a charts por defeito, logging de acessos, templates clínicos com lógica condicional) — o desenho need-to-know + audit desta ADR está ao nível deles.
- **Sinais de mercado:** Salão99 (Grupo Boticário) encerrou em 05/2026 (base BR órfã); Treatwell só lançou consultation forms em 2024. Só a Clinicorp tem alertas de contraindicação derivados das respostas.

## Roadmap registado (não nesta versão)

Melhorias identificadas na revisão 2026-07-07, por ordem de valor — cada uma exige mini-spec própria quando for puxada:

1. **Envio automático + lembrete de ficha pendente.** O envio é manual por decisão de produto (o momento certo é o fecho do lead→cliente, fluxo F10). Futuro: auto-envio no evento de conversão lead→cliente + lembrete via pipeline BullMQ se pendente perto da marcação (padrão Fresha/Phorest/Zenoti). Com WhatsApp, ninguém no mercado tem isto.
2. **Validade/renovação da anamnese** (padrão Phorest): validade configurável por tenant (ex.: 12 meses), badge F10 "expirada", re-envio pede confirmação/actualização — exactidão (Art. 5(1)(d)) e segurança clínica (medicação muda).
3. **Assinatura desenhada** no formulário (standard BR/EU para anamnese/TCLE); imagem ligada à entrada do `ConsentLog`. Necessária quando existirem TCLE por procedimento.
4. **Alerta de contraindicação** derivado dos booleanos da anamnese (só a Clinicorp tem) — visível apenas a admin/gerente/terapeuta, nunca no badge não-clínico do F10.
5. **Tipo `uso_imagem` no enum `ConsentLog.tipo`** (fotos antes/depois com autorização) + envio de cópia da ficha ao cliente por WhatsApp após submissão.
6. **Política por tenant** (editor de texto da política própria da clínica; hoje: template único com nome da clínica interpolado) e **campanhas de re-consentimento** em mudança de versão.
7. **Menores:** gate de data de nascimento + fluxo de consentimento parental (hoje: declaração "maiores de 18" no formulário).
