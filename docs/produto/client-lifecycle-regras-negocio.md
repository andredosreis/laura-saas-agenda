# Client Lifecycle — Regras de Negocio (Entrevista com Laura)

**Data**: 2026-05-27
**Actualizado**: 2026-05-28
**Status**: Pendente aprovacao da Laura
**Contexto**: O agente IA para clientes existentes ja funciona (marca sessoes, consulta pacotes, consulta agendamentos). Faltam decisoes de negocio que so a Laura pode tomar.

> **Instrucoes para a Laura**: Em cada pergunta, a opcao marcada com `[R]` e a recomendacao tecnica. Se concordas, basta confirmar. Se preferes outra opcao, diz qual e porqe.

---

## 1. Sessao avulsa vs Pacote

Quando o cliente marca via WhatsApp, como funciona?

- [ ] **A)** Sempre avulsa — a Laura liga ao pacote manualmente depois
- [ ] **B)** Se tem pacote activo, desconta automaticamente uma sessao
- [R] **C)** O agente pergunta: "Quer usar uma sessao do pacote X (restam N) ou marcar avulso?"

**Recomendacao**: C — da visibilidade ao cliente sobre o pacote sem forcar. Se o pacote tem sessoes, o cliente escolhe; se nao tem, marca avulsa. A Laura nao perde controlo.

**Nota tecnica**: Se B ou C, o sistema precisa de linkar o agendamento ao pacote e descontar a sessao automaticamente.

---

## 2. Cliente sem pacote — pode marcar?

Se o cliente nao tem pacote activo, pode marcar sessao via WhatsApp?

- [R] **A)** Sim, marca como avulsa (paga na clinica)
- [ ] **B)** Nao, redireciona: "Fale com a Laura para adquirir um pacote"
- [ ] **C)** Pode marcar avaliacao gratuita, mas nao sessao paga

**Recomendacao**: A — bloquear marcacao perde receita. Marca avulsa, cliente paga na clinica. Sem atrito.

**Cenario especial — pacote esgotado**: Se as sessoes do pacote acabaram, o agente avisa: "As sessoes do seu pacote acabaram. Quer que peca a Laura para preparar a renovacao?" Se sim, cria nota para a Laura. Nenhuma transaccao financeira automatica — a Laura contacta e resolve.

---

## 3. Limite de marcacoes por IA

O cliente pode marcar quantas sessoes quiser via WhatsApp?

- [ ] **A)** Sem limite
- [R] **B)** Maximo 1 agendamento pendente por vez (so marca outra depois de ir a actual)
- [ ] **C)** Maximo ___ por semana/mes (definir numero)

**Recomendacao**: B — evita abusos sem ser restritivo. Caso raro (2 seguidas), a Laura marca manualmente. Para MVP e o mais seguro.

---

## 4. Reagendar — quem pode?

O cliente pode reagendar sozinho via WhatsApp?

- [ ] **A)** Livre — cancela e remarca automaticamente
- [ ] **B)** Pode pedir, mas a Laura confirma manualmente
- [R] **C)** Livre ate 24h antes do horario, depois precisa de aprovacao

**Recomendacao**: C — respeita o tempo da Laura. Ate 24h o cliente remarca sozinho; menos de 24h o bot diz "Contacte a Laura directamente." Equilibra autonomia com proteccao da agenda.

---

## 5. Cancelar — politica

O cliente pode cancelar via WhatsApp? Ha penalizacao?

- [ ] **A)** Livre, sem penalizacao
- [R] **B)** Livre ate 24h antes, depois conta como sessao usada do pacote
- [ ] **C)** Pode pedir, mas a Laura confirma manualmente

**Recomendacao**: B — pratica de mercado. Protege a Laura de cancelamentos em cima da hora. O bot avisa: "Cancelamentos com menos de 24h contam como sessao usada."

---

## 6. Horario de atendimento do bot

O bot responde a qualquer hora ou so no horario da clinica?

- [ ] **A)** 24h (marca a qualquer hora, sessao e no horario normal)
- [ ] **B)** So responde no horario da clinica (fora disso: "estamos fechados")
- [R] **C)** 24h mas avisa "fora do horario" e marca na mesma

**Recomendacao**: C — clientes enviam mensagem a noite. O bot responde e marca, mas avisa: "Estamos fora do horario, a Laura confirmara amanha." Nao perde marcacoes, nao gera expectativas falsas.

---

## 7. Tipo de sessao

O agente deve perguntar que servico o cliente quer?

- [ ] **A)** Marca generico "Sessao" — a Laura decide o tratamento na hora
- [ ] **B)** Pergunta o servico e grava (ex: "Drenagem Linfatica")
- [R] **C)** Se tem pacote activo, assume o servico do pacote automaticamente; se nao tem pacote, marca generico "Sessao"

**Recomendacao**: C com fallback — se tem pacote, ja sabe o servico (ex: "Drenagem Linfatica x10"). Se nao tem, marca generico e a Laura decide na hora. Evita perguntas desnecessarias.

---

## 8. Precos no WhatsApp

O agente pode dizer precos especificos de servicos?

- [R] **A)** Manter actual — so diz "a partir de 40 EUR" (Laura diz pessoalmente)
- [ ] **B)** Pode dizer preco do catalogo se o cliente perguntar
- [ ] **C)** Pode dizer range ("entre 40 EUR e 80 EUR dependendo do caso")

**Recomendacao**: A — precos no WhatsApp geram comparacoes e mal-entendidos. A Laura fecha presencialmente, conhece o caso, adapta. Manter como esta protege a margem.

---

## 9. Cliente antigo com telefone nao registado (NOVO)

Pessoa diz "ja sou cliente da Laura" mas o telefone nao esta no sistema. O que fazer?

- [R] **A)** O agente marca sessao normalmente e deixa observacao: "Diz ser cliente existente — telefone nao encontrado. Laura: verificar e criar/associar cliente."
- [ ] **B)** O agente nao marca e redireciona: "Peca a Laura para registar o seu numero primeiro"

**Recomendacao**: A — nao bloquear o cliente. Entra como Lead, o agente adapta o tom (sem qualificacao/scoring), marca sessao, e a Laura resolve o cadastro depois. Zero atrito.

**Fluxo tecnico**:
1. Telefone desconhecido → entra como Lead (fluxo normal)
2. Lead agent detecta "ja sou cliente" → muda postura (sem qualificacao)
3. Marca agendamento ligado ao Lead
4. Observacao automatica para a Laura
5. Laura cria/associa o Cliente no dashboard

---

## 10. Renovacao de pacotes via WhatsApp (NOVO)

Quando o pacote do cliente acaba, o agente pode sugerir renovacao?

- [R] **A)** Fase 1 — Agente avisa e cria nota: "Sessoes acabaram. Quer que peca a Laura para preparar renovacao?" Se sim, nota para Laura contactar.
- [ ] **B)** Fase 2 (futuro) — Agente cria CompraPacote pendente, pergunta forma de pagamento, Laura fecha.
- [ ] **C)** Fase 3 (futuro) — Integracao com MB Way/Multibanco para pagamento automatico.

**Recomendacao**: A para ja — simples, sem risco financeiro. Fases B e C sao projectos separados que requerem integracao com gateway de pagamento.

**Fluxo tecnico Fase A**:
1. Agente detecta `sessoesRestantes === 0`
2. Avisa: "As sessoes do seu pacote acabaram. Quer que peca a Laura para preparar a renovacao?"
3. Se sim → cria nota/observacao no dashboard da Laura
4. Laura contacta cliente e resolve pagamento presencialmente

---

## Roadmap de implementacao

| Fase | O que inclui | Complexidade | Depende de |
|---|---|---|---|
| Phase 2A | Reagendar + Cancelar (regras 4-5) | Media | Aprovacao Laura |
| Phase 2B | Pacote vs Avulsa (regras 1-2-7) | Media | Aprovacao Laura |
| Phase 2C | Limite 1 pendente (regra 3) | Baixa | Aprovacao Laura |
| Phase 2D | Horario bot (regra 6) + Telefone nao registado (regra 9) | Media | Aprovacao Laura |
| Phase 3 | Renovacao pacotes — nota para Laura (regra 10A) | Baixa | Phase 2B |
| Futuro | Pagamento automatico (regra 10B-C) | Muito alta | Gateway pagamento |

---

## Notas da entrevista

_(preencher durante a conversa com a Laura)_

Data da entrevista: _______________
Decisoes tomadas: _______________
Observacoes adicionais: _______________
