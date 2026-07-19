"""Par emendado: duas sessoes seguidas, uma por pacote (decisao 2026-07-19).

Cliente com dois pacotes (ex: rosto + corpo) marca duas sessoes SEGUIDAS —
a 2a comeca 60 min depois da 1a, sem arrumacao entre elas. Cada sessao liga
ao seu CompraPacote; o backend valida o span de 120 min contra a grelha.
"""

from langchain.messages import AIMessage, HumanMessage, ToolMessage

from ia_service.services import marcai_client, mongo_reader
from ia_service.services.client_orchestrator import _booking_created_this_turn
from ia_service.tools.client_tools import (
    make_create_client_appointment_pair_tool,
    make_create_client_appointment_tool,
    make_get_pair_slots_tool,
)

PACOTES = [
    {"_id": "cp-rosto", "pacoteNome": "Drenagem Rosto", "sessoesRestantes": 3},
    {"_id": "cp-corpo", "pacoteNome": "Drenagem Corpo", "sessoesRestantes": 5},
]


# ───────────────────── create_client_appointment_pair ─────────────────────


async def test_pair_resolve_pacotes_e_envia_par(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        return PACOTES

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"par": True}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_pair_tool("t1", "c1")
    result = await tool.ainvoke(
        {
            "data": "2026-08-04",
            "hora": "10:00",
            "servico_primeira": "Drenagem Rosto",
            "servico_segunda": "Drenagem Corpo",
        }
    )

    assert result.startswith("OK")
    assert calls["compra_pacote_id"] == "cp-rosto"
    assert calls["servico_nome"] == "Drenagem Rosto"
    assert calls["par"] == {"servicoNome": "Drenagem Corpo", "compraPacoteId": "cp-corpo"}


async def test_pair_match_tolera_acentos_e_caixa(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        return [
            {"_id": "cp1", "pacoteNome": "Drenagem Linfática Rosto", "sessoesRestantes": 2},
            {"_id": "cp2", "pacoteNome": "Drenagem Linfática Corpo", "sessoesRestantes": 2},
        ]

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"par": True}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_pair_tool("t1", "c1")
    result = await tool.ainvoke(
        {
            "data": "2026-08-04",
            "hora": "10:00",
            "servico_primeira": "drenagem linfatica rosto",
            "servico_segunda": "DRENAGEM LINFATICA CORPO",
        }
    )

    assert result.startswith("OK")
    assert calls["compra_pacote_id"] == "cp1"
    assert calls["par"]["compraPacoteId"] == "cp2"


async def test_pair_pacote_em_falta_nao_marca(monkeypatch):
    async def fake_packages(**kwargs):
        return [PACOTES[0]]  # so tem o de rosto

    created = []

    async def fake_create(**kwargs):
        created.append(kwargs)
        return {"par": True}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_pair_tool("t1", "c1")
    result = await tool.ainvoke(
        {
            "data": "2026-08-04",
            "hora": "10:00",
            "servico_primeira": "Drenagem Rosto",
            "servico_segunda": "Drenagem Corpo",
        }
    )

    assert result.startswith("ERRO")
    assert "Drenagem Corpo" in result
    assert created == []


async def test_pair_limite_atingido_da_instrucao_clara(monkeypatch):
    async def fake_packages(**kwargs):
        return PACOTES

    async def fake_create(**kwargs):
        raise RuntimeError("409 max_pending_reached")

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_pair_tool("t1", "c1")
    result = await tool.ainvoke(
        {
            "data": "2026-08-04",
            "hora": "10:00",
            "servico_primeira": "Drenagem Rosto",
            "servico_segunda": "Drenagem Corpo",
        }
    )

    assert result.startswith("ERRO")
    assert "limite" in result.lower()


# ──────────────────────────── get_pair_slots ────────────────────────────


def test_pair_slots_usa_duracao_120(monkeypatch):
    seen = {}

    def fake_slots(tenant_id, dias_a_frente=7, slot_duration_min=60, **kwargs):
        seen["slot_duration_min"] = slot_duration_min
        return [
            {"date": "2026-08-04", "time": t, "weekday": "Terça", "iso": f"2026-08-04T{t}:00"}
            for t in ("10:00", "13:00")
        ]

    monkeypatch.setattr(mongo_reader, "find_available_slots", fake_slots)

    tool = make_get_pair_slots_tool("t1")
    result = tool.invoke({})

    assert seen["slot_duration_min"] == 120
    assert "10:00" in result and "13:00" in result
    assert "60 minutos depois" in result


# ─────────────── single: ligacao do compraPacote (gap antigo) ───────────────


async def test_single_envia_compra_pacote_id(monkeypatch):
    calls = {}

    async def fake_packages(**kwargs):
        return PACOTES

    async def fake_create(**kwargs):
        calls.update(kwargs)
        return {"_id": "a1"}

    monkeypatch.setattr(marcai_client, "get_client_packages", fake_packages)
    monkeypatch.setattr(marcai_client, "create_client_appointment", fake_create)

    tool = make_create_client_appointment_tool("t1", "c1")
    result = await tool.ainvoke({"data": "2026-08-04", "hora": "10:00"})

    assert result.startswith("OK")
    assert calls["compra_pacote_id"] == "cp-rosto"


# ───────────────── orchestrator: supressao da resposta ─────────────────


def test_supressao_quando_par_ok():
    msgs = [
        HumanMessage(content="quero rosto e corpo"),
        ToolMessage(
            content="OK — par marcado: Drenagem Rosto as 10:00 e Drenagem Corpo logo a seguir.",
            tool_call_id="c1",
            name="create_client_appointment_pair",
        ),
        AIMessage(content="OK"),
    ]
    assert _booking_created_this_turn(msgs) is True
