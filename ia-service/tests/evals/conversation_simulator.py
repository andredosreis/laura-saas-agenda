"""Conversation simulator — exercises extractor v2 + agent end-to-end
without WhatsApp or the Marcai backend.

For each scripted user-message in a scenario:
  1. Build the conversation history from prior turns.
  2. Run `extract_intel(messages)` → captures intent / nome / urgência /
     score_delta the way the orchestrator would in production.
  3. Update the simulated `lead_state` (nome, motivo, urgência, accumulated
     score) — mimicking what marcai_client.update_lead_info + apply_score_delta
     would persist on the backend side.
  4. Build the agent with the up-to-date lead_state, turn_number and
     last_clinic_message — same call shape as `lead_orchestrator._generate_reply`.
  5. Invoke the agent with the message history + new user message.
     MongoDB-backed tools are monkey-patched (same as in the eval suite).
  6. Render a WhatsApp-style transcript with the extractor metadata
     alongside the agent reply, so you can see both layers reacting
     to each turn.

Run:
    python -m tests.evals.conversation_simulator
    python -m tests.evals.conversation_simulator --scenario maria_happy_path
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import patch

# Make ia_service.* importable
_SRC = Path(__file__).resolve().parent.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

# Mirror LangSmith env (so tracing of these runs also lands in the project)
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

from ia_service.agents.lead_agent import make_lead_agent  # noqa: E402
from ia_service.services.lead_extractor import extract_intel  # noqa: E402


TENANT_ID = "695413fb6ce936a9097af750"  # Laura / marcai
SCENARIOS_PATH = Path(__file__).parent / "scenarios.json"


_FAKE_SLOTS = [
    {"date": "2026-05-20", "time": "09:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "11:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "13:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "14:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "15:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "17:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-21", "time": "10:00", "weekday": "Quinta-feira"},
    {"date": "2026-05-21", "time": "14:00", "weekday": "Quinta-feira"},
    {"date": "2026-05-23", "time": "09:00", "weekday": "Sábado"},
    {"date": "2026-05-23", "time": "12:00", "weekday": "Sábado"},
]


def _extract_reply(last_message: Any) -> str:
    raw = getattr(last_message, "content", "") if last_message else ""
    if isinstance(raw, list):
        return "".join(
            (p.get("text", "") if isinstance(p, dict) else str(p)) for p in raw
        )
    return str(raw or "")


def _extract_tool_calls(messages: list[Any]) -> list[str]:
    names: list[str] = []
    for msg in messages:
        for c in getattr(msg, "tool_calls", None) or []:
            name = (c.get("name") if isinstance(c, dict) else getattr(c, "name", "")) or ""
            if name:
                names.append(name)
    return names


def _apply_intel_to_state(state: dict, intel) -> dict:
    """Mimic what `marcai_client.update_lead_info` + `apply_score_delta` do.

    Idempotent updates: only fill fields where the extractor returned a
    non-null value, accumulate score_delta capped at [0, 100].
    """
    new_state = dict(state)
    if intel.nome:
        new_state["nome"] = intel.nome
    if intel.interesse:
        new_state["motivo"] = intel.interesse
    if intel.urgencia:
        new_state["urgencia"] = intel.urgencia
    new_state["score"] = max(0, min(100, new_state.get("score", 0) + (intel.score_delta or 0)))
    return new_state


async def run_scenario(scenario: dict) -> dict:
    """Returns a structured trace of the simulated conversation."""
    user_messages: list[str] = scenario["user_messages"]
    lead_state: dict = {"nome": "", "motivo": "", "urgencia": "", "score": 0}
    history: list[dict] = []
    turn_number = 0
    last_clinic_message = ""

    trace: list[dict] = []
    flags = {
        "asked_for_name_after_known": False,
        "greeted_on_turn_gt_0": False,
        "fabricated_slots": False,
    }

    # OpenAI TPM limit for gpt-4o-mini is 200K tokens/minute. The system
    # prompt (~720 lines) + accumulated history adds up fast — without a
    # gap between turns we exhaust the budget mid-scenario. 8s gives the
    # rolling window time to free up tokens.
    inter_turn_sleep_s = 8

    import re as _re
    _greeting = _re.compile(
        r"^\s*(ol[áa]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|bem-?vind[oa])",
        _re.IGNORECASE,
    )
    _name_ask = _re.compile(r"seu\s+(primeiro\s+)?nome|como\s+(se\s+)?chama", _re.IGNORECASE)
    _time = _re.compile(r"\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s*h\b")

    for idx, user_msg in enumerate(user_messages):
        if idx > 0:
            await asyncio.sleep(inter_turn_sleep_s)
        # 1) Extract intel on (history + current user message)
        messages_for_extractor = history + [{"role": "user", "content": user_msg}]
        intel = await extract_intel(messages_for_extractor)

        # 2) Apply intel into the simulated lead_state
        if intel is not None:
            lead_state = _apply_intel_to_state(lead_state, intel)

        # 3) Build agent with up-to-date state and invoke
        agent = make_lead_agent(
            TENANT_ID,
            lead_id=None,  # offline — no qualification/booking tools exposed
            lead_state=lead_state,
            turn_number=turn_number,
            last_clinic_message=last_clinic_message,
        )

        messages_for_agent = history + [{"role": "user", "content": user_msg}]
        with patch(
            "ia_service.services.mongo_reader.find_available_slots",
            return_value=_FAKE_SLOTS,
        ):
            result = await agent.ainvoke({"messages": messages_for_agent})

        final_messages = result.get("messages", [])
        reply = _extract_reply(final_messages[-1] if final_messages else None)
        tool_calls = _extract_tool_calls(final_messages)

        # 4) Behavioural flag checks
        if turn_number >= 1 and _greeting.match(reply):
            flags["greeted_on_turn_gt_0"] = True
        if lead_state.get("nome") and _name_ask.search(reply):
            flags["asked_for_name_after_known"] = True
        if _time.search(reply) and "get_available_slots" not in tool_calls:
            flags["fabricated_slots"] = True

        trace.append({
            "turn": turn_number,
            "user": user_msg,
            "intel": {
                "intent": intel.intent if intel else None,
                "nome": intel.nome if intel else None,
                "urgencia": intel.urgencia if intel else None,
                "interesse": (intel.interesse or "")[:60] if intel else None,
                "score_delta": intel.score_delta if intel else 0,
                "objection_type": intel.objection_type if intel else None,
            },
            "lead_state_after": dict(lead_state),
            "reply": reply,
            "tool_calls": tool_calls,
        })

        # 5) Append both sides to history; advance turn counters
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "assistant", "content": reply})
        turn_number += 1
        last_clinic_message = reply

    return {
        "scenario": scenario["name"],
        "description": scenario.get("description", ""),
        "trace": trace,
        "final_state": lead_state,
        "flags": flags,
    }


def render_trace(result: dict) -> None:
    print()
    print("═" * 76)
    print(f"CENÁRIO: {result['scenario']}")
    print(f"        {result['description']}")
    print("═" * 76)

    for step in result["trace"]:
        print()
        print(f"┌─ Turn {step['turn']} " + "─" * 60)
        print(f"│ 👤 Lead:  {step['user']}")
        intel = step["intel"]
        print(
            f"│ 🔍 Extractor: intent={intel['intent']!r} "
            f"nome={intel['nome']!r} urgência={intel['urgencia']!r} "
            f"Δscore={intel['score_delta']:+d}"
            + (f" objection={intel['objection_type']!r}" if intel.get("objection_type") else "")
        )
        state = step["lead_state_after"]
        print(
            f"│ 📊 State:  nome={state['nome']!r} motivo={state['motivo']!r} "
            f"urgência={state['urgencia']!r} score={state['score']}"
        )
        if step["tool_calls"]:
            print(f"│ 🔧 Tools: {step['tool_calls']}")
        # Render reply with WhatsApp-like prefix on every line
        for line in step["reply"].split("\n"):
            print(f"│ 🤖 Laura: {line}")
        print("└" + "─" * 75)

    print()
    print("─" * 76)
    print("ANÁLISE COMPORTAMENTAL")
    print("─" * 76)
    flags = result["flags"]
    print(f"  {'✗' if flags['greeted_on_turn_gt_0'] else '✓'} Não saudou em turn ≥ 1 (anti-BUG-001)")
    print(f"  {'✗' if flags['asked_for_name_after_known'] else '✓'} Não voltou a pedir nome após capturado (anti-BUG-002)")
    print(f"  {'✗' if flags['fabricated_slots'] else '✓'} Não fabricou slots sem tool call (anti-BUG-004)")
    print(f"  Final state: {result['final_state']}")


def load_scenarios(filter_name: str | None = None) -> list[dict]:
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    scenarios = data.get("scenarios", [])
    if filter_name:
        scenarios = [s for s in scenarios if filter_name in s["name"]]
    return scenarios


async def main_async(filter_name: str | None):
    scenarios = load_scenarios(filter_name)
    if not scenarios:
        print("No scenarios matched.")
        return
    for s in scenarios:
        try:
            result = await run_scenario(s)
            render_trace(result)
        except Exception as exc:
            print(f"\n✗ Scenario {s['name']} crashed: {exc!r}")
            import traceback
            traceback.print_exc()


def main() -> None:
    p = argparse.ArgumentParser(description="Simulate WhatsApp conversations through the Marcai IA stack.")
    p.add_argument("--scenario", help="Filter by scenario name substring.")
    args = p.parse_args()
    asyncio.run(main_async(args.scenario))


if __name__ == "__main__":
    main()
