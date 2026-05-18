"""Tests for the system prompt renderer (Phase 4c)."""

import pytest

from ia_service.services import tenant_knowledge
from ia_service.services.prompt_renderer import render_system_prompt


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()


def test_render_substitutes_voz_placeholder():
    txt = render_system_prompt("nonexistent-tenant")
    # The voz.md content should be inside the rendered prompt
    assert "Português europeu" in txt or "português europeu" in txt


def test_render_substitutes_catalogo_placeholder():
    txt = render_system_prompt("nonexistent-tenant")
    assert "Drenagem Linfática" in txt
    assert "Massagem Relaxante" in txt


def test_render_substitutes_politicas_placeholder():
    txt = render_system_prompt("nonexistent-tenant")
    assert "Cancelamento" in txt or "cancelamento" in txt


def test_render_no_unsubstituted_placeholders():
    txt = render_system_prompt("nonexistent-tenant")
    # All {{...}} should be replaced
    assert "{{voz}}" not in txt
    assert "{{catalogo}}" not in txt
    assert "{{politicas}}" not in txt


def test_render_includes_anti_hallucination_rule():
    txt = render_system_prompt("nonexistent-tenant")
    # The system prompt must remind LLM to call find_servico for prices
    assert "find_servico" in txt
