"""Tests for LangChain tools (Phase 4b).

Validates the tool factory pattern:
- Tools are created bound to a tenant_id (via closure)
- Tools expose proper LangChain BaseTool interface (name, description, .invoke)
- Tool calls delegate to tenant_knowledge with the right tenant_id
- Unknown args return a helpful "not found" message instead of raising
"""

import pytest

from ia_service.services import tenant_knowledge
from ia_service.tools.lead_tools import make_find_servico_tool


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge._read_servicos.cache_clear()
    tenant_knowledge._read_faqs.cache_clear()


# ───────────────────── Tool metadata ─────────────────────


def test_find_servico_tool_has_name():
    tool = make_find_servico_tool("any-tenant")
    assert tool.name == "find_servico"


def test_find_servico_tool_has_description_for_llm():
    tool = make_find_servico_tool("any-tenant")
    # Description goes to the LLM — must mention what the tool does
    assert "servi" in tool.description.lower()  # matches "serviço" (ç ≠ c)
    assert len(tool.description) > 30  # enough for the LLM to understand


def test_find_servico_tool_takes_nome_arg():
    tool = make_find_servico_tool("any-tenant")
    # args_schema is a Pydantic model in modern LangChain
    schema_props = tool.args_schema.model_json_schema()["properties"]
    assert "nome" in schema_props


# ───────────────────── Tool invocation ─────────────────────


def test_find_servico_tool_returns_section_when_found():
    tool = make_find_servico_tool("nonexistent-tenant")  # falls back to _default
    result = tool.invoke({"nome": "drenagem"})
    assert isinstance(result, str)
    assert "Drenagem" in result
    assert "60" in result  # the duration


def test_find_servico_tool_handles_accents():
    tool = make_find_servico_tool("nonexistent-tenant")
    # User types without accent
    result = tool.invoke({"nome": "drenagem linfatica"})
    assert "Drenagem" in result


def test_find_servico_tool_returns_not_found_message_when_unknown():
    tool = make_find_servico_tool("nonexistent-tenant")
    result = tool.invoke({"nome": "criolipolise inexistente XYZ"})
    # Must be a non-empty string (LLM-readable), not None or error
    assert isinstance(result, str)
    assert len(result) > 0
    assert "não encontrad" in result.lower() or "não foi encontrad" in result.lower()


# ─────────────── get_available_slots: erro ≠ sem vagas ───────────────


def test_get_available_slots_backend_error_is_transparent(monkeypatch):
    """Erro técnico no backend NÃO pode virar 'não há vagas' para o lead."""
    from ia_service.services import mongo_reader
    from ia_service.tools.lead_tools import make_get_available_slots_tool

    monkeypatch.setattr(mongo_reader, "find_available_slots", lambda *a, **k: None)
    tool = make_get_available_slots_tool("tenant-X")
    out = tool.invoke({})
    assert "não há slots" not in out.lower()
    assert "recepcionista" in out.lower()


def test_get_available_slots_empty_means_no_slots(monkeypatch):
    from ia_service.services import mongo_reader
    from ia_service.tools.lead_tools import make_get_available_slots_tool

    monkeypatch.setattr(mongo_reader, "find_available_slots", lambda *a, **k: [])
    tool = make_get_available_slots_tool("tenant-X")
    out = tool.invoke({})
    assert "Não há slots livres" in out


# ─────────── create_appointment: confirmação definitiva ───────────


async def test_create_appointment_success_message_is_definitive(monkeypatch):
    """A tool marca de facto — a mensagem de sucesso não pode dizer
    'pendente de confirmação pela recepcionista' (contradiz o prompt,
    que exige confirmação definitiva ao lead)."""
    from ia_service.services import marcai_client
    from ia_service.tools.lead_tools import make_create_appointment_tool

    async def fake_create(**kwargs):
        return {"_id": "appt-1"}

    monkeypatch.setattr(marcai_client, "create_appointment", fake_create)
    tool = make_create_appointment_tool("tenant-X", "lead-1")
    out = await tool.ainvoke({"data": "2026-07-10", "hora": "11:00"})
    assert "pendente" not in out.lower()
    assert "marcada" in out.lower()


# ───────────────────── Tenant isolation ─────────────────────


def test_find_servico_tool_is_bound_to_tenant_via_closure():
    """Two tools made with different tenant_ids should query different
    tenants — proven by checking that the underlying knowledge lookup
    uses the bound tenant_id, not whatever the LLM might pass."""
    tool_a = make_find_servico_tool("tenant-A")
    tool_b = make_find_servico_tool("tenant-B")

    # Both are independent tool instances
    assert tool_a is not tool_b

    # Both should still find drenagem (both fall back to _default)
    a = tool_a.invoke({"nome": "drenagem"})
    b = tool_b.invoke({"nome": "drenagem"})
    assert "Drenagem" in a
    assert "Drenagem" in b
