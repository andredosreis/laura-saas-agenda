import os

import httpx
import structlog
from fastapi import APIRouter

from ..config import settings

router = APIRouter()
logger = structlog.get_logger()

# Commit deployado — injectado no build (GIT_SHA). Confirma que versão corre.
GIT_SHA = os.getenv("GIT_SHA", "unknown")
BUILT_AT = os.getenv("BUILT_AT") or None


@router.get("/health")
async def health_check():
    marcai_reachable = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{settings.marcai_api_url}/api/auth/me")
            # 401 = API is up but not authenticated — that's fine
            marcai_reachable = r.status_code in (200, 401)
    except Exception as exc:
        logger.warning("health_check_marcai_unreachable", error=str(exc))

    return {
        "status": "ok",
        "version": "0.2.0",
        "git_sha": GIT_SHA,
        "marcai_reachable": marcai_reachable,
    }


@router.get("/version")
async def version():
    """Versão deployada — para confirmar rapidamente que commit está a correr."""
    return {"version": GIT_SHA, "built_at": BUILT_AT}
