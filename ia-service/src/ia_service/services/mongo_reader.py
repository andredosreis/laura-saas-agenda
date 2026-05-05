"""Read-only Mongo access for Phase 4 tools (available slots, lead lookup).

All writes go through marcai_client (HTTP to Node). Never add write methods here.
"""

from functools import lru_cache

import structlog
from bson import ObjectId
from pymongo import MongoClient

from ..config import settings

logger = structlog.get_logger()

_mongo_clients: dict[str, MongoClient] = {}


def _get_client(tenant_id: str) -> MongoClient:
    if tenant_id not in _mongo_clients:
        _mongo_clients[tenant_id] = MongoClient(settings.mongodb_uri)
    return _mongo_clients[tenant_id]


def get_tenant_db(tenant_id: str):
    db_name = f"{settings.mongodb_db_prefix}_tenant_{tenant_id}"
    return _get_client(tenant_id)[db_name]


def find_lead_by_phone(tenant_id: str, telefone: str) -> dict | None:
    telefone_norm = "".join(c for c in telefone if c.isdigit())
    try:
        tid = ObjectId(tenant_id)
    except Exception:
        return None
    db = get_tenant_db(tenant_id)
    return db.leads.find_one({"tenantId": tid, "telefone": telefone_norm})


def find_available_slots(tenant_id: str, dias_a_frente: int = 7) -> list[dict]:
    # Phase 4 — returns schedule slots with available times
    # Stub: returns empty list until Phase 4 implementation
    return []
