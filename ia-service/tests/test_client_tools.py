"""Client tools — limite de 24h para reagendar/cancelar.

Fix: `get_my_appointments` arredondava as horas para inteiro ANTES de
comparar com 24 — uma sessão a 23h36 aparecia como "24h" e reagendável.
A comparação passa a usar o float sem arredondar.
"""

from datetime import datetime, timedelta, timezone

from ia_service.services import marcai_client
from ia_service.tools.client_tools import make_get_my_appointments_tool


def _appt_at(dt):
    return {
        "_id": "appt-1",
        "dataHora": dt.isoformat().replace("+00:00", "Z"),
        "status": "Agendado",
        "tipo": "Sessao",
    }


async def test_appointment_23h36_away_is_not_reschedulable(monkeypatch):
    dt = datetime.now(timezone.utc) + timedelta(hours=23, minutes=36)

    async def fake_appointments(**kwargs):
        return [_appt_at(dt)]

    monkeypatch.setattr(marcai_client, "get_client_appointments", fake_appointments)
    tool = make_get_my_appointments_tool("tenant-x", "cliente-1")
    out = await tool.ainvoke({})
    assert "NAO (<24h)" in out
    assert "SIM" not in out


async def test_appointment_25h_away_is_reschedulable(monkeypatch):
    dt = datetime.now(timezone.utc) + timedelta(hours=25)

    async def fake_appointments(**kwargs):
        return [_appt_at(dt)]

    monkeypatch.setattr(marcai_client, "get_client_appointments", fake_appointments)
    tool = make_get_my_appointments_tool("tenant-x", "cliente-1")
    out = await tool.ainvoke({})
    assert "SIM" in out
