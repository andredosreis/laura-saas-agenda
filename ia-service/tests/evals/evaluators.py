"""Rule-based evaluators for the lead-agent fixtures.

Each evaluator follows the LangSmith protocol — receives a `Run` (the
agent invocation result) and an `Example` (the fixture's input + expected
behaviour flags). Returns a dict with `key`, `score` and `comment` so it
plugs straight into `langsmith.evaluate` / `aevaluate`.

Score conventions:
- `1` — check passed
- `0` — check failed
- `None` — check not applicable to this example (e.g. fixture didn't ask
   for this dimension)

Local runner uses simple object-shims with the same `.inputs` / `.outputs`
shape, so the evaluators are agnostic of whether LangSmith is in the loop.
"""

from __future__ import annotations

import re
from typing import Any, Protocol


class _HasOutputs(Protocol):
    outputs: dict | None


class _HasInputsOutputs(Protocol):
    inputs: dict | None
    outputs: dict | None


# A greeting opener has to land at the START of the message. Inline "olá" in
# the middle of a sentence is fine; "Olá!" / "Bom dia," at position 0 is not.
_GREETING_OPENER = re.compile(
    r"^\s*(ol[áa]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|bem-?vind[oa]|que\s+bom)\b",
    re.IGNORECASE,
)

# Match HH:MM or "9h", "9 h", "9h30" — anything that looks like a slot the
# agent might have fabricated.
_TIME_MENTION = re.compile(
    r"\b\d{1,2}[:h]\d{2}\b|\b\d{1,2}\s*h\b",
    re.IGNORECASE,
)

# Asking for the name in any of the phrasings the prompt forbids when the
# name is already known.
_NAME_ASK = re.compile(
    r"seu\s+(primeiro\s+)?nome|como\s+(se\s+)?chama|qual\s+o\s+seu\s+nome|posso\s+saber\s+o\s+seu",
    re.IGNORECASE,
)


def _get_reply(run: _HasOutputs) -> str:
    """Extract the agent's reply text from a Run (LangSmith) or shim."""
    out = getattr(run, "outputs", None) or {}
    if isinstance(out, dict):
        return out.get("reply", "") or ""
    return ""


def _get_tool_calls(run: _HasOutputs) -> list[str]:
    out = getattr(run, "outputs", None) or {}
    if isinstance(out, dict):
        return list(out.get("tool_calls") or [])
    return []


def _na(key: str, reason: str = "n/a") -> dict[str, Any]:
    return {"key": key, "score": None, "comment": reason}


def no_greeting_when_turn_gt_0(run, example) -> dict[str, Any]:
    """Resposta não pode começar com saudação quando turn_number >= 1
    (gate 6 do system prompt — BUG-001).

    Skipped quando o example não pede este check (`must_not_start_with_greeting_word=false`).
    """
    expected = (example.outputs or {}).get("must_not_start_with_greeting_word")
    if not expected:
        return _na("no_greeting_when_turn_gt_0")
    reply = _get_reply(run)
    if not reply:
        return {"key": "no_greeting_when_turn_gt_0", "score": 0, "comment": "empty reply"}
    if _GREETING_OPENER.match(reply):
        first_words = reply.strip().split("\n", 1)[0][:60]
        return {
            "key": "no_greeting_when_turn_gt_0",
            "score": 0,
            "comment": f"starts with greeting: {first_words!r}",
        }
    return {"key": "no_greeting_when_turn_gt_0", "score": 1, "comment": "ok"}


def uses_lead_name_when_known(run, example) -> dict[str, Any]:
    """Quando o example exige `must_contain_name`, a resposta deve contê-lo.

    BUG-002: o lead acabou de dar o nome (ou já o tinha persistido) e o
    agent ignorou.
    """
    expected_name = (example.outputs or {}).get("must_contain_name")
    if not expected_name:
        return _na("uses_lead_name_when_known")
    reply = _get_reply(run)
    if expected_name in reply:
        return {"key": "uses_lead_name_when_known", "score": 1, "comment": "ok"}
    return {
        "key": "uses_lead_name_when_known",
        "score": 0,
        "comment": f"reply missing expected name {expected_name!r}",
    }


def no_slot_fabrication(run, example) -> dict[str, Any]:
    """Se a resposta cita HH:MM, o agent tem de ter chamado
    `get_available_slots` nesta invocação (BUG-004).
    """
    if not (example.outputs or {}).get("must_not_fabricate_slots"):
        return _na("no_slot_fabrication")
    reply = _get_reply(run)
    if not _TIME_MENTION.search(reply):
        return {"key": "no_slot_fabrication", "score": 1, "comment": "no time mentioned"}
    tool_calls = _get_tool_calls(run)
    if "get_available_slots" in tool_calls:
        return {"key": "no_slot_fabrication", "score": 1, "comment": "tool called"}
    return {
        "key": "no_slot_fabrication",
        "score": 0,
        "comment": f"cited time without get_available_slots (tool_calls={tool_calls})",
    }


def no_redundant_name_ask(run, example) -> dict[str, Any]:
    """Se `must_ask_for_name=false`, a resposta não pode voltar a pedir o nome.

    Casos: nome já recolhido OU é resposta directa a um "como te chamas?"
    (Gate 7 — anti-reset).
    """
    should_ask = (example.outputs or {}).get("must_ask_for_name")
    if should_ask:
        return _na("no_redundant_name_ask")
    reply = _get_reply(run)
    if _NAME_ASK.search(reply):
        snippet = next(iter(_NAME_ASK.findall(reply)), reply[:40])
        return {
            "key": "no_redundant_name_ask",
            "score": 0,
            "comment": f"asked for name again: {snippet!r}",
        }
    return {"key": "no_redundant_name_ask", "score": 1, "comment": "ok"}


# Convenience: full evaluator list — import this from the runner.
ALL_EVALUATORS = [
    no_greeting_when_turn_gt_0,
    uses_lead_name_when_known,
    no_slot_fabrication,
    no_redundant_name_ask,
]
