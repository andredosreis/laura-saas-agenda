#!/usr/bin/env bash
#
# wave-status.sh — consolida o estado de uma wave num único wave-status.md
#
# Percorre os worktrees da wave e, por feature, reporta: branch, alterações por
# commitar, se a janela tmux está viva, e o veredicto da avaliação (presença de
# eval-report.md + contagem de pass/fail). Substitui o "caçar resultado em
# várias janelas, logs e worktrees" — é o relatório único da execução.
#
# Uso:
#   scripts/tools/wave-status.sh <tracking.json> <wave-number | F01 F02 ...> [session]
# Exemplos:
#   scripts/tools/wave-status.sh PRDProgress-rgpd.json 1
#   scripts/tools/wave-status.sh PRDProgress-disponibilidade.json F03 F04 marcai-wave
#
# Gera:  ../marcai-worktrees/wave-status.md  (e imprime no terminal).
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WT_ROOT="$REPO_ROOT/../marcai-worktrees"

[ "${1:-}" ] || { echo "uso: wave-status.sh <tracking.json> <wave|F01 F02 ...> [session]"; exit 1; }
TRACKING="$1"; shift
[ -f "$TRACKING" ] || TRACKING="$REPO_ROOT/docs/produto/$TRACKING"
[ -f "$TRACKING" ] || { echo "❌ tracking não encontrado: $TRACKING"; exit 1; }

# último argumento pode ser a sessão tmux (se não parecer feature/wave)
SESSION="marcai-wave"
ARGS=("$@")
last="${ARGS[${#ARGS[@]}-1]}"
if [ "${#ARGS[@]}" -ge 2 ] && ! [[ "$last" =~ ^([0-9]+|[Ff][0-9]+)$ ]]; then
  SESSION="$last"; unset 'ARGS[${#ARGS[@]}-1]'
fi
[ "${#ARGS[@]}" -ge 1 ] || { echo "❌ indica a wave (número) ou as features (F01 F02 ...)"; exit 1; }

# --- resolve features: id \t slug \t specrel ---
resolve() {
  node -e '
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
  ' "$TRACKING" "${ARGS[@]}"
}

IDS=(); SLUGS=(); SPECS=()
while IFS=$'\t' read -r id slug spec; do
  [ -n "$id" ] || continue
  IDS+=("$id"); SLUGS+=("$slug"); SPECS+=("$spec")
done < <(resolve)
[ "${#IDS[@]}" -ge 1 ] || { echo "❌ nenhuma feature corresponde a: ${ARGS[*]} (em $TRACKING)"; exit 1; }

mkdir -p "$WT_ROOT"
OUT="$WT_ROOT/wave-status.md"
PRD_REL="${TRACKING#$REPO_ROOT/}"

{
  echo "# Wave Status — $(basename "$TRACKING")"
  echo
  echo "- **Features:** ${IDS[*]}"
  echo "- **Sessão tmux:** \`$SESSION\`"
  echo "- **Gerado:** $(date '+%Y-%m-%d %H:%M:%S')"
  echo "- **Worktrees:** \`$WT_ROOT/\`"
  echo
  echo "| Feature | Branch | Estado | Eval | Alterações | Janela |"
  echo "|---|---|---|---|---|---|"
} > "$OUT"

done_n=0; fail_n=0; pending_n=0
for idx in "${!IDS[@]}"; do
  ID="${IDS[$idx]}"; SLUG="${SLUGS[$idx]}"; SPEC="${SPECS[$idx]}"
  WT="$WT_ROOT/${ID}-${SLUG}"
  BR="feat/${ID}-${SLUG}"
  REPORT="$WT/${SPEC}/eval-report.md"

  if [ ! -d "$WT" ]; then
    estado="sem worktree"; eval_col="—"; ch="—"
    pending_n=$((pending_n+1))
  else
    ch="$(git -C "$WT" status --porcelain 2>/dev/null | grep -c . | tr -d ' ')"
    if [ -f "$REPORT" ]; then
      fails="$(grep -ciE '\b(fail|failed|falhou|reprovad)' "$REPORT" 2>/dev/null | tr -d ' ')"
      passes="$(grep -ciE '\b(pass|passed|passou|aprovad)' "$REPORT" 2>/dev/null | tr -d ' ')"
      if [ "${fails:-0}" -gt 0 ]; then
        estado="⚠️ eval c/ falhas"; fail_n=$((fail_n+1))
      else
        estado="✅ concluída"; done_n=$((done_n+1))
      fi
      eval_col="${passes:-0}✓ / ${fails:-0}✗"
    else
      estado="⏳ a correr / pendente"; eval_col="—"; pending_n=$((pending_n+1))
    fi
  fi

  if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$ID"; then
    win="● viva"
  else
    win="○ —"
  fi

  echo "| \`$ID\` $SLUG | \`$BR\` | $estado | $eval_col | $ch | $win |" >> "$OUT"
done

{
  echo
  echo "## Resumo"
  echo
  echo "- ✅ Concluídas: **$done_n**"
  echo "- ⚠️ Com falhas na avaliação: **$fail_n**  → inspecionar worktree + \`eval-report.md\`"
  echo "- ⏳ Pendentes / a correr: **$pending_n**"
  echo
  echo "> Worktrees preservados para inspeção. Para limpar os concluídos:"
  echo "> \`scripts/tools/wave-dispatch.sh $PRD_REL ${ARGS[*]} --cleanup-done\`"
  echo "> ou manualmente: \`git worktree remove <path> && git branch -D <branch>\`"
} >> "$OUT"

echo "✅ wave-status escrito em: $OUT"
echo "   Concluídas: $done_n · Falhas: $fail_n · Pendentes: $pending_n"
cat "$OUT"
