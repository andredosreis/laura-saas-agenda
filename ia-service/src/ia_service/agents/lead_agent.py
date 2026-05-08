"""Lead agent (Phase 4c).

Builds a LangChain agent for answering WhatsApp messages from new leads.
The agent has:
- A system prompt rendered from per-tenant markdown (voz, catálogo, políticas)
- Tools bound to the tenant via closure (find_servico for now)
- An LLM (default: gpt-4o-mini) for reasoning + tool selection

Usage:
    agent = make_lead_agent(tenant_id)
    result = agent.invoke({
        "messages": [{"role": "user", "content": "Quanto custa drenagem?"}]
    })
    reply = result["messages"][-1].content
"""

from __future__ import annotations

from typing import Any

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from ..config import settings
from ..services.prompt_renderer import render_system_prompt
from ..tools.lead_tools import make_find_servico_tool, make_get_available_slots_tool


# Model factory kept separate so tests can monkeypatch it with a fake LLM
def _build_model():
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
        api_key=settings.openai_api_key,
        timeout=20,  # seconds — fail fast on slow LLM
    )


def make_lead_agent(tenant_id: str) -> Any:
    """Create a LangChain agent bound to a tenant.

    The returned object exposes `.invoke({"messages": [...]})` (sync) and
    `.ainvoke({"messages": [...]})` (async) per LangChain v1 contract.
    """
    tools = [
        make_find_servico_tool(tenant_id),
        make_get_available_slots_tool(tenant_id),
    ]
    system_prompt = render_system_prompt(tenant_id)
    model = _build_model()
    return create_agent(model, tools=tools, system_prompt=system_prompt)
