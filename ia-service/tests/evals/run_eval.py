"""CLI runner for the lead-agent evals.

Two modes:

  1. **Local (default)** — load fixtures, invoke the agent on each turn,
     run rule-based evaluators, print a pass/fail table. No LangSmith
     network calls. Exit code != 0 on any failure → CI-friendly.

         python -m tests.evals.run_eval
         python -m tests.evals.run_eval --fixture maria

  2. **LangSmith sync** — push fixtures to a LangSmith dataset
     (`marcai-lead-agent`) and run an experiment against it. Each run
     shows up under `Projects → marcai-ia-service-local → Experiments`
     and the dataset is reusable from the LangSmith UI / playground.

         python -m tests.evals.run_eval --sync

Requires `LANGSMITH_API_KEY` to be set when using `--sync` (already set
in `ia-service/.env`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Make `ia_service.*` importable when invoked as `python -m tests.evals.run_eval`
# from the ia-service root. pyproject's `pythonpath=["src"]` only applies to
# pytest — for direct CLI invocation we add it ourselves.
_SRC = Path(__file__).resolve().parent.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

# Mirror LangSmith env vars from settings (.env) into os.environ.
# The langsmith SDK reads its API key from os.environ at Client() construction
# time — and pydantic-settings loaded our .env into a Python object, not into
# the OS env. ia_service.main does this same dance for the FastAPI app, but the
# eval runner doesn't import main, so we replicate it here.
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

from .evaluators import ALL_EVALUATORS  # noqa: E402
from .target import run_agent_on_example  # noqa: E402

FIXTURES_DIR = Path(__file__).parent / "fixtures"
DATASET_NAME = "marcai-lead-agent"


@dataclass
class _ExampleShim:
    """Mimics LangSmith `Example` for local runs."""

    inputs: dict
    outputs: dict


@dataclass
class _RunShim:
    """Mimics LangSmith `Run` for local runs."""

    outputs: dict


def load_examples(fixture_filter: str | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        if fixture_filter and fixture_filter not in path.stem:
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for ex in data.get("examples", []):
            items.append(
                {
                    "fixture": data["name"],
                    "name": ex["name"],
                    "inputs": ex["inputs"],
                    "outputs": ex["outputs"],
                }
            )
    return items


def _format_score(score: int | float | None) -> str:
    if score is None:
        return "·"
    if score >= 1:
        return "✓"
    return "✗"


async def run_local(items: list[dict[str, Any]]) -> int:
    print(f"\n→ Running {len(items)} example(s) offline")
    print(f"  Evaluators: {[e.__name__ for e in ALL_EVALUATORS]}\n")

    pass_count = 0
    fail_count = 0
    na_count = 0

    for it in items:
        try:
            actual = await run_agent_on_example(it["inputs"])
        except Exception as exc:
            print(f"  ✗ {it['fixture']}::{it['name']}  agent crashed: {exc!r}")
            fail_count += len(ALL_EVALUATORS)
            continue

        run = _RunShim(outputs=actual)
        example = _ExampleShim(inputs=it["inputs"], outputs=it["outputs"])

        results = [ev(run, example) for ev in ALL_EVALUATORS]
        line_head = f"  [{it['fixture']}::{it['name']}]"
        print(line_head)
        for r in results:
            marker = _format_score(r["score"])
            extra = ""
            if r["score"] is None:
                na_count += 1
            elif r["score"] >= 1:
                pass_count += 1
            else:
                fail_count += 1
                extra = f"  ← {r.get('comment', '')}"
            print(f"      {marker} {r['key']}{extra}")
        # Sample of agent reply for quick eyeballing
        reply_preview = (actual.get("reply") or "").replace("\n", " ")[:120]
        tools = actual.get("tool_calls") or []
        print(f"      reply: {reply_preview!r}")
        if tools:
            print(f"      tools: {tools}")
        print()

    print(
        f"→ Summary: {pass_count} pass / {fail_count} fail / {na_count} n/a "
        f"(of {pass_count + fail_count + na_count} checks across {len(items)} examples)"
    )
    return fail_count


def _ensure_dataset(client, items: list[dict[str, Any]]):
    """Idempotent: create the dataset if missing, then sync examples.

    For simplicity, we list current examples and only add new ones whose
    `(fixture, name)` tuple isn't already present. The runner is not
    trying to be a full dataset versioning tool — for breaking schema
    changes, delete the dataset in the UI and re-run with --sync.
    """
    try:
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
        print(f"→ Found existing dataset: {DATASET_NAME} (id={dataset.id})")
    except Exception:
        dataset = client.create_dataset(
            DATASET_NAME,
            description="Marcai lead-agent — turn checkpoints from real sessions",
        )
        print(f"→ Created dataset: {DATASET_NAME} (id={dataset.id})")

    existing_names: set[str] = set()
    try:
        for ex in client.list_examples(dataset_id=dataset.id):
            meta = (ex.metadata or {}) if hasattr(ex, "metadata") else {}
            key = f"{meta.get('fixture', '')}::{meta.get('name', '')}"
            existing_names.add(key)
    except Exception:
        pass

    new_inputs: list[dict] = []
    new_outputs: list[dict] = []
    new_metadata: list[dict] = []
    for it in items:
        key = f"{it['fixture']}::{it['name']}"
        if key in existing_names:
            continue
        new_inputs.append(it["inputs"])
        new_outputs.append(it["outputs"])
        new_metadata.append({"fixture": it["fixture"], "name": it["name"]})

    if not new_inputs:
        print(f"→ Dataset already has all {len(items)} examples — nothing to upload")
        return dataset

    client.create_examples(
        inputs=new_inputs,
        outputs=new_outputs,
        metadata=new_metadata,
        dataset_id=dataset.id,
    )
    print(f"→ Uploaded {len(new_inputs)} new example(s)")
    return dataset


async def run_langsmith(items: list[dict[str, Any]]) -> int:
    try:
        from langsmith import Client, aevaluate
    except ImportError:
        print("✗ langsmith SDK not installed. Run: pip install '.[dev]' (inside ia-service venv)")
        return 1

    client = Client()
    _ensure_dataset(client, items)

    async def target(inputs: dict) -> dict:
        return await run_agent_on_example(inputs)

    print(f"\n→ Running experiment on dataset {DATASET_NAME}...")
    results = await aevaluate(
        target,
        data=DATASET_NAME,
        evaluators=ALL_EVALUATORS,
        experiment_prefix="lead-agent-baseline",
        max_concurrency=2,
    )

    # Stream results so the user sees progress
    failed = 0
    async for row in results:
        eval_results = row.get("evaluation_results", {}).get("results", []) or []
        line = f"  [{row['example'].id}]"
        for r in eval_results:
            score = getattr(r, "score", None)
            key = getattr(r, "key", "?")
            line += f" {_format_score(score)} {key}"
            if score is not None and score < 1:
                failed += 1
        print(line)

    print(
        "\n→ Experiment finished. View at "
        "https://smith.langchain.com/  (project: marcai-ia-service-local)"
    )
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description="Run lead-agent evals from JSON fixtures.")
    parser.add_argument(
        "--sync",
        action="store_true",
        help="Push fixtures to LangSmith dataset and run experiment there.",
    )
    parser.add_argument(
        "--fixture",
        help="Filter fixtures by stem substring (e.g. 'maria').",
    )
    args = parser.parse_args()

    items = load_examples(args.fixture)
    if not items:
        print("No fixtures matched.")
        sys.exit(1)

    if args.sync:
        failed = asyncio.run(run_langsmith(items))
    else:
        failed = asyncio.run(run_local(items))

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
