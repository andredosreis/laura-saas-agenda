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

from functools import lru_cache
from pathlib import Path

from . import tenant_knowledge

# Resolve template path from this file: services/ → ia_service/ → prompts/
_TEMPLATE_PATH = (
    Path(__file__).parent.parent / "prompts" / "system_lead_agent.md"
)


@lru_cache(maxsize=1)
def _load_template() -> str:
    """Load the system prompt template once. Cache forever."""
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def render_system_prompt(tenant_id: str) -> str:
    """Return the full system prompt for a tenant, with placeholders filled."""
    template = _load_template()
    return (
        template.replace("{{voz}}", tenant_knowledge.load_voz(tenant_id))
        .replace("{{catalogo}}", tenant_knowledge.load_catalogo(tenant_id))
        .replace("{{politicas}}", tenant_knowledge.load_politicas(tenant_id))
    )
