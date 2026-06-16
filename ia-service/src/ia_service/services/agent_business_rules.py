"""Agent business rules — what the IA can propose to leads.

⚠️ IMPORTANTE — Quando editar este ficheiro:
==============================================
Estas regras controlam APENAS o que a IA conversacional propõe ao lead
via WhatsApp. Não restringem agendamentos manuais — a Laura continua
livre para marcar a qualquer hora pelo painel admin.

Estrutura:
- `RULES_PER_TENANT[<tenantId>]` define as regras de cada clínica
- `_default` é o fallback para tenants sem regras explícitas
- `weekday`: Python convention — 0=Segunda, 1=Terça, …, 6=Domingo
- Se um dia for `None` → fechado para a IA propor
- `start`/`end`: hora local da clínica em formato "HH:MM"
- `break_start`/`break_end`: opcional — se omitido, não há pausa

Para mudar (ex: Sábado abrir até às 17:00):
1. Encontre o tenant em `RULES_PER_TENANT`
2. Edite o "saturday" como quiser
3. Reinicie o ia-service (no Render: redeploy)

Para adicionar um tenant novo:
1. Adicione uma chave nova com o tenantId
2. Copie a estrutura do `_default` e ajuste

Não precisa adicionar tenant aqui se as regras default servirem.
"""

from __future__ import annotations

from datetime import date
from typing import Optional, TypedDict

# 0=Monday, 1=Tuesday, ..., 6=Sunday (Python's datetime.weekday() convention)
WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


class DayRule(TypedDict, total=False):
    start: str  # "HH:MM" hora local
    end: str  # "HH:MM" hora local
    break_start: str  # opcional
    break_end: str  # opcional


# Map: tenant_id → { day_name → DayRule | None (None = fechado) }
RULES_PER_TENANT: dict[str, dict[str, Optional[DayRule]]] = {
    # L.A. Estética Avançada (Laura) — pilot
    "695413fb6ce936a9097af750": {
        "monday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "tuesday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "wednesday": {
            "start": "09:00",
            "end": "19:00",
            "break_start": "12:00",
            "break_end": "13:00",
        },
        "thursday": {
            "start": "09:00",
            "end": "19:00",
            "break_start": "12:00",
            "break_end": "13:00",
        },
        "friday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "saturday": {"start": "09:00", "end": "13:00"},  # 4h sem break
        "sunday": None,  # fechado
    },
    # Default para clínicas novas que ainda não definiram regras
    "_default": {
        "monday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "tuesday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "wednesday": {
            "start": "09:00",
            "end": "19:00",
            "break_start": "12:00",
            "break_end": "13:00",
        },
        "thursday": {
            "start": "09:00",
            "end": "19:00",
            "break_start": "12:00",
            "break_end": "13:00",
        },
        "friday": {"start": "09:00", "end": "19:00", "break_start": "12:00", "break_end": "13:00"},
        "saturday": {"start": "09:00", "end": "13:00"},
        "sunday": None,
    },
}


# ════════════════════════════════════════════════════════════════════════
# EXCEÇÕES POR DATA (feriados e dias especiais) — EDITA AQUI LIVREMENTE
# ════════════════════════════════════════════════════════════════════════
# Sobrepõem a regra normal do dia da semana, SÓ para a data indicada.
# Formato da chave: "YYYY-MM-DD".  Valor:
#   - None                                  → FECHADO nesse dia (feriado)
#   - {"start": "HH:MM", "end": "HH:MM"}    → ABERTO com horário especial
#     (podes juntar "break_start"/"break_end" se quiseres pausa)
#
# Casos de uso:
#   "2026-12-25": None,                                 # Natal — fechado
#   "2026-06-10": {"start": "09:00", "end": "13:00"},   # feriado mas trabalha de manhã
#   "2026-08-15": {"start": "10:00", "end": "16:00"},   # horário reduzido só nesse dia
#   "2026-11-01": {"start": "09:00", "end": "19:00"},   # abrir um domingo (normalmente fechado)
#
# Uma exceção ABRE um dia mesmo que o dia da semana esteja fechado, e FECHA
# um dia mesmo que normalmente esteja aberto.
# Depois de editar: rebuild + restart do ia-service.
DATE_OVERRIDES_PER_TENANT: dict[str, dict[str, Optional[DayRule]]] = {
    # L.A. Estética Avançada (Laura)
    "695413fb6ce936a9097af750": {
        # Chave SEMPRE no formato "YYYY-MM-DD" (sem texto à frente).
        "2026-12-25": None,  # Natal
        "2026-06-03": None,
        "2026-06-04": None,
        "2026-06-10": None,
    },
}


def get_day_rule(tenant_id: str, weekday: int) -> Optional[DayRule]:
    """Return the rule for `weekday` (0=Mon..6=Sun) for the given tenant.

    Falls back to `_default` if the tenant has no specific rules.
    Returns None when the day is closed.
    """
    rules = RULES_PER_TENANT.get(tenant_id, RULES_PER_TENANT["_default"])
    day_name = WEEKDAY_NAMES[weekday]
    return rules.get(day_name)


def get_rule_for_date(tenant_id: str, the_date: date) -> Optional[DayRule]:
    """Regra efectiva para uma DATA concreta.

    1. Se houver uma excepção em DATE_OVERRIDES_PER_TENANT para essa data,
       usa-a (None = fechado nesse dia; ou um horário especial).
    2. Caso contrário, usa a regra normal do dia da semana.

    Returns None when the day is closed (by override or by weekday rule).
    """
    overrides = DATE_OVERRIDES_PER_TENANT.get(tenant_id, {})
    iso = the_date.isoformat()  # "YYYY-MM-DD"
    if iso in overrides:
        return overrides[iso]
    return get_day_rule(tenant_id, the_date.weekday())
