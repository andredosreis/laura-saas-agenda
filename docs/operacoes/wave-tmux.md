# Wave Runner (tmux) — implementação paralela (semi-auto)

**Estado:** v2 semi-auto · **Data:** 2026-07-01
**Skill:** `implement-and-evaluate-tmux` (`.claude/skills/implement-and-evaluate-tmux/`)
**Scripts:** `wave-tmux.sh` (organiza) · `wave-dispatch.sh` (dispara) · `wave-status.sh` (consolida) · `wave-dashboard.sh` (janela 0)

Adaptação ao Marcai do "Implement and Evaluate TMUX" do harness. Cria, por feature de uma wave, um **git worktree + branch + janela tmux** isolados, para implementares várias features em paralelo **sem se atropelarem localmente**. A unidade de trabalho passa de *feature* para *wave*.

**Semi-auto:** o `wave-tmux.sh` organiza; o `wave-dispatch.sh` dispara `claude` + `implement-feature → evaluator` em cada painel respeitando `--max-parallel` (fila automática) — mas só **depois** de um **gate de segurança de BD** obrigatório. Consolida tudo em `wave-status.md`.

> Não é o dispatcher 100% desatendido do curso. O gate de BD dev (o `.env` aponta para produção) obriga a confirmação humana antes de qualquer disparo — ver "Modo semi-auto e o gate" abaixo.

Invoca via skill: `implement-and-evaluate-tmux` (o Claude corre os 3 passos: organizar → gate → disparar → consolidar).

---

## Pré-requisitos

1. **tmux:** `brew install tmux` (não vem instalado).
2. **node + git** (já tens).
3. **⚠️ Base de dados de DEV (crítico).** O `.env` aponta para o **Atlas de PRODUÇÃO**. O runner copia o `.env` para cada worktree — **troca o `MONGODB_URI` para uma BD de dev** antes de subir servidores ou correr o `/evaluator` (que sobe a app + Playwright e mexe em dados). Os testes unitários usam `mongodb-memory-server` (seguros); a avaliação de UI **não**.

---

## Uso

```bash
# por número de wave
scripts/tools/wave-tmux.sh PRDProgress-rgpd.json 1

# por features explícitas (de qualquer wave)
scripts/tools/wave-tmux.sh PRDProgress-disponibilidade.json F03 F04

# anexar à sessão criada
tmux attach -t marcai-wave
```

O 1.º argumento é o tracking (`PRDProgress-*.json` em `docs/produto/`, ou caminho completo); o resto é a wave ou a lista de features.

---

## O que cria

- **Worktrees** em `../marcai-worktrees/<ID>-<slug>/`, cada um na sua branch `feat/<ID>-<slug>` (a partir do `HEAD` actual).
- **Sessão tmux `marcai-wave`** com:
  - **Janela 0 — dashboard:** estado de cada worktree (branch, nº de alterações, janela viva).
  - **Uma janela por feature** (nome = `F0X`), com 3 painéis:
    - **Esquerda:** banner com o contexto + os comandos prontos (`claude` → `/implement-feature` → `/evaluator`). Portas sugeridas pré-exportadas (`PORT`).
    - **Sup. direito:** painel de logs (corres aqui `npm run dev` etc.).
    - **Inf. direito:** portas TCP à escuta do bloco daquela feature.

Portas por feature (evita colisões): backend `5101+i`, frontend `5201+i`, ia `8101+i`.

---

## Fluxo semi-auto (o que a skill faz)

```bash
# 1) organizar: worktrees + branches + janelas tmux (idempotente)
scripts/tools/wave-tmux.sh PRDProgress-rgpd.json 1

# 2) GATE HUMANO: em cada ../marcai-worktrees/<ID>-<slug>/.env trocar
#    MONGODB_URI para uma BD de DEV. Ver o plano + resultado do gate:
scripts/tools/wave-dispatch.sh PRDProgress-rgpd.json 1 --dry-run

# 3) disparar (só depois de trocar as BDs): claude + implement→evaluate por painel
scripts/tools/wave-dispatch.sh PRDProgress-rgpd.json 1 --max-parallel 3 --yes

# 4) consolidar a qualquer momento
scripts/tools/wave-status.sh PRDProgress-rgpd.json 1
```

O `wave-dispatch.sh` **recusa disparar** enquanto algum worktree tiver `MONGODB_URI` de produção (marcador `5sar5yx`; override `WAVE_PROD_DB_MARKER`). Deteta conclusão pelo aparecimento de `eval-report.md`, faz soft-fail `/exit` aos painéis terminados, e puxa a próxima feature da fila. Falhas são **localizadas** — uma feature não derruba as outras.

Podes sempre operar manualmente dentro de cada painel: `claude` → `/implement-feature <tracking> F0X` → `/evaluator`. Vês o dashboard (Ctrl-b 0); Ctrl-b `<n>` muda de janela; Ctrl-b `d` desanexa (a sessão continua viva).

**Limpeza opt-in:** por defeito os worktrees ficam preservados para revisão. `--cleanup-done` remove worktree+branch das features concluídas com sucesso; timeouts/falhas ficam sempre preservados.

---

## Cuidados conhecidos (deste projecto)

- **Conflitos de merge:** o isolamento por worktree evita a bagunça **local**, mas **não** os conflitos no GitHub quando duas features mexem nos mesmos ficheiros (ex.: `registry.js`, `app.js`, `CriarAgendamento.jsx` cruzam RGPD↔Disponibilidade). Sequencia ou coordena essas.
- **3 serviços:** algumas features tocam backend + ia-service + frontend; sobe só o que a feature precisa, nas portas do bloco.
- **Limpeza:** `tmux kill-session -t marcai-wave` termina a sessão; `git worktree remove ../marcai-worktrees/<...>` + `git worktree prune` limpam worktrees.

---

## Modo semi-auto e o gate (e não 100% desatendido)

O dispatcher 100% desatendido do curso pressupõe um harness **maduro**: ambiente isolado e seguro por execução. No Marcai o `.env` aponta para **produção** e o `evaluator` sobe a app + Playwright, tocando dados. Por isso o modo é **semi-auto**: a skill dispara os times automaticamente (fila `--max-parallel`, soft-fail, consolidação), mas **só depois de o gate de BD passar**. É a diferença entre "organização paralela" e "correr eval contra produção sem ninguém a ver".

Evoluir para desatendido pede: (1) BD de dev por worktree provisionada automaticamente, (2) bloco de portas/serviços estabilizado, (3) passo de PR automático. Até lá, o gate humano fica.

> ⚠️ **Valida o layout tmux + o disparo** na primeira wave real após `brew install tmux`. Verificado: parser de features, sintaxe (bash 3.2), gate de segurança, geração do `wave-status.md`, guards do dispatcher. Por verificar em ambiente vivo: o `send-keys` para o TUI do Claude (timing `WAVE_CLAUDE_WARMUP`) e a deteção de `eval-report.md`.
