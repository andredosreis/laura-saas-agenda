import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import require_service_token
from ..services import team_reply_parser
from ..services.team_reply_parser import TeamReplyInterpretation

router = APIRouter()
logger = structlog.get_logger()


class PendingRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    reason: str = Field(default="", max_length=500)


class ParseTeamReplyRequest(BaseModel):
    tenant_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=4000)
    pending_requests: list[PendingRequest] = Field(default_factory=list, max_length=10)


@router.post(
    "/parse-team-reply",
    response_model=TeamReplyInterpretation,
    dependencies=[Depends(require_service_token)],
)
async def parse_team_reply(payload: ParseTeamReplyRequest) -> TeamReplyInterpretation:
    try:
        return await team_reply_parser.interpret_team_reply(
            payload.message,
            [request.model_dump() for request in payload.pending_requests],
            payload.tenant_id,
        )
    except Exception as exc:
        logger.warning("team_reply_parse_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Falha ao interpretar recado") from exc
