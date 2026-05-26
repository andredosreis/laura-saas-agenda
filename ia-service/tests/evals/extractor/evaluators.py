"""Evaluators for the F07 lead_extractor.

Two flavours:

- **Row-level** (`def fn(run, example) -> dict`): one verdict per example.
  Used by both the local runner (each fixture entry gets a tick or cross)
  and LangSmith (each Example.id gets a feedback row).

- **Summary** (`def fn(runs, examples) -> dict`): one verdict aggregated
  across the whole experiment. This is where Precision / Recall / F1 by
  class actually appear — they only make sense over a population.

We compute precision/recall/F1 by hand (no scikit-learn). Macro-averaged
because the class distribution is uneven in the fixtures (some intents
are rarer) and unweighted average tells us more about coverage than
weighted average would.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any


# ─────────────────────────── Row-level evaluators ───────────────────────────


def _outputs(obj) -> dict:
    return getattr(obj, "outputs", None) or {}


def _na(key: str, reason: str = "n/a") -> dict[str, Any]:
    return {"key": key, "score": None, "comment": reason}


def intent_exact_match(run, example) -> dict[str, Any]:
    expected = _outputs(example).get("expected_intent")
    if not expected:
        return _na("intent_exact_match")
    predicted = _outputs(run).get("intent")
    score = 1 if predicted == expected else 0
    return {
        "key": "intent_exact_match",
        "score": score,
        "comment": f"pred={predicted!r} exp={expected!r}",
    }


def urgencia_exact_match(run, example) -> dict[str, Any]:
    """Treats `None` as a class — useful for testing 'should not invent urgency'."""
    out = _outputs(example)
    if "expected_urgencia" not in out:
        return _na("urgencia_exact_match")
    expected = out.get("expected_urgencia")
    predicted = _outputs(run).get("urgencia")
    score = 1 if predicted == expected else 0
    return {
        "key": "urgencia_exact_match",
        "score": score,
        "comment": f"pred={predicted!r} exp={expected!r}",
    }


def nome_exact_match(run, example) -> dict[str, Any]:
    """Case-insensitive match; both None counts as match (correctly didn't extract)."""
    out = _outputs(example)
    if "expected_nome" not in out:
        return _na("nome_exact_match")
    expected = out.get("expected_nome")
    predicted = _outputs(run).get("nome")

    def _norm(v):
        return (v or "").strip().lower() or None

    score = 1 if _norm(predicted) == _norm(expected) else 0
    return {
        "key": "nome_exact_match",
        "score": score,
        "comment": f"pred={predicted!r} exp={expected!r}",
    }


def score_delta_in_range(run, example) -> dict[str, Any]:
    rng = _outputs(example).get("expected_score_delta_range")
    if not rng or len(rng) != 2:
        return _na("score_delta_in_range")
    predicted = _outputs(run).get("score_delta", 0)
    low, high = rng
    score = 1 if low <= predicted <= high else 0
    return {
        "key": "score_delta_in_range",
        "score": score,
        "comment": f"pred={predicted} expected_range=[{low},{high}]",
    }


def objection_type_exact_match(run, example) -> dict[str, Any]:
    out = _outputs(example)
    if "expected_objection_type" not in out:
        return _na("objection_type_exact_match")
    expected = out.get("expected_objection_type")
    predicted = _outputs(run).get("objection_type")
    score = 1 if predicted == expected else 0
    return {
        "key": "objection_type_exact_match",
        "score": score,
        "comment": f"pred={predicted!r} exp={expected!r}",
    }


def perdido_motivo_contains(run, example) -> dict[str, Any]:
    needle = _outputs(example).get("expected_perdido_motivo_contains")
    if not needle:
        return _na("perdido_motivo_contains")
    haystack = (_outputs(run).get("perdido_motivo") or "").lower()
    score = 1 if needle.lower() in haystack else 0
    return {
        "key": "perdido_motivo_contains",
        "score": score,
        "comment": f"haystack={haystack!r} needle={needle!r}",
    }


ROW_EVALUATORS = [
    intent_exact_match,
    urgencia_exact_match,
    nome_exact_match,
    score_delta_in_range,
    objection_type_exact_match,
    perdido_motivo_contains,
]


# ─────────────────────── Summary evaluators (P/R/F1) ───────────────────────


def _per_class_prf(pairs: list[tuple[Any, Any]]) -> dict[str, dict[str, float]]:
    """Compute precision / recall / F1 / support per class from (pred, expected) pairs.

    `pairs` should already be filtered to examples where `expected` is set.
    `None` is a valid class label (relevant for `urgencia` where "should
    be null" is a legitimate expectation).
    """
    classes = sorted({e for _, e in pairs}, key=lambda x: (x is None, x))
    report: dict[str, dict[str, float]] = {}
    for cls in classes:
        tp = sum(1 for p, e in pairs if p == cls and e == cls)
        fp = sum(1 for p, e in pairs if p == cls and e != cls)
        fn = sum(1 for p, e in pairs if p != cls and e == cls)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        report[str(cls)] = {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
            "support": tp + fn,
        }
    return report


def _macro_f1(report: dict[str, dict[str, float]]) -> float:
    if not report:
        return 0.0
    return round(sum(c["f1"] for c in report.values()) / len(report), 3)


def _gather_pairs(runs, examples, run_key: str, example_key: str):
    pairs: list[tuple[Any, Any]] = []
    for r, e in zip(runs, examples):
        expected = (e.outputs or {}).get(example_key, "__missing__")
        if expected == "__missing__":
            continue
        predicted = (r.outputs or {}).get(run_key)
        pairs.append((predicted, expected))
    return pairs


def intent_macro_f1(runs: Sequence, examples: Sequence) -> dict[str, Any]:
    pairs = _gather_pairs(runs, examples, "intent", "expected_intent")
    if not pairs:
        return {"key": "intent_macro_f1", "score": None, "comment": "no examples with expected_intent"}
    report = _per_class_prf(pairs)
    score = _macro_f1(report)
    return {
        "key": "intent_macro_f1",
        "score": score,
        "comment": f"per_class={report}",
    }


def urgencia_macro_f1(runs: Sequence, examples: Sequence) -> dict[str, Any]:
    pairs = _gather_pairs(runs, examples, "urgencia", "expected_urgencia")
    if not pairs:
        return {"key": "urgencia_macro_f1", "score": None, "comment": "no examples with expected_urgencia"}
    report = _per_class_prf(pairs)
    score = _macro_f1(report)
    return {
        "key": "urgencia_macro_f1",
        "score": score,
        "comment": f"per_class={report}",
    }


def objection_type_macro_f1(runs: Sequence, examples: Sequence) -> dict[str, Any]:
    pairs = _gather_pairs(runs, examples, "objection_type", "expected_objection_type")
    if not pairs:
        return {"key": "objection_type_macro_f1", "score": None, "comment": "no expected_objection_type"}
    report = _per_class_prf(pairs)
    score = _macro_f1(report)
    return {
        "key": "objection_type_macro_f1",
        "score": score,
        "comment": f"per_class={report}",
    }


def nome_recall(runs: Sequence, examples: Sequence) -> dict[str, Any]:
    """Recall on the *non-null* class only — how often does it grab the name
    when the name was there to be grabbed. False positives (extracting a name
    when expected=null) are caught by `nome_exact_match` row-level.
    """
    tp = fn = 0
    for r, e in zip(runs, examples):
        expected = (e.outputs or {}).get("expected_nome")
        if not expected:
            continue
        predicted = (r.outputs or {}).get("nome")
        if predicted and predicted.strip().lower() == expected.strip().lower():
            tp += 1
        else:
            fn += 1
    if tp + fn == 0:
        return {"key": "nome_recall", "score": None, "comment": "no positive examples"}
    recall = round(tp / (tp + fn), 3)
    return {
        "key": "nome_recall",
        "score": recall,
        "comment": f"tp={tp} fn={fn} support={tp + fn}",
    }


def score_delta_mae(runs: Sequence, examples: Sequence) -> dict[str, Any]:
    """Mean absolute error of `score_delta` vs the *centre* of the expected range.

    Lower is better. Useful complement to `score_delta_in_range` row-level
    (which is binary): MAE tells you how far OFF the predictions are on
    average even when they fall inside the expected range.
    """
    diffs: list[float] = []
    for r, e in zip(runs, examples):
        rng = (e.outputs or {}).get("expected_score_delta_range")
        if not rng or len(rng) != 2:
            continue
        midpoint = (rng[0] + rng[1]) / 2
        predicted = (r.outputs or {}).get("score_delta", 0) or 0
        diffs.append(abs(predicted - midpoint))
    if not diffs:
        return {"key": "score_delta_mae", "score": None, "comment": "no expected_score_delta_range"}
    mae = round(sum(diffs) / len(diffs), 2)
    return {
        "key": "score_delta_mae",
        "score": mae,
        "comment": f"n={len(diffs)} mae_vs_midpoint={mae}",
    }


SUMMARY_EVALUATORS = [
    intent_macro_f1,
    urgencia_macro_f1,
    objection_type_macro_f1,
    nome_recall,
    score_delta_mae,
]


# ────────────────────────── Pretty printing ──────────────────────────


def format_classification_report(report: dict[str, dict[str, float]], title: str) -> str:
    """sklearn-style classification report for the CLI runner."""
    lines = [f"\n{title}"]
    lines.append(f"{'class':<28} {'precision':>10} {'recall':>10} {'f1':>10} {'support':>10}")
    lines.append("-" * 72)
    for cls, m in sorted(report.items()):
        lines.append(
            f"{cls:<28} {m['precision']:>10.3f} {m['recall']:>10.3f} "
            f"{m['f1']:>10.3f} {int(m['support']):>10}"
        )
    macro = _macro_f1(report)
    lines.append("-" * 72)
    lines.append(f"{'macro avg':<28} {'':>10} {'':>10} {macro:>10.3f}")
    return "\n".join(lines)
