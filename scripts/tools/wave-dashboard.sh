#!/usr/bin/env bash
#
# wave-dashboard.sh — painel da janela 0 do runner tmux (ver wave-tmux.sh).
# Mostra o estado de cada worktree da wave: branch, alterações por commitar,
# e se a janela tmux correspondente está viva. Refresca a cada 3s.
#
# Uso (chamado pelo wave-tmux.sh):  wave-dashboard.sh <session>
#
set -uo pipefail
SESSION="${1:-marcai-wave}"
WT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/../marcai-worktrees"

while true; do
  clear
  echo "═══════════════════════════════════════════════════════════════════════"
  echo "  ⚡ Marcai Wave Dashboard   ·   sessão: $SESSION   ·   $(date '+%H:%M:%S')"
  echo "═══════════════════════════════════════════════════════════════════════"
  echo
  printf "  %-26s %-26s %-9s %s\n" "WORKTREE" "BRANCH" "CHANGES" "JANELA"
  printf "  %-26s %-26s %-9s %s\n" "--------" "------" "-------" "------"
  if [ -d "$WT_ROOT" ] && ls "$WT_ROOT"/*/ >/dev/null 2>&1; then
    for d in "$WT_ROOT"/*/; do
      [ -d "$d" ] || continue
      name="$(basename "$d")"
      br="$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
      ch="$(git -C "$d" status --porcelain 2>/dev/null | grep -c . || echo 0)"
      fid="${name%%-*}"
      if tmux list-windows -t "$SESSION" -F '#{window_name}' 2>/dev/null | grep -qx "$fid"; then
        win="● viva"
      else
        win="—"
      fi
      printf "  %-26s %-26s %-9s %s\n" "$name" "$br" "$ch" "$win"
    done
  else
    echo "  (sem worktrees ainda — corre wave-tmux.sh primeiro)"
  fi
  echo
  echo "  Ciclo por janela:  claude → /implement-feature → /evaluator"
  echo "  Sair: tmux kill-session -t $SESSION   ·   limpar worktrees: git worktree prune"
  sleep 3
done
