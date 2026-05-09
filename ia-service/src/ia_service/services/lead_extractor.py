"""Lead intel extractor (Phase 4d-2).

Replaces "agent decides which tools to call" (inconsistent) with a
deterministic structured-output extraction step. The LLM is given the
last few turns of conversation and asked to return a strict JSON
matching the LeadIntel schema. Python then applies updates to the DB
directly — no tool calls involved.

This runs BEFORE the conversational agent. It costs an extra ~$0.0003
per turn (gpt-4o-mini, ~800 tokens) but guarantees the lead's intel is
always captured when present.

Usage:
    intel = await extract_intel(history_messages, current_message)
    if intel.interesse or intel.urgencia or intel.observacoes:
        await marcai_client.update_lead_info(...)
    if intel.score_delta != 0 and lead score reaches 60:
        await marcai_client.qualify_lead(...)
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..config import settings


# ─────────────────────────── Schema ───────────────────────────


class LeadIntel(BaseModel):
    """Structured intel extracted from a lead's recent messages.

    All fields are optional — only fill in what the lead has clearly
    revealed. If unsure, leave None.
    """

    interesse: Optional[str] = Field(
        None,
        description=(
            "Resumo curto (≤200 chars) do que o lead procura. "
            "Só preencher se o lead disse claramente o objectivo "
            "(ex: 'recuperação pós-parto', 'preparação pré-cirurgia', "
            "'tratamento capilar para queda'). Se ainda não está claro, "
            "deixar null."
        ),
    )

    urgencia: Optional[Literal["baixa", "media", "alta"]] = Field(
        None,
        description=(
            "Pressão de tempo do lead. "
            "alta: tem data marcada (casamento, evento, pós-op imediato). "
            "media: quer começar este mês. "
            "baixa: está só a explorar opções. "
            "null se não há sinal claro."
        ),
    )

    observacoes: Optional[str] = Field(
        None,
        description=(
            "Detalhe livre útil para a Laura na avaliação clínica "
            "(ex: 'parto há 3 meses', 'fez lipo, médico recomendou 10 sessões DLA'). "
            "Só preencher se há facto concreto novo. Não duplicar interesse."
        ),
    )

    intent: Literal[
        "primeira_msg",
        "descrever_problema",
        "pergunta_preco",
        "duvida_servico",
        "pedir_agendamento",
        "escolher_slot",
        "hesitacao",
        "desistir",
        "agradecer_encerrar",
        "outra",
    ] = Field(
        ...,
        description=(
            "Intenção principal da mensagem mais recente do lead. "
            "primeira_msg: saudação inicial sem mais contexto. "
            "descrever_problema: revelou sintoma/objectivo (parto, dor, evento). "
            "pergunta_preco: pediu valores. "
            "duvida_servico: pediu detalhe técnico (duração, contraindicações). "
            "pedir_agendamento: aceitou marcar avaliação. "
            "escolher_slot: indicou hora específica (ex: '15:00 dá-me jeito'). "
            "hesitacao: 'vou pensar', 'depois falo', evasivas. "
            "desistir: 'não me interessa', 'vou para outra clínica'. "
            "agradecer_encerrar: 'obrigada', 'tchau' depois de marcação. "
            "outra: nada do acima."
        ),
    )

    score_delta: int = Field(
        0,
        ge=-30,
        le=30,
        description=(
            "Quanto adicionar ao score de qualificação do lead (-30 a +30). "
            "Heurística sugerida: "
            "+30 descreveu sintomas+objectivos concretos. "
            "+25 mostrou urgência clara. "
            "+20 aceitou avaliação. "
            "+15 pediu detalhe técnico. "
            "+10 escolheu slot específico. "
            "0 mensagem genérica/saudação. "
            "-15 hesitou repetidamente. "
            "-25 disse 'sem dinheiro agora'. "
            "-30 desistiu explicitamente."
        ),
    )

    perdido_motivo: Optional[str] = Field(
        None,
        description=(
            "Se intent=desistir, motivo curto. "
            "ex: 'sem orçamento', 'optou por outra clínica', 'não interessada'. "
            "null caso contrário."
        ),
    )

    objection_type: Optional[
        Literal[
            "preco",        # "não tenho dinheiro", "está caro"
            "tempo",        # "estou ocupada", "agora não dá"
            "distancia",    # "moro longe", "não sei se consigo ir"
            "duvida_servico",  # "será que funciona?", "preciso de pensar mais"
            "outra_clinica",   # "estou a comparar", "vi outra"
            "geral",        # hesitação sem motivo claro ("vou pensar")
        ]
    ] = Field(
        None,
        description=(
            "Quando o lead hesita, recusa marcar ou se mostra evasivo, "
            "categoriza o tipo de objecção que está por trás (mesmo "
            "implícita). Permite à IA aplicar a estratégia certa de "
            "superação. null se o lead avança com confiança."
        ),
    )


# ─────────────────────── Extractor prompt ───────────────────────


EXTRACTOR_SYSTEM_PROMPT = """És um extractor de informação de leads para uma clínica
de estética em Portugal. Lê as mensagens trocadas (saudações + leads + respostas anteriores
da assistente Laura) e extrai factos sobre este lead num JSON estrito.

Regras absolutas:
1. Só preenche `interesse` / `urgencia` / `observacoes` se a INFORMAÇÃO está claramente
   nas mensagens DESTE lead. Não inventes nem completes lacunas.
2. `intent` é sempre obrigatório — escolhe a categoria que melhor descreve a ÚLTIMA
   mensagem do lead (a mais recente), não a conversa inteira.
3. `score_delta` segue a heurística do schema. Em dúvida, usa 0.
4. `perdido_motivo` SÓ se intent=desistir.
5. Português europeu nas strings que preenches (interesse/observacoes).

Não respondes ao lead — só extrais. Não escrevas conversação."""


# ─────────────────────── LLM factory ───────────────────────


def _get_extractor_llm():
    """Build an LLM bound to LeadIntel schema for structured output."""
    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=settings.openai_api_key,
            timeout=15,
        )
    else:
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0,
            google_api_key=settings.google_api_key,
            timeout=15,
        )

    return llm.with_structured_output(LeadIntel)


# ─────────────────────── Public API ───────────────────────


async def extract_intel(messages: list[dict]) -> Optional[LeadIntel]:
    """Run the extractor on a conversation; return LeadIntel or None on failure.

    `messages` is the same list the conversational agent receives —
    last ~5-10 turns in {role, content} format.
    """
    if not messages:
        return None

    extractor = _get_extractor_llm()
    payload = [{"role": "system", "content": EXTRACTOR_SYSTEM_PROMPT}] + messages
    try:
        result: LeadIntel = await extractor.ainvoke(payload)
        return result
    except Exception:
        # Extractor failures are non-fatal — orchestrator continues with
        # the conversational agent without intel updates.
        return None
