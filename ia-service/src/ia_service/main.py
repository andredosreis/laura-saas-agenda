import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .routers import health, process

logger = structlog.get_logger()

app = FastAPI(
    title="ia-service",
    version="0.2.0",
    description="Marcai AI service — lead orchestration via WhatsApp",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.include_router(health.router)
app.include_router(process.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
