#!/usr/bin/env bash
#
# wave-dispatch.sh — dispatcher SEMI-AUTO da wave (harness Marcai)
#
# Depois de o wave-tmux.sh ter criado os worktrees + janelas tmux, este script:
#   1. GATE DE SEGURANÇA: verifica o MONGODB_URI de cada worktree e RECUSA
#      disparar se algum ainda apontar para o cluster de PRODUÇÃO.
#   2. Dispara `claude` + a instrução implement→evaluate no painel principal de
#      cada feature, respeitando --max-parallel (fila automática).
#   3. Deteta conclusão (aparecimento de eval-report.md), faz soft-fail `/exit`
#      aos painéis que já terminaram, e puxa a próxima feature da fila.
#   4. No fim, consolida tudo com wave-status.sh.
#
# É SEMI-AUTO por opção: no Marcai o .env aponta para o Atlas de PRODUÇÃO e o
# evaluator sobe a app + Playwright. O gate obriga-te a confirmar a BD de DEV
# antes de qualquer disparo. NÃO abre PRs e NÃO apaga worktrees por defeito.
#
# Uso:
#   scripts/tools/wave-dispatch.sh <tracking.json> <wave|F01 F02 ...> [opções]
# Opções:
#   --max-parallel N   times simultâneos (default 3)
#   --timeout SECS     tempo máx. por feature antes de marcar timeout (default 1800)
#   --yes              confirma que já trocaste o MONGODB_URI p/ DEV e dispara
#   --cleanup-done     remove worktree+branch das features concluídas com sucesso
#   --dry-run          só mostra o plano e o resultado do gate; não dispara
#
# Exemplos:
#   scripts/tools/wave-dispatch.sh PRDProgress-rgpd.json 1 --dry-run
#   scripts/tools/wave-dispatch.sh PRDProgress-rgpd.json 1 --max-parallel 2 --yes
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="marcai-wave"
WT_ROOT="$REPO_ROOT/../marcai-worktrees"
# Marcador do cluster Atlas de PRODUÇÃO (ver memória/infra). Override via env.
PROD_DB_MARKER="${WAVE_PROD_DB_MARKER:-5sar5yx}"
WARMUP="${WAVE_CLAUDE_WARMUP:-8}"     # segundos à espera do TUI do Claude arrancar
POLL="${WAVE_POLL:-15}"               # intervalo de sondagem (s)

MAX_PARALLEL=3; TIMEOUT=1800; ASSUME_YES=0; CLEANUP_DONE=0; DRY_RUN=0
# Texto extra (guardrails de segurança, contexto) apenso à instrução de cada time.
EXTRA_PROMPT="${WAVE_EXTRA_PROMPT:-}"

[ "${1:-}" ] || { echo "uso: wave-dispatch.sh <tracking.json> <wave|F01 ...> [--max-parallel N] [--yes] [--dry-run]"; exit 1; }
TRACKING="$1"; shift
[ -f "$TRACKING" ] || TRACKING="$REPO_ROOT/docs/produto/$TRACKING"
[ -f "$TRACKING" ] || { echo "❌ tracking não encontrado: $TRACKING"; exit 1; }

SEL=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --max-parallel) MAX_PARALLEL="${2:-3}"; shift 2;;
    --timeout)      TIMEOUT="${2:-1800}"; shift 2;;
    --yes)          ASSUME_YES=1; shift;;
    --cleanup-done) CLEANUP_DONE=1; shift;;
    --dry-run)      DRY_RUN=1; shift;;
    *)              SEL+=("$1"); shift;;
  esac
done
[ "${#SEL[@]}" -ge 1 ] || { echo "❌ indica a wave (número) ou as features (F01 F02 ...)"; exit 1; }

command -v tmux >/dev/null || { echo "❌ tmux não instalado."; exit 1; }
tmux has-session -t "$SESSION" 2>/dev/null || {
  echo "❌ sessão tmux '$SESSION' não existe. Corre primeiro:"
  echo "   scripts/tools/wave-tmux.sh $(basename "$TRACKING") ${SEL[*]}"; exit 1; }

PRD_REL="${TRACKING#$REPO_ROOT/}"

# --- resolve features: id \t slug \t specrel ---
IDS=(); SLUGS=(); SPECS=()
while IFS=$'\t' read -r id slug spec; do
  [ -n "$id" ] || continue
  IDS+=("$id"); SLUGS+=("$slug"); SPECS+=("$spec")
done < <(node -e '
  const fs=require("fs");
  const file=process.argv[1], sel=process.argv.slice(2);
  const feats=(JSON.parse(fs.readFileSync(file,"utf8")).features)||{};
  const wave=(sel.length===1 && /^[0-9]+$/.test(sel[0]))?Number(sel[0]):null;
  const ids =wave===null?new Set(sel.map(s=>s.toUpperCase())):null;
  for(const [id,f] of Object.entries(feats)){
    const ok=wave!==null?Number(f.wave)===wave:ids.has(id.toUpperCase());
    if(!ok) continue;
    const spec=(f.spec||"").replace(/\/$/,"");
    const base=(spec.split("/").pop())||id;
    const slug=base.replace(/^F[0-9]+-/i,"")||id;
    process.stdout.write(id+"\t"+slug+"\t"+spec+"\n");
  }
' "$TRACKING" "${SEL[@]}")
[ "${#IDS[@]}" -ge 1 ] || { echo "❌ nenhuma feature corresponde a: ${SEL[*]}"; exit 1; }

echo "Features: ${IDS[*]}   ·   max-parallel: $MAX_PARALLEL   ·   timeout: ${TIMEOUT}s"

# ─────────────────────────────────────────────────────────────────────────────
# GATE DE SEGURANÇA — nenhum worktree pode apontar para a BD de produção
# ─────────────────────────────────────────────────────────────────────────────
unsafe=()
for idx in "${!IDS[@]}"; do
  WT="$WT_ROOT/${IDS[$idx]}-${SLUGS[$idx]}"
  ENVF="$WT/.env"
  [ -f "$ENVF" ] || continue
  uri="$(grep -E '^MONGODB_URI=' "$ENVF" 2>/dev/null | head -1)"
  if printf '%s' "$uri" | grep -q "$PROD_DB_MARKER"; then
    unsafe+=("${IDS[$idx]}")
  fi
done

if [ "${#unsafe[@]}" -gt 0 ]; then
  echo
  echo "🛑 GATE DE SEGURANÇA: MONGODB_URI ainda aponta para PRODUÇÃO (marcador '$PROD_DB_MARKER') em: ${unsafe[*]}"
  echo "   O evaluator sobe a app + Playwright e mexe em dados. Troca cada .env para uma BD de DEV:"
  for id in "${unsafe[@]}"; do
    for idx in "${!IDS[@]}"; do [ "${IDS[$idx]}" = "$id" ] && echo "     $WT_ROOT/${id}-${SLUGS[$idx]}/.env"; done
  done
  echo "   (Se a tua BD de dev legítima contém o marcador, força com WAVE_PROD_DB_MARKER=<outro> ou =__none__.)"
  exit 2
fi
echo "✅ Gate de segurança OK — nenhum worktree aponta para produção."

# --- painel principal (top-left) de uma janela de feature ---
main_pane() { tmux list-panes -t "$SESSION:$1" -F '#{pane_id} #{pane_left} #{pane_top}' 2>/dev/null | awk '$2==0 && $3==0 {print $1; exit}'; }
report_path() {
  local exact="$WT_ROOT/${IDS[$1]}-${SLUGS[$1]}/${SPECS[$1]}/eval-report.md"
  if [ -f "$exact" ]; then echo "$exact"; return; fi
  # Fallback: o campo "spec" do tracking pode estar desatualizado (ex.: docs movidos).
  # Localiza o eval-report onde quer que a feature o tenha escrito no worktree.
  find "$WT_ROOT/${IDS[$1]}-${SLUGS[$1]}" -type f -name eval-report.md -path "*${IDS[$1]}*" 2>/dev/null | head -1
}

if [ "$DRY_RUN" = 1 ] || [ "$ASSUME_YES" != 1 ]; then
  echo
  echo "PLANO (semi-auto):"
  for idx in "${!IDS[@]}"; do
    echo "  • ${IDS[$idx]}  →  janela '$(main_pane "${IDS[$idx]}")'  →  /implement-feature $PRD_REL ${IDS[$idx]}  +  /evaluator"
  done
  echo
  if [ "$DRY_RUN" = 1 ]; then echo "(--dry-run) nada disparado."; exit 0; fi
  echo "Para disparar (confirma que já trocaste os MONGODB_URI para DEV):"
  echo "   scripts/tools/wave-dispatch.sh $(basename "$TRACKING") ${SEL[*]} --max-parallel $MAX_PARALLEL --yes"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# DISPATCH — fila com no máx. MAX_PARALLEL times simultâneos
# ─────────────────────────────────────────────────────────────────────────────
N="${#IDS[@]}"
STATE=(); START=()
for idx in $(seq 0 $((N-1))); do STATE[$idx]="queued"; START[$idx]=0; done

fire() {
  local idx="$1" ID="${IDS[$1]}" pane
  pane="$(main_pane "$ID")"
  if [ -z "$pane" ]; then echo "  ⚠️ $ID: painel não encontrado (janela existe?) — a saltar."; STATE[$idx]="error"; return; fi
  local prompt="Implementa e avalia a feature $ID. 1) Corre a skill implement-feature com \"$PRD_REL $ID\". 2) Quando terminar, corre a skill evaluator para $ID (gera eval-report.md + screenshots e atualiza $PRD_REL). Segue CLAUDE.md e as regras do projeto. Nao abras PR.${EXTRA_PROMPT:+ $EXTRA_PROMPT}"
  echo "  ▶ $ID: a arrancar claude no painel $pane"
  tmux send-keys -t "$pane" "claude" C-m
  sleep "$WARMUP"
  # O TUI do Claude usa bracketed-paste: enviar o prompt e o C-m juntos NÃO submete
  # (o Enter é absorvido pela colagem). Enviar o texto, esperar, e só depois um Enter.
  tmux send-keys -t "$pane" "$prompt"
  sleep 1
  tmux send-keys -t "$pane" Enter
  STATE[$idx]="running"; START[$idx]="$(date +%s)"
}

running_count() { local c=0 s; for s in "${STATE[@]}"; do [ "$s" = "running" ] && c=$((c+1)); done; echo "$c"; }

echo
echo "🚀 Dispatch iniciado. (Ctrl-C aqui NÃO mata os times — vivem no tmux.)"
while :; do
  # lança enquanto houver slot livre e features na fila
  while [ "$(running_count)" -lt "$MAX_PARALLEL" ]; do
    next=-1
    for idx in $(seq 0 $((N-1))); do [ "${STATE[$idx]}" = "queued" ] && { next=$idx; break; }; done
    [ "$next" -lt 0 ] && break
    fire "$next"
  done

  # alguma coisa ainda a correr ou na fila?
  pend=0
  for idx in $(seq 0 $((N-1))); do
    case "${STATE[$idx]}" in queued|running) pend=$((pend+1));; esac
  done
  [ "$pend" -eq 0 ] && break

  sleep "$POLL"

  now="$(date +%s)"
  for idx in $(seq 0 $((N-1))); do
    [ "${STATE[$idx]}" = "running" ] || continue
    ID="${IDS[$idx]}"; rp="$(report_path "$idx")"
    if [ -f "$rp" ]; then
      echo "  ✅ $ID: eval-report.md detetado — concluída."
      STATE[$idx]="done"
      # soft-fail: se o Claude não saiu sozinho, força /exit para libertar o painel
      pane="$(main_pane "$ID")"; [ -n "$pane" ] && tmux send-keys -t "$pane" "/exit" C-m 2>/dev/null || true
    elif [ $((now - START[idx])) -ge "$TIMEOUT" ]; then
      echo "  ⏱️  $ID: timeout (${TIMEOUT}s) — worktree preservado para inspeção."
      STATE[$idx]="timeout"
    fi
  done
done

echo
echo "🏁 Dispatch terminado. A consolidar wave-status.md…"
bash "$REPO_ROOT/scripts/tools/wave-status.sh" "$TRACKING" "${SEL[@]}" "$SESSION" || true

# --- limpeza opcional dos concluídos com sucesso ---
if [ "$CLEANUP_DONE" = 1 ]; then
  echo
  echo "🧹 --cleanup-done: a remover worktrees das features concluídas…"
  for idx in $(seq 0 $((N-1))); do
    [ "${STATE[$idx]}" = "done" ] || continue
    WT="$WT_ROOT/${IDS[$idx]}-${SLUGS[$idx]}"; BR="feat/${IDS[$idx]}-${SLUGS[$idx]}"
    win="${IDS[$idx]}"
    tmux kill-window -t "$SESSION:$win" 2>/dev/null || true
    git -C "$REPO_ROOT" worktree remove --force "$WT" 2>/dev/null && echo "   removido worktree $WT" || true
    git -C "$REPO_ROOT" branch -D "$BR" 2>/dev/null && echo "   removida branch $BR" || true
  done
fi

echo
echo "Resumo:"
for idx in $(seq 0 $((N-1))); do printf "  %-6s %s\n" "${IDS[$idx]}" "${STATE[$idx]}"; done
echo "Worktrees preservados em $WT_ROOT/ (salvo os limpos). Relatório: $WT_ROOT/wave-status.md"
