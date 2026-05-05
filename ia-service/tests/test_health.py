import respx
from httpx import Response


async def test_health_returns_ok(client):
    with respx.mock:
        respx.get("http://marcai-test/api/auth/me").mock(return_value=Response(401))
        r = await client.get("/health")

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert body["marcai_reachable"] is True


async def test_health_when_marcai_down(client):
    with respx.mock:
        respx.get("http://marcai-test/api/auth/me").mock(side_effect=Exception("connection refused"))
        r = await client.get("/health")

    assert r.status_code == 200
    assert r.json()["marcai_reachable"] is False


async def test_health_no_token_required(client):
    # Health endpoint must be accessible without X-Service-Token
    with respx.mock:
        respx.get("http://marcai-test/api/auth/me").mock(return_value=Response(401))
        r = await client.get("/health")  # no auth headers

    assert r.status_code == 200
