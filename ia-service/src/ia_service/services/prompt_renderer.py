"""System prompt renderer (Phase 4c).

Loads `prompts/system_lead_agent.md` and substitutes the placeholders
`{{voz}}`, `{{catalogo}}`, `{{politicas}}` with tenant-specific
markdown content (or `_default/` fallback).

Usage:
    from ia_service.services.prompt_renderer import render_system_prompt
    system_prompt = render_system_prompt(tenant_id)
    agent = create_agent(model, tools, system_prompt=system_prompt)
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from . import tenant_knowledge

# Resolve template path from this file: services/ → ia_service/ → prompts/
_TEMPLATE_PATH = (
    Path(__file__).parent.parent / "prompts" / "system_lead_agent.md"
)
_WEEKDAYS_PT = [
    "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado", "Domingo",
]


@lru_cache(maxsize=1)
def _load_template() -> str:
    """Load the system prompt template once. Cache forever."""
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def _today_string(timezone_name: str = "Europe/Lisbon") -> str:
    """Format today in PT for the LLM ('Quinta-feira, 8 de Maio de 2026')."""
    now = datetime.now(ZoneInfo(timezone_name))
    weekday = _WEEKDAYS_PT[now.weekday()]
    months = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ]
    return f"{weekday}, {now.day} de {months[now.month - 1]} de {now.year} (ISO: {now.strftime('%Y-%m-%d')})"


def render_system_prompt(tenant_id: str) -> str:
    """Return the full system prompt for a tenant, with placeholders filled.

    NOTE: `{{today}}` is intentionally NOT cached so the agent always sees
    the current date — important for "próxima semana" reasoning.
    """
    template = _load_template()
    return (
        template.replace("{{voz}}", tenant_knowledge.load_voz(tenant_id))
        .replace("{{catalogo}}", tenant_knowledge.load_catalogo(tenant_id))
        .replace("{{politicas}}", tenant_knowledge.load_politicas(tenant_id))
        .replace("{{today}}", _today_string())
    )
