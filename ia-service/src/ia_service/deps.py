import hmac
from typing import Annotated

from fastapi import Header, HTTPException

from .config import settings


async def require_service_token(x_service_token: Annotated[str, Header()]) -> None:
    expected = settings.internal_service_token.encode()
    if not hmac.compare_digest(x_service_token.encode(), expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
