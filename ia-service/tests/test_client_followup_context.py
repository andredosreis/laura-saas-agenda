"""Contexto de follow-up pendente: formatação + injecção no prompt."""

import pytest

from ia_service.services import tenant_knowledge
from ia_service.services.client_orchestrator import _format_followup_context
from ia_service.services.prompt_renderer import render_client_system_prompt

# Mesmo padrão de test_prompt_renderer.py: tenant desconhecido cai nos
# defaults genéricos; caches limpas entre testes.
TENANT_ID = "nonexistent-tenant"


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()


def test_format_followup_context_none():
    assert _format_followup_context(None) == "Nenhum follow-up pendente."


def test_format_followup_context_pendente():
    ctx = _format_followup_context(
        {"_id": "a1", "dataHora": "2026-07-02T13:00:00.000Z", "status": "Agendado"}
    )
    assert "PENDENTE" in ctx
    # UTC convertido para hora de parede de Lisboa (13:00Z = 14:00 WEST) —
    # o ISO cru fazia a IA anunciar a hora errada ao cliente.
    assert "2026-07-02 14:00" in ctx
    assert "hora de Lisboa" in ctx
    assert "Agendado" in ctx


def test_render_client_prompt_inclui_followup_context():
    prompt = render_client_system_prompt(
        TENANT_ID,
        client_state={"nome": "Maria"},
        followup_context="PENDENTE — sessao de ontem",
    )
    assert "PENDENTE — sessao de ontem" in prompt
    assert "{{followup_context}}" not in prompt


def test_render_client_prompt_default_sem_followup():
    prompt = render_client_system_prompt(TENANT_ID, client_state={"nome": "Maria"})
    assert "Nenhum follow-up pendente." in prompt
    assert "{{followup_context}}" not in prompt
