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
