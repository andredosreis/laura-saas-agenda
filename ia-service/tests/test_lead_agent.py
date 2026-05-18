"""Tests for lead_agent factory (Phase 4c).

We don't make real LLM calls here — those cost money and are
non-deterministic. We test that the factory wiring works:
- `make_lead_agent` returns a usable object
- The system prompt is rendered with tenant content
- Tools are bound to the right tenant

Real LLM behavior is validated via the manual smoke test in Step 4c-6.
"""

from __future__ import annotations

import os

import pytest

# All tests in this module need a (fake) OpenAI key so ChatOpenAI doesn't
# raise at construction. We never actually call OpenAI.
os.environ.setdefault("OPENAI_API_KEY", "sk-fake-for-tests")

from ia_service.agents import lead_agent
from ia_service.services import tenant_knowledge


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge._read_servicos.cache_clear()
    tenant_knowledge._read_faqs.cache_clear()


def test_make_lead_agent_returns_invocable_object():
    agent = lead_agent.make_lead_agent("tenant-X")
    # LangChain agents from create_agent() expose .invoke + .ainvoke
    assert hasattr(agent, "invoke")
    assert hasattr(agent, "ainvoke")


def test_make_lead_agent_uses_tenant_specific_prompt(monkeypatch):
    """Verify the rendered system prompt is passed to create_agent."""
    captured = {}

    def fake_create_agent(model, tools, system_prompt, **kwargs):
        captured["system_prompt"] = system_prompt
        captured["tools"] = tools
        # Return a stub object that mimics the agent interface
        class Stub:
            def invoke(self, *args, **kwargs):
                return None
            async def ainvoke(self, *args, **kwargs):
                return None
        return Stub()

    monkeypatch.setattr(lead_agent, "create_agent", fake_create_agent)
    lead_agent.make_lead_agent("tenant-Y")

    # System prompt is rendered with markdown content
    assert "Marcai" in captured["system_prompt"]
    assert "Drenagem Linfática" in captured["system_prompt"]
    # Find_servico tool is registered
    tool_names = [t.name for t in captured["tools"]]
    assert "find_servico" in tool_names


def test_make_lead_agent_for_different_tenants_creates_different_tools(monkeypatch):
    """Two tenants → two independent tool instances (closure isolation)."""
    captured_tools = []

    def fake_create_agent(model, tools, system_prompt, **kwargs):
        captured_tools.append(tools[0])
        class Stub:
            def invoke(self, *args, **kwargs):
                return None
            async def ainvoke(self, *args, **kwargs):
                return None
        return Stub()

    monkeypatch.setattr(lead_agent, "create_agent", fake_create_agent)

    lead_agent.make_lead_agent("tenant-A")
    lead_agent.make_lead_agent("tenant-B")

    assert len(captured_tools) == 2
    assert captured_tools[0] is not captured_tools[1]
