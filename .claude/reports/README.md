# Agent Reports — Marcai

Pasta gerida pelo `orchestrator`. Contém um registo escrito de cada delegação significativa entre agents para que o utilizador possa rever **o que cada agent disse, fez ou recomendou** sem ter de scrollar conversações.

## Princípios

1. **Apenas o orchestrator escreve aqui.** Outros agents reportam ao orchestrator; o orchestrator persiste.
2. **Um ficheiro por sessão de trabalho** (não por mensagem). Sessão = conjunto de delegações relacionadas a uma melhoria, audit ou tarefa.
3. **Append-only durante a sessão.** Não reescrever histórico — adicionar sub-secções conforme novos agents reportam.
4. **Resumo, não transcript.** Capturar findings, decisões, débito, ficheiros tocados — não a conversa inteira.

## Formato de nome de ficheiro

```
YYYY-MM-DD-<tipo>-<slug>.md
```

Exemplos:
```
2026-04-25-audit-architect-system.md
2026-04-26-melhoria-22-rate-limit.md
2026-04-26-fix-multitenant-leak-clientes.md
2026-05-01-adr-sync-stack-drift.md
```

Tipos comuns:
- `audit` — análise sem alteração de código
- `melhoria` — execução de item do `MELHORIAS.md` (ex: `melhoria-04-paginacao`)
- `fix` — correcção pontual fora do roadmap
- `adr` — proposta ou sincronização de ADR
- `refactor` — refactor que envolve múltiplos agents

## Estrutura mínima do report

```markdown
# <Título da sessão>

**Data:** YYYY-MM-DD
**Severidade:** 🔴 Crítica | 🟡 Importante | 🟢 Produto | 🔵 Dívida Técnica
**Origem:** <melhoria #N | fix ad-hoc | audit periódico>
**Estado:** Em curso | Concluída | Bloqueada | Aguarda utilizador

---

## Agents envolvidos e ordem

1. `architect-agent` (modo `audit`) — identificou X
2. `backend-agent` (modo `execute`) — implementou Y
3. `multi-tenant-guard` (modo `regression-check`) — validou Z
4. `quality-agent` (modo `gate`) — decisão PASS/CONCERNS/FAIL/WAIVED

## Findings por agent

### architect-agent (audit)
- Finding 1: ...
- Finding 2: ...
- Recomendação: ...

### backend-agent (execute)
- Ficheiros alterados: `src/...`, `src/...`
- Decisões tomadas: ...

### multi-tenant-guard (regression-check)
- Queries verificadas: N
- Violations encontradas: 0
- Severidade: 🟢

### quality-agent (gate)
- **Decisão:** CONCERNS
- Princípios cumpridos: ✓✓✓✗✓✓
- Débito identificado: teste de isolamento em falta para `Recurso X` (sugerido adicionar a `MELHORIAS.md`)
- NFR Security: OK | Performance: OK | Reliability: CONCERNS
- Justificação: ...

## Ficheiros tocados (consolidado)

```
A  src/modules/clientes/clienteController.js   +12  -4
M  src/middlewares/requirePlan.js              +5   -1
A  tests/clientes/isolamento.test.js           +47  -0
```

## Pendências para o utilizador

- [ ] Decidir se aceita CONCERNS e regista débito em MELHORIAS.md, ou pede correcção
- [ ] Confirmar mensagem de commit proposta abaixo

## Commit message proposto

```
feat(clientes): adicionar requirePlan em criação de cliente

Refs: melhoria #2 do MELHORIAS.md
Gate: CONCERNS — débito de teste isolamento registado em MELHORIAS.md
```

---

*Report gerado pelo orchestrator em <data>.*
```

## Ciclo de vida

1. **Início de sessão:** orchestrator cria ficheiro com cabeçalho + `Estado: Em curso`
2. **Cada delegação:** orchestrator append uma sub-secção em "Findings por agent" depois do agent reportar
3. **Fim de sessão:** orchestrator preenche "Ficheiros tocados", "Pendências", "Commit message proposto", e marca `Estado: Concluída` (ou `Bloqueada` / `Aguarda utilizador`)
4. **Após commit:** orchestrator anota o SHA do commit no fim do report (uma linha)

## O que NÃO escrever aqui

- Logs de tools brutos (output de `npm test`, etc.) — só o resultado relevante
- Snippets de código completos — só linhas que mereceram decisão
- Diálogos do agent — só findings/decisões finais
- Informação que já está no ADR (linkar em vez de duplicar)

## Manutenção

- Reports não são apagados — servem de histórico auditável
- Após 6 meses, reports concluídos podem ser movidos para `.claude/reports/archive/YYYY/`
- Reports `Bloqueada` / `Aguarda utilizador` ficam visíveis até ao utilizador resolver
