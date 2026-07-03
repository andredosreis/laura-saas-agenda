"""HTTP client to Marcai Node backend — all writes to Node go through here."""

import asyncio

import httpx
import structlog

from ..config import settings

logger = structlog.get_logger()

_HEADERS = {
    "Content-Type": "application/json",
}


def _auth_headers() -> dict:
    return {**_HEADERS, "x-service-token": settings.internal_service_token}


async def _post_with_retry(url: str, json: dict, retries: int = 1, timeout: float = 20.0) -> dict:
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(url, json=json, headers=_auth_headers())
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(1.0)
    raise last_exc  # type: ignore[misc]


async def _patch_with_retry(url: str, json: dict, retries: int = 1, timeout: float = 10.0) -> dict:
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.patch(url, json=json, headers=_auth_headers())
                r.raise_for_status()
                return r.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(1.0)
    raise last_exc  # type: ignore[misc]


async def create_lead(
    tenant_id: str,
    telefone: str,
    nome: str | None = None,
    email: str | None = None,
    conversa_id: str | None = None,
) -> dict:
    """Returns the lead document with `_alreadyExisted` injected.

    The Node response shape is `{success, data: <lead>, alreadyExisted?}` —
    we flatten it so callers see the alreadyExisted flag inside the lead
    dict (key `_alreadyExisted` to avoid collisions with real fields).
    """
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads",
        json={
            "tenantId": tenant_id,
            "telefone": telefone,
            "nome": nome,
            "email": email,
            "conversaId": conversa_id,
        },
    )
    lead = dict(resp["data"])
    lead["_alreadyExisted"] = bool(resp.get("alreadyExisted", False))
    return lead


async def create_message(
    tenant_id: str,
    telefone: str,
    mensagem: str,
    origem: str,
    direcao: str,
    conversa_id: str | None = None,
) -> dict:
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/mensagens",
        json={
            "tenantId": tenant_id,
            "telefone": telefone,
            "mensagem": mensagem,
            "origem": origem,
            "direcao": direcao,
            "conversaId": conversa_id,
        },
        timeout=10.0,
    )
    return resp["data"]


async def move_lead_stage(
    lead_id: str,
    tenant_id: str,
    stage: str,
    motivo: str | None = None,
) -> dict:
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/stage",
        json={"tenantId": tenant_id, "stage": stage, "motivo": motivo},
    )
    return resp["data"]


async def get_recent_messages(
    tenant_id: str,
    lead_id: str,
    limit: int = 10,
) -> list[dict]:
    """Fetch the most recent messages for a lead's conversation, oldest first.

    Used by the orchestrator to give the LangChain agent conversational
    memory: previous lead messages + previous IA replies are passed as
    `messages` so the agent sees the full context.

    Returns: list of {mensagem, origem, direcao, data} dicts.
    """
    url = f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/messages"
    params = {"tenantId": tenant_id, "limit": limit}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params, headers=_auth_headers())
            r.raise_for_status()
            return r.json().get("data", [])
    except Exception as exc:
        logger.warning("recent_messages_fetch_failed", error=str(exc))
        return []


async def qualify_lead(
    lead_id: str,
    tenant_id: str,
    score: int,
    motivo_interesse: str,
    objetivos: list[str],
) -> dict:
    """Set the lead's qualification score to an absolute value (`score`).

    Used by the agent's `qualify_lead` tool — the agent commits a deliberate
    final score after reasoning over the conversation. Set semantics, not
    accumulative.

    For per-turn cumulative deltas from the extractor (F07), use
    `apply_score_delta` instead — that path is atomic at the DB layer
    and is the GAP-02 fix.
    """
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/qualificacao",
        json={
            "tenantId": tenant_id,
            "score": score,
            "motivoInteresse": motivo_interesse,
            "objetivos": objetivos,
        },
    )
    return resp["data"]


async def apply_score_delta(
    lead_id: str,
    tenant_id: str,
    score_delta: int,
    motivo_interesse: str | None = None,
    objetivos: list[str] | None = None,
) -> dict:
    """Apply a cumulative score delta to the lead atomically.

    Resolves GAP-02 (cross-turn race on score accumulation). The Node
    endpoint uses an aggregation pipeline update to read+compute+clamp+write
    in a single MongoDB command — two parallel orchestrator runs for the
    same lead now produce a deterministic final score equal to the sum of
    their deltas (clamped to [0, 100]), instead of last-write-wins losing
    one of them.

    `score_delta` must be an integer in [-30, +30] (mirrors LeadIntel
    schema in F07). Other fields (motivo_interesse, objetivos) are applied
    in the same atomic update.

    Auto-promotion to 'qualificado' (when score >= 60 and status is
    'novo' or 'em_conversa') is performed by the Node endpoint inside
    the same pipeline — no separate round-trip.
    """
    payload: dict = {
        "tenantId": tenant_id,
        "scoreDelta": score_delta,
    }
    if motivo_interesse:
        payload["motivoInteresse"] = motivo_interesse
    if objetivos:
        payload["objetivos"] = objetivos
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/qualificacao",
        json=payload,
    )
    return resp["data"]


async def create_appointment(
    lead_id: str,
    tenant_id: str,
    data_hora_iso: str,
    tipo: str = "Avaliacao",
) -> dict:
    """Create an appointment for the lead. Returns the new appointment dict.

    Raises on conflict (HTTP 409 'slot_taken'). The agent should react to
    this by re-fetching available slots and proposing alternatives.
    """
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/agendamento",
        json={
            "tenantId": tenant_id,
            "dataHoraISO": data_hora_iso,
            "tipo": tipo,
        },
    )
    return resp["data"]


async def update_lead_info(
    lead_id: str,
    tenant_id: str,
    nome: str | None = None,
    interesse: str | None = None,
    urgencia: str | None = None,
    observacoes: str | None = None,
) -> dict:
    """Update lead intel captured during conversation.

    Used by the agent to record what the lead said as the conversation
    flows — before having enough data to fully qualify. All fields are
    optional; only provided ones are sent.
    """
    payload: dict = {"tenantId": tenant_id}
    if nome is not None:
        payload["nome"] = nome
    if interesse is not None:
        payload["interesse"] = interesse
    if urgencia is not None:
        payload["urgencia"] = urgencia
    if observacoes is not None:
        payload["observacoes"] = observacoes

    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/leads/{lead_id}/qualificacao",
        json=payload,
    )
    return resp["data"]


# ─────────────────────── Availability (F03) ─────────────────────────


def fetch_available_slots(
    tenant_id: str,
    *,
    date: str | None = None,
    from_: str | None = None,
    to: str | None = None,
    days: int = 7,
    duration: int = 60,
    timeout: float = 10.0,
) -> dict:
    """Fetch availability from the Node backend (F03 single source).

    Synchronous on purpose: the caller (`mongo_reader.find_available_slots`)
    and the `get_available_slots` agent tool are sync, so we use
    `httpx.Client` instead of forcing an event loop into the tool.

    Returns the parsed `data` payload:
        {tenantId, timezone, duration, scheduleConfigured, days: [...]}

    Raises on any HTTP/transport error — this function does NOT swallow
    errors. `find_available_slots` is the error boundary (it catches and
    degrades to `[]`); keeping the two layers distinct means graceful
    degradation lives in exactly one place.
    """
    params: dict[str, str | int] = {"tenantId": tenant_id, "duration": duration}
    if date is not None:
        params["date"] = date
    elif from_ is not None or to is not None:
        if from_ is not None:
            params["from"] = from_
        if to is not None:
            params["to"] = to
    else:
        params["days"] = days

    url = f"{settings.marcai_api_url}/api/internal/disponibilidade"
    with httpx.Client(timeout=timeout) as client:
        r = client.get(url, params=params, headers=_auth_headers())
        r.raise_for_status()
        return r.json()["data"]


# ─────────────────────── Client lifecycle ───────────────────────────


async def get_client_packages(tenant_id: str, cliente_id: str) -> list[dict]:
    """Returns active packages with remaining sessions for a client."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/pacotes",
            params={"tenantId": tenant_id},
            headers=_auth_headers(),
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def get_client_appointments(tenant_id: str, cliente_id: str) -> list[dict]:
    """Returns upcoming non-cancelled appointments for a client."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/agendamentos",
            params={"tenantId": tenant_id},
            headers=_auth_headers(),
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def create_client_appointment(
    tenant_id: str,
    cliente_id: str,
    data_hora_iso: str,
    tipo: str = "Sessao",
    servico_nome: str | None = None,
) -> dict:
    """Creates a new appointment for an existing client.

    servico_nome: label do servico (ex: nome do pacote activo) usado pelo
    backend no template de confirmacao e nos lembretes.
    """
    payload = {"tenantId": tenant_id, "dataHoraISO": data_hora_iso, "tipo": tipo}
    if servico_nome:
        payload["servicoNome"] = servico_nome
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/agendamentos",
        json=payload,
    )
    return resp["data"]


async def get_client_messages(
    tenant_id: str,
    cliente_id: str,
    limit: int = 10,
) -> list[dict]:
    """Returns recent conversation messages for a client (by phone)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/messages",
            params={"tenantId": tenant_id, "limit": limit},
            headers=_auth_headers(),
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def reschedule_client_appointment(
    tenant_id: str, cliente_id: str, agendamento_id: str, nova_data_hora_iso: str
) -> dict:
    """Reschedule an existing appointment to a new time."""
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/agendamentos/{agendamento_id}/reschedule",
        json={"tenantId": tenant_id, "novaDataHoraISO": nova_data_hora_iso},
    )
    return resp["data"]


async def cancel_client_appointment(tenant_id: str, cliente_id: str, agendamento_id: str) -> dict:
    """Cancel an existing appointment."""
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/agendamentos/{agendamento_id}/cancel",
        json={"tenantId": tenant_id},
    )
    return resp["data"]


async def pause_client_ia(tenant_id: str, cliente_id: str) -> dict:
    """Pausa o agente de IA para este cliente (iaAtiva=false).

    A partir daí, as mensagens deste cliente caem em MANUAL_SILENT no router
    (sem invocar o LLM, sem responder) ate o humano reactivar pelo inbox.
    """
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/pausar-ia",
        json={"tenantId": tenant_id, "ativa": False},
    )
    return resp["data"]


async def get_pending_followup(tenant_id: str, cliente_id: str) -> dict | None:
    """Agendamento com follow-up pós-sessão pendente (<24h, sem resposta) ou None."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(
            f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/followup-pendente",
            params={"tenantId": tenant_id},
            headers=_auth_headers(),
        )
        r.raise_for_status()
        return r.json().get("data")


async def registar_presenca(
    tenant_id: str,
    cliente_id: str,
    agendamento_id: str,
    compareceu: bool,
    feedback: str = "",
) -> dict:
    """Regista a resposta ao follow-up (Compareceu / Não Compareceu)."""
    resp = await _patch_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}"
        f"/agendamentos/{agendamento_id}/presenca",
        json={"tenantId": tenant_id, "compareceu": compareceu, "feedback": feedback},
    )
    return resp["data"]


async def sinalizar_renovacao(tenant_id: str, cliente_id: str) -> dict:
    """Alerta a equipa de que o cliente quer renovar o pacote (handoff)."""
    resp = await _post_with_retry(
        f"{settings.marcai_api_url}/api/internal/clientes/{cliente_id}/renovacao-interesse",
        json={"tenantId": tenant_id},
    )
    return resp["data"]
