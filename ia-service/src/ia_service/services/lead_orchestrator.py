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

import re
from datetime import datetime, timezone

import structlog

from ..config import settings
from . import evolution_client, lead_extractor, marcai_client

logger = structlog.get_logger()

_GREETINGS = {
    "manha": (
        "Bom dia! 😊 Obrigado por entrar em contacto connosco. "
        "Já vamos tratar do seu pedido — em breve entramos em contacto!"
    ),
    "tarde": (
        "Boa tarde! 😊 Obrigado por entrar em contacto connosco. "
        "Já vamos tratar do seu pedido — em breve entramos em contacto!"
    ),
    "noite": (
        "Boa noite! 😊 Obrigado por entrar em contacto connosco. "
        "Já vamos tratar do seu pedido — em breve entramos em contacto!"
    ),
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
) -> tuple[list[dict], int, str]:
    """Build the LangChain `messages` array with conversation history.

    Pulls the last 10 persisted messages from the lead's conversation
    and appends the current inbound message at the end.

    `direcao=entrada` (lead → clinic) → role=user
    `direcao=saida`   (clinic → lead) → role=assistant

    Returns a tuple `(messages, turn_number, last_clinic_message)` where:
      - `turn_number` counts how many assistant messages are already in
        the window — i.e. how many times the clinic spoke before this
        new inbound. Used by the system prompt to gate greetings.
      - `last_clinic_message` is the latest assistant utterance (empty
        string if the clinic has not spoken yet). Used by the system
        prompt to detect e.g. "we just asked the lead's name".
    """
    messages: list[dict] = []
    turn_number = 0
    last_clinic_message = ""
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
                    if role == "assistant":
                        turn_number += 1
                        last_clinic_message = content
            log.info(
                "history_loaded",
                turns=len(messages),
                cutoff_min=30,
                clinic_turns=turn_number,
            )
        except Exception as exc:
            log.warning("history_load_failed", error=str(exc))

    # Append current message — orchestrator persists it AFTER this call,
    # so it's not yet in the history we just fetched.
    messages.append({"role": "user", "content": current_message})
    return messages, turn_number, last_clinic_message


def _booking_created_this_turn(messages: list) -> bool:
    """True se `create_appointment` devolveu OK neste turno (ToolMessage).

    Mais fiavel que o regex sobre o texto da resposta: com a confirmacao
    automatica do sistema, a resposta do agente passou a ser so o
    complemento logistico (morada/mapa) e pode nao conter "marcado as HH:MM".
    """
    from langchain.messages import ToolMessage

    for m in messages:
        if isinstance(m, ToolMessage) and getattr(m, "name", "") == "create_appointment":
            content = m.content if isinstance(m.content, str) else str(m.content)
            if content.strip().startswith("OK"):
                return True
    return False


async def _generate_reply(
    tenant_id: str,
    lead_id: str | None,
    mensagem: str,
    fallback_greeting: str,
    log,
    aviso_clinica: str = "",
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

        messages, turn_number, last_clinic_message = await _build_conversation_history(
            tenant_id, lead_id, mensagem, log
        )

        # Fetch the persisted Lead state so the agent can inject it into
        # the system prompt and never has to guess what it already knows
        # (name, motivo, urgência, score). Failure here is non-fatal —
        # the agent still works, just without the {{lead_*}} hints.
        lead_state = await _get_lead_state(tenant_id, lead_id, log)

        # Aviso da equipa (ex: encerramento para ferias) viaja no payload
        # do backend e entra no prompt via lead_state.
        if aviso_clinica:
            lead_state = {**(lead_state or {}), "aviso_clinica": aviso_clinica}

        agent = make_lead_agent(
            tenant_id,
            lead_id=lead_id,
            lead_state=lead_state,
            turn_number=turn_number,
            last_clinic_message=last_clinic_message,
        )

        # Metadata + tags surfaced to LangSmith traces — lets us filter
        # runs by tenant / lead / turn in the LangSmith UI and pivot on
        # the specific bug we are debugging (e.g. "all turn_number=1
        # replies where lead_nome is populated").
        run_config = {
            "tags": [
                f"tenant:{tenant_id}",
                f"turn:{turn_number}",
                f"provider:{settings.llm_provider}",
            ],
            "metadata": {
                "tenant_id": tenant_id,
                "lead_id": lead_id or "",
                "turn_number": turn_number,
                "lead_nome": (lead_state or {}).get("nome") or "",
                "lead_score": (lead_state or {}).get("score") or 0,
                "last_clinic_message_excerpt": last_clinic_message[:80],
            },
            "run_name": "lead_agent_turn",
        }

        # Gemini Flash sometimes returns empty content after tool calls
        # (transient quirk). Retry once before falling back to greeting.
        content = ""
        booking_created = False
        for attempt in (1, 2):
            result = await agent.ainvoke({"messages": messages}, config=run_config)
            booking_created = booking_created or _booking_created_this_turn(result["messages"])
            last_msg = result["messages"][-1]
            raw = getattr(last_msg, "content", "")
            if isinstance(raw, list):
                content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw)
            else:
                content = str(raw or "")
            if content.strip():
                break
            log.warning("agent_empty_reply_retrying", attempt=attempt)

        if not content.strip():
            log.warning("agent_empty_reply_falling_back")
            return fallback_greeting, "greeting_fallback"
        log.info("agent_reply_generated", chars=len(content))

        # Marcacao feita via tool neste turno → stage 'agendado'
        # deterministico (a resposta pode ja nao citar "marcado as HH:MM").
        if booking_created and lead_id:
            try:
                await marcai_client.move_lead_stage(
                    lead_id=lead_id, tenant_id=tenant_id, stage="agendado"
                )
                log.info("stage_moved_on_tool_booking", stage="agendado")
            except Exception as exc:
                log.info("stage_move_on_tool_booking_skipped", error=str(exc))

        # Defense-in-depth: detect booking confirmation in reply and
        # auto-move stage to 'agendado'. LLMs sometimes craft a perfect
        # confirmation ("Marcado às 15:00") without remembering to call
        # move_lead_stage. We catch that here.
        await _maybe_auto_book(content, tenant_id, lead_id, log)

        return content, "agent"
    except Exception as exc:
        log.error("agent_failed_falling_back", error=str(exc))
        return fallback_greeting, "greeting_fallback"


_BOOKING_REGEX = re.compile(
    # Roots: marc/agend/confirm cover "marcado", "marcação", "marcar",
    # "agendado", "agendamento", "agendar", "confirmado", "confirmar",
    # "confirmação". Followed (in same paragraph) by an HH:MM or "Xh"
    # time within ~120 chars.
    #
    # 2026-05-20: lookahead used to exclude "!" / "." / "?", which broke
    # auto-book on perfectly valid confirmations like
    #   "Está marcado, Cintia! 🎉 ... às 09:00"
    # because "!" after the name terminated the lazy match too early.
    # Now we only exclude "." and "?" (sentence terminators), and cap the
    # gap at 120 chars to avoid pulling unrelated times from much later
    # in the reply.
    r"(?:marc|agend|confirm)\w*\b[^.?]{0,120}?\b(\d{1,2}[h:]\d{2}|\d{1,2}\s*h\b)",
    re.IGNORECASE,
)


async def _get_lead_state(tenant_id: str, lead_id: str | None, log) -> dict | None:
    """Read the Lead's persisted state directly from Mongo for the system prompt.

    Returns a dict with keys `nome`, `motivo`, `urgencia`, `score` — or
    None when `lead_id` is missing or the document can't be loaded.
    Used by `_generate_reply` to inject lead context into the agent's
    system prompt so the LLM never has to guess what is already known.

    Failure is non-fatal: returns None and the agent runs without the
    {{lead_*}} placeholders filled in (they default to the sentinel
    '(ainda não recolhido)' inside `prompt_renderer`).
    """
    if not lead_id:
        return None
    try:
        from bson import ObjectId

        from . import mongo_reader

        db = mongo_reader.get_tenant_db(tenant_id)
        doc = db.leads.find_one(
            {"_id": ObjectId(lead_id)},
            {
                "nome": 1,
                "urgencia": 1,
                "observacoes": 1,
                "qualificacao.score": 1,
                "qualificacao.motivoInteresse": 1,
            },
        )
        if not doc:
            return None
        qual = doc.get("qualificacao") or {}
        return {
            "nome": doc.get("nome") or "",
            "motivo": qual.get("motivoInteresse") or "",
            "urgencia": doc.get("urgencia") or "",
            "score": int(qual.get("score") or 0),
            # Notas duraveis da ficha (equipa/extractor) — ex: "de ferias
            # so ate 15/07". Injectadas no prompt para sobreviverem a
            # janela de 30 min de historico.
            "observacoes": doc.get("observacoes") or "",
        }
    except Exception as exc:
        log.warning("lead_state_load_failed", error=str(exc))
        return None


async def _maybe_auto_book(content: str, tenant_id: str, lead_id: str | None, log) -> None:
    """If the agent's reply confirms a booking + cites a time, move stage."""
    if not lead_id or not _BOOKING_REGEX.search(content):
        return
    try:
        await marcai_client.move_lead_stage(lead_id=lead_id, tenant_id=tenant_id, stage="agendado")
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
            lead_doc = db.leads.find_one({"_id": ObjectId(lead_id)}, {"status": 1})
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

    # Defesa em profundidade: quando o Node envia lead_id, validar que o
    # lead existe na DB DESTE tenant antes de processar. Com DB-per-tenant
    # um lead de outro tenant nunca aparece aqui — mismatch → ignorado.
    # Falha na verificação (Mongo down, id inválido) é não-fatal: loga e
    # continua, porque todos os reads/writes a jusante já são tenant-scoped.
    if lead_id:
        try:
            from bson import ObjectId

            from . import mongo_reader

            db = mongo_reader.get_tenant_db(tenant_id)
            if db.leads.find_one({"_id": ObjectId(lead_id)}, {"_id": 1}) is None:
                log.warning("lead_tenant_mismatch", lead_id=lead_id)
                return {
                    "status": "ignored",
                    "lead_id": None,
                    "action_taken": "lead_tenant_mismatch",
                }
        except Exception as exc:
            log.warning("lead_tenant_check_skipped", error=str(exc))
    if not lead_id:
        try:
            lead_data = await marcai_client.create_lead(
                tenant_id=tenant_id,
                telefone=telefone,
            )
            lead_id = str(lead_data["_id"])
            conversa_id = str(lead_data.get("conversa") or "")
            is_brand_new_lead = not lead_data.get("_alreadyExisted", False)
            log.info(
                "lead_resolved", lead_id=lead_id, already_existed=lead_data.get("_alreadyExisted")
            )
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
        tenant_id,
        lead_id,
        mensagem,
        fallback_greeting,
        log,
        aviso_clinica=(getattr(payload, "aviso_clinica", None) or "").strip(),
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
