"""HTTP client to Marcai Node backend — all writes to Node go through here."""

import asyncio

import httpx
import structlog

from ..config import settings

logger = structlog.get_logger()

_HEADERS = {
    "Content-Type": "application/json",
}


def _auth_headers() -> dict:
    return {**_HEADERS, "x-service-token": settings.internal_service_token}


async def _post_with_retry(url: str, json: dict, retries: int = 1, timeout: float = 20.0) -> dict:
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(url, json=json, headers=_auth_headers())
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(1.0)
    raise last_exc  # type: ignore[misc]


async def _patch_with_retry(url: str, json: dict, retries: int = 1, timeout: float = 10.0) -> dict:
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.patch(url, json=json, headers=_auth_headers())
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(1.0)
    raise last_exc  # type: ignore[misc]


async def create_lead(
    tenant_id: str,
    telefone: str,
    nome: str | None = None,
    email: str | None = None,
    conversa_id: str | None = None,
) -> dict:
    """Returns the lead document with `_alreadyExisted` injected.

    The Node response shape is `{success, data: <lead>, alreadyExisted?}` —
    we flatten it so callers see the alreadyExisted flag inside the lead
    dict (key `_alreadyExisted` to avoid collisions with real fields).
    """
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads",
        json={
            "tenantId": tenant_id,
            "telefone": telefone,
            "nome": nome,
            "email": email,
            "conversaId": conversa_id,
        },
    )
    lead = dict(resp["data"])
    lead["_alreadyExisted"] = bool(resp.get("alreadyExisted", False))
    return lead


async def create_message(
    tenant_id: str,
    telefone: str,
    mensagem: str,
    origem: str,
    direcao: str,
    conversa_id: str | None = None,
) -> dict:
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/mensagens",
        json={
            "tenantId": tenant_id,
            "telefone": telefone,
            "mensagem": mensagem,
            "origem": origem,
            "direcao": direcao,
            "conversaId": conversa_id,
        },
        timeout=10.0,
    )
    return resp["data"]


async def move_lead_stage(
    lead_id: str,
    tenant_id: str,
    stage: str,
    motivo: str | None = None,
) -> dict:
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/stage",
        json={"tenantId": tenant_id, "stage": stage, "motivo": motivo},
    )
    return resp["data"]


async def get_recent_messages(
    tenant_id: str,
    lead_id: str,
    limit: int = 10,
) -> list[dict]:
    """Fetch the most recent messages for a lead's conversation, oldest first.

    Used by the orchestrator to give the LangChain agent conversational
    memory: previous lead messages + previous IA replies are passed as
    `messages` so the agent sees the full context.

    Returns: list of {mensagem, origem, direcao, data} dicts.
    """
    url = f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/messages"
    params = {"tenantId": tenant_id, "limit": limit}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params, headers=_auth_headers())
            r.raise_for_status()
            return r.json().get("data", [])
    except Exception as exc:
        logger.warning("recent_messages_fetch_failed", error=str(exc))
        return []


async def qualify_lead(
    lead_id: str,
    tenant_id: str,
    score: int,
    motivo_interesse: str,
    objetivos: list[str],
) -> dict:
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/qualificacao",
        json={
            "tenantId": tenant_id,
            "score": score,
            "motivoInteresse": motivo_interesse,
            "objetivos": objetivos,
        },
    )
    return resp["data"]


async def create_appointment(
    lead_id: str,
    tenant_id: str,
    data_hora_iso: str,
    tipo: str = "Avaliacao",
) -> dict:
    """Create an appointment for the lead. Returns the new appointment dict.

    Raises on conflict (HTTP 409 'slot_taken'). The agent should react to
    this by re-fetching available slots and proposing alternatives.
    """
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/agendamento",
        json={
            "tenantId": tenant_id,
            "dataHoraISO": data_hora_iso,
            "tipo": tipo,
        },
    )
    return resp["data"]


async def update_lead_info(
    lead_id: str,
    tenant_id: str,
    nome: str | None = None,
    interesse: str | None = None,
    urgencia: str | None = None,
    observacoes: str | None = None,
) -> dict:
    """Update lead intel captured during conversation.

    Used by the agent to record what the lead said as the conversation
    flows — before having enough data to fully qualify. All fields are
    optional; only provided ones are sent.
    """
    payload: dict = {"tenantId": tenant_id}
    if nome is not None:
        payload["nome"] = nome
    if interesse is not None:
        payload["interesse"] = interesse
    if urgencia is not None:
        payload["urgencia"] = urgencia
    if observacoes is not None:
        payload["observacoes"] = observacoes

    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/qualificacao",
        json=payload,
    )
    return resp["data"]
