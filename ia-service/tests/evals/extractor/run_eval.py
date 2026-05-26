"""CLI runner for the F07 extractor evals.

Mirror of `tests/evals/run_eval.py` but for the structured-output
extractor (classification + extraction problem, not text generation).

Two modes:

  1. **Local (default)** — run all fixtures, print per-example row-level
     scores + full classification report (precision / recall / F1 per
     class) at the end. Exit code != 0 if any row failed.

         python -m tests.evals.extractor.run_eval
         python -m tests.evals.extractor.run_eval --fixture intents

  2. **LangSmith sync** — push to a separate dataset
     `marcai-extractor-eval`, run an experiment with both row evaluators
     AND summary evaluators (so macro-F1 appears as a single number per
     run in the LangSmith UI experiment compare).

         python -m tests.evals.extractor.run_eval --sync
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Make ia_service.* importable when invoked via -m
_SRC = Path(__file__).resolve().parent.parent.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

# Mirror LangSmith env from .env (pydantic settings → os.environ)
import os as _os  # noqa: E402

from ia_service.config import settings as _settings  # noqa: E402

if _settings.langsmith_api_key:
    _os.environ.setdefault("LANGSMITH_API_KEY", _settings.langsmith_api_key)
if _settings.langsmith_project:
    _os.environ.setdefault("LANGSMITH_PROJECT", _settings.langsmith_project)
if _settings.langsmith_tracing:
    _os.environ.setdefault("LANGSMITH_TRACING", "true")
if _settings.langsmith_endpoint:
    _os.environ.setdefault("LANGSMITH_ENDPOINT", _settings.langsmith_endpoint)

from .evaluators import (  # noqa: E402
    ROW_EVALUATORS,
    SUMMARY_EVALUATORS,
    _per_class_prf,
    format_classification_report,
)
from .target import run_extractor_on_example  # noqa: E402

FIXTURES_DIR = Path(__file__).parent / "fixtures"
DATASET_NAME = "marcai-extractor-eval"


@dataclass
class _ExampleShim:
    inputs: dict
    outputs: dict


@dataclass
class _RunShim:
    outputs: dict


def load_examples(fixture_filter: str | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        if fixture_filter and fixture_filter not in path.stem:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for ex in data.get("examples", []):
            items.append({
                "fixture": data["name"],
                "name": ex["name"],
                "inputs": ex["inputs"],
                "outputs": ex["outputs"],
            })
    return items


def _marker(score) -> str:
    if score is None:
        return "·"
    if isinstance(score, (int, float)) and score >= 1:
        return "✓"
    if isinstance(score, (int, float)) and score == 0:
        return "✗"
    return f"{score}"


async def run_local(items: list[dict[str, Any]]) -> int:
    print(f"\n→ Running {len(items)} extractor example(s) offline")
    print(f"  Row evaluators: {[e.__name__ for e in ROW_EVALUATORS]}")
    print(f"  Summary evaluators: {[e.__name__ for e in SUMMARY_EVALUATORS]}\n")

    fail_count = 0
    runs_list = []
    examples_list = []

    for it in items:
        try:
            actual = await run_extractor_on_example(it["inputs"])
        except Exception as exc:
            print(f"  ✗ {it['fixture']}::{it['name']}  extractor crashed: {exc!r}")
            fail_count += len(ROW_EVALUATORS)
            continue

        run = _RunShim(outputs=actual)
        example = _ExampleShim(inputs=it["inputs"], outputs=it["outputs"])
        runs_list.append(run)
        examples_list.append(example)

        print(f"  [{it['fixture']}::{it['name']}]")
        for ev in ROW_EVALUATORS:
            r = ev(run, example)
            marker = _marker(r["score"])
            extra = f"  ← {r.get('comment', '')}" if r["score"] == 0 else ""
            print(f"      {marker} {r['key']}{extra}")
            if r["score"] == 0:
                fail_count += 1
        # tiny preview
        prev = (
            f"intent={actual.get('intent')!r} "
            f"nome={actual.get('nome')!r} "
            f"urgencia={actual.get('urgencia')!r} "
            f"score_delta={actual.get('score_delta')}"
        )
        if actual.get("objection_type"):
            prev += f" objection={actual['objection_type']!r}"
        if actual.get("perdido_motivo"):
            prev += f" perdido_motivo={actual['perdido_motivo']!r}"
        print(f"      {prev}\n")

    # ─── Summary section ──────────────────────────────────────────────────
    print("─" * 72)
    print("SUMMARY METRICS")
    print("─" * 72)

    for ev in SUMMARY_EVALUATORS:
        r = ev(runs_list, examples_list)
        print(f"  {r['key']:<28} score={r['score']}")

    # Full classification report for intent / urgencia / objection_type
    for run_key, exp_key, title in [
        ("intent", "expected_intent", "INTENT — per-class report"),
        ("urgencia", "expected_urgencia", "URGENCIA — per-class report"),
        ("objection_type", "expected_objection_type", "OBJECTION_TYPE — per-class report"),
    ]:
        pairs = []
        for r, e in zip(runs_list, examples_list):
            expected = e.outputs.get(exp_key, "__missing__")
            if expected == "__missing__":
                continue
            pairs.append((r.outputs.get(run_key), expected))
        if not pairs:
            continue
        report = _per_class_prf(pairs)
        print(format_classification_report(report, title))

    print()
    return fail_count


def _ensure_dataset(client, items):
    try:
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
        print(f"→ Found existing dataset: {DATASET_NAME} (id={dataset.id})")
    except Exception:
        dataset = client.create_dataset(
            DATASET_NAME,
            description="Marcai extractor F07 — intent/urgência/nome/score_delta",
        )
        print(f"→ Created dataset: {DATASET_NAME} (id={dataset.id})")

    existing: set[str] = set()
    try:
        for ex in client.list_examples(dataset_id=dataset.id):
            meta = (getattr(ex, "metadata", None) or {})
            existing.add(f"{meta.get('fixture', '')}::{meta.get('name', '')}")
    except Exception:
        pass

    new_inputs, new_outputs, new_meta = [], [], []
    for it in items:
        key = f"{it['fixture']}::{it['name']}"
        if key in existing:
            continue
        new_inputs.append(it["inputs"])
        new_outputs.append(it["outputs"])
        new_meta.append({"fixture": it["fixture"], "name": it["name"]})

    if new_inputs:
        client.create_examples(
            inputs=new_inputs,
            outputs=new_outputs,
            metadata=new_meta,
            dataset_id=dataset.id,
        )
        print(f"→ Uploaded {len(new_inputs)} new example(s)")
    else:
        print(f"→ Dataset already has all {len(items)} examples — nothing to upload")
    return dataset


async def run_langsmith(items, label: str | None = None):
    try:
        from langsmith import Client, aevaluate
    except ImportError:
        print("✗ langsmith not installed. Run: pip install -e '.[dev]'")
        return 1

    client = Client()
    _ensure_dataset(client, items)

    # Capture the actual model + provider used in metadata so the
    # LangSmith experiment compare view shows "what" was tested.
    metadata = {
        "llm_provider": _settings.llm_provider,
        "extractor_model": (
            _settings.extractor_model_openai
            if _settings.llm_provider == "openai"
            else _settings.extractor_model_gemini
        ),
        "label": label or "default",
    }

    async def target(inputs: dict) -> dict:
        return await run_extractor_on_example(inputs)

    prefix = f"extractor-{label}" if label else "extractor-baseline"
    print(f"\n→ Running experiment on dataset {DATASET_NAME} (prefix={prefix})...")
    print(f"  Metadata: {metadata}")
    results = await aevaluate(
        target,
        data=DATASET_NAME,
        evaluators=ROW_EVALUATORS,
        summary_evaluators=SUMMARY_EVALUATORS,
        experiment_prefix=prefix,
        metadata=metadata,
        max_concurrency=3,
    )

    failed = 0
    async for row in results:
        eval_results = row.get("evaluation_results", {}).get("results", []) or []
        ex_id = row["example"].id
        line = f"  [{ex_id}]"
        for r in eval_results:
            key = getattr(r, "key", "?")
            score = getattr(r, "score", None)
            line += f" {_marker(score)} {key}"
            if score == 0:
                failed += 1
        print(line)

    print(
        "\n→ Experiment finished. Macro-F1 + per-class precision/recall in "
        "the LangSmith Experiment view (summary tab)."
    )
    return failed


def main() -> None:
    p = argparse.ArgumentParser(description="F07 extractor eval runner.")
    p.add_argument("--sync", action="store_true", help="Push dataset + experiment to LangSmith.")
    p.add_argument("--fixture", help="Filter by fixture stem (e.g. 'intent').")
    p.add_argument(
        "--label",
        help="Custom experiment label (e.g. 'mini-v2-promptfix'). "
        "Without this, prefix defaults to 'extractor-baseline'.",
    )
    args = p.parse_args()

    items = load_examples(args.fixture)
    if not items:
        print("No fixtures matched.")
        sys.exit(1)

    if args.sync:
        failed = asyncio.run(run_langsmith(items, label=args.label))
    else:
        failed = asyncio.run(run_local(items))
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
