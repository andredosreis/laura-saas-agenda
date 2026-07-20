# Marcai — Matriz Jurídica RGPD por Finalidade

**Estado:** Draft para validação por jurista/DPO — NÃO é aconselhamento jurídico
**Data:** 2026-07-19
**Autor:** André dos Reis (preparação técnica)
**Relacionado:** `rgpd-conformidade.md` (plano operacional), `rgpd-perguntas-jurista.md` (pacote apresentável das Q1–Q14 + redacções pedidas — enviar este ao jurista), ADR-031, `docs/produto/features/features-rgpd/RECONCILIATION.md` (R1–R10)

> Objectivo: para **cada finalidade de tratamento**, fixar a base do **Art. 6**, a condição do **Art. 9** (quando há dados de saúde), a **retenção** (com fonte), os **destinatários** e o **mecanismo de prova** — avaliados separadamente, nunca em bloco. As linhas marcadas ⚠️ são as questões que o jurista tem de fechar antes de vender "conformidade RGPD".

**Papéis:** a clínica (tenant) é o **responsável (controller)**; o Marcai é o **processador (processor)**; os fornecedores abaixo são sub-processadores do Marcai (lista publicada em `rgpd-conformidade.md` §3).

---

## 1. Matriz por finalidade

| # | Finalidade | Categorias de dados | Base Art. 6 | Condição Art. 9 | Retenção (fonte) | Destinatários / sub-processadores | Mecanismo de prova |
|---|---|---|---|---|---|---|---|
| 1 | Gestão de marcações e agenda | Identificação, contacto, histórico de marcações | 6(1)(b) contrato | n/a | Relação activa + período de inactividade configurável (default 24 meses ⚠️ Q2) | Atlas, Contabo, R2 (backup) | Registos de sistema |
| 2 | Ficha base do cliente | Nome, telefone, email, data de nascimento, nota operacional | 6(1)(b) contrato | n/a | Idem #1 | Idem #1 | Registos de sistema |
| 3 | Mensagens de serviço (lembretes, confirmações, link da ficha) | Contacto, dados da marcação | 6(1)(b) contrato — transaccional, não marketing | n/a | Histórico de conversa (arquivo ADR-026) | Evolution/Meta (⚠️ Q7 Baileys), Contabo | `Mensagem` persistida |
| 4 | **Anamnese / dados de saúde (estética)** | Bloco `CLINICAL_FIELDS` do `Cliente` | 6(1)(a) consentimento | **9(2)(a) consentimento explícito** — ⚠️ Q1: 9(2)(h) foi deliberadamente **não** invocado (exige profissional sujeito a sigilo, Art. 9(3); contestável em estética) | Enquanto consentimento vigente; retirada → cessa o uso (R4); apagamento → F07 | Atlas, Contabo, R2 (backup). **Nunca IA/OpenAI/Google (R1)** | `ConsentLog` (F01) + acesso need-to-know (F02) + audit de leitura (`AcessoClinicoLog`) |
| 5 | Marketing / campanhas | Contacto, preferências | 6(1)(a) consentimento | ⚠️ Q3: se alguma segmentação usar dados de saúde → 9(2)(a); política: **não segmentar por saúde** (minimização) | Até retirada do consentimento | Evolution/Meta | `ConsentLog (marketing)` (F09) |
| 6 | WhatsApp opt-in (mensagens iniciadas pelo negócio, não transaccionais) | Contacto | 6(1)(a) consentimento | n/a | Até retirada | Evolution/Meta | `ConsentLog (whatsapp_optin)` — ⚠️ Q4: captura pelo funcionário no painel (F09) é prova fraca |
| 7 | IA conversacional (resposta a mensagens de clientes/leads) | Conteúdo de mensagens, nome, telefone, marcações, `observacoes` | ⚠️ Q5: 6(1)(b) (execução do serviço) vs 6(1)(f) (interesse legítimo + LIA) — a fechar | Nunca dados clínicos (R1); ⚠️ Q6: `observacoes` é texto livre e entra no prompt — risco de saúde de facto | Retenção da conversa (ADR-026) + retenção-zero na OpenAI (opção) | OpenAI (EUA, SCCs), Google Ireland (UE), LangSmith (endpoint UE) | DPIA (obrigatória — IA + saúde no mesmo sistema), logs |
| 8 | Transcrição de notas de voz | Áudio do cliente | Idem #7 | Idem #7 | Áudio não retido após transcrição (confirmar) | Google (Gemini) | DPIA |
| 9 | Facturação e registos fiscais | Transações, pagamentos, valores, datas | 6(1)(c) obrigação legal | n/a | **10 anos** — ⚠️ Q8: confirmar Art. 52.º CIVA + Art. 123.º CIRC e fazer matriz **campo-a-campo** (a obrigação cobre os elementos fiscais, não notas livres nem `dadosMBWay.telefone`) | Atlas, Contabo, R2 | Imutabilidade dos registos fiscais (F07 preserva) |
| 10 | Audit de acessos clínicos (`AcessoClinicoLog`) | Quem leu a ficha clínica, quando | 6(1)(c)/(f) accountability (Art. 5(2), 32) | n/a | ~12 meses (TTL) | Atlas | Índice TTL, append-only |
| 11 | Registos de consentimento (`ConsentLog`) | Histórico de consentimentos | 6(1)(c) — Art. 7(1) dever de demonstrar | n/a | Vigência do tratamento + prazo prescricional ⚠️ Q9 | Atlas | Append-only, `versao` server-derived (R6) |
| 12 | Backups cifrados | Cópia integral das BDs | 6(1)(f) continuidade de negócio | herda das origens | Rotação ≤35 dias (alvo — ⚠️ confirmar e documentar no DPA) | R2 (Cloudflare, UE) | Política de rotação documentada |
| 13 | Observabilidade e erros | Metadados técnicos, ids | 6(1)(f) | n/a — minimizar PII nos eventos | Retenção Sentry configurada | Sentry (região UE) | Config de scrubbing |
| 14 | Emails transaccionais (verificação, reset, alertas) | Email, nome | 6(1)(b) | n/a | Logs do fornecedor | **Resend (EUA)** — ⚠️ Q10: DPA+SCCs ou alternativa UE | Logs de envio |

---

## 2. Transferências internacionais

| Sub-processador | País | Salvaguarda | Estado |
|---|---|---|---|
| OpenAI | EUA | DPA + SCCs + opção retenção-zero; minimização (R1: nunca clínico) | ⚠️ confirmar contrato |
| Resend | EUA | DPA + SCCs | ⚠️ Q10 — ou substituir por fornecedor UE |
| Vercel (frontend) | EUA/edge | DPA + SCCs; sobretudo estático | ok em princípio |
| Google (Gemini) | Irlanda (UE) | DPA; residência UE | ok em princípio |
| Meta/WhatsApp | UE/EUA | ⚠️ Q7 — via Baileys (não-oficial, ADR-025) | risco assumido documentado |

---

## 3. Modelo de prova do consentimento — desenhado (passo 3 concluído 2026-07-20; RECONCILIATION R7/R8)

**`ConsentLog` v2** (append-only, só consentimentos reais — `dados_saude`, `whatsapp_optin`, `marketing`):
- `textoHash` — sha256 do texto do aviso/consentimento **efectivamente apresentado**, calculado pelo servidor;
- `actor` **explícito** (`titular` | `funcionario`), server-derived: o formulário público regista `titular`; qualquer chamada staff autenticada regista `funcionario`;
- `evidencia` **obrigatória** em concessões por funcionário (declaração assistida — 400 sem ela); retirada dispensa evidência (Art. 7(3) — opt-out sem fricção);
- `fichaTokenId` — liga o consentimento ao evento de recolha (F04);
- `versao` sempre server-derived (R6); finalidade = `tipo`; responsável = o tenant (clínica).

**`NoticeReceipt`** (novo, append-only) — prova de entrega/apresentação do aviso Art. 13 (`versao`, `textoHash`, `canal`, ip). O antigo `tipo: politica_privacidade` deixa de existir como "consentimento".

**`PedidoTitular`** (esboçado em R7; implementação no passo 4 por F06/F07) — pedidos dos titulares como registo próprio (`apagamento`/`acesso`/`portabilidade`/`rectificacao`, estado, `prazoLimite` Art. 12(3)). Substitui o uso indevido de `ConsentLog (withdrawn)` para registar pedidos de apagamento.

**Aviso Art. 13 (F04):** template estruturado (controlador+contacto, finalidades, bases, destinatários, transferências, retenção, direitos+CNPD, contacto) interpolado por tenant e com hash — **redacção pendente do jurista (Q1)**; estrutura e hashing fixados. Submissão com claim atómico do token + transacção Mongo + compensação (sem estados meio-submetidos).

**Canal de concessão (R8):** comunicações só por acção do titular (checkboxes no formulário F04, nunca pré-marcados) ou declaração assistida com evidência no painel; o checkbox de booking clicado pelo staff foi removido.

---

## 4. Questões abertas para o jurista/DPO

1. **Q1 — Art. 9 em estética:** confirmar a recusa do 9(2)(h) (sigilo profissional, Art. 9(3)) e a suficiência do 9(2)(a) consentimento explícito para a anamnese. Inclui redacção exacta do pedido de consentimento (F04 R11/R12).
2. **Q2 — Default de retenção 24 meses:** não foi identificada norma sectorial que o fundamente; fixar critério (necessidade/minimização) ou ajustar o default.
3. **Q3 — Marketing e dados de saúde:** validar a política "nunca segmentar por saúde" como suficiente para manter marketing fora do Art. 9.
4. **Q4 — Opt-in registado por funcionário (F09):** o checkbox no painel interno é declaração assistida, não acto do titular. **Remédio já desenhado (R8, 2026-07-20):** concessão primária = checkboxes do titular no formulário F04; painel restrito a retiradas (livres) + declarações assistidas com `evidencia` obrigatória e badge visível. **Ao jurista:** validar a suficiência da declaração assistida como prova, e a redacção do campo evidência.
5. **Q5 — Base legal da IA conversacional:** 6(1)(b) vs 6(1)(f)+LIA; consequências para o dever de informação e opt-out.
6. **Q6 — `Cliente.observacoes`:** campo livre visível a toda a equipa e injectado no prompt da IA (`client_orchestrator.py`); risco de dados de saúde de facto. **Remédio parcial desenhado (R10, 2026-07-20):** o F10 já NÃO usa `observacoes` — a nota da agenda é o novo `notaOperacional` (max 200, guidance "sem dados de saúde", excluído das projecções da IA e do `/clinico`). **Fica em aberto:** se `observacoes` (legacy) deve continuar a fluir para o prompt da IA — decisão produto+jurista (minimização vs utilidade das notas duráveis da equipa).
7. **Q7 — Canal WhatsApp não-oficial (Baileys):** risco assumido; caminho para API oficial via BSP (ADR-025). Nota: a política Meta de Jan-2026 sobre assistentes de uso geral está suspensa por medidas provisórias da Comissão Europeia (Jun-2026, IP/26/1276) — em qualquer regime o bot task-specific do Marcai não é afectado; matéria de concorrência/ToS, não RGPD.
8. **Q8 — Retenção fiscal campo-a-campo:** 10 anos (Art. 52.º CIVA; Art. 123.º CIRC) cobre os elementos fiscais. **Remédio desenhado (R9, 2026-07-20):** o F07 passa a limpar `Transacao.observacoes`, `Pagamento.observacoes`, `dadosMBWay.telefone`, `Agendamento.observacoes` e o `leadData` embutido; **mantém** valores, datas, referências e `Transacao.descricao` (descritivo de factura — tratado como fiscal). **Ao jurista:** confirmar a classificação de `descricao` e validar a matriz campo-a-campo final.
9. **Q9 — Retenção do próprio `ConsentLog`:** vigência + prazo prescricional aplicável.
10. **Q10 — Email (Resend, EUA):** DPA+SCCs suficientes vs migrar para fornecedor UE.
11. **Q11 — Terminologia "anonimização" (F07):** o que o F07 faz é **pseudonimização** (EDPB: continua dado pessoal). **Remédio desenhado (R9, 2026-07-20):** as specs/contracts de F07/F08 carregam a nota terminológica (identificadores de código mantêm-se; documentação legal diz "pseudonimização/de-identificação irreversível de PII"). **Ao jurista:** redacção final no DPA/política.
12. **Q12 — Acesso vs portabilidade (F06):** **Remédio desenhado (R9, 2026-07-20):** `?tipo=acesso|portabilidade` — acesso = universo completo com allowlists por coleção (+`Lead`+`NoticeReceipt`); portabilidade = fatia estreita (identidade+anamnese, mensagens do titular, marcações, consentimentos); cada export regista um `PedidoTitular` (audit + prazo Art. 12(3)). **Ao jurista:** validar a fatia exacta do Art. 20.
13. **Q13 — Notificação de violações:** Marcai→clínica **sem demora injustificada** (Art. 33(2)); nunca redigir como "SLA de 72h" (as 72h são clínica→CNPD, Art. 33(1)).
14. **Q14 — Menores:** declaração "maiores de 18" no formulário (F04 R12) — validar suficiência sem verificação de idade.

---

## 5. Fontes

- [RGPD — texto integral (EUR-Lex)](https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX%3A32016R0679) — Art. 6, 7, 9, 15, 17, 20, 33
- [CNPD — Consentimento](https://www.cnpd.pt/organizacoes/areas-tematicas/consentimento/)
- [CNPD — Violação de dados](https://www.cnpd.pt/organizacoes/outras-obrigacoes/violacao-de-dados-ou-data-breach/)
- [EDPB — Anonymisation & pseudonymisation](https://www.edpb.europa.eu/topics/ai-and-technology/anonymisationpseudonymisation_en)
- [CIVA Art. 52.º — prazo de conservação](https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/ra/pages/ivara52-0808.aspx)
- [Comissão Europeia — medidas provisórias Meta/WhatsApp, Jun-2026 (IP/26/1276)](https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1276)
