---
name: implement-and-evaluate-tmux
description: Runs a whole PRD wave in parallel instead of one feature at a time. For each feature in the wave it creates an isolated git worktree + branch + a 3-pane tmux window (Claude | logs | ports), then acts as a SEMI-AUTO dispatcher — after a mandatory DEV-database safety gate — firing implement-feature → evaluator in each pane, capped by --max-parallel, and consolidating everything into wave-status.md. It is a wrapper around the implement-feature and evaluator skills; it does NOT reimplement their logic. Part of the Harness Engineering method — use when several features of a wave are specified and ready.
---

# Implement and Evaluate — TMUX (Wave Dispatcher)

You are the **wave dispatcher**. Where `implement-feature` + `evaluator` operate on *one feature*, this skill changes the **unit of work to a whole wave**: it distributes the wave across independent teams (one worktree + branch + tmux window each), runs them in parallel, and consolidates the results.

> **The intelligence stays in `implement-feature` and `evaluator`.** This skill only *organises and dispatches* — it does not supervise each cycle, does not decide how a team fixes something, does not rewrite intermediate artifacts, and does not open PRs. It fires the teams and tracks status to consolidate.

The mental model (course "Implement and Evaluate TMUX", adapted to Marcaí):

```
Dispatcher (tmux)
  ├─ Feature A (worktree/branch/window): implement-feature → evaluator
  ├─ Feature B (worktree/branch/window): implement-feature → evaluator
  └─ Feature C (worktree/branch/window): implement-feature → evaluator
```

One feature = one worktree = one branch = one tmux window. **Isolation is the point:** teams never step on each other's local checkout. (Conflicts can still surface later on GitHub if two features touch the same files — that is a merge concern, not a local one.)

---

## WHEN TO USE

- A wave has **several features already Specified** (spec.md / plan.md / contract.md exist) and you want to implement+evaluate them together instead of one by one.
- You accept **reviewing afterwards** (the new bottleneck is human review, not code generation).

Do **not** use it for a single feature (use `/implement-feature` + `/evaluator` directly), or when features in the wave depend on each other in the same files (run those serially with `--max-parallel 1`).

---

## INPUT

- A **tracking file**: `docs/produto/PRDProgress-*.json` (or a full path). Each feature has `wave`, `spec`, `status`.
- A **selection**: a wave number (`1`) or explicit feature IDs (`F03 F04`).
- Optional: `--max-parallel N` (default **3**), `--timeout SECS` (default 1800).

---

## ⚠️ MARCAÍ SAFETY RULE (non-negotiable)

The repo `.env` points at the **PRODUCTION** MongoDB Atlas cluster, and `evaluator` boots the app + Playwright and touches data. Therefore this skill is **SEMI-AUTO**: it never fires the teams until the DEV-database gate passes.

- `wave-tmux.sh` copies `.env` into each worktree — you MUST change each worktree's `MONGODB_URI` to a **DEV** database before dispatching.
- `wave-dispatch.sh` enforces this: it **refuses to fire** while any worktree's `MONGODB_URI` still matches the production marker (`5sar5yx`, override with `WAVE_PROD_DB_MARKER`).
- Unit tests use `mongodb-memory-server` (safe). The UI evaluation does **not** — hence the gate.

---

## EXECUTION FLOW

### 1. Resolve & validate the wave
- Read the tracking file. Confirm the selected features exist and are `Specified` (or beyond). If a feature has unmet PRD dependencies, say so — do not silently include it.
- Report the resolved feature list back to the user before doing anything heavy.

### 2. Build the isolated environments
Run the builder (idempotent — safe to re-run):
```bash
scripts/tools/wave-tmux.sh <tracking.json> <wave|F01 F02 ...>
```
This creates, per feature: a worktree at `../marcai-worktrees/<ID>-<slug>/` on branch `feat/<ID>-<slug>`, and a tmux window (session `marcai-wave`) with **3 panes** — main (left, runs Claude), logs (top-right), ports (bottom-right). Window 0 is the **dashboard** (`wave-dashboard.sh`).

### 3. Human safety gate (STOP here)
Tell the user explicitly to open each worktree's `.env` and switch `MONGODB_URI` to a DEV database, then confirm. Verify with a dry-run, which also prints the dispatch plan:
```bash
scripts/tools/wave-dispatch.sh <tracking.json> <wave|F01 ...> --dry-run
```
If the gate reports any worktree still on production, **do not proceed** — surface it and wait.

### 4. Dispatch (semi-auto, capped by max-parallel)
Once the user confirms DEV databases:
```bash
scripts/tools/wave-dispatch.sh <tracking.json> <wave|F01 ...> --max-parallel 3 --yes
```
The dispatcher re-runs the safety gate, then fires `claude` + a single implement→evaluate instruction into each feature's main pane, running at most `--max-parallel` teams at a time and pulling the next from the queue as slots free. A failure is **localised** — one team failing or timing out never blocks the others.

### 5. Consolidate
On finish (or any time), produce the single report:
```bash
scripts/tools/wave-status.sh <tracking.json> <wave|F01 ...>
```
`wave-status.md` (in `../marcai-worktrees/`) lists per feature: branch, state, eval verdict (pass/fail counts from `eval-report.md`), uncommitted changes, and whether the tmux window is alive.

### 6. Cleanup (opt-in only)
By default **worktrees are preserved** for inspection and human review. Only when the user asks, clean up the successfully-finished ones:
```bash
scripts/tools/wave-dispatch.sh <tracking.json> <wave|F01 ...> --cleanup-done
```
Timed-out / failed worktrees are always preserved.

---

## SOFT FAILS (handle, don't panic)

- **Idle-stuck Claude TUI:** a team finishes (eval-report.md appears) but the Claude TUI doesn't exit, leaving the pane "busy". The dispatcher sends `/exit` to that pane to free it. If you see stuck panes, that is the expected remedy.
- **Timeout:** a team exceeds `--timeout`. Its worktree is preserved for manual inspection; the slot is freed for the next feature.
- **Merge conflicts:** not this skill's job — isolation prevents *local* clobbering, not GitHub conflicts. Flag them for review.

---

## OUTPUT

Report to the user:
1. The resolved wave and the tmux session name (`marcai-wave`) with how to attach (`tmux attach -t marcai-wave`; `Ctrl-b <n>` switches windows, `Ctrl-b d` detaches).
2. The safety-gate result (which worktrees were on prod, if any).
3. The final consolidation: how many features finished ✅, failed eval ⚠️, or are pending/timed-out ⏳ — pointing at `wave-status.md`.
4. A reminder that review + PRs are the human's next step (this skill does not open PRs).

---

## FILES (this skill's toolbox)

- `scripts/tools/wave-tmux.sh` — builds worktrees + branches + tmux windows (dispatcher's "organiser").
- `scripts/tools/wave-dashboard.sh` — window-0 live dashboard.
- `scripts/tools/wave-dispatch.sh` — safety gate + max-parallel queue + auto-fire + soft-fail + cleanup.
- `scripts/tools/wave-status.sh` — consolidates `wave-status.md`.
- `docs/operacoes/wave-tmux.md` — operator guide (prereqs, DB safety, troubleshooting).

Reuses skills: **implement-feature** (implementation) and **evaluator** (contract verification). Do not reimplement their logic here.

## PREREQUISITES

- `tmux` (`brew install tmux` — not installed by default), `node`, `git`.
- The wave's features must have `spec.md` / `plan.md` / `contract.md` (produced by `spec-writer`).
