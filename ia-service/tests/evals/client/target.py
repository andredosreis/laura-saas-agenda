"""Target function — invokes the client agent and returns reply + tool_calls."""

from __future__ import annotations

from typing import Any


async def client_agent_target(inputs: dict[str, Any]) -> dict[str, Any]:
    from ia_service.agents.client_agent import make_client_agent

    agent = make_client_agent(
        tenant_id=inputs["tenant_id"],
        cliente_id=inputs.get("cliente_id", "eval-placeholder"),
        client_state=inputs.get("client_state", {"nome": "Teste", "telefone": "351900000000"}),
        upcoming_appointments=inputs.get("upcoming_appointments", "Nenhum agendamento futuro."),
        turn_number=inputs.get("turn_number", 0),
        last_clinic_message=inputs.get("last_clinic_message", ""),
    )

    history = inputs.get("history", [])
    messages = list(history) + [{"role": "user", "content": inputs["current_message"]}]

    result = await agent.ainvoke(
        {"messages": messages},
        config={"run_name": "client_eval", "tags": ["eval"]},
    )

    last_msg = result["messages"][-1]
    raw = getattr(last_msg, "content", "")
    if isinstance(raw, list):
        reply = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw)
    else:
        reply = str(raw or "")

    tool_calls = []
    for msg in result["messages"]:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                tool_calls.append(tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", ""))

    return {"reply": reply.strip(), "tool_calls": tool_calls}
