"""Read-only Mongo access for Phase 4 tools (available slots, lead lookup).

All writes go through marcai_client (HTTP to Node). Never add write methods here.
"""

import structlog
from bson import ObjectId
from pymongo import MongoClient

from ..config import settings

logger = structlog.get_logger()

# Um único MongoClient partilhado (pool de ligações) — a URI é a mesma para
# todos os tenants; o isolamento é por DATABASE (`tenant_<id>`), não por client.
_mongo_client: MongoClient | None = None


def _get_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(settings.mongodb_uri)
    return _mongo_client


def get_tenant_db(tenant_id: str):
    # Matches Node convention in src/config/tenantDB.js: `tenant_<id>` (no prefix).
    db_name = f"tenant_{tenant_id}"
    return _get_client()[db_name]


def find_lead_by_phone(tenant_id: str, telefone: str) -> dict | None:
    telefone_norm = "".join(c for c in telefone if c.isdigit())
    try:
        tid = ObjectId(tenant_id)
    except Exception:
        return None
    db = get_tenant_db(tenant_id)
    return db.leads.find_one({"tenantId": tid, "telefone": telefone_norm})


def find_available_slots(
    tenant_id: str,
    dias_a_frente: int = 7,
    slot_duration_min: int = 60,
    timezone_name: str = "Europe/Lisbon",
) -> list[dict] | None:
    """Compute slots the IA can propose to leads.

    **Fonte única (F03 / ADR-028 Fase 2)**: esta função lê a disponibilidade
    do endpoint interno `/api/internal/disponibilidade` do backend Node — que
    calcula os slots a partir do painel (`Schedule` + `ScheduleException`,
    F01/F02). Deixou de usar `agent_business_rules.py` (RULES_PER_TENANT /
    DATE_OVERRIDES_PER_TENANT), que ficou deprecado. Assim, mudanças de horário
    feitas no painel chegam à IA em tempo real, sem rebuild do ia-service.

    Camadas de erro (mantidas distintas de propósito):
      • `marcai_client.fetch_available_slots` faz o GET e LANÇA em qualquer
        erro de HTTP/transporte.
      • esta função é a fronteira de erro: apanha qualquer erro e devolve
        `None` (erro TÉCNICO — a tool diz ao lead que vai confirmar com a
        recepcionista, nunca "não há vagas"). Devolve `[]` quando a resposta
        é válida mas sem vagas, ou quando `scheduleConfigured` é `false`
        (tenant sem horário definido). A distinção None ≠ [] existe para a
        IA não converter uma falha de rede em "não há disponibilidade".

    Return: `list[{date, time, weekday, iso}]` (ordem cronológica) ou `None`
    em erro técnico. `iso` é hora local naive (`YYYY-MM-DDTHH:MM:00`).

    Nota (D12): o filtro de estados passou a ser o whitelist do Node
    (`status ∈ ['Agendado','Confirmado']`); o blacklist Python foi retirado.
    """
    from . import marcai_client

    try:
        data = marcai_client.fetch_available_slots(
            tenant_id,
            days=dias_a_frente,
            duration=slot_duration_min,
        )
    except Exception as exc:  # transporte, HTTP 4xx/5xx, timeout
        logger.warning("available_slots_fetch_failed", tenant_id=tenant_id, error=str(exc))
        return None

    if not data or not data.get("scheduleConfigured"):
        return []

    free_slots: list[dict] = []
    for day in data.get("days", []):
        date_str = day.get("date")
        weekday = day.get("weekday")
        for time_str in day.get("slots", []):
            free_slots.append(
                {
                    "date": date_str,
                    "time": time_str,
                    "weekday": weekday,
                    "iso": f"{date_str}T{time_str}:00",
                }
            )
    return free_slots
