"""Rule-based evaluators for client-agent fixtures.

Same protocol as lead-agent evaluators: score 1=pass, 0=fail, None=n/a.
"""

from __future__ import annotations

import re
from typing import Any

_MARKDOWN_PATTERN = re.compile(r"\*\*[^*]+\*\*|\*[^*]+\*|^\s*[-*]\s|^\s*\d+\.\s", re.MULTILINE)
_BR_PT_MARKERS = re.compile(
    r"\bvoce pode\b|\btudo bem\?|\bbeleza\b|\bcelular\b|\bagendar\b|\bvamos nessa\b",
    re.IGNORECASE,
)
_LEMBRETE_PREFERENCE = re.compile(
    r"prefer[ei].*lembrete|quando.*receber.*lembrete|vespera.*ou.*dia",
    re.IGNORECASE,
)
_40_EUR = re.compile(r"40\s*(eur|€|euros)", re.IGNORECASE)
_LAURA_PRICE = re.compile(r"laura|combinar|pessoalmente|conversar", re.IGNORECASE)
_PACOTE_CONTA = re.compile(
    r"pacote.*conta|conta.*pacote|pacote.*barato|barato.*pacote|pacote.*melhor", re.IGNORECASE
)


def _get_reply(run) -> str:
    out = getattr(run, "outputs", None) or {}
    return (out.get("reply", "") or "") if isinstance(out, dict) else ""


def _get_tool_calls(run) -> list[str]:
    out = getattr(run, "outputs", None) or {}
    return list(out.get("tool_calls") or []) if isinstance(out, dict) else []


def _na(key: str, reason: str = "n/a") -> dict[str, Any]:
    return {"key": key, "score": None, "comment": reason}


def no_markdown(run, example) -> dict[str, Any]:
    expected = (example.outputs or {}).get("must_not_contain_markdown")
    if not expected:
        return _na("no_markdown")
    reply = _get_reply(run)
    has_md = bool(_MARKDOWN_PATTERN.search(reply))
    return {
        "key": "no_markdown",
        "score": 0 if has_md else 1,
        "comment": f"Markdown encontrado: {_MARKDOWN_PATTERN.findall(reply)[:3]}"
        if has_md
        else "OK",
    }


def pt_pt_not_br(run, example) -> dict[str, Any]:
    expected = (example.outputs or {}).get("must_be_pt_pt")
    if not expected:
        return _na("pt_pt_not_br")
    reply = _get_reply(run)
    has_br = bool(_BR_PT_MARKERS.search(reply))
    return {
        "key": "pt_pt_not_br",
        "score": 0 if has_br else 1,
        "comment": f"BR-PT detectado: {_BR_PT_MARKERS.findall(reply)[:3]}" if has_br else "OK",
    }


def max_sentences(run, example) -> dict[str, Any]:
    limit = (example.outputs or {}).get("max_sentences")
    if limit is None:
        return _na("max_sentences")
    reply = _get_reply(run)
    sentences = [s.strip() for s in re.split(r"[.!?]+", reply) if s.strip()]
    count = len(sentences)
    return {
        "key": "max_sentences",
        "score": 1 if count <= limit else 0,
        "comment": f"{count} frases (max {limit})",
    }


def contains_name(run, example) -> dict[str, Any]:
    name = (example.outputs or {}).get("must_contain_name")
    if not name:
        return _na("contains_name")
    reply = _get_reply(run)
    found = name.lower() in reply.lower()
    return {
        "key": "contains_name",
        "score": 1 if found else 0,
        "comment": f'Nome "{name}" {"encontrado" if found else "NAO encontrado"}',
    }


def called_tool(run, example) -> dict[str, Any]:
    expected_tool = (example.outputs or {}).get("must_call_tool")
    if not expected_tool:
        return _na("called_tool")
    tools = _get_tool_calls(run)
    found = expected_tool in tools
    return {
        "key": "called_tool",
        "score": 1 if found else 0,
        "comment": (
            f'Tool "{expected_tool}" {"chamada" if found else "NAO chamada"}. Tools: {tools}'
        ),
    }


def lembrete_automatic(run, example) -> dict[str, Any]:
    expected = (example.outputs or {}).get("must_say_automatic")
    if not expected:
        return _na("lembrete_automatic")
    reply = _get_reply(run)
    says_auto = bool(re.search(r"autom[aá]tic", reply, re.IGNORECASE))
    asks_pref = bool(_LEMBRETE_PREFERENCE.search(reply))
    score = 1 if says_auto and not asks_pref else 0
    comment = []
    if not says_auto:
        comment.append('Nao disse "automatico"')
    if asks_pref:
        comment.append("Perguntou preferencia de lembrete")
    return {
        "key": "lembrete_automatic",
        "score": score,
        "comment": "; ".join(comment) if comment else "OK",
    }


def price_response(run, example) -> dict[str, Any]:
    checks = example.outputs or {}
    if not checks.get("must_contain_40_eur"):
        return _na("price_response")
    reply = _get_reply(run)
    has_40 = bool(_40_EUR.search(reply))
    has_laura = bool(_LAURA_PRICE.search(reply))
    has_pacote = bool(_PACOTE_CONTA.search(reply))
    score = 1 if (has_40 and has_laura) else 0
    parts = []
    if not has_40:
        parts.append("Falta 40 EUR")
    if not has_laura:
        parts.append("Falta referencia a Laura")
    if not has_pacote:
        parts.append("Falta mencao a pacote mais em conta")
    return {
        "key": "price_response",
        "score": score,
        "comment": "; ".join(parts) if parts else "OK",
    }


def block_reschedule_24h(run, example) -> dict[str, Any]:
    expected = (example.outputs or {}).get("must_block_reschedule")
    if not expected:
        return _na("block_reschedule_24h")
    reply = _get_reply(run).lower()
    tools = _get_tool_calls(run)
    called_reschedule = "reschedule_appointment" in tools
    mentions_laura = bool(re.search(r"laura|directamente|contacte", reply))
    mentions_24h = bool(re.search(r"24\s*h|antecedencia|menos de um dia", reply))
    score = 1 if (not called_reschedule and mentions_laura) else 0
    return {
        "key": "block_reschedule_24h",
        "score": score,
        "comment": (
            f"Reschedule tool called: {called_reschedule}, "
            f"Laura mentioned: {mentions_laura}, 24h mentioned: {mentions_24h}"
        ),
    }


def no_slots_without_asking(run, example) -> dict[str, Any]:
    expected = (example.outputs or {}).get("must_not_offer_slots_without_asking")
    if not expected:
        return _na("no_slots_without_asking")
    reply = _get_reply(run)
    from ..evaluators import _TIME_MENTION

    has_times = bool(_TIME_MENTION.search(reply))
    return {
        "key": "no_slots_without_asking",
        "score": 0 if has_times else 1,
        "comment": "Ofereceu horarios sem ser pedido" if has_times else "OK",
    }


ALL_EVALUATORS = [
    no_markdown,
    pt_pt_not_br,
    max_sentences,
    contains_name,
    called_tool,
    lembrete_automatic,
    price_response,
    block_reschedule_24h,
    no_slots_without_asking,
]
