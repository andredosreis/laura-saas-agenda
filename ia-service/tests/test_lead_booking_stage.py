"""Detecção determinística de marcação do lead via ToolMessage.

Com a confirmação automática do sistema, a resposta do agente passou a ser
só o complemento logístico (morada/mapa) — o regex _BOOKING_REGEX pode não
disparar. O stage 'agendado' move-se pela ToolMessage de create_appointment.
"""

from langchain.messages import AIMessage, HumanMessage, ToolMessage

from ia_service.services.lead_orchestrator import _booking_created_this_turn


def _turn(*extra):
    return [HumanMessage(content="pode ser às 11h"), *extra]


def test_detecta_create_appointment_ok():
    msgs = _turn(
        ToolMessage(
            content="OK — avaliação marcada para 2026-07-10 às 11:00.",
            tool_call_id="c1",
            name="create_appointment",
        ),
        AIMessage(content="A clínica fica na Rua X..."),
    )
    assert _booking_created_this_turn(msgs) is True


def test_ignora_create_appointment_com_erro():
    msgs = _turn(
        ToolMessage(
            content="ERRO: o slot já foi ocupado por outro cliente.",
            tool_call_id="c1",
            name="create_appointment",
        ),
        AIMessage(content="Esse horário acabou de ser ocupado..."),
    )
    assert _booking_created_this_turn(msgs) is False


def test_ignora_outras_tools():
    msgs = _turn(
        ToolMessage(
            content="OK — lead qualificado.",
            tool_call_id="c1",
            name="qualify_lead",
        ),
        AIMessage(content="..."),
    )
    assert _booking_created_this_turn(msgs) is False


def test_sem_tools_e_false():
    assert _booking_created_this_turn(_turn(AIMessage(content="Olá!"))) is False


# ───────────── avisar_equipa (lead) + notas da ficha no prompt ─────────────


async def test_avisar_equipa_lead_envia_motivo(monkeypatch):
    from ia_service.services import marcai_client
    from ia_service.tools.lead_tools import make_avisar_equipa_tool

    calls = {}

    async def fake_alertar(**kwargs):
        calls.update(kwargs)
        return {"whatsappEnviado": True, "pushEnviado": False}

    monkeypatch.setattr(marcai_client, "alertar_equipa_lead", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "l1")
    result = await tool.ainvoke({"motivo": "Lead só até 15/07; sem vagas antes"})

    assert "OK" in result
    assert calls == {
        "tenant_id": "t1",
        "lead_id": "l1",
        "motivo": "Lead só até 15/07; sem vagas antes",
    }


async def test_avisar_equipa_lead_erro_nao_rebenta(monkeypatch):
    from ia_service.services import marcai_client
    from ia_service.tools.lead_tools import make_avisar_equipa_tool

    async def fake_alertar(**kwargs):
        raise RuntimeError("500 Server Error")

    monkeypatch.setattr(marcai_client, "alertar_equipa_lead", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "l1")
    result = await tool.ainvoke({"motivo": "x"})

    assert "ERRO" in result


def test_prompt_lead_injeta_observacoes():
    from ia_service.services import tenant_knowledge
    from ia_service.services.prompt_renderer import render_system_prompt

    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()

    prompt = render_system_prompt(
        "nonexistent-tenant",
        lead_state={
            "nome": "Hayzel",
            "observacoes": "Estadia em Portugal apenas até 15 de julho.",
        },
    )
    assert "Estadia em Portugal apenas até 15 de julho." in prompt
    assert "{{lead_observacoes}}" not in prompt


def test_prompt_client_injeta_notas():
    from ia_service.services import tenant_knowledge
    from ia_service.services.prompt_renderer import render_client_system_prompt

    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()

    prompt = render_client_system_prompt(
        "nonexistent-tenant",
        client_state={"nome": "Maria", "observacoes": "De férias até 20/08."},
    )
    assert "De férias até 20/08." in prompt
    assert "{{client_notas}}" not in prompt


def test_prompt_lead_injeta_aviso_clinica():
    from ia_service.services import tenant_knowledge
    from ia_service.services.prompt_renderer import render_system_prompt

    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()

    prompt = render_system_prompt(
        "nonexistent-tenant",
        lead_state={
            "nome": "Maria",
            "aviso_clinica": "Clínica fechada de 7 a 29/07; reabrimos a 30/07.",
        },
    )
    assert "Clínica fechada de 7 a 29/07; reabrimos a 30/07." in prompt
    assert "{{aviso_clinica}}" not in prompt


def test_prompt_client_injeta_aviso_clinica():
    from ia_service.services import tenant_knowledge
    from ia_service.services.prompt_renderer import render_client_system_prompt

    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()

    prompt = render_client_system_prompt(
        "nonexistent-tenant",
        client_state={"nome": "Maria", "aviso_clinica": "Clínica fechada de 7 a 29/07."},
    )
    assert "Clínica fechada de 7 a 29/07." in prompt
    assert "{{aviso_clinica}}" not in prompt


def test_prompt_sem_aviso_usa_sentinela():
    from ia_service.services import tenant_knowledge
    from ia_service.services.prompt_renderer import render_client_system_prompt

    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()

    prompt = render_client_system_prompt("nonexistent-tenant", client_state={"nome": "Maria"})
    assert "(sem avisos)" in prompt
