"""Client lifecycle orchestrator (Phase 1).

Mirrors lead_orchestrator.py but for existing clients. Simpler pipeline:
no lead resolution, no extractor, no stage transitions.

Flow:
  1. Fetch client info (name, phone)
  2. Persist inbound message
  3. Build conversation history (30-min window)
  4. Fetch upcoming appointments (for system prompt)
  5. Generate reply via client_agent (fallback to greeting)
  6. Send reply via Evolution API
  7. Persist outbound message

Excepcao: se o agente criou um agendamento neste turno, os passos 6-7 sao
saltados — o backend ja enviou o template automatico de confirmacao.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog

from ..config import settings
from ..services import marcai_client
from ..services.evolution_client import send_message

logger = structlog.get_logger()

_GREETINGS = {
    "manha": "Bom dia! 😊 Em que posso ajudar?",
    "tarde": "Boa tarde! 😊 Em que posso ajudar?",
    "noite": "Boa noite! 😊 Em que posso ajudar?",
}


def _period_of_day(dt: datetime) -> str:
    hour = dt.astimezone(timezone.utc).hour
    if 6 <= hour < 12:
        return "manha"
    if 12 <= hour < 19:
        return "tarde"
    return "noite"


# Contexto vs fluxo de sessao (caso Maria, 2026-07-06): a cliente respondeu
# 8h30 depois da resposta manual da Laura e a janela unica de 30 min cortou
# TODO o historico — a IA cumprimentou como 1o turno, ignorando a conversa.
# O HISTORICO entra ate 48h (contexto: clientes respondem horas/dias depois,
# incluindo handoff manual->IA); turn_number/last_clinic_message continuam
# na janela de 30 min porque controlam fluxo de sessao (saudacao,
# anti-repeticao), nao contexto.
HISTORY_WINDOW = timedelta(hours=48)
TURN_WINDOW = timedelta(minutes=30)


async def _build_conversation_history(
    tenant_id: str, cliente_id: str, current_message: str, log
) -> tuple[list[dict], int, str]:
    messages: list[dict] = []
    turn_number = 0
    last_clinic_message = ""

    try:
        history = await marcai_client.get_client_messages(
            tenant_id=tenant_id, cliente_id=cliente_id, limit=8
        )
        now = datetime.now(timezone.utc)
        history_cutoff = now - HISTORY_WINDOW
        turn_cutoff = now - TURN_WINDOW
        for m in history:
            data_str = m.get("data") or m.get("createdAt") or ""
            try:
                msg_dt = datetime.fromisoformat(data_str.replace("Z", "+00:00"))
            except ValueError:
                continue
            if msg_dt < history_cutoff:
                continue
            role = "user" if m.get("direcao") == "entrada" else "assistant"
            content = m.get("mensagem", "").strip()
            if content:
                messages.append({"role": role, "content": content})
                if role == "assistant" and msg_dt >= turn_cutoff:
                    turn_number += 1
                    last_clinic_message = content
        log.info(
            "client_history_loaded",
            turns=len(messages),
            clinic_turns=turn_number,
        )
    except Exception as exc:
        log.warning("client_history_load_failed", error=str(exc))

    messages.append({"role": "user", "content": current_message})
    return messages, turn_number, last_clinic_message


def _iso_utc_para_lisboa(dt_str: str) -> str:
    """UTC ISO do backend → hora de parede de Lisboa para o modelo.

    O ISO cru fazia a IA dizer "16:30" para uma sessao das 17:30 (bug
    apanhado em teste, 2026-07-03).
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    try:
        dt = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
        return dt.astimezone(ZoneInfo("Europe/Lisbon")).strftime("%Y-%m-%d %H:%M (hora de Lisboa)")
    except Exception:
        return str(dt_str)


async def _format_upcoming_appointments(tenant_id: str, cliente_id: str, log) -> str:
    try:
        appointments = await marcai_client.get_client_appointments(
            tenant_id=tenant_id, cliente_id=cliente_id
        )
        if not appointments:
            return "Nenhum agendamento futuro."
        lines = []
        for appt in appointments:
            dt = _iso_utc_para_lisboa(appt.get("dataHora", "?"))
            status = appt.get("status", "?")
            tipo = appt.get("tipo", "Sessao")
            servico = appt.get("servicoAvulsoNome", "")
            label = servico or tipo
            # Distinguir origem: marcacoes feitas pela Laura no painel
            # (criadoPorIA=False) contam tanto como as da IA — a IA deve
            # respeita-las e NAO marcar uma segunda sessao por cima.
            origem = (
                "marcado pela clinica" if appt.get("criadoPorIA") is False else "marcado pela IA"
            )
            lines.append(f"- {label}: {dt} ({status}) — {origem}")
        return "\n".join(lines)
    except Exception as exc:
        log.warning("client_appointments_fetch_failed", error=str(exc))
        return "Erro ao consultar agendamentos."


_SYSTEM_CONFIRMED_TOOLS = {
    "create_client_appointment",
    "create_client_appointment_pair",
    "reschedule_appointment",
}


def _booking_created_this_turn(messages: list) -> bool:
    """True se o agente marcou/remarcou uma sessao com sucesso neste turno.

    Nesses casos o backend ja enviou o template automatico "Agendamento
    Confirmado" ao cliente (create e reschedule re-agendam as notificacoes)
    — a resposta textual do agente e suprimida para nao chegarem duas
    confirmacoes seguidas (decisao 2026-07-03).
    O historico e reconstruido a cada turno so com texto user/assistant,
    por isso qualquer ToolMessage no resultado pertence a este turno.
    """
    from langchain.messages import ToolMessage

    for m in messages:
        if isinstance(m, ToolMessage) and getattr(m, "name", "") in _SYSTEM_CONFIRMED_TOOLS:
            content = m.content if isinstance(m.content, str) else str(m.content)
            if content.strip().startswith("OK"):
                return True
    return False


def _format_followup_context(followup: dict | None) -> str:
    if not followup:
        return "Nenhum follow-up pendente."
    data_hora = _iso_utc_para_lisboa(followup.get("dataHora", "?"))
    status = followup.get("status", "?")
    return (
        f"PENDENTE — foi enviada uma mensagem pos-sessao sobre a sessao de "
        f"{data_hora} (status actual: {status}). A mensagem da cliente e "
        "provavelmente a resposta. Segue o protocolo 'Follow-up pos-sessao'."
    )


async def _generate_reply(
    tenant_id: str,
    cliente_id: str,
    client_state: dict,
    mensagem: str,
    fallback_greeting: str,
    log,
) -> tuple[str, str]:
    if not settings.openai_api_key:
        return fallback_greeting, "greeting_fallback"

    try:
        from ..agents.client_agent import make_client_agent

        messages, turn_number, last_clinic_message = await _build_conversation_history(
            tenant_id, cliente_id, mensagem, log
        )

        upcoming = await _format_upcoming_appointments(tenant_id, cliente_id, log)

        followup = None
        try:
            followup = await marcai_client.get_pending_followup(tenant_id, cliente_id)
        except Exception as exc:
            log.warning("client_followup_fetch_failed", error=str(exc))

        agent = make_client_agent(
            tenant_id,
            cliente_id=cliente_id,
            client_state=client_state,
            upcoming_appointments=upcoming,
            turn_number=turn_number,
            last_clinic_message=last_clinic_message,
            followup_context=_format_followup_context(followup),
            followup_agendamento_id=str(followup["_id"]) if followup else None,
        )

        run_config = {
            "tags": [
                f"tenant:{tenant_id}",
                "lifecycle:client",
                f"turn:{turn_number}",
                f"provider:{settings.llm_provider}",
            ],
            "metadata": {
                "tenant_id": tenant_id,
                "cliente_id": cliente_id,
                "turn_number": turn_number,
                "client_nome": client_state.get("nome", ""),
            },
            "run_name": "client_agent_turn",
        }

        content = ""
        for attempt in (1, 2):
            result = await agent.ainvoke({"messages": messages}, config=run_config)
            if _booking_created_this_turn(result["messages"]):
                log.info("client_agent_booking_created_reply_suppressed")
                return "", "booking_confirmed_by_system"
            last_msg = result["messages"][-1]
            raw = getattr(last_msg, "content", "")
            if isinstance(raw, list):
                content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in raw)
            else:
                content = str(raw or "")
            if content.strip():
                break
            log.warning("client_agent_empty_reply_retrying", attempt=attempt)

        if not content.strip():
            log.warning("client_agent_empty_reply_falling_back")
            return fallback_greeting, "greeting_fallback"
        log.info("client_agent_reply_generated", chars=len(content))
        return content, "agent"
    except Exception as exc:
        log.error("client_agent_failed_falling_back", error=str(exc))
        return fallback_greeting, "greeting_fallback"


async def run(payload) -> dict:
    tenant_id = payload.tenant_id
    telefone = payload.telefone
    mensagem = payload.mensagem
    instance_name = payload.instance_name
    timestamp = payload.timestamp
    cliente_id = payload.cliente_id

    log = logger.bind(
        tenant_id=tenant_id,
        telefone=telefone,
        instance=instance_name,
        cliente_id=cliente_id,
    )

    # Defesa em profundidade: validar que o cliente existe na DB DESTE
    # tenant antes de processar (mesmo racional do lead_orchestrator).
    # Aproveita a mesma leitura para trazer as observacoes da ficha —
    # notas duraveis da equipa ("de ferias ate 20/08") que o prompt usa.
    cliente_observacoes = ""
    if cliente_id:
        try:
            from bson import ObjectId

            from . import mongo_reader

            db = mongo_reader.get_tenant_db(tenant_id)
            doc = db.clientes.find_one({"_id": ObjectId(cliente_id)}, {"_id": 1, "observacoes": 1})
            if doc is None:
                log.warning("cliente_tenant_mismatch", cliente_id=cliente_id)
                return {
                    "status": "error",
                    "cliente_id": None,
                    "action_taken": "cliente_tenant_mismatch",
                }
            cliente_observacoes = doc.get("observacoes") or ""
        except Exception as exc:
            log.warning("cliente_tenant_check_skipped", error=str(exc))

    # 1. Build client state for the system prompt
    cliente_nome = getattr(payload, "cliente_nome", None) or "Cliente"
    client_state = {
        "nome": cliente_nome,
        "telefone": telefone,
        "observacoes": cliente_observacoes,
        # Aviso da equipa (Tenant.configuracoes.avisoIA) — ex: ferias.
        "aviso_clinica": (getattr(payload, "aviso_clinica", None) or "").strip(),
    }

    # 2. Persist inbound message
    conversa_id = None
    try:
        msg_data = await marcai_client.create_message(
            tenant_id=tenant_id,
            telefone=telefone,
            mensagem=mensagem,
            origem="cliente",
            direcao="entrada",
            conversa_id=None,
        )
        conversa_id = str(msg_data.get("conversa", {}).get("_id") or "")
    except Exception as exc:
        log.warning("client_inbound_persist_failed", error=str(exc))

    # 3. Generate reply
    period = _period_of_day(timestamp)
    fallback_greeting = _GREETINGS[period]
    reply, reply_source = await _generate_reply(
        tenant_id, cliente_id, client_state, mensagem, fallback_greeting, log
    )

    # Marcacao criada neste turno: o backend ja enviou (e persistiu) o
    # template automatico de confirmacao — nao enviar segunda mensagem.
    if reply_source == "booking_confirmed_by_system":
        log.info("client_processed", reply_source=reply_source)
        return {
            "status": "processed",
            "cliente_id": cliente_id,
            "action_taken": reply_source,
        }

    # 4. Send reply via Evolution API
    try:
        await send_message(
            telefone=telefone,
            mensagem=reply,
            instance_name=instance_name,
        )
        log.info("client_evolution_sent")
    except Exception as exc:
        log.error("client_evolution_send_failed", error=str(exc))
        return {"status": "error", "cliente_id": cliente_id, "action_taken": "send_failed"}

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
        log.warning("client_outbound_persist_failed", error=str(exc))

    log.info("client_processed", reply_source=reply_source)
    return {
        "status": "processed",
        "cliente_id": cliente_id,
        "action_taken": reply_source,
    }
