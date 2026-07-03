"""_period_of_day deve usar a hora de Lisboa, não UTC.

Fix: em horário de verão (UTC+1) o fallback dizia "Boa tarde" às 19:30
locais e "Boa noite" às 06:30 da manhã.
"""

from datetime import datetime, timezone

from ia_service.services import client_orchestrator, lead_orchestrator


def test_lead_summer_evening_is_noite():
    # 18:30 UTC em Julho = 19:30 em Lisboa → noite
    dt = datetime(2026, 7, 3, 18, 30, tzinfo=timezone.utc)
    assert lead_orchestrator._period_of_day(dt) == "noite"


def test_lead_summer_early_morning_is_manha():
    # 05:30 UTC em Julho = 06:30 em Lisboa → manhã
    dt = datetime(2026, 7, 3, 5, 30, tzinfo=timezone.utc)
    assert lead_orchestrator._period_of_day(dt) == "manha"


def test_lead_winter_utc_matches_lisbon():
    # Inverno: Lisboa = UTC → 18:30 é tarde nos dois referenciais
    dt = datetime(2026, 1, 15, 18, 30, tzinfo=timezone.utc)
    assert lead_orchestrator._period_of_day(dt) == "tarde"


def test_client_summer_evening_is_noite():
    dt = datetime(2026, 7, 3, 18, 30, tzinfo=timezone.utc)
    assert client_orchestrator._period_of_day(dt) == "noite"
