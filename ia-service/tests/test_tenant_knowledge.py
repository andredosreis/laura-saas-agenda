"""Tests for tenant_knowledge loader (Phase 4a).

Validates:
- Loading static prompt files (catalogo, voz, politicas)
- find_servico / find_faq with accent-insensitive matching
- Fallback to _default/ when tenant-specific dir missing
- LRU cache behavior (same call returns same string instance)
"""

import pytest

from ia_service.services import tenant_knowledge


@pytest.fixture(autouse=True)
def clear_caches():
    """Clear LRU caches between tests so file edits in one test don't leak."""
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge._read_servicos.cache_clear()
    tenant_knowledge._read_faqs.cache_clear()


# ───────────────────────── Static loaders ─────────────────────────


def test_load_catalogo_default_returns_seed_content():
    txt = tenant_knowledge.load_catalogo("nonexistent-tenant-id")
    assert "Drenagem Linfática" in txt
    assert "Massagem Relaxante" in txt


def test_load_voz_default_contains_tone_rules():
    txt = tenant_knowledge.load_voz("nonexistent-tenant-id")
    assert "português europeu" in txt.lower() or "portugues europeu" in txt.lower()


def test_load_politicas_default_contains_cancellation():
    txt = tenant_knowledge.load_politicas("nonexistent-tenant-id")
    assert "Cancelamento" in txt or "cancelamento" in txt


# ───────────────────────── find_servico ─────────────────────────


def test_find_servico_exact_match():
    txt = tenant_knowledge.find_servico("nonexistent", "Drenagem Linfática")
    assert txt is not None
    assert "60 minutos" in txt or "60 min" in txt


def test_find_servico_case_insensitive():
    txt = tenant_knowledge.find_servico("nonexistent", "DRENAGEM LINFÁTICA")
    assert txt is not None


def test_find_servico_accent_insensitive():
    # User types "drenagem linfatica" without accents
    txt = tenant_knowledge.find_servico("nonexistent", "drenagem linfatica")
    assert txt is not None
    assert "Drenagem" in txt  # response keeps original accents


def test_find_servico_partial_name_match():
    # Shorter query should still match longer service name
    txt = tenant_knowledge.find_servico("nonexistent", "drenagem")
    assert txt is not None


def test_find_servico_unknown_returns_none():
    txt = tenant_knowledge.find_servico("nonexistent", "criolipolise XYZ")
    assert txt is None


def test_find_servico_multi_word_query_with_filler():
    """LLM may search for 'pacote 10' but title has 'Pacote de 10' — must still match."""
    # Use Laura's tenant which has a "Pacote de 10 Sessões..." section
    txt = tenant_knowledge.find_servico("695413fb6ce936a9097af750", "pacote 10")
    assert txt is not None
    assert "Pacote de 10" in txt
    # Also "pre operatorio" → "Pré e Pós-Operatório"
    txt = tenant_knowledge.find_servico("695413fb6ce936a9097af750", "pre operatorio")
    assert txt is not None
    assert "Operatório" in txt or "operatório" in txt


# ───────────────────────── find_faq ─────────────────────────


def test_find_faq_about_payment():
    txt = tenant_knowledge.find_faq("nonexistent", "pagamento")
    assert txt is not None
    assert "Multibanco" in txt or "MB Way" in txt or "pagamento" in txt.lower()


def test_find_faq_about_cancel():
    txt = tenant_knowledge.find_faq("nonexistent", "cancelar")
    assert txt is not None


def test_find_faq_unknown_returns_none():
    txt = tenant_knowledge.find_faq("nonexistent", "cor do céu em marte")
    assert txt is None


# ───────────────────────── Cache behaviour ─────────────────────────


def test_load_catalogo_is_cached():
    a = tenant_knowledge.load_catalogo("tenant-X")
    b = tenant_knowledge.load_catalogo("tenant-X")
    # Same string instance from cache
    assert a is b


def test_different_tenants_have_separate_cache_entries():
    info = tenant_knowledge.load_catalogo.cache_info()
    initial_size = info.currsize
    tenant_knowledge.load_catalogo("tenant-A")
    tenant_knowledge.load_catalogo("tenant-B")
    assert tenant_knowledge.load_catalogo.cache_info().currsize == initial_size + 2
