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
    # Matches Node convention in src/config/tenantDB.js: `tenant_<id>` (no prefix).
    db_name = f"tenant_{tenant_id}"
    return _get_client(tenant_id)[db_name]


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
) -> list[dict]:
    """Compute available slots for the next N days from Schedule + Agendamento.

    All times are computed in the clinic's local timezone (Europe/Lisbon by
    default). Appointments stored in UTC in Mongo are converted to local
    before comparison. Returned `iso` field is also in local time (naive,
    treat as Europe/Lisbon).

    Algorithm:
    1. For each day in [today, today + dias_a_frente] (local):
       a. Look up Schedule for that day-of-week (must be isActive=true).
       b. Generate candidate slots between startTime/endTime, skipping
          the break window.
    2. Read existing appointments (UTC), convert to local, treat each as
       occupying [start, start + slot_duration_min).
    3. A candidate slot is busy if it overlaps with any occupied interval.
    4. Skip past slots and break window.
    """
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(timezone_name)
    db = get_tenant_db(tenant_id)

    now_local = datetime.now(tz)
    today = now_local.date()
    end_date = today + timedelta(days=dias_a_frente)

    # Pre-fetch all appointments in the range, excluding cancelled.
    # Mongo stores UTC; convert to local for comparison.
    # Use a generous UTC window (-1d to +1d) to catch boundary cases.
    range_start_utc = datetime.combine(today - timedelta(days=1), datetime.min.time())
    range_end_utc = datetime.combine(end_date + timedelta(days=1), datetime.max.time())
    cancelled_status = {
        "Cancelado Pelo Cliente",
        "Cancelado Pelo Salão",
        "Cancelado Pelo Salao",  # accent variation
    }
    occupied_intervals: list[tuple[datetime, datetime]] = []
    for appt in db.agendamentos.find(
        {
            "dataHora": {"$gte": range_start_utc, "$lte": range_end_utc},
            "status": {"$nin": list(cancelled_status)},
        },
        {"dataHora": 1},
    ):
        # Mongo returns naive datetime stored as UTC — attach UTC, convert to local, drop tz
        utc = appt["dataHora"].replace(tzinfo=ZoneInfo("UTC"))
        appt_start = utc.astimezone(tz).replace(tzinfo=None, second=0, microsecond=0)
        appt_end = appt_start + timedelta(minutes=slot_duration_min)
        occupied_intervals.append((appt_start, appt_end))

    def _slot_is_free(slot_start: datetime, slot_end: datetime) -> bool:
        """A slot is free iff it does not overlap with any occupied interval."""
        for occ_start, occ_end in occupied_intervals:
            # Overlap when slot_start < occ_end AND slot_end > occ_start
            if slot_start < occ_end and slot_end > occ_start:
                return False
        return True

    # Build candidate slots
    weekday_labels_pt = [
        "Segunda", "Terça", "Quarta", "Quinta",
        "Sexta", "Sábado", "Domingo",
    ]
    free_slots: list[dict] = []

    current = today
    while current <= end_date:
        # Python: Monday=0, Sunday=6.   Schedule.dayOfWeek: Sunday=0, Saturday=6.
        # Map: python(0=Mon) → schedule(1=Mon), python(6=Sun) → schedule(0=Sun).
        py_weekday = current.weekday()
        sched_dow = (py_weekday + 1) % 7

        schedule = db.schedules.find_one(
            {"dayOfWeek": sched_dow, "isActive": True}
        )
        if not schedule:
            current += timedelta(days=1)
            continue

        start_h, start_m = map(int, schedule["startTime"].split(":"))
        end_h, end_m = map(int, schedule["endTime"].split(":"))
        break_start_h, break_start_m = map(int, schedule.get("breakStartTime", "12:00").split(":"))
        break_end_h, break_end_m = map(int, schedule.get("breakEndTime", "13:00").split(":"))

        slot = datetime.combine(current, datetime.min.time()).replace(
            hour=start_h, minute=start_m
        )
        end_of_day = datetime.combine(current, datetime.min.time()).replace(
            hour=end_h, minute=end_m
        )
        break_start = datetime.combine(current, datetime.min.time()).replace(
            hour=break_start_h, minute=break_start_m
        )
        break_end = datetime.combine(current, datetime.min.time()).replace(
            hour=break_end_h, minute=break_end_m
        )

        while slot < end_of_day:
            slot_end = slot + timedelta(minutes=slot_duration_min)
            # Slot extends beyond closing time
            if slot_end > end_of_day:
                break
            # Skip slots overlapping break window
            if slot < break_end and slot_end > break_start:
                slot += timedelta(minutes=slot_duration_min)
                continue
            # Skip past slots (today only) — compare in local time
            now_naive = now_local.replace(tzinfo=None)
            if slot < now_naive:
                slot += timedelta(minutes=slot_duration_min)
                continue
            if _slot_is_free(slot, slot_end):
                free_slots.append({
                    "date": slot.strftime("%Y-%m-%d"),
                    "time": slot.strftime("%H:%M"),
                    "weekday": weekday_labels_pt[py_weekday],
                    "iso": slot.isoformat(),
                })
            slot += timedelta(minutes=slot_duration_min)

        current += timedelta(days=1)

    return free_slots
