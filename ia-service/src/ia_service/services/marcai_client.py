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
    return resp["data"]


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
