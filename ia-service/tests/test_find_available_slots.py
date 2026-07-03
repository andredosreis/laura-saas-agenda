"""F03 — find_available_slots reads from the internal endpoint (not agent_business_rules).

All HTTP is mocked with respx — no real cross-service calls.
"""

import httpx
import respx
from httpx import Response

from ia_service.services import mongo_reader

ENDPOINT = "http://marcai-test/api/internal/disponibilidade"
TENANT = "695413fb6ce936a9097af750"

TWO_DAYS_PAYLOAD = {
    "success": True,
    "data": {
        "tenantId": TENANT,
        "timezone": "Europe/Lisbon",
        "duration": 60,
        "scheduleConfigured": True,
        "days": [
            {
                "date": "2026-07-15",
                "weekday": "Quarta",
                "isException": False,
                "exceptionType": None,
                "slots": ["09:00", "10:00"],
            },
            {
                "date": "2026-07-16",
                "weekday": "Quinta",
                "isException": False,
                "exceptionType": None,
                "slots": ["11:00"],
            },
        ],
    },
}


def test_reshapes_endpoint_slots_into_flat_chronological_list():
    with respx.mock:
        respx.get(ENDPOINT).mock(return_value=Response(200, json=TWO_DAYS_PAYLOAD))
        slots = mongo_reader.find_available_slots(TENANT)

    assert slots == [
        {"date": "2026-07-15", "time": "09:00", "weekday": "Quarta", "iso": "2026-07-15T09:00:00"},
        {"date": "2026-07-15", "time": "10:00", "weekday": "Quarta", "iso": "2026-07-15T10:00:00"},
        {"date": "2026-07-16", "time": "11:00", "weekday": "Quinta", "iso": "2026-07-16T11:00:00"},
    ]


def test_schedule_not_configured_returns_empty():
    payload = {"success": True, "data": {"scheduleConfigured": False, "days": []}}
    with respx.mock:
        respx.get(ENDPOINT).mock(return_value=Response(200, json=payload))
        assert mongo_reader.find_available_slots(TENANT) == []


def test_endpoint_500_returns_none_no_exception():
    # None = erro técnico (≠ [] = genuinamente sem vagas) — permite à tool
    # distinguir "não há vagas" de "não consegui consultar" na resposta ao lead.
    with respx.mock:
        respx.get(ENDPOINT).mock(
            return_value=Response(500, json={"success": False, "error": "Erro interno"})
        )
        assert mongo_reader.find_available_slots(TENANT) is None


def test_endpoint_timeout_returns_none_no_exception():
    with respx.mock:
        respx.get(ENDPOINT).mock(side_effect=httpx.TimeoutException("timeout"))
        assert mongo_reader.find_available_slots(TENANT) is None


def test_source_switch_does_not_use_agent_business_rules(monkeypatch):
    """Regression: the slot source is the endpoint, not agent_business_rules."""
    from ia_service.services import agent_business_rules

    def _boom(*args, **kwargs):
        raise AssertionError("agent_business_rules must not be the source of slots (F03)")

    monkeypatch.setattr(agent_business_rules, "get_rule_for_date", _boom)
    monkeypatch.setattr(agent_business_rules, "get_day_rule", _boom)

    with respx.mock:
        respx.get(ENDPOINT).mock(return_value=Response(200, json=TWO_DAYS_PAYLOAD))
        slots = mongo_reader.find_available_slots(TENANT)

    assert len(slots) == 3  # sourced from the endpoint, agent_business_rules untouched
