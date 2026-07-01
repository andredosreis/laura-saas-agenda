#!/usr/bin/env bash
#
# wave-tmux.sh — workspaces paralelos SUPERVISIONADOS por feature (harness Marcai)
#
# Cria, para cada feature de uma wave: um git WORKTREE + BRANCH isolados e uma
# JANELA tmux de 3 painéis (Claude | logs | portas). NÃO corre nada sozinho —
# deixa tudo pronto para TU disparares o /implement-feature e o /evaluator.
#
# Uso:
#   scripts/tools/wave-tmux.sh <tracking.json> <wave-number | F01 F02 ...>
# Exemplos:
#   scripts/tools/wave-tmux.sh PRDProgress-rgpd.json 1            # wave 1 do RGPD
#   scripts/tools/wave-tmux.sh PRDProgress-disponibilidade.json F01 F02
#
# Pré-requisitos: tmux (brew install tmux), node, git.
# ⚠️ SEGURANÇA: o .env aponta para o cluster Atlas de PRODUÇÃO. Cada worktree
#    recebe uma cópia do .env — TROCA o MONGODB_URI para uma BD de DEV antes de
#    correr `npm run dev` ou o evaluator (que sobe a app + Playwright).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION="marcai-wave"
WT_ROOT="$REPO_ROOT/../marcai-worktrees"

command -v tmux >/dev/null || { echo "❌ tmux não instalado. Corre: brew install tmux"; exit 1; }
command -v node >/dev/null || { echo "❌ node não encontrado."; exit 1; }

[ "${1:-}" ] || { echo "uso: wave-tmux.sh <tracking.json> <wave|F01 F02 ...>"; exit 1; }
TRACKING="$1"; shift
[ -f "$TRACKING" ] || TRACKING="$REPO_ROOT/docs/produto/$TRACKING"
[ -f "$TRACKING" ] || { echo "❌ tracking não encontrado: $TRACKING"; exit 1; }
[ "$#" -ge 1 ] || { echo "❌ indica a wave (número) ou as features (F01 F02 ...)"; exit 1; }

# --- resolve features (id + slug a partir do campo "spec") via node ---
IDS=(); SLUGS=()
while IFS=$'\t' read -r id slug; do
  [ -n "$id" ] || continue
  IDS+=("$id"); SLUGS+=("$slug")
done < <(node -e '
  const fs=require("fs");
  const file=process.argv[1], sel=process.argv.slice(2); // node -e: argv[1] já é o 1.º arg
  const feats=(JSON.parse(fs.readFileSync(file,"utf8")).features)||{};
  const wave = (sel.length===1 && /^[0-9]+$/.test(sel[0])) ? Number(sel[0]) : null;
  const ids  = wave===null ? new Set(sel.map(s=>s.toUpperCase())) : null;
  for (const [id,f] of Object.entries(feats)) {
    const ok = wave!==null ? Number(f.wave)===wave : ids.has(id.toUpperCase());
    if(!ok) continue;
    const base=((f.spec||"").replace(/\/$/,"").split("/").pop())||id;
    const slug=base.replace(/^F[0-9]+-/i,"")||id;
    process.stdout.write(id+"\t"+slug+"\n");
  }
' "$TRACKING" "$@")

[ "${#IDS[@]}" -ge 1 ] || { echo "❌ nenhuma feature corresponde a: $* (em $TRACKING)"; exit 1; }
echo "Features: ${IDS[*]}"

tmux has-session -t "$SESSION" 2>/dev/null && {
  echo "ℹ️  sessão '$SESSION' já existe. Anexa: tmux attach -t $SESSION (ou: tmux kill-session -t $SESSION)"; exit 1; }

mkdir -p "$WT_ROOT"

# --- janela 0: dashboard ---
tmux new-session -d -s "$SESSION" -n dashboard -c "$REPO_ROOT"
tmux send-keys -t "$SESSION:dashboard" "bash scripts/tools/wave-dashboard.sh $SESSION" C-m

PRD_REL="${TRACKING#$REPO_ROOT/}"
i=0
for idx in "${!IDS[@]}"; do
  ID="${IDS[$idx]}"; SLUG="${SLUGS[$idx]}"; i=$((i+1))
  WT="$WT_ROOT/${ID}-${SLUG}"
  BR="feat/${ID}-${SLUG}"
  BPORT=$((5100 + i)); FPORT=$((5200 + i)); IAPORT=$((8100 + i))

  # worktree + branch (idempotente)
  if [ ! -d "$WT" ]; then
    git -C "$REPO_ROOT" worktree add -b "$BR" "$WT" HEAD >/dev/null 2>&1 \
      || git -C "$REPO_ROOT" worktree add "$WT" "$BR" >/dev/null
    [ -f "$REPO_ROOT/.env" ] && cp "$REPO_ROOT/.env" "$WT/.env"
    [ -f "$REPO_ROOT/laura-saas-frontend/.env" ] && cp "$REPO_ROOT/laura-saas-frontend/.env" "$WT/laura-saas-frontend/.env" 2>/dev/null || true
  fi

  # janela de 3 painéis (pane ids robustos)
  main=$(tmux new-window -P -F '#{pane_id}' -t "$SESSION" -n "$ID" -c "$WT")
  right=$(tmux split-window -h -P -F '#{pane_id}' -t "$main" -c "$WT")
  ports=$(tmux split-window -v -P -F '#{pane_id}' -t "$right" -c "$WT")

  # painel principal: banner + comandos prontos (NÃO auto-corre)
  tmux send-keys -t "$main" "clear; cat <<'B'
┌────────────────────────────────────────────────────────────────┐
│  Feature ${ID}  ·  branch ${BR}
│  spec:  ${PRD_REL%/*}/features-*/${ID}-${SLUG}/
│  Portas sugeridas:  backend ${BPORT}  ·  frontend ${FPORT}  ·  ia ${IAPORT}
│
│  ⚠️  O .env copiado aponta para PRODUÇÃO. Troca MONGODB_URI para
│      uma BD de DEV antes de subir servidores ou correr o evaluator.
│
│  Passos (supervisionado — corre tu):
│    1) claude
│    2) /implement-feature ${PRD_REL} ${ID}
│    3) /evaluator   (gera eval-report.md + screenshots)
└────────────────────────────────────────────────────────────────┘
B" C-m
  tmux send-keys -t "$main" "export PORT=${BPORT}" C-m

  # painel logs (sup. dir.)
  tmux send-keys -t "$right" "clear; echo 'LOGS — ex.: PORT=${BPORT} npm run dev   |   (cd laura-saas-frontend && npm run dev -- --port ${FPORT})'" C-m

  # painel portas (inf. dir.) — loop sem 'watch' (não existe no macOS)
  tmux send-keys -t "$ports" "while true; do clear; echo 'PORTAS (${BPORT}/${FPORT}/${IAPORT}):'; lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -E ':(${BPORT}|${FPORT}|${IAPORT})\\b' || echo '  (nenhuma a escutar ainda)'; sleep 3; done" C-m

  tmux select-pane -t "$main"
done

tmux select-window -t "$SESSION:dashboard"
echo "✅ Pronto. Anexa com:  tmux attach -t $SESSION"
echo "   (Ctrl-b <número> muda de janela · Ctrl-b d desanexa)"
