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

from ..config import settings
from ..services.prompt_renderer import render_system_prompt
from ..tools.lead_tools import (
    make_avisar_equipa_tool,
    make_create_appointment_tool,
    make_find_servico_tool,
    make_get_available_slots_tool,
    make_move_lead_stage_tool,
    make_qualify_lead_tool,
    make_update_lead_info_tool,
)


# Model factory kept separate so tests can monkeypatch it with a fake LLM.
# Provider is selected via settings.llm_provider ('gemini' default, 'openai' opt-in).
def _build_model():
    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.agent_model_openai,
            temperature=0,
            api_key=settings.openai_api_key,
            timeout=20,
        )

    if settings.llm_provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=settings.agent_model_anthropic,
            temperature=0,
            api_key=settings.anthropic_api_key,
            timeout=20,
            max_tokens=2048,
        )

    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.agent_model_gemini,
        temperature=0,
        google_api_key=settings.google_api_key,
        timeout=20,
    )


def make_lead_agent(
    tenant_id: str,
    lead_id: str | None = None,
    lead_state: dict | None = None,
    turn_number: int = 0,
    last_clinic_message: str = "",
) -> Any:
    """Create a LangChain agent bound to a tenant + (optionally) a lead.

    `lead_id` is required for the qualification tools (update_lead_info,
    qualify_lead, move_lead_stage). When omitted, only the read-only
    tools (find_servico, get_available_slots) are exposed — useful for
    evals or stateless calls.

    `lead_state` is the persisted state of the Lead at the moment of
    invocation. Keys: `nome`, `motivo`, `urgencia`, `score`. Injected
    into the system prompt as `{{lead_*}}` placeholders so the agent
    never has to guess what it already knows. Pass `None` when there
    is no Lead context yet.

    `turn_number` is the count of clinic messages already sent in this
    conversation window. Surfaced in the system prompt as a hard gate
    against repeated greetings (BUG-001).

    `last_clinic_message` is the previous assistant utterance, surfaced
    to the prompt so the agent can detect "we just asked for the name"
    without re-walking history (BUG-002).
    """
    tools = [
        make_find_servico_tool(tenant_id),
        make_get_available_slots_tool(tenant_id),
    ]
    if lead_id:
        tools.extend(
            [
                make_update_lead_info_tool(tenant_id, lead_id),
                make_qualify_lead_tool(tenant_id, lead_id),
                make_move_lead_stage_tool(tenant_id, lead_id),
                make_create_appointment_tool(tenant_id, lead_id),
                make_avisar_equipa_tool(tenant_id, lead_id),
            ]
        )
    system_prompt = render_system_prompt(
        tenant_id,
        lead_state=lead_state,
        turn_number=turn_number,
        last_clinic_message=last_clinic_message,
    )
    model = _build_model()
    return create_agent(model, tools=tools, system_prompt=system_prompt)
