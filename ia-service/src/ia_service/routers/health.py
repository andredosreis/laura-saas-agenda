import httpx
import structlog
from fastapi import APIRouter

from ..config import settings

router = APIRouter()
logger = structlog.get_logger()


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
        "marcai_reachable": marcai_reachable,
    }
