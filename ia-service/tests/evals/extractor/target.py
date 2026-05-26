"""Eval target for the F07 lead_extractor.

Unlike the agent eval, the extractor doesn't need any tool mocks — it's
a pure structured-output call (LLM with `with_structured_output(LeadIntel)`).
We invoke `extract_intel(messages)` directly and return all fields of the
LeadIntel pydantic model as a flat dict so evaluators can pivot freely.
"""

from __future__ import annotations

from typing import Any

from ia_service.services.lead_extractor import extract_intel


async def run_extractor_on_example(inputs: dict) -> dict[str, Any]:
    """LangSmith-compatible target. Returns all LeadIntel fields flat."""
    messages = list(inputs.get("history", []))
    current = inputs.get("current_message")
    if current:
        messages.append({"role": "user", "content": current})

    intel = await extract_intel(messages)
    if intel is None:
        return {
            "error": "extractor_returned_none",
            "intent": None,
            "nome": None,
            "urgencia": None,
            "interesse": None,
            "observacoes": None,
            "score_delta": 0,
            "perdido_motivo": None,
            "objection_type": None,
        }

    return {
        "intent": intel.intent,
        "nome": intel.nome,
        "urgencia": intel.urgencia,
        "interesse": intel.interesse,
        "observacoes": intel.observacoes,
        "score_delta": intel.score_delta,
        "perdido_motivo": intel.perdido_motivo,
        "objection_type": intel.objection_type,
    }
