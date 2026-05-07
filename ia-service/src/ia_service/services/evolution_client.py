"""HTTP client to Evolution API — outbound WhatsApp messages."""

import httpx
import structlog

from ..config import settings

logger = structlog.get_logger()


async def send_message(telefone: str, mensagem: str, instance_name: str) -> dict:
    url = f"{settings.evolution_api_url}/message/sendText/{instance_name}"
    headers = {"apikey": settings.evolution_api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            url,
            json={"number": telefone, "text": mensagem},
            headers=headers,
        )
        r.raise_for_status()
        data = r.json()
        logger.info("evolution_message_sent", telefone=telefone, instance=instance_name)
        return data
