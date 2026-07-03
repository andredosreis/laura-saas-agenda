"""Tests for the system prompt renderer (Phase 4c)."""

import pytest

from ia_service.services import tenant_knowledge
from ia_service.services.prompt_renderer import render_system_prompt


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()


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
    assert "{{clinica_nome}}" not in txt
    assert "{{owner_nome}}" not in txt
    assert "{{owner_profissao}}" not in txt


def test_render_includes_anti_hallucination_rule():
    txt = render_system_prompt("nonexistent-tenant")
    # The system prompt must remind LLM to call find_servico for prices
    assert "find_servico" in txt


def test_render_preco_entrada_comes_from_clinica_config(monkeypatch):
    """O preço de entrada é por tenant (clinica.md), nunca hardcoded no
    template partilhado — outro tenant não pode herdar os 40 € da Laura."""
    monkeypatch.setattr(
        tenant_knowledge,
        "load_clinica_config",
        lambda tid: {
            "nome": "Clínica X",
            "dona": "Maria",
            "profissao": "esteticista",
            "preco_entrada": "55 €",
        },
    )
    txt = render_system_prompt("whatever-tenant")
    assert "{{preco_entrada}}" not in txt
    assert "55 €" in txt
    assert "40 €" not in txt


def test_render_preco_entrada_default_preserves_40(monkeypatch):
    # Sem configuração explícita, o default mantém o comportamento actual
    txt = render_system_prompt("nonexistent-tenant")
    assert "{{preco_entrada}}" not in txt
    assert "40 €" in txt


def test_render_client_includes_tenant_politicas():
    from ia_service.services.prompt_renderer import render_client_system_prompt

    txt = render_client_system_prompt("nonexistent-tenant")
    assert "{{politicas}}" not in txt
    # "Privacidade" só existe no politicas.md do _default — prova que o
    # ficheiro do tenant é injectado no prompt do client agent.
    assert "Privacidade" in txt


def test_render_client_substitutes_preco_entrada():
    from ia_service.services.prompt_renderer import render_client_system_prompt

    txt = render_client_system_prompt("nonexistent-tenant")
    assert "{{preco_entrada}}" not in txt
    assert "40 €" in txt


def test_render_clinica_identity_per_tenant():
    # Tenant da Laura tem clinica.md próprio — identidade real injectada
    txt = render_system_prompt("695413fb6ce936a9097af750")
    assert "L.A. Estética Avançada" in txt
    assert "Laura" in txt

    # Tenant desconhecido cai nos defaults genéricos — nunca na identidade
    # de outro tenant (multi-tenancy nos prompts)
    txt_default = render_system_prompt("nonexistent-tenant")
    assert "L.A. Estética" not in txt_default
    assert "Laura" not in txt_default


def test_clinica_config_includes_preco_entrada_default():
    cfg = tenant_knowledge.load_clinica_config("nonexistent-tenant")
    assert cfg["preco_entrada"] == "40 €"
