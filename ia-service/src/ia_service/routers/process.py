from datetime import datetime
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import require_service_token
from ..services import client_orchestrator, lead_orchestrator

router = APIRouter()
logger = structlog.get_logger()


class ProcessLeadRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    instance_name: str = Field(min_length=1, max_length=128)
    telefone: str = Field(min_length=9, max_length=20, pattern=r"^[0-9]+$")
    mensagem: str = Field(min_length=1, max_length=4000)
    message_id: str = Field(min_length=1, max_length=200)
    timestamp: datetime
    cliente_id: str | None = None
    lead_id: str | None = None
    # Aviso da equipa (Tenant.configuracoes.avisoIA) — ex: encerramento
    # para ferias. Injectado no system prompt de cada turno.
    aviso_clinica: str | None = Field(default=None, max_length=500)


class ProcessLeadResponse(BaseModel):
    status: Literal["processed", "duplicate", "ignored", "error"]
    lead_id: str | None = None
    action_taken: str | None = None
    next_check_at: datetime | None = None


@router.post(
    "/process-lead",
    response_model=ProcessLeadResponse,
    dependencies=[Depends(require_service_token)],
)
async def process_lead(payload: ProcessLeadRequest) -> ProcessLeadResponse:
    try:
        result = await lead_orchestrator.run(payload)
        return result
    except Exception as exc:
        logger.error(
            "process_lead_error",
            tenant_id=payload.tenant_id,
            telefone=payload.telefone,
            error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Internal processing error") from exc


class ProcessClientRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=64)
    instance_name: str = Field(min_length=1, max_length=128)
    telefone: str = Field(min_length=9, max_length=20, pattern=r"^[0-9]+$")
    mensagem: str = Field(min_length=1, max_length=4000)
    message_id: str = Field(min_length=1, max_length=200)
    timestamp: datetime
    cliente_id: str
    cliente_nome: str | None = Field(default=None, max_length=200)
    aviso_clinica: str | None = Field(default=None, max_length=500)


class ProcessClientResponse(BaseModel):
    status: Literal["processed", "error"]
    cliente_id: str | None = None
    action_taken: str | None = None


@router.post(
    "/process-client",
    response_model=ProcessClientResponse,
    dependencies=[Depends(require_service_token)],
)
async def process_client(payload: ProcessClientRequest) -> ProcessClientResponse:
    try:
        result = await client_orchestrator.run(payload)
        return result
    except Exception as exc:
        logger.error(
            "process_client_error",
            tenant_id=payload.tenant_id,
            telefone=payload.telefone,
            error=str(exc),
        )
        raise HTTPException(status_code=500, detail="Internal processing error") from exc
