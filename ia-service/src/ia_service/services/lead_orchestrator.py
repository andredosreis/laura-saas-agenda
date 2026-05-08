"""Lead orchestrator — Phase 2 skeleton + Phase 4c agent.

Flow:
  1. Resolve lead (use lead_id from payload, or create via marcai_client — idempotent)
  2. Persist inbound message
  3. Generate reply (LangChain agent if OPENAI_API_KEY set, else fixed greeting)
  4. Send reply via Evolution API
  5. Persist outbound message
  6. Move lead to em_conversa if it was novo

Phase 4c: agent integration with graceful fallback. If the agent fails for
any reason (timeout, API error), falls back to the fixed time-based greeting.
"""

from datetime import datetime, timezone

import structlog

from ..config import settings
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


async def _build_conversation_history(
    tenant_id: str, lead_id: str | None, current_message: str, log
) -> list[dict]:
    """Build the LangChain `messages` array with conversation history.

    Pulls the last 10 persisted messages from the lead's conversation
    and appends the current inbound message at the end.

    `direcao=entrada` (lead → clinic) → role=user
    `direcao=saida`   (clinic → lead) → role=assistant
    """
    messages: list[dict] = []
    if lead_id:
        try:
            history = await marcai_client.get_recent_messages(
                tenant_id=tenant_id, lead_id=lead_id, limit=8
            )
            # Session-style filter: only include messages from the last
            # 30 minutes. Older interactions (e.g. lead from 2 days ago)
            # would bias the LLM with stale slot proposals or old context.
            from datetime import datetime, timedelta, timezone

            cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
            for m in history:
                # `data` is ISO 8601 from the Node side
                data_str = m.get("data") or m.get("createdAt") or ""
                try:
                    msg_dt = datetime.fromisoformat(data_str.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if msg_dt < cutoff:
                    continue
                role = "user" if m.get("direcao") == "entrada" else "assistant"
                content = m.get("mensagem", "").strip()
                if content:
                    messages.append({"role": role, "content": content})
            log.info("history_loaded", turns=len(messages), cutoff_min=30)
        except Exception as exc:
            log.warning("history_load_failed", error=str(exc))

    # Append current message — orchestrator persists it AFTER this call,
    # so it's not yet in the history we just fetched.
    messages.append({"role": "user", "content": current_message})
    return messages


async def _generate_reply(
    tenant_id: str,
    lead_id: str | None,
    mensagem: str,
    fallback_greeting: str,
    log,
) -> tuple[str, str]:
    """Returns (reply_text, source) where source is 'agent' or 'greeting_fallback'.

    Tries the LangChain agent first if OPENAI_API_KEY is set. Falls back to
    the fixed greeting on any failure (timeout, API error, etc).
    """
    if not settings.openai_api_key:
        return fallback_greeting, "greeting_fallback"

    try:
        # Imported lazily so test setups without the openai_api_key do not
        # need to instantiate ChatOpenAI on import.
        from ..agents.lead_agent import make_lead_agent

        messages = await _build_conversation_history(
            tenant_id, lead_id, mensagem, log
        )

        agent = make_lead_agent(tenant_id)
        result = await agent.ainvoke({"messages": messages})
        last_msg = result["messages"][-1]
        # last_msg may be AIMessage; .content is a string in simple cases
        content = getattr(last_msg, "content", "") or ""
        if not content.strip():
            log.warning("agent_empty_reply_falling_back")
            return fallback_greeting, "greeting_fallback"
        log.info("agent_reply_generated", chars=len(content))
        return content, "agent"
    except Exception as exc:
        log.error("agent_failed_falling_back", error=str(exc))
        return fallback_greeting, "greeting_fallback"


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

    # 3. Generate reply (agent if API key set, else fixed greeting)
    period = _period_of_day(timestamp)
    fallback_greeting = _GREETINGS[period]
    reply, reply_source = await _generate_reply(
        tenant_id, lead_id, mensagem, fallback_greeting, log
    )

    # 4. Send reply via Evolution API
    try:
        await evolution_client.send_message(
            telefone=telefone,
            mensagem=reply,
            instance_name=instance_name,
        )
    except Exception as exc:
        log.error("greeting_send_failed", error=str(exc))
        return {"status": "error", "lead_id": lead_id, "action_taken": "greeting_send_failed"}

    # 5. Persist outbound message
    try:
        await marcai_client.create_message(
            tenant_id=tenant_id,
            telefone=telefone,
            mensagem=reply,
            origem="laura",
            direcao="saida",
            conversa_id=conversa_id or None,
        )
    except Exception as exc:
        log.warning("outbound_message_persist_failed", error=str(exc))

    # 6. Move lead to em_conversa (only if it was in novo — Node validates the transition)
    try:
        await marcai_client.move_lead_stage(
            lead_id=lead_id,
            tenant_id=tenant_id,
            stage="em_conversa",
        )
    except Exception as exc:
        # Non-critical: lead may already be in a later stage, transition may be refused
        log.info("stage_transition_skipped", error=str(exc))

    log.info("lead_processed", lead_id=lead_id, reply_source=reply_source)
    return {
        "status": "processed",
        "lead_id": lead_id,
        "action_taken": "agent_reply_sent" if reply_source == "agent" else "greeting_sent",
        "next_check_at": None,
    }
