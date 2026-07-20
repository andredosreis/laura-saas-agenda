# Marcai — Pacote de Questões para Jurista de Protecção de Dados (PT)

**Data:** 2026-07-20
**De:** André dos Reis (fundador, Marcai)
**Objectivo:** validar o enquadramento RGPD do produto antes do onboarding de clínicas pagantes e obter a redacção dos textos legais.
**Anexos técnicos:** `rgpd-matriz-juridica.md` (matriz por finalidade), `rgpd-conformidade.md` (plano operacional).

---

## 1. Contexto em 60 segundos

O **Marcai** é um SaaS de gestão de agendamentos para clínicas de estética em Portugal. Cada clínica usa o painel para gerir clientes, marcações e pagamentos; um assistente de IA responde a mensagens de WhatsApp dos clientes (marcar, remarcar, tirar dúvidas).

**Papéis (já assumidos por nós):** cada **clínica é a responsável pelo tratamento (controller)**; o **Marcai é o subcontratante (processor)**. A entrega comercial nº 1 é um **DPA que a clínica assina**. Toda a infraestrutura principal está na UE; as excepções (IA, email) estão identificadas no bloco D.

**Ponto sensível:** o modelo de cliente inclui uma **ficha de anamnese** (alergias, medicação, diabetes, hipertensão, etc.) — dados de saúde, categoria especial do Art. 9. Desenhámos um sistema onde o próprio cliente preenche a ficha num **formulário público enviado por WhatsApp** e dá o consentimento explícito no mesmo ecrã, com prova registada (versão + hash do texto apresentado, quem agiu, quando, por que canal).

**O que pedimos:** respostas às questões abaixo + a redacção dos textos do bloco F. A engenharia está desenhada e avança em paralelo; **nada é apresentado a clientes finais antes da vossa validação dos textos**.

---

## 2. Bloco A — Enquadramento das bases legais

### Q1 — Base para dados de saúde numa clínica de estética
Assumimos que o Art. 9(2)(h) (prestação de cuidados de saúde) **não** é invocável com segurança — exige profissional sujeito a sigilo (Art. 9(3)), o que numa clínica de estética é contestável. Por isso a base escolhida para a anamnese é **consentimento explícito (Art. 9(2)(a))**, capturado no formulário self-service.
**Pergunta:** confirmam esta escolha? Há enquadramento CNPD específico para estética que devamos considerar?

### Q3 — Marketing e dados de saúde
Política interna: campanhas de marketing **nunca segmentam por dados de saúde** (só contacto + preferências).
**Pergunta:** isto basta para manter o marketing fora do Art. 9, com base 6(1)(a)?

### Q5 — Base legal da IA conversacional
A IA responde a mensagens dos clientes usando nome, telefone, marcações e o conteúdo das mensagens (nunca a anamnese — exclusão técnica garantida). Hesitamos entre 6(1)(b) (execução do serviço de agendamento) e 6(1)(f) (interesse legítimo + LIA).
**Pergunta:** qual a base correcta, e que consequências para o dever de informação e opt-out?

---

## 3. Bloco B — Consentimento e prova

### Contexto do modelo de prova (para validar, já desenhado)
Cada consentimento gera um registo imutável com: tipo (saúde / WhatsApp / marketing), acção (dado / retirado), **hash do texto exactamente apresentado**, versão da política, canal, IP, e um marcador de **quem agiu**: o próprio titular (formulário público) ou um funcionário (declaração assistida — só permitida com um campo de **evidência obrigatório**, ex.: "cliente pediu verbalmente na recepção a 20/07"). A entrega do aviso de privacidade é registada à parte (recibo de aviso, não consentimento). A retirada é sempre possível sem fricção.

### Q4 — Declaração assistida pelo funcionário
O canal primário de concessão é o próprio titular (checkboxes no formulário, nunca pré-marcadas). Secundariamente, um funcionário pode registar um consentimento **em nome do** cliente, com evidência obrigatória e etiqueta visível "declaração assistida".
**Pergunta:** a declaração assistida com evidência é aceitável como prova de consentimento? Que requisitos mínimos deve ter o campo de evidência?

### Q14 — Menores
O formulário exibe "Destinado a maiores de 18 anos", sem verificação de idade; menores estão fora de âmbito.
**Pergunta:** a declaração basta? Que redacção recomendam?

---

## 4. Bloco C — Retenção e apagamento

### Q2 — Default de retenção
Anonimizamos clientes inactivos após um período configurável por clínica; o default proposto é **24 meses de inactividade**, sem norma sectorial identificada que o fundamente.
**Pergunta:** que critério/valor default recomendam? (O job automático fica **desligado** até esta resposta.)

### Q8 — Retenção fiscal campo-a-campo
Ao apagar um cliente, preservamos os registos financeiros (10 anos — Art. 52.º CIVA / Art. 123.º CIRC) mas limpamos tudo o que não é elemento fiscal: notas livres de transações/pagamentos/marcações, telefone MB Way, identidade embutida. Mantemos o **descritivo do serviço vendido** (ex.: "Pacote 10 sessões radiofrequência") por o tratarmos como elemento da factura.
**Pergunta:** confirmam a classificação do descritivo como fiscal? Algo mais a preservar/limpar?

### Q9 — Retenção do próprio registo de consentimentos
**Pergunta:** por quanto tempo conservar os registos de consentimento após o fim do tratamento (prazo prescricional aplicável)?

### Q11 — Terminologia no DPA
O nosso "apagamento" é tecnicamente **pseudonimização** (EDPB: o registo continua ligável internamente e continua a ser dado pessoal): PII e dados clínicos são substituídos irreversivelmente, conversas WhatsApp são apagadas de vez, esqueleto estatístico e fiscal permanece. Backups cifrados expiram por rotação (alvo ≤ 35 dias) em vez de reescrita.
**Pergunta:** validar a redacção desta mecânica no DPA/política (nunca prometer "anonimização"); a posição sobre backups é defensável?

---

## 5. Bloco D — Fornecedores e transferências

### Q10 — Email transaccional (Resend, EUA)
Emails de verificação/reset/alertas via **Resend** (EUA). DPA + SCCs disponíveis do fornecedor.
**Pergunta:** DPA+SCCs bastam, ou recomendam migrar para fornecedor UE?

### Q7 — Canal WhatsApp não-oficial
Hoje o WhatsApp liga por biblioteca não-oficial (Baileys); há plano de migração para a API oficial via BSP. Risco assumido e documentado.
**Pergunta:** como formular este risco no DPA perante a clínica? Nota: a política Meta de Jan-2026 sobre assistentes de IA de uso geral está suspensa por medidas provisórias da Comissão Europeia (Jun-2026, IP/26/1276); o nosso bot é task-specific e não é afectado em nenhum dos regimes — tratamos isto como matéria de ToS/concorrência, não RGPD.

*(Restante lista de sub-processadores — MongoDB Atlas UE, Contabo DE, Cloudflare R2 UE, OpenAI EUA c/ SCCs + minimização, Google Ireland, LangSmith UE, Sentry UE, Vercel — no anexo `rgpd-conformidade.md` §3.)*

---

## 6. Bloco E — Incidentes e direitos dos titulares

### Q13 — Notificação de violações
Processo: Marcai (processor) avisa a clínica **sem demora injustificada** após conhecimento (Art. 33(2)), com meta operacional interna nas primeiras horas — nunca formulado como "SLA de 72h" (as 72h são da clínica para a CNPD).
**Pergunta:** validar esta formulação para o DPA + o conteúdo mínimo do aviso à clínica.

### Q12 — Acesso vs portabilidade *(informativo — já desenhado, validar a fatia)*
Implementamos os dois direitos separados: **acesso (Art. 15)** = dossier completo com listas de campos controladas; **portabilidade (Art. 20)** = apenas dados fornecidos pelo titular (identidade, anamnese, mensagens que escreveu, marcações, consentimentos) em JSON. Cada pedido fica registado com prazo (Art. 12(3): 1 mês).
**Pergunta:** a fatia de portabilidade está correcta?

### Q6 — Notas internas e a IA *(decisão produto+jurídica)*
Existe um campo de notas livres da equipa que alimenta o prompt da IA ("de férias até 20/08"). Já criámos um campo separado e restrito para as notas operacionais da agenda (com aviso "sem dados de saúde", excluído da IA). Fica a decisão sobre o campo legado.
**Pergunta:** o fluxo notas-livres→IA é aceitável com guidance à equipa, ou deve ser cortado/minimizado?

---

## 7. Bloco F — Redacções que pedimos (entregáveis)

1. **Aviso de privacidade Art. 13 do formulário** — temos a estrutura pronta (responsável+contacto, finalidades, bases, destinatários, transferências, retenção, direitos incl. queixa à CNPD, contacto), com o nome da clínica interpolado por tenant e hash do texto guardado como prova. Falta a **redacção**.
2. **Textos das checkboxes de consentimento** (saúde; WhatsApp; marketing) + declaração "maiores de 18" (Q14).
3. **DPA (minuta)** que as clínicas assinam — incluindo sub-processadores + pré-aviso de 30 dias, mecânica de pseudonimização (Q11), notificação de incidentes (Q13), janela de backups.
4. **Política de privacidade (PT)** com versionamento.
5. **DPIA** — apoio/parecer (IA + dados de saúde no mesmo sistema → avaliação de impacto necessária). Os fluxos de dados estão documentados nos anexos.

---

## 8. Estado técnico (para calibrar o timing)

A construção técnica **não está bloqueada** pelas respostas — os defaults conservadores já estão desenhados e os pontos jurídicos são parametrizáveis (textos versionados com hash, retenção configurável, job desligável). Os únicos gates jurídicos reais antes de expor a clientes finais:

| Gate | O que espera pela vossa resposta |
|---|---|
| Envio da ficha a clientes reais | Redacção do aviso Art. 13 + textos de consentimento (F.1, F.2) |
| Ligar o job de retenção automática | Q2 (default de retenção) |
| Assinatura de clínicas pagantes | DPA + política (F.3, F.4) |
| Comunicação comercial "conforme RGPD" | Validação geral Q1–Q14 + DPIA (F.5) |
