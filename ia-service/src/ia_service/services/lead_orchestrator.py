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
from . import evolution_client, lead_extractor, marcai_client

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

        agent = make_lead_agent(tenant_id, lead_id=lead_id)

        # Gemini Flash sometimes returns empty content after tool calls
        # (transient quirk). Retry once before falling back to greeting.
        content = ""
        for attempt in (1, 2):
            result = await agent.ainvoke({"messages": messages})
            last_msg = result["messages"][-1]
            raw = getattr(last_msg, "content", "")
            if isinstance(raw, list):
                content = "".join(
                    p.get("text", "") if isinstance(p, dict) else str(p)
                    for p in raw
                )
            else:
                content = str(raw or "")
            if content.strip():
                break
            log.warning("agent_empty_reply_retrying", attempt=attempt)

        if not content.strip():
            log.warning("agent_empty_reply_falling_back")
            return fallback_greeting, "greeting_fallback"
        log.info("agent_reply_generated", chars=len(content))

        # Defense-in-depth: detect booking confirmation in reply and
        # auto-move stage to 'agendado'. LLMs sometimes craft a perfect
        # confirmation ("Marcado às 15:00") without remembering to call
        # move_lead_stage. We catch that here.
        await _maybe_auto_book(content, tenant_id, lead_id, log)

        return content, "agent"
    except Exception as exc:
        log.error("agent_failed_falling_back", error=str(exc))
        return fallback_greeting, "greeting_fallback"


import re as _re

_BOOKING_REGEX = _re.compile(
    # Roots: marc/agend/confirm cover "marcado", "marcação", "marcar",
    # "agendado", "agendamento", "agendar", "confirmado", "confirmar",
    # "confirmação". Followed (in same sentence) by an HH:MM or "Xh" time.
    r"(?:marc|agend|confirm)\w*\b[^.!?]*?\b(\d{1,2}[h:]\d{2}|\d{1,2}\s*h\b)",
    _re.IGNORECASE,
)


async def _maybe_auto_book(content: str, tenant_id: str, lead_id: str | None, log) -> None:
    """If the agent's reply confirms a booking + cites a time, move stage."""
    if not lead_id or not _BOOKING_REGEX.search(content):
        return
    try:
        await marcai_client.move_lead_stage(
            lead_id=lead_id, tenant_id=tenant_id, stage="agendado"
        )
        log.info("auto_book_stage_moved", stage="agendado")
    except Exception as exc:
        # Non-fatal: stage may already be agendado, or transition refused
        log.info("auto_book_skipped", error=str(exc))


async def _extract_and_apply_intel(
    tenant_id: str, lead_id: str, telefone: str, mensagem: str, log
) -> None:
    """Run the structured-output extractor on recent history and apply
    any new intel directly to the DB (no LLM tool calls involved).

    This complements (does not replace) the agent's optional tool calls.
    Belt-and-suspenders: if the agent ALSO calls update_lead_info, the
    DB just gets overwritten with the same data — idempotent.
    """
    try:
        # Build messages list from recent history + current message
        history = await marcai_client.get_recent_messages(
            tenant_id=tenant_id, lead_id=lead_id, limit=6
        )
        # Filter by 30-min window (same logic as agent history) and convert
        from datetime import datetime, timedelta, timezone

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        msgs: list[dict] = []
        for m in history:
            data_str = m.get("data") or m.get("createdAt") or ""
            try:
                msg_dt = datetime.fromisoformat(data_str.replace("Z", "+00:00"))
            except ValueError:
                continue
            if msg_dt < cutoff:
                continue
            role = "user" if m.get("direcao") == "entrada" else "assistant"
            content_m = m.get("mensagem", "").strip()
            if content_m:
                msgs.append({"role": role, "content": content_m})
        msgs.append({"role": "user", "content": mensagem})

        intel = await lead_extractor.extract_intel(msgs)
        if intel is None:
            log.warning("intel_extraction_skipped")
            return

        log.info(
            "intel_extracted",
            intent=intel.intent,
            score_delta=intel.score_delta,
            interesse=bool(intel.interesse),
        )

        # Apply intel to DB
        if intel.nome or intel.interesse or intel.urgencia or intel.observacoes:
            try:
                await marcai_client.update_lead_info(
                    lead_id=lead_id,
                    tenant_id=tenant_id,
                    nome=intel.nome,
                    interesse=intel.interesse,
                    urgencia=intel.urgencia,
                    observacoes=intel.observacoes,
                )
            except Exception as exc:
                log.warning("intel_update_failed", error=str(exc))

        # GAP-02 fix: Apply score_delta atomically. The Node endpoint uses
        # an aggregation pipeline update (`$add` + `$min` + `$max`) so the
        # read-compute-write happens in a single MongoDB command, atomic
        # at the document level. Two parallel orchestrator runs for the
        # same lead now produce deterministic accumulation (each delta
        # lands) instead of the previous last-write-wins race.
        #
        # Auto-promotion to 'qualificado' is also computed inside the
        # same pipeline (no separate round-trip needed).
        if intel.score_delta != 0:
            try:
                updated = await marcai_client.apply_score_delta(
                    lead_id=lead_id,
                    tenant_id=tenant_id,
                    score_delta=intel.score_delta,
                    motivo_interesse=intel.interesse or "",
                    objetivos=[intel.observacoes] if intel.observacoes else [],
                )
                new_score = (updated.get("qualificacao") or {}).get("score")
                log.info(
                    "intel_score_delta_applied",
                    delta=intel.score_delta,
                    new_score=new_score,
                    status=updated.get("status"),
                )
            except Exception as exc:
                log.info("intel_score_update_skipped", error=str(exc))

        # Move 'novo' → 'em_conversa' ONLY if lead is currently in 'novo'.
        # Reading current status first avoids regressing leads already at
        # 'qualificado' / 'agendado'. Note: if the score-delta call above
        # already auto-promoted to 'qualificado' inside the same Node
        # pipeline, this read will see 'qualificado' and skip the
        # transition — correct behaviour.
        try:
            from bson import ObjectId
            from . import mongo_reader as _mr
            db = _mr.get_tenant_db(tenant_id)
            lead_doc = db.leads.find_one(
                {"_id": ObjectId(lead_id)}, {"status": 1}
            )
            if lead_doc and lead_doc.get("status") == "novo":
                await marcai_client.move_lead_stage(
                    lead_id=lead_id, tenant_id=tenant_id, stage="em_conversa"
                )
        except Exception:
            pass

        # If lead is desisting → move stage to perdido immediately
        if intel.intent == "desistir":
            try:
                await marcai_client.move_lead_stage(
                    lead_id=lead_id,
                    tenant_id=tenant_id,
                    stage="perdido",
                    motivo=intel.perdido_motivo or "desistiu na conversa",
                )
                log.info("intel_moved_perdido", motivo=intel.perdido_motivo)
            except Exception as exc:
                log.info("intel_move_perdido_skipped", error=str(exc))
    except Exception as exc:
        # Non-fatal: extractor failures should never block the conversation.
        log.warning("intel_extraction_error", error=str(exc))


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
    is_brand_new_lead = False
    if not lead_id:
        try:
            lead_data = await marcai_client.create_lead(
                tenant_id=tenant_id,
                telefone=telefone,
            )
            lead_id = str(lead_data["_id"])
            conversa_id = str(lead_data.get("conversa") or "")
            is_brand_new_lead = not lead_data.get("_alreadyExisted", False)
            log.info("lead_resolved", lead_id=lead_id, already_existed=lead_data.get("_alreadyExisted"))
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

    # 2.5. Extract structured intel from the conversation BEFORE the
    # conversational agent runs. This guarantees the lead's interesse/
    # urgencia/observacoes/score are captured even if the agent later
    # forgets to call qualification tools.
    if lead_id:
        await _extract_and_apply_intel(tenant_id, lead_id, telefone, mensagem, log)

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

    # 6. Move brand-new lead from 'novo' → 'em_conversa'.
    # Skipped for existing leads — the agent/auto_book handle later transitions.
    if is_brand_new_lead:
        try:
            await marcai_client.move_lead_stage(
                lead_id=lead_id,
                tenant_id=tenant_id,
                stage="em_conversa",
            )
        except Exception as exc:
            log.info("stage_transition_skipped", error=str(exc))

    log.info("lead_processed", lead_id=lead_id, reply_source=reply_source)
    return {
        "status": "processed",
        "lead_id": lead_id,
        "action_taken": "agent_reply_sent" if reply_source == "agent" else "greeting_sent",
        "next_check_at": None,
    }
