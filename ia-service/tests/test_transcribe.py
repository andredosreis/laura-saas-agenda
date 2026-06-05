"""Testes do endpoint /transcribe (transcrição de áudio via Gemini).

O LLM real é substituído por um fake (monkeypatch de _build_transcriber) para
não chamar o Gemini nem precisar de chave nos testes.
"""

import base64

import pytest

from ia_service.routers import transcribe as transcribe_router


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeLLM:
    def __init__(self, reply):
        self._reply = reply
        self.calls = []

    async def ainvoke(self, messages):
        self.calls.append(messages)
        return _FakeMessage(self._reply)


def _audio_b64() -> str:
    return base64.b64encode(b"fake-ogg-bytes").decode("utf-8")


async def test_transcribe_returns_text(client, auth_headers, monkeypatch):
    fake = _FakeLLM("Olá, queria marcar para sexta às 15h")
    monkeypatch.setattr(transcribe_router, "_build_transcriber", lambda: fake)

    r = await client.post(
        "/transcribe",
        headers=auth_headers,
        json={"audio_base64": _audio_b64(), "mime_type": "audio/ogg"},
    )

    assert r.status_code == 200
    assert r.json()["text"] == "Olá, queria marcar para sexta às 15h"

    # Confirma que o áudio foi enviado ao modelo como bloco base64 + o prompt.
    sent = fake.calls[0][0].content
    assert any(p.get("type") == "file" and p.get("data") == _audio_b64() for p in sent)
    assert any(p.get("type") == "text" for p in sent)


async def test_transcribe_requires_token(client):
    r = await client.post(
        "/transcribe",
        json={"audio_base64": _audio_b64(), "mime_type": "audio/ogg"},
    )
    assert r.status_code in (401, 422)  # 422 se o header obrigatório faltar


async def test_transcribe_rejects_empty_audio(client, auth_headers, monkeypatch):
    monkeypatch.setattr(transcribe_router, "_build_transcriber", lambda: _FakeLLM(""))
    r = await client.post(
        "/transcribe",
        headers=auth_headers,
        json={"audio_base64": "", "mime_type": "audio/ogg"},
    )
    assert r.status_code == 400


async def test_transcribe_handles_llm_failure(client, auth_headers, monkeypatch):
    class _Boom:
        async def ainvoke(self, _):
            raise RuntimeError("gemini down")

    monkeypatch.setattr(transcribe_router, "_build_transcriber", lambda: _Boom())
    r = await client.post(
        "/transcribe",
        headers=auth_headers,
        json={"audio_base64": _audio_b64(), "mime_type": "audio/ogg"},
    )
    assert r.status_code == 502
