import os

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import settings
from .routers import health, process, team_reply, transcribe

logger = structlog.get_logger()

# LangSmith auto-instruments LangChain when LANGSMITH_TRACING=true and
# LANGSMITH_API_KEY are set as process env vars. Pydantic-settings reads
# them from .env into our `settings` object, but the `langsmith` SDK reads
# them from `os.environ` directly — so we mirror them across before any
# LangChain object is imported elsewhere in the app.
if settings.langsmith_tracing and settings.langsmith_api_key:
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)
    if settings.langsmith_endpoint:
        os.environ.setdefault("LANGSMITH_ENDPOINT", settings.langsmith_endpoint)
    logger.info("langsmith_tracing_enabled", project=settings.langsmith_project)
else:
    logger.info("langsmith_tracing_disabled")

app = FastAPI(
    title="ia-service",
    version="0.2.0",
    description="Marcai AI service — lead orchestration via WhatsApp",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.include_router(health.router)
app.include_router(process.router)
app.include_router(transcribe.router)
app.include_router(team_reply.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
