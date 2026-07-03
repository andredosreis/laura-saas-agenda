"""Gate do agente por provider activo.

Fix: o gate dos orchestrators verificava apenas `settings.openai_api_key`,
mas o provider default é o Gemini — remover a chave OpenAI (não usada)
degradava toda a IA para a saudação fixa, silenciosamente. O gate passa a
verificar a chave do provider seleccionado via `llm_api_key_configured()`.
"""

import structlog

from ia_service.config import llm_api_key_configured, settings
from ia_service.services import client_orchestrator, lead_orchestrator, marcai_client

log = structlog.get_logger()


def _set_keys(monkeypatch, provider, openai=None, google=None, anthropic=None):
    monkeypatch.setattr(settings, "llm_provider", provider)
    monkeypatch.setattr(settings, "openai_api_key", openai)
    monkeypatch.setattr(settings, "google_api_key", google)
    monkeypatch.setattr(settings, "anthropic_api_key", anthropic)


# ───────────────────── llm_api_key_configured ─────────────────────


def test_gemini_provider_needs_google_key_only(monkeypatch):
    _set_keys(monkeypatch, "gemini", google="g-key")
    assert llm_api_key_configured() is True


def test_gemini_provider_ignores_openai_key(monkeypatch):
    # Chave OpenAI presente NÃO conta quando o provider activo é gemini
    _set_keys(monkeypatch, "gemini", openai="sk-x")
    assert llm_api_key_configured() is False


def test_openai_provider_checks_openai_key(monkeypatch):
    _set_keys(monkeypatch, "openai", openai="sk-x")
    assert llm_api_key_configured() is True
    _set_keys(monkeypatch, "openai", google="g-key")
    assert llm_api_key_configured() is False


def test_anthropic_provider_checks_anthropic_key(monkeypatch):
    _set_keys(monkeypatch, "anthropic", anthropic="ak-x")
    assert llm_api_key_configured() is True
    _set_keys(monkeypatch, "anthropic", openai="sk-x", google="g-key")
    assert llm_api_key_configured() is False


# ───────────────────── orchestrators usam o gate ─────────────────────


class _FakeMsg:
    def __init__(self, content):
        self.content = content


class _FakeAgent:
    def __init__(self, reply="Resposta do agente."):
        self.reply = reply

    async def ainvoke(self, payload, config=None):
        return {"messages": [_FakeMsg(self.reply)]}


async def _empty_list(*args, **kwargs):
    return []


async def test_lead_reply_uses_agent_with_gemini_key_only(monkeypatch):
    _set_keys(monkeypatch, "gemini", google="g-key")
    from ia_service.agents import lead_agent

    monkeypatch.setattr(lead_agent, "make_lead_agent", lambda *a, **k: _FakeAgent())

    reply, source = await lead_orchestrator._generate_reply(
        "tenant-x", None, "olá", "fallback-greeting", log
    )
    assert source == "agent"
    assert reply == "Resposta do agente."


async def test_lead_reply_falls_back_without_any_key(monkeypatch):
    _set_keys(monkeypatch, "gemini")
    reply, source = await lead_orchestrator._generate_reply(
        "tenant-x", None, "olá", "fallback-greeting", log
    )
    assert (reply, source) == ("fallback-greeting", "greeting_fallback")


async def test_client_reply_uses_agent_with_gemini_key_only(monkeypatch):
    _set_keys(monkeypatch, "gemini", google="g-key")
    from ia_service.agents import client_agent

    monkeypatch.setattr(client_agent, "make_client_agent", lambda *a, **k: _FakeAgent())
    monkeypatch.setattr(marcai_client, "get_client_messages", _empty_list)
    monkeypatch.setattr(marcai_client, "get_client_appointments", _empty_list)

    reply, source = await client_orchestrator._generate_reply(
        "tenant-x", "cliente-1", {"nome": "Ana"}, "olá", "fallback-greeting", log
    )
    assert source == "agent"
    assert reply == "Resposta do agente."


# ───────────────── fallback a meio da conversa não é greeting ─────────────────


async def test_lead_fallback_mid_conversation_is_not_full_greeting(monkeypatch):
    """Se o agente falha a meio da conversa (turn ≥ 1), o fallback não pode
    ser o greeting de primeiro contacto — soa a reset para o lead."""
    from datetime import datetime, timezone

    _set_keys(monkeypatch, "gemini", google="g-key")
    from ia_service.agents import lead_agent

    def _boom(*args, **kwargs):
        raise RuntimeError("LLM down")

    monkeypatch.setattr(lead_agent, "make_lead_agent", _boom)

    now_iso = datetime.now(timezone.utc).isoformat()

    async def _history(**kwargs):
        return [
            {"mensagem": "olá", "direcao": "entrada", "data": now_iso},
            {"mensagem": "Olá! Em que posso ajudar?", "direcao": "saida", "data": now_iso},
        ]

    monkeypatch.setattr(marcai_client, "get_recent_messages", _history)

    greeting = "Bom dia! 😊 Obrigado por entrar em contacto connosco."
    reply, source = await lead_orchestrator._generate_reply(
        "tenant-x", "lead-1", "quero marcar", greeting, log
    )
    assert source == "greeting_fallback"
    assert "entrar em contacto" not in reply
