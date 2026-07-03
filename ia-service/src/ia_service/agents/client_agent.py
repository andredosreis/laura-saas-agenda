"""Client agent (Client Lifecycle Phase 1).

Builds a LangChain agent for existing clients messaging via WhatsApp.
Reuses the same model factory as the lead agent but with a different
system prompt and tool set focused on appointment management.
"""

from __future__ import annotations

from typing import Any

from langchain.agents import create_agent

from ..services.prompt_renderer import render_client_system_prompt
from ..tools.client_tools import (
    make_avisar_equipa_tool,
    make_cancel_appointment_tool,
    make_create_client_appointment_tool,
    make_get_my_appointments_tool,
    make_get_my_packages_tool,
    make_pausar_atendimento_tool,
    make_registar_presenca_tool,
    make_reschedule_appointment_tool,
    make_sinalizar_renovacao_tool,
)
from ..tools.lead_tools import (
    make_find_servico_tool,
    make_get_available_slots_tool,
)
from .lead_agent import _build_model


def make_client_agent(
    tenant_id: str,
    cliente_id: str,
    client_state: dict | None = None,
    upcoming_appointments: str = "Nenhum agendamento futuro.",
    turn_number: int = 0,
    last_clinic_message: str = "",
    followup_context: str = "Nenhum follow-up pendente.",
    followup_agendamento_id: str | None = None,
) -> Any:
    tools = [
        make_find_servico_tool(tenant_id),
        make_get_available_slots_tool(tenant_id),
        make_get_my_packages_tool(tenant_id, cliente_id),
        make_get_my_appointments_tool(tenant_id, cliente_id),
        make_create_client_appointment_tool(tenant_id, cliente_id),
        make_reschedule_appointment_tool(tenant_id, cliente_id),
        make_cancel_appointment_tool(tenant_id, cliente_id),
        make_pausar_atendimento_tool(tenant_id, cliente_id),
        make_avisar_equipa_tool(tenant_id, cliente_id),
    ]
    # Tools de follow-up so existem quando ha follow-up pendente — o
    # agendamento alvo e capturado por closure, nunca escolhido pelo LLM.
    if followup_agendamento_id:
        tools.append(make_registar_presenca_tool(tenant_id, cliente_id, followup_agendamento_id))
        tools.append(make_sinalizar_renovacao_tool(tenant_id, cliente_id))
    system_prompt = render_client_system_prompt(
        tenant_id,
        client_state=client_state,
        upcoming_appointments=upcoming_appointments,
        turn_number=turn_number,
        last_clinic_message=last_clinic_message,
        followup_context=followup_context,
    )
    model = _build_model()
    return create_agent(model, tools=tools, system_prompt=system_prompt)
