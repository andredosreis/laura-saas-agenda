"""Phase 2 skeleton tests — all external calls are mocked with respx."""

import respx
from httpx import Response

BASE_PAYLOAD = {
    "tenant_id": "507f1f77bcf86cd799439011",
    "instance_name": "marcai",
    "telefone": "351910000001",
    "mensagem": "Olá, quero saber mais",
    "message_id": "msg-abc-001",
    "timestamp": "2026-05-05T10:00:00Z",
    "cliente_id": None,
    "lead_id": None,
}

NEW_LEAD_RESPONSE = {
    "success": True,
    "data": {"_id": "lead-id-111", "status": "novo", "conversa": None, "alreadyExisted": False},
}

MSG_RESPONSE = {
    "success": True,
    "data": {"mensagem": {"_id": "msg-001"}, "conversa": {"_id": "conv-001"}},
}

STAGE_RESPONSE = {"success": True, "data": {"_id": "lead-id-111", "status": "em_conversa"}}


async def test_process_lead_creates_lead_and_sends_greeting(client, auth_headers):
    with respx.mock:
        respx.post("http://marcai-test/api/internal/leads").mock(
            return_value=Response(201, json=NEW_LEAD_RESPONSE)
        )
        respx.post("http://marcai-test/api/internal/leads/mensagens").mock(
            return_value=Response(201, json=MSG_RESPONSE)
        )
        respx.post("http://evolution-test/message/sendText/marcai").mock(
            return_value=Response(200, json={"key": {"id": "evo-msg-001"}})
        )
        respx.patch("http://marcai-test/api/internal/leads/lead-id-111/stage").mock(
            return_value=Response(200, json=STAGE_RESPONSE)
        )

        r = await client.post("/process-lead", json=BASE_PAYLOAD, headers=auth_headers)

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "processed"
    assert body["lead_id"] == "lead-id-111"
    assert body["action_taken"] == "greeting_sent"


async def test_process_lead_reuses_existing_lead_id(client, auth_headers):
    payload = {**BASE_PAYLOAD, "lead_id": "lead-existing-999"}
    with respx.mock:
        respx.post("http://marcai-test/api/internal/leads/mensagens").mock(
            return_value=Response(201, json=MSG_RESPONSE)
        )
        respx.post("http://evolution-test/message/sendText/marcai").mock(
            return_value=Response(200, json={"key": {"id": "evo-msg-002"}})
        )
        respx.patch("http://marcai-test/api/internal/leads/lead-existing-999/stage").mock(
            return_value=Response(200, json={**STAGE_RESPONSE, "data": {"_id": "lead-existing-999"}})
        )

        r = await client.post("/process-lead", json=payload, headers=auth_headers)

    assert r.status_code == 200
    assert r.json()["lead_id"] == "lead-existing-999"
    # create_lead was NOT called
    assert "http://marcai-test/api/internal/leads" not in [
        str(req.url) for req in respx.calls if req.request.method == "POST" and "mensagens" not in str(req.request.url)
    ]


async def test_process_lead_rejects_missing_token(client):
    r = await client.post("/process-lead", json=BASE_PAYLOAD)
    assert r.status_code == 422  # missing required header


async def test_process_lead_rejects_wrong_token(client):
    r = await client.post(
        "/process-lead",
        json=BASE_PAYLOAD,
        headers={"x-service-token": "wrong-token"},
    )
    assert r.status_code == 401


async def test_process_lead_returns_error_on_evolution_failure(client, auth_headers):
    with respx.mock:
        respx.post("http://marcai-test/api/internal/leads").mock(
            return_value=Response(201, json=NEW_LEAD_RESPONSE)
        )
        respx.post("http://marcai-test/api/internal/leads/mensagens").mock(
            return_value=Response(201, json=MSG_RESPONSE)
        )
        respx.post("http://evolution-test/message/sendText/marcai").mock(
            return_value=Response(500, json={"error": "internal"})
        )

        r = await client.post("/process-lead", json=BASE_PAYLOAD, headers=auth_headers)

    assert r.status_code == 500


async def test_process_lead_morning_greeting_contains_bom_dia(client, auth_headers):
    payload = {**BASE_PAYLOAD, "timestamp": "2026-05-05T09:00:00Z"}
    evolution_calls: list[str] = []

    def capture_evolution(request):
        import json
        body = json.loads(request.content)
        evolution_calls.append(body["text"])
        return Response(200, json={"key": {"id": "evo-111"}})

    with respx.mock:
        respx.post("http://marcai-test/api/internal/leads").mock(
            return_value=Response(201, json=NEW_LEAD_RESPONSE)
        )
        respx.post("http://marcai-test/api/internal/leads/mensagens").mock(
            return_value=Response(201, json=MSG_RESPONSE)
        )
        respx.post("http://evolution-test/message/sendText/marcai").mock(
            side_effect=capture_evolution
        )
        respx.patch("http://marcai-test/api/internal/leads/lead-id-111/stage").mock(
            return_value=Response(200, json=STAGE_RESPONSE)
        )

        await client.post("/process-lead", json=payload, headers=auth_headers)

    assert evolution_calls, "Evolution API was not called"
    assert "Bom dia" in evolution_calls[0]
