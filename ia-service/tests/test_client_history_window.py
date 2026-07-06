"""Janela de historico do client agent — caso Maria (2026-07-06).

A cliente respondeu 8h30 depois da resposta MANUAL da Laura e a janela
unica de 30 min cortava todo o historico: a IA cumprimentava como 1o
turno, ignorando a conversa em curso. Agora: HISTORICO ate 48h
(contexto), turn_number/last_clinic_message na janela de 30 min
(controlo de sessao).
"""

from datetime import datetime, timedelta, timezone

from ia_service.services import client_orchestrator, marcai_client


class _Log:
    def info(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


async def test_gap_de_horas_entra_no_contexto_mas_nao_conta_turno(monkeypatch):
    now = datetime.now(timezone.utc)

    async def fake_messages(**kwargs):
        return [
            {
                "direcao": "entrada",
                "mensagem": "Para que dia fica marcada a minha sessao?",
                "data": _iso(now - timedelta(hours=9)),
            },
            {
                "direcao": "saida",
                "mensagem": "Boa tarde Maria, nao tem sessao marcada, quer marcar?",
                "data": _iso(now - timedelta(hours=8, minutes=30)),
            },
            {
                "direcao": "saida",
                "mensagem": "mensagem antiga de ha 3 dias",
                "data": _iso(now - timedelta(days=3)),
            },
        ]

    monkeypatch.setattr(marcai_client, "get_client_messages", fake_messages)

    messages, turn_number, last_clinic = (
        await client_orchestrator._build_conversation_history(
            "t1", "c1", "Nao tenho nenhuma marcada. De preferencia sextas 16h.", _Log()
        )
    )

    texts = [m["content"] for m in messages]
    # resposta manual de 8h30 atras ENTRA no contexto (antes era cortada)
    assert any("quer marcar" in t for t in texts)
    # mais de 48h fica fora
    assert not any("3 dias" in t for t in texts)
    # sessao nova: mensagens antigas nao contam como turnos desta janela
    assert turn_number == 0
    assert last_clinic == ""
    # mensagem actual e sempre a ultima
    assert messages[-1]["content"].startswith("Nao tenho")


async def test_mensagem_recente_conta_turno(monkeypatch):
    now = datetime.now(timezone.utc)

    async def fake_messages(**kwargs):
        return [
            {
                "direcao": "saida",
                "mensagem": "Que dia lhe da jeito?",
                "data": _iso(now - timedelta(minutes=5)),
            },
        ]

    monkeypatch.setattr(marcai_client, "get_client_messages", fake_messages)

    messages, turn_number, last_clinic = (
        await client_orchestrator._build_conversation_history(
            "t1", "c1", "sexta", _Log()
        )
    )

    assert turn_number == 1
    assert last_clinic == "Que dia lhe da jeito?"
