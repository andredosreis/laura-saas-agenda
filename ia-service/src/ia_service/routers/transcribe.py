"""Transcrição de áudios do WhatsApp via Gemini (notas de voz dos clientes).

O backend Node descarrega o áudio do Evolution e envia-o aqui em base64; o
Gemini (multimodal) devolve a transcrição em texto, que o Node injecta no
pipeline de routing/agente como se fosse uma mensagem de texto normal.

Mantém-se no ia-service (e não no Node) porque é aqui que vive o cliente Gemini
e a chave — assim o Node não precisa de um SDK de STT nem de custos extra.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import require_service_token

router = APIRouter()
logger = structlog.get_logger()


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(..., description="Áudio em base64 (sem prefixo data:)")
    mime_type: str = Field(default="audio/ogg", description="Ex.: audio/ogg, audio/mpeg")


class TranscribeResponse(BaseModel):
    text: str


# Factory separada (não inline) por uma razão de testes: os testes fazem
# monkeypatch de `_build_transcriber` para devolver um LLM falso, evitando
# chamar o Gemini real / precisar de chave. O import do ChatGoogleGenerativeAI
# fica no topo do módulo (não local) — está sempre instalado (provider default).
def _build_transcriber():
    return ChatGoogleGenerativeAI(
        model=settings.transcribe_model_gemini,
        temperature=0,
        google_api_key=settings.google_api_key,
        timeout=30,
    )


_PROMPT = (
    "Transcreve este áudio em português de Portugal. "
    "Devolve APENAS a transcrição literal, sem comentários, sem aspas, "
    "sem descrever sons. Se não houver fala perceptível, devolve string vazia."
)


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    dependencies=[Depends(require_service_token)],
)
async def transcribe(payload: TranscribeRequest) -> TranscribeResponse:
    if not payload.audio_base64:
        raise HTTPException(status_code=400, detail="audio_base64 vazio")

    message = HumanMessage(
        content=[
            {"type": "text", "text": _PROMPT},
            {
                "type": "file",
                "source_type": "base64",
                "mime_type": payload.mime_type,
                "data": payload.audio_base64,
            },
        ]
    )

    try:
        llm = _build_transcriber()
        result = await llm.ainvoke([message])
    except Exception as exc:  # noqa: BLE001 — degrade graciosamente
        logger.warning("transcribe_failed", error=str(exc), mime_type=payload.mime_type)
        raise HTTPException(status_code=502, detail="Falha na transcrição") from exc

    raw = result.content
    text = (raw if isinstance(raw, str) else str(raw or "")).strip()
    logger.info("transcribe_ok", chars=len(text), mime_type=payload.mime_type)
    return TranscribeResponse(text=text)
