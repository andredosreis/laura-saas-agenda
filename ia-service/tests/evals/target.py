"""Eval target — wraps `make_lead_agent` for use with the runner / LangSmith.

The fixtures live in `fixtures/*.json`; each turn checkpoint has an
`inputs` dict that this module turns into an agent invocation. The
result dict (`reply`, `tool_calls`, `messages`) is what evaluators
inspect.

For OFFLINE evals we monkey-patch the two tool backends that would
otherwise need MongoDB or the Marcai HTTP API:

- `mongo_reader.find_available_slots` returns a deterministic list of
  fake slots so the agent can still call `get_available_slots` without
  a real DB.

We deliberately pass `lead_id=None` from the fixtures so the
qualification/booking tools are not even exposed — those write to the
Marcai backend and an offline eval should never trigger them.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any
from unittest.mock import patch

from ia_service.agents.lead_agent import make_lead_agent

_FAKE_SLOTS = [
    {"date": "2026-05-19", "time": "09:00", "weekday": "Terça-feira"},
    {"date": "2026-05-19", "time": "11:00", "weekday": "Terça-feira"},
    {"date": "2026-05-19", "time": "13:00", "weekday": "Terça-feira"},
    {"date": "2026-05-19", "time": "14:00", "weekday": "Terça-feira"},
    {"date": "2026-05-19", "time": "15:00", "weekday": "Terça-feira"},
    {"date": "2026-05-19", "time": "17:00", "weekday": "Terça-feira"},
    {"date": "2026-05-20", "time": "10:00", "weekday": "Quarta-feira"},
    {"date": "2026-05-20", "time": "14:00", "weekday": "Quarta-feira"},
]


@contextmanager
def _offline_mocks():
    """Replace MongoDB-backed tool helpers with deterministic fakes."""
    with patch(
        "ia_service.services.mongo_reader.find_available_slots",
        return_value=_FAKE_SLOTS,
    ):
        yield


def _extract_tool_calls(messages: list[Any]) -> list[str]:
    """Collect tool-call names from every AIMessage in the agent trace."""
    names: list[str] = []
    for msg in messages:
        calls = getattr(msg, "tool_calls", None) or []
        for c in calls:
            if isinstance(c, dict):
                name = c.get("name") or ""
            else:
                name = getattr(c, "name", "") or ""
            if name:
                names.append(name)
    return names


def _extract_reply(last_message: Any) -> str:
    raw = getattr(last_message, "content", "") if last_message else ""
    if isinstance(raw, list):
        return "".join((p.get("text", "") if isinstance(p, dict) else str(p)) for p in raw)
    return str(raw or "")


async def run_agent_on_example(inputs: dict) -> dict:
    """LangSmith-compatible target.

    Builds the agent with the lead-state / turn metadata from the
    fixture, then invokes it on the conversation up to and including
    `current_message`. Returns a dict the evaluators can inspect.
    """
    tenant_id = inputs["tenant_id"]
    lead_id = inputs.get("lead_id")  # intentionally None in offline evals
    history = inputs.get("history", [])
    current_message = inputs["current_message"]
    lead_state = inputs.get("lead_state")
    turn_number = inputs.get("turn_number", 0)
    last_clinic_message = inputs.get("last_clinic_message", "") or ""

    agent = make_lead_agent(
        tenant_id,
        lead_id=lead_id,
        lead_state=lead_state,
        turn_number=turn_number,
        last_clinic_message=last_clinic_message,
    )

    messages = list(history) + [{"role": "user", "content": current_message}]

    with _offline_mocks():
        result = await agent.ainvoke({"messages": messages})

    final_messages = result.get("messages", [])
    reply = _extract_reply(final_messages[-1] if final_messages else None)
    tool_calls = _extract_tool_calls(final_messages)

    return {
        "reply": reply,
        "tool_calls": tool_calls,
        "turn_number": turn_number,
    }
