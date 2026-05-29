"""CLI runner for client-agent evals.

Usage:
    python -m tests.evals.client.run_eval                     # all fixtures
    python -m tests.evals.client.run_eval --fixture booking    # one fixture
    python -m tests.evals.client.run_eval --sync               # push to LangSmith
    python -m tests.evals.client.run_eval --sync --label gpt5  # label the experiment
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_SRC = Path(__file__).resolve().parent.parent.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

import os as _os

from ia_service.config import settings as _settings

if _settings.langsmith_api_key:
    _os.environ.setdefault("LANGSMITH_API_KEY", _settings.langsmith_api_key)
if _settings.langsmith_endpoint:
    _os.environ.setdefault("LANGSMITH_ENDPOINT", _settings.langsmith_endpoint)

FIXTURES_DIR = Path(__file__).parent / "fixtures"
DATASET_NAME = "marcai-client-agent"


@dataclass
class Shim:
    inputs: dict | None = None
    outputs: dict | None = None


def load_fixtures(name_filter: str | None = None) -> list[dict]:
    all_examples = []
    for fp in sorted(FIXTURES_DIR.glob("*.json")):
        if name_filter and name_filter not in fp.stem:
            continue
        data = json.loads(fp.read_text())
        all_examples.extend(data.get("examples", []))
    return all_examples


async def run_local(examples: list[dict], evaluators) -> tuple[int, int]:
    from .target import client_agent_target

    passed = 0
    total = 0
    for ex in examples:
        print(f"\n{'='*60}")
        print(f"  {ex['name']}")
        print(f"  msg: {ex['inputs']['current_message'][:60]}")
        print(f"{'='*60}")

        result = await client_agent_target(ex["inputs"])
        reply = result.get("reply", "")
        tools = result.get("tool_calls", [])

        print(f"  Reply ({len(reply)} chars): {reply[:120]}...")
        if tools:
            print(f"  Tools: {tools}")

        run_shim = Shim(outputs=result)
        example_shim = Shim(inputs=ex["inputs"], outputs=ex["outputs"])

        for evaluator in evaluators:
            res = evaluator(run_shim, example_shim)
            score = res.get("score")
            if score is None:
                continue
            total += 1
            if score == 1:
                passed += 1
                print(f"    ✓ {res['key']}: {res['comment']}")
            else:
                print(f"    ✗ {res['key']}: {res['comment']}")

    return passed, total


def run_langsmith_sync(examples: list[dict], evaluators, label: str | None = None):
    from langsmith import Client, aevaluate

    client = Client()

    ls_examples = []
    for ex in examples:
        ls_examples.append({
            "inputs": ex["inputs"],
            "outputs": ex["outputs"],
            "metadata": {"name": ex["name"]},
        })

    try:
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
    except Exception:
        dataset = client.create_dataset(
            dataset_name=DATASET_NAME,
            description="Client agent eval fixtures — booking, reschedule, cancel, tone, PT-PT",
        )

    existing = list(client.list_examples(dataset_id=dataset.id))
    if existing:
        for e in existing:
            client.delete_example(e.id)

    client.create_examples(
        inputs=[e["inputs"] for e in ls_examples],
        outputs=[e["outputs"] for e in ls_examples],
        metadata=[e["metadata"] for e in ls_examples],
        dataset_id=dataset.id,
    )
    print(f"Pushed {len(ls_examples)} examples to '{DATASET_NAME}'")

    async def target(inputs):
        from .target import client_agent_target
        return await client_agent_target(inputs)

    experiment_prefix = label or f"client-agent-{_settings.agent_model_openai}"
    results = asyncio.run(
        aevaluate(
            target,
            data=DATASET_NAME,
            evaluators=evaluators,
            experiment_prefix=experiment_prefix,
        )
    )
    print(f"\nExperiment: {experiment_prefix}")
    print("View in LangSmith UI for full results.")


def main():
    parser = argparse.ArgumentParser(description="Client agent eval runner")
    parser.add_argument("--fixture", type=str, help="Filter fixtures by name")
    parser.add_argument("--sync", action="store_true", help="Push to LangSmith")
    parser.add_argument("--label", type=str, help="Experiment label for LangSmith")
    args = parser.parse_args()

    from .evaluators import ALL_EVALUATORS

    examples = load_fixtures(args.fixture)
    if not examples:
        print("No fixtures found.")
        sys.exit(1)

    print(f"Loaded {len(examples)} examples")
    print(f"Model: {_settings.agent_model_openai}")

    if args.sync:
        run_langsmith_sync(examples, ALL_EVALUATORS, args.label)
    else:
        passed, total = asyncio.run(run_local(examples, ALL_EVALUATORS))
        pct = (passed / total * 100) if total else 0
        print(f"\n{'='*60}")
        print(f"  Results: {passed}/{total} ({pct:.0f}%)")
        print(f"{'='*60}")
        sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
