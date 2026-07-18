from ia_service.routers import team_reply as team_reply_router
from ia_service.services import team_reply_parser
from ia_service.services.team_reply_parser import TeamReplyInterpretation


async def test_parse_team_reply_returns_structured_relay(client, auth_headers, monkeypatch):
    calls = []

    async def fake_interpret(message, pending_requests, tenant_id):
        calls.append((message, pending_requests, tenant_id))
        return TeamReplyInterpretation(
            action="relay",
            recipient_hint="Anabela Cordeiro",
            message_to_contact="A Laura vai ligar-lhe.",
        )

    monkeypatch.setattr(team_reply_router.team_reply_parser, "interpret_team_reply", fake_interpret)

    response = await client.post(
        "/parse-team-reply",
        headers=auth_headers,
        json={
            "tenant_id": "tenant-test",
            "message": "Diga para Anabela Cordeiro que eu vou ligar para ela",
            "pending_requests": [
                {"name": "Anabela Cordeiro", "reason": "Pediu contacto da Laura"}
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "action": "relay",
        "recipient_hint": "Anabela Cordeiro",
        "message_to_contact": "A Laura vai ligar-lhe.",
        "clarification": None,
    }
    assert calls[0][1][0]["name"] == "Anabela Cordeiro"


async def test_parse_team_reply_requires_service_token(client):
    response = await client.post(
        "/parse-team-reply",
        json={"message": "Diga à Ana que vou ligar", "pending_requests": []},
    )
    assert response.status_code in (401, 422)


async def test_interpreter_converts_invalid_relay_to_clarification(monkeypatch):
    class FakeParser:
        async def ainvoke(self, _messages):
            return TeamReplyInterpretation(
                action="relay",
                recipient_hint=None,
                message_to_contact=None,
            )

    monkeypatch.setattr(team_reply_parser, "_build_parser", lambda: FakeParser())

    result = await team_reply_parser.interpret_team_reply(
        "Quanto à Ana, transmite que sim",
        [{"name": "Ana", "reason": "Confirmação"}],
        "tenant-test",
    )

    assert result.action == "clarify"
    assert result.clarification


async def test_common_relay_uses_tenant_owner_without_llm(monkeypatch):
    def fake_config(tenant_id):
        assert tenant_id == "tenant-laura"
        return {"nome": "Clínica", "dona": "Laura", "profissao": "profissional"}

    monkeypatch.setattr(team_reply_parser.tenant_knowledge, "load_clinica_config", fake_config)
    monkeypatch.setattr(
        team_reply_parser,
        "_build_parser",
        lambda: (_ for _ in ()).throw(AssertionError("LLM não devia ser chamado")),
    )

    result = await team_reply_parser.interpret_team_reply(
        "Diga para Anabela Cordeiro que eu vou ligar para ela",
        [{"name": "Anabela Cordeiro", "reason": "Pediu contacto"}],
        "tenant-laura",
    )

    assert result.action == "relay"
    assert result.recipient_hint == "Anabela Cordeiro"
    assert result.message_to_contact == "A Laura vai ligar-lhe."


async def test_pronoun_with_multiple_pending_requests_requires_clarification(monkeypatch):
    monkeypatch.setattr(
        team_reply_parser.tenant_knowledge,
        "load_clinica_config",
        lambda _tenant_id: {
            "nome": "Clínica",
            "dona": "responsável",
            "profissao": "profissional",
        },
    )

    result = await team_reply_parser.interpret_team_reply(
        "Diga para ela que eu vou ligar",
        [
            {"name": "Anabela Cordeiro", "reason": "Pedido A"},
            {"name": "Rita Costa", "reason": "Pedido B"},
        ],
        "tenant-test",
    )

    assert result.action == "clarify"
    assert result.recipient_hint is None


async def test_pronoun_with_one_pending_request_uses_that_exact_name(monkeypatch):
    monkeypatch.setattr(
        team_reply_parser.tenant_knowledge,
        "load_clinica_config",
        lambda _tenant_id: {
            "nome": "Clínica",
            "dona": "Marta",
            "profissao": "profissional",
        },
    )

    result = await team_reply_parser.interpret_team_reply(
        "Diga-lhe que eu vou ligar",
        [{"name": "Anabela Cordeiro", "reason": "Pedido único"}],
        "tenant-test",
    )

    assert result.action == "relay"
    assert result.recipient_hint == "Anabela Cordeiro"
    assert result.message_to_contact == "A Marta vai ligar-lhe."
