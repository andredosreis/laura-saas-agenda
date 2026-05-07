"""Lead orchestrator — Phase 2 skeleton.

Flow:
  1. Resolve lead (use lead_id from payload, or create via marcai_client — idempotent)
  2. Persist inbound message
  3. Send time-based greeting via Evolution API
  4. Persist outbound message
  5. Move lead to em_conversa if it was novo

Phase 4 will replace step 3 with LangGraph agent.
"""

from datetime import datetime, timezone

import structlog

from . import evolution_client, marcai_client

logger = structlog.get_logger()

_GREETINGS = {
    "manha": "Bom dia! 😊 Obrigado por entrar em contacto connosco. Já vamos tratar do seu pedido — em breve entramos em contacto!",
    "tarde": "Boa tarde! 😊 Obrigado por entrar em contacto connosco. Já vamos tratar do seu pedido — em breve entramos em contacto!",
    "noite": "Boa noite! 😊 Obrigado por entrar em contacto connosco. Já vamos tratar do seu pedido — em breve entramos em contacto!",
}


def _period_of_day(dt: datetime) -> str:
    hour = dt.astimezone(timezone.utc).hour
    if 6 <= hour < 12:
        return "manha"
    if 12 <= hour < 19:
        return "tarde"
    return "noite"


async def run(payload) -> dict:
    """
    payload: ProcessLeadRequest from routers/process.py
    Returns: dict matching ProcessLeadResponse
    """
    tenant_id = payload.tenant_id
    telefone = payload.telefone
    mensagem = payload.mensagem
    instance_name = payload.instance_name
    timestamp = payload.timestamp

    log = logger.bind(tenant_id=tenant_id, telefone=telefone, instance=instance_name)

    # 1. Resolve lead (idempotent POST — returns existing if phone already registered)
    lead_id = payload.lead_id
    conversa_id: str | None = None
    if not lead_id:
        try:
            lead_data = await marcai_client.create_lead(
                tenant_id=tenant_id,
                telefone=telefone,
            )
            lead_id = str(lead_data["_id"])
            conversa_id = str(lead_data.get("conversa") or "")
            log.info("lead_resolved", lead_id=lead_id, already_existed=lead_data.get("alreadyExisted"))
        except Exception as exc:
            log.error("lead_create_failed", error=str(exc))
            return {"status": "error", "lead_id": None, "action_taken": "lead_create_failed"}

    # 2. Persist inbound message
    try:
        msg_data = await marcai_client.create_message(
            tenant_id=tenant_id,
            telefone=telefone,
            mensagem=mensagem,
            origem="cliente",
            direcao="entrada",
            conversa_id=conversa_id or None,
        )
        if conversa_id is None:
            conversa_id = str(msg_data.get("conversa", {}).get("_id") or "")
    except Exception as exc:
        log.warning("inbound_message_persist_failed", error=str(exc))

    # 3. Send greeting via Evolution API
    period = _period_of_day(timestamp)
    greeting = _GREETINGS[period]
    try:
        await evolution_client.send_message(
            telefone=telefone,
            mensagem=greeting,
            instance_name=instance_name,
        )
    except Exception as exc:
        log.error("greeting_send_failed", error=str(exc))
        return {"status": "error", "lead_id": lead_id, "action_taken": "greeting_send_failed"}

    # 4. Persist outbound message
    try:
        await marcai_client.create_message(
            tenant_id=tenant_id,
            telefone=telefone,
            mensagem=greeting,
            origem="laura",
            direcao="saida",
            conversa_id=conversa_id or None,
        )
    except Exception as exc:
        log.warning("outbound_message_persist_failed", error=str(exc))

    # 5. Move lead to em_conversa (only if it was in novo — Node validates the transition)
    try:
        await marcai_client.move_lead_stage(
            lead_id=lead_id,
            tenant_id=tenant_id,
            stage="em_conversa",
        )
    except Exception as exc:
        # Non-critical: lead may already be in a later stage, transition may be refused
        log.info("stage_transition_skipped", error=str(exc))

    log.info("lead_processed", lead_id=lead_id)
    return {
        "status": "processed",
        "lead_id": lead_id,
        "action_taken": "greeting_sent",
        "next_check_at": None,
    }
