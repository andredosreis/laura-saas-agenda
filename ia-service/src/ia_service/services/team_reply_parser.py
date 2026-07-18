"""Interpreta respostas do número pessoal da equipa.

O modelo só transforma linguagem natural em dados estruturados:
destinatário, texto para o contacto e eventual pedido de esclarecimento.
Nunca recebe nem escolhe telefones e nunca envia mensagens.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field

from . import tenant_knowledge


class TeamReplyInterpretation(BaseModel):
    action: Literal["relay", "clarify"]
    recipient_hint: str | None = Field(default=None, max_length=200)
    message_to_contact: str | None = Field(default=None, max_length=1000)
    clarification: str | None = Field(default=None, max_length=500)


SYSTEM_PROMPT = """És um intérprete de recados internos de uma clínica portuguesa.
A mensagem vem do número pessoal autorizado da responsável da clínica ({owner_name}).
Transforma a mensagem numa instrução estruturada, sem executar nada.

Regras:
- action="relay" apenas quando percebes quem deve receber o recado e qual é a
  mensagem que deve chegar a essa pessoa.
- recipient_hint contém somente o nome referido por {owner_name}. Nunca inventes nomes.
- message_to_contact é o recado em português europeu, escrito diretamente para
  o destinatário e atribuído a {owner_name}. Mantém os factos; não acrescentes
  prazos, confirmações ou promessas.
- Se {owner_name} falar na primeira pessoa, converte para terceira pessoa:
  "eu vou ligar para ela" -> "A {owner_name} vai ligar-lhe."
- "Confirma marcação da Silva" significa recipient_hint="Silva" e
  message_to_contact="A {owner_name} confirmou a sua marcação."
- Se não houver nome explícito, só podes escolher um dos pedidos pendentes
  fornecidos quando existir exatamente um candidato coerente.
- Com vários destinatários possíveis, mensagem incompleta ou conversa social,
  usa action="clarify" e escreve uma pergunta curta para a responsável.
- Nunca devolvas telefone, ID, markdown ou explicações fora do schema.
"""

_RELAY_RE = re.compile(
    r"^(?:diga|diz|avisa|avise)(?:-lhe)?\s+"
    r"(?:(?:para\s+)?(?:a|ao|à)\s+|para\s+)?"
    r"(?P<recipient>.+?)\s+que\s+(?P<body>.+)$",
    re.IGNORECASE,
)
_IMPLICIT_RELAY_RE = re.compile(
    r"^(?:diga|diz|avisa|avise)(?:-lhe)?\s+que\s+(?P<body>.+)$",
    re.IGNORECASE,
)
_CONFIRMATION_RE = re.compile(
    r"^confirma(?:\s+a)?\s+marca(?:ção|cao)\s+(?:da|do|de)\s+"
    r"(?P<recipient>.+?)[.!?]*$",
    re.IGNORECASE,
)
_PRONOUNS = {
    "ela",
    "ele",
    "elas",
    "eles",
    "lhe",
    "lhes",
    "si",
    "dela",
    "dele",
    "cliente",
    "pessoa",
    "senhora",
    "senhor",
}


def _normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text.casefold())
    return "".join(
        char for char in normalized if unicodedata.category(char) != "Mn"
    ).strip(" \t\r\n.!?;:")


def _pending_recipient(pending_requests: list[dict[str, str]]) -> str | None:
    unique: dict[str, str] = {}
    for request in pending_requests:
        name = str(request.get("name") or "").strip()
        if name:
            unique.setdefault(_normalize(name), name)
    return next(iter(unique.values())) if len(unique) == 1 else None


def _safe_recipient(
    raw: str | None,
    pending_requests: list[dict[str, str]],
) -> str | None:
    recipient = str(raw or "").strip(" \t\r\n.!?;:")
    if not recipient or _normalize(recipient) in _PRONOUNS:
        return _pending_recipient(pending_requests)
    return recipient


def _rewrite_common_message(body: str, owner_name: str) -> str:
    normalized = _normalize(body)
    if re.fullmatch(
        r"(?:eu\s+)?(?:vou\s+ligar|ligo)(?:\s+para)?"
        r"(?:\s+(?:ela|ele|si|lhe))?",
        normalized,
    ):
        return f"A {owner_name} vai ligar-lhe."
    return f"A {owner_name} pediu-me para lhe transmitir: “{body.strip()}”."


def _interpret_common(
    message: str,
    pending_requests: list[dict[str, str]],
    owner_name: str,
) -> TeamReplyInterpretation | None:
    text = message.strip()

    confirmation = _CONFIRMATION_RE.fullmatch(text)
    if confirmation:
        recipient = _safe_recipient(
            confirmation.group("recipient"),
            pending_requests,
        )
        if not recipient:
            return TeamReplyInterpretation(
                action="clarify",
                clarification="Qual é o nome completo da pessoa da marcação?",
            )
        return TeamReplyInterpretation(
            action="relay",
            recipient_hint=recipient,
            message_to_contact=f"A {owner_name} confirmou a sua marcação.",
        )

    implicit = _IMPLICIT_RELAY_RE.fullmatch(text)
    if implicit:
        recipient = _pending_recipient(pending_requests)
        if not recipient:
            return TeamReplyInterpretation(
                action="clarify",
                clarification="A quem devo enviar o recado?",
            )
        return TeamReplyInterpretation(
            action="relay",
            recipient_hint=recipient,
            message_to_contact=_rewrite_common_message(
                implicit.group("body"),
                owner_name,
            ),
        )

    relay = _RELAY_RE.fullmatch(text)
    if relay:
        recipient = _safe_recipient(relay.group("recipient"), pending_requests)
        if not recipient:
            return TeamReplyInterpretation(
                action="clarify",
                clarification="A quem devo enviar o recado?",
            )
        return TeamReplyInterpretation(
            action="relay",
            recipient_hint=recipient,
            message_to_contact=_rewrite_common_message(
                relay.group("body"),
                owner_name,
            ),
        )
    return None


def _build_parser():
    # Reutiliza a factory multi-provider já usada pelos agentes. O wrapper
    # `with_structured_output` devolve uma instância Pydantic validada.
    from ..agents.lead_agent import _build_model

    return _build_model().with_structured_output(TeamReplyInterpretation)


async def interpret_team_reply(
    message: str,
    pending_requests: list[dict[str, str]],
    tenant_id: str,
) -> TeamReplyInterpretation:
    owner_name = tenant_knowledge.load_clinica_config(tenant_id)["dona"]
    common = _interpret_common(message, pending_requests, owner_name)
    if common is not None:
        return common

    parser = _build_parser()
    context = {
        "mensagem_da_responsavel": message,
        "nome_da_responsavel": owner_name,
        "pedidos_pendentes_mais_recentes_primeiro": pending_requests[:10],
    }
    result = await parser.ainvoke(
        [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(owner_name=owner_name),
            },
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ]
    )

    if result.action == "relay" and (
        not (result.recipient_hint or "").strip()
        or not (result.message_to_contact or "").strip()
    ):
        return TeamReplyInterpretation(
            action="clarify",
            clarification="A quem devo enviar o recado e qual é a mensagem?",
        )
    return result
