from datetime import datetime
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import require_service_token
from ..services import client_orchestrator, lead_orchestrator

router = APIRouter()
logger = structlog.get_logger()


class ProcessLeadRequest(BaseModel):
    tenant_id: str
    instance_name: str
    telefone: str
    mensagem: str
    message_id: str
    timestamp: datetime
    cliente_id: str | None = None
    lead_id: str | None = None


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
        raise HTTPException(status_code=500, detail=str(exc))


class ProcessClientRequest(BaseModel):
    tenant_id: str
    instance_name: str
    telefone: str
    mensagem: str
    message_id: str
    timestamp: datetime
    cliente_id: str
    cliente_nome: str | None = None


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
        raise HTTPException(status_code=500, detail=str(exc))
