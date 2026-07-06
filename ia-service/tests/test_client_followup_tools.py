"""Tools de alerta à equipa (registar_presenca, sinalizar_renovacao, avisar_equipa)."""

from ia_service.services import marcai_client
from ia_service.tools.client_tools import (
    make_avisar_equipa_tool,
    make_registar_presenca_tool,
    make_sinalizar_renovacao_tool,
)


async def test_registar_presenca_compareceu(monkeypatch):
    calls = {}

    async def fake_registar(**kwargs):
        calls.update(kwargs)
        return {"statusAtualizado": True, "status": "Compareceu"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True, "feedback": "correu bem"})

    assert "OK" in result
    assert calls["tenant_id"] == "t1"
    assert calls["cliente_id"] == "c1"
    assert calls["agendamento_id"] == "a1"
    assert calls["compareceu"] is True
    assert calls["feedback"] == "correu bem"


async def test_registar_presenca_faltou_sugere_remarcar(monkeypatch):
    async def fake_registar(**kwargs):
        return {"statusAtualizado": True, "status": "Não Compareceu"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": False})

    assert "remarcar" in result.lower()


async def test_registar_presenca_noop_quando_laura_ja_definiu(monkeypatch):
    async def fake_registar(**kwargs):
        return {"statusAtualizado": False, "status": "Realizado"}

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True})

    assert "nao foi alterado" in result.lower().replace("ã", "a")


async def test_registar_presenca_erro_http_nao_rebenta(monkeypatch):
    async def fake_registar(**kwargs):
        raise RuntimeError("500 Server Error")

    monkeypatch.setattr(marcai_client, "registar_presenca", fake_registar)

    tool = make_registar_presenca_tool("t1", "c1", "a1")
    result = await tool.ainvoke({"compareceu": True})

    assert "ERRO" in result


async def test_sinalizar_renovacao_avisa_equipa(monkeypatch):
    calls = {}

    async def fake_sinalizar(**kwargs):
        calls.update(kwargs)
        return {"whatsappEnviado": True, "pushEnviado": False}

    monkeypatch.setattr(marcai_client, "sinalizar_renovacao", fake_sinalizar)

    tool = make_sinalizar_renovacao_tool("t1", "c1")
    result = await tool.ainvoke({})

    assert "OK" in result
    assert "precos" in result.lower().replace("ç", "c")
    assert calls == {"tenant_id": "t1", "cliente_id": "c1"}


async def test_sinalizar_renovacao_erro_degrada(monkeypatch):
    async def fake_sinalizar(**kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(marcai_client, "sinalizar_renovacao", fake_sinalizar)

    tool = make_sinalizar_renovacao_tool("t1", "c1")
    result = await tool.ainvoke({})

    assert "ERRO" in result


async def test_avisar_equipa_envia_motivo(monkeypatch):
    calls = {}

    async def fake_alertar(**kwargs):
        calls.update(kwargs)
        return {"whatsappEnviado": True, "pushEnviado": False}

    monkeypatch.setattr(marcai_client, "alertar_equipa", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "c1")
    result = await tool.ainvoke({"motivo": "Cliente diz ter 3 sessoes; ficha mostra 1"})

    assert "OK" in result
    assert "NAO bloqueia" in result
    assert calls == {
        "tenant_id": "t1",
        "cliente_id": "c1",
        "motivo": "Cliente diz ter 3 sessoes; ficha mostra 1",
    }


async def test_avisar_equipa_erro_nao_rebenta(monkeypatch):
    async def fake_alertar(**kwargs):
        raise RuntimeError("500 Server Error")

    monkeypatch.setattr(marcai_client, "alertar_equipa", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "c1")
    result = await tool.ainvoke({"motivo": "x"})

    assert "ERRO" in result


async def test_avisar_equipa_deduplicado_avisa_modelo(monkeypatch):
    async def fake_alertar(**kwargs):
        return {"whatsappEnviado": False, "pushEnviado": False, "deduplicado": True}

    monkeypatch.setattr(marcai_client, "alertar_equipa", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "c1")
    result = await tool.ainvoke({"motivo": "x"})

    assert "JA tinha sido avisada" in result


async def test_avisar_equipa_sem_canal_nao_mente(monkeypatch):
    # Tenant sem numeroWhatsapp: rota devolve 200 mas nada foi entregue —
    # a tool tem de o dizer ao modelo em vez de "equipa avisada".
    async def fake_alertar(**kwargs):
        return {"whatsappEnviado": False, "pushEnviado": False}

    monkeypatch.setattr(marcai_client, "alertar_equipa", fake_alertar)

    tool = make_avisar_equipa_tool("t1", "c1")
    result = await tool.ainvoke({"motivo": "x"})

    assert "ATENCAO" in result
    assert "equipa avisada" not in result
