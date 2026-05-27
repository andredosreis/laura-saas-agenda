"""System prompt renderer (Phase 4c + lead state injection).

Loads `prompts/system_lead_agent.md` and substitutes:
  - tenant content placeholders (`{{voz}}`, `{{catalogo}}`, `{{politicas}}`)
  - dynamic placeholders: `{{today}}`, `{{lead_nome}}`, `{{lead_motivo}}`,
    `{{lead_urgencia}}`, `{{lead_score}}`, `{{turn_number}}`,
    `{{is_first_turn}}`, `{{last_clinic_message}}`

The lead-state placeholders carry the persisted Lead document into the
system prompt so the agent never has to guess what it already knows.
Specifically, this is what blocks the "agent asks for name again after
already having it" bug — the agent reads `{{lead_nome}}` directly and
the prompt makes the consequence explicit ("if not '(ainda não recolhido)',
NEVER ask for the name again").

`turn_number` is the number of clinic messages already sent in this
conversation (0 on the very first incoming message, ≥1 thereafter). The
prompt uses it as a hard gate to ban "Olá!" / "Bom dia!" greetings on
turn ≥ 1 — this is the structural fix for BUG-001 from
`docs/testes-ia/02-problemas-pendentes.md`.

`last_clinic_message` is the most recent assistant utterance, fed into
the prompt so the agent can detect cases like "we just asked for the
lead's name in the previous turn" and act accordingly without having to
re-derive that from the full history.

Usage:
    from ia_service.services.prompt_renderer import render_system_prompt
    system_prompt = render_system_prompt(
        tenant_id,
        lead_state={"nome": "Jessica", "motivo": "preparação para casamento",
                    "urgencia": "alta", "score": 25},
        turn_number=3,
        last_clinic_message="Posso saber o seu primeiro nome?",
    )
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

from . import tenant_knowledge

# Resolve template path from this file: services/ → ia_service/ → prompts/
_TEMPLATE_PATH = (
    Path(__file__).parent.parent / "prompts" / "system_lead_agent.md"
)
_CLIENT_TEMPLATE_PATH = (
    Path(__file__).parent.parent / "prompts" / "system_client_agent.md"
)
_WEEKDAYS_PT = [
    "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado", "Domingo",
]

# Sentinel value used in the prompt to mean "not yet captured".
# The prompt has explicit rules conditional on this string — see
# `system_lead_agent.md` block "# Estado deste lead".
NOT_YET = "(ainda não recolhido)"


def _load_template() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


_MONTHS_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _today_string(timezone_name: str = "Europe/Lisbon") -> str:
    now = datetime.now(ZoneInfo(timezone_name))
    weekday = _WEEKDAYS_PT[now.weekday()]
    return f"{weekday}, {now.day} de {_MONTHS_PT[now.month - 1]} de {now.year} (ISO: {now.strftime('%Y-%m-%d')})"


def _calendar_next_14_days(timezone_name: str = "Europe/Lisbon") -> str:
    from datetime import timedelta
    now = datetime.now(ZoneInfo(timezone_name))
    lines = []
    for i in range(14):
        d = now + timedelta(days=i)
        wd = _WEEKDAYS_PT[d.weekday()]
        tag = " ← HOJE" if i == 0 else (" ← amanhã" if i == 1 else "")
        lines.append(f"- {wd} {d.day}/{d.month:02d} (ISO {d.strftime('%Y-%m-%d')}){tag}")
    return "\n".join(lines)


def render_system_prompt(
    tenant_id: str,
    lead_state: Optional[dict] = None,
    turn_number: int = 0,
    last_clinic_message: str = "",
) -> str:
    """Return the full system prompt for a tenant + optional lead state.

    `lead_state` is a dict with keys `nome`, `motivo`, `urgencia`, `score`.
    Missing keys fall back to the "not yet recolhido" sentinel. Pass
    `None` to render without lead context (eval / stateless paths).

    `turn_number` is the count of clinic messages already sent in this
    conversation window. The prompt uses it as a hard gate against
    repeated greetings — turn 0 may greet, turn ≥ 1 must not.

    `last_clinic_message` is the most recent assistant utterance, useful
    so the prompt can flag cases like "we just asked for the lead's name
    in the previous turn" without re-deriving it from history.

    NOTE: dynamic placeholders (`{{today}}`, `{{lead_*}}`,
    `{{turn_number}}`) are intentionally NOT cached — the agent must
    always see fresh state.
    """
    state = lead_state or {}
    nome = (state.get("nome") or "").strip() or NOT_YET
    motivo = (state.get("motivo") or "").strip() or NOT_YET
    urgencia = (state.get("urgencia") or "").strip() or NOT_YET
    score = state.get("score")
    score_str = str(score) if score is not None else "0"

    is_first_turn = "sim" if turn_number <= 0 else "não"
    last_clinic = (last_clinic_message or "").strip() or NOT_YET

    template = _load_template()
    return (
        template
        .replace("{{voz}}", tenant_knowledge.load_voz(tenant_id))
        .replace("{{catalogo}}", tenant_knowledge.load_catalogo(tenant_id))
        .replace("{{politicas}}", tenant_knowledge.load_politicas(tenant_id))
        .replace("{{today}}", _today_string())
        .replace("{{calendario}}", _calendar_next_14_days())
        .replace("{{lead_nome}}", nome)
        .replace("{{lead_motivo}}", motivo)
        .replace("{{lead_urgencia}}", urgencia)
        .replace("{{lead_score}}", score_str)
        .replace("{{turn_number}}", str(max(0, turn_number)))
        .replace("{{is_first_turn}}", is_first_turn)
        .replace("{{last_clinic_message}}", last_clinic)
    )


def render_client_system_prompt(
    tenant_id: str,
    client_state: Optional[dict] = None,
    upcoming_appointments: str = "Nenhum agendamento futuro.",
    turn_number: int = 0,
    last_clinic_message: str = "",
) -> str:
    state = client_state or {}
    nome = (state.get("nome") or "").strip() or "Cliente"
    last_clinic = (last_clinic_message or "").strip() or NOT_YET

    template = _CLIENT_TEMPLATE_PATH.read_text(encoding="utf-8")
    return (
        template
        .replace("{{voz}}", tenant_knowledge.load_voz(tenant_id))
        .replace("{{catalogo}}", tenant_knowledge.load_catalogo(tenant_id))
        .replace("{{politicas}}", tenant_knowledge.load_politicas(tenant_id))
        .replace("{{today}}", _today_string())
        .replace("{{calendario}}", _calendar_next_14_days())
        .replace("{{client_nome}}", nome)
        .replace("{{upcoming_appointments}}", upcoming_appointments)
        .replace("{{turn_number}}", str(max(0, turn_number)))
        .replace("{{last_clinic_message}}", last_clinic)
    )
