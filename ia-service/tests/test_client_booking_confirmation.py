"""Marcação pela IA: serviço do pacote no template + supressão da resposta.

Decisão 2026-07-03 (conversa da Dulce): o template automático "Agendamento
Confirmado" é a única confirmação que o cliente recebe — a resposta textual
do agente é suprimida — e mostra o serviço do pacote activo em vez do
genérico "Sessão".
"""

import pytest
from langchain.messages import AIMessage, HumanMessage, ToolMessage

from ia_service.services import marcai_client, tenant_knowledge
from ia_service.services.client_orchestrator import _booking_created_this_turn
from ia_service.services.prompt_renderer import render_client_system_prompt
from ia_service.tools.client_tools import (
    make_create_client_appointment_tool,
    make_reschedule_appointment_tool,
)

TENANT_ID = "nonexistent-tenant"


# ───────────────────── create: servico_nome do pacote ─────────────────────


async def test_create_passa_servico_do_pacote_activo(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        return [
            {"pacoteNome": "Drenagem Linfática Avançada", "sessoesRestantes": 3},
        ]

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_tool("t1", "c1")
    result = await tool.ainvoke({"data": "2026-07-30", "hora": "16:15"})

    assert result.startswith("OK")
    assert calls["servico_nome"] == "Drenagem Linfática Avançada"


async def test_create_ignora_pacote_sem_sessoes_restantes(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        return [{"pacoteNome": "Pacote Esgotado", "sessoesRestantes": 0}]

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_tool("t1", "c1")
    result = await tool.ainvoke({"data": "2026-07-30", "hora": "16:15"})

    assert result.startswith("OK")
    assert calls["servico_nome"] is None


async def test_create_marca_mesmo_se_consulta_de_pacotes_falhar(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        raise RuntimeError("500 Server Error")

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_tool("t1", "c1")
    result = await tool.ainvoke({"data": "2026-07-30", "hora": "16:15"})

    assert result.startswith("OK")
    assert calls["servico_nome"] is None


async def test_create_avisa_agente_que_resposta_nao_e_enviada(monkeypatch):
    async def fake_packages(**kwargs):
        return []

    async def fake_create(**kwargs):
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_tool("t1", "c1")
    result = await tool.ainvoke({"data": "2026-07-30", "hora": "16:15"})

    assert "NAO sera enviada" in result


async def test_reschedule_avisa_agente_que_resposta_nao_e_enviada(monkeypatch):
    async def fake_reschedule(**kwargs):
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "reschedule_client_appointment", fake_reschedule)

    tool = make_reschedule_appointment_tool("t1", "c1")
    result = await tool.ainvoke(
        {"agendamento_id": "a1", "nova_data": "2026-07-31", "nova_hora": "10:00"}
    )

    assert result.startswith("OK")
    assert "NAO sera enviada" in result


# ───────────────── orchestrator: supressão da resposta ─────────────────


def _turn(*extra):
    return [HumanMessage(content="quero marcar"), *extra]


def test_supressao_quando_create_ok():
    msgs = _turn(
        ToolMessage(
            content="OK — sessao marcada para 2026-07-30 as 16:15.",
            tool_call_id="c1",
            name="create_client_appointment",
        ),
        AIMessage(content="OK"),
    )
    assert _booking_created_this_turn(msgs) is True


def test_supressao_quando_reschedule_ok():
    msgs = _turn(
        ToolMessage(
            content="OK — agendamento reagendado para 2026-07-31 as 10:00.",
            tool_call_id="c1",
            name="reschedule_appointment",
        ),
        AIMessage(content="OK"),
    )
    assert _booking_created_this_turn(msgs) is True


def test_sem_supressao_quando_create_falha():
    msgs = _turn(
        ToolMessage(
            content="ERRO: o slot ja foi ocupado.",
            tool_call_id="c1",
            name="create_client_appointment",
        ),
        AIMessage(content="Esse horário acabou de ser ocupado, quer outro?"),
    )
    assert _booking_created_this_turn(msgs) is False


def test_sem_supressao_para_outras_tools():
    msgs = _turn(
        ToolMessage(
            content="OK — presenca registada.",
            tool_call_id="c1",
            name="registar_presenca",
        ),
        AIMessage(content="Que bom que correu bem!"),
    )
    assert _booking_created_this_turn(msgs) is False


def test_sem_supressao_sem_tool_calls():
    assert _booking_created_this_turn(_turn(AIMessage(content="Olá!"))) is False


# ───────────────── prompt: apenas o primeiro nome ─────────────────


@pytest.fixture(autouse=True)
def clear_caches():
    tenant_knowledge.load_catalogo.cache_clear()
    tenant_knowledge.load_voz.cache_clear()
    tenant_knowledge.load_politicas.cache_clear()
    tenant_knowledge.load_clinica_config.cache_clear()


def test_prompt_usa_apenas_primeiro_nome():
    prompt = render_client_system_prompt(
        TENANT_ID, client_state={"nome": "Dulce Felicidades Gerra"}
    )
    assert "Dulce" in prompt
    assert "Felicidades" not in prompt
    assert "Gerra" not in prompt


def test_prompt_nome_vazio_cai_no_default():
    prompt = render_client_system_prompt(TENANT_ID, client_state={"nome": "  "})
    assert "Cliente" in prompt


# ───────────────── horas ao modelo sempre em Lisboa ─────────────────


async def test_get_my_appointments_mostra_hora_de_lisboa(monkeypatch):
    from ia_service.tools.client_tools import make_get_my_appointments_tool

    async def fake_appointments(**kwargs):
        # 16:30 UTC em julho (WEST) = 17:30 de Lisboa — bug real: a IA dizia
        # "16:30" para uma sessao das 17:30.
        return [
            {
                "_id": "a1",
                "dataHora": "2026-07-30T16:30:00.000Z",
                "status": "Agendado",
                "tipo": "Sessao",
            }
        ]

    monkeypatch.setattr(marcai_client, "get_client_appointments", fake_appointments)

    tool = make_get_my_appointments_tool("t1", "c1")
    result = await tool.ainvoke({})

    assert "2026-07-30 17:30" in result
    assert "hora de Lisboa" in result
    assert "16:30" not in result
