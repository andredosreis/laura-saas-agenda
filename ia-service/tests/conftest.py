import os

import pytest

# Force test token before importing app
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-token")
os.environ.setdefault("MARCAI_API_URL", "http://marcai-test")
os.environ.setdefault("EVOLUTION_API_URL", "http://evolution-test")
os.environ.setdefault("EVOLUTION_API_KEY", "test-key")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

from httpx import ASGITransport, AsyncClient  # noqa: E402

from ia_service.main import app  # noqa: E402

SERVICE_TOKEN = "test-token"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def auth_headers():
    return {"x-service-token": SERVICE_TOKEN}
