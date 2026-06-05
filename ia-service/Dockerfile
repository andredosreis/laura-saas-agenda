FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
COPY src/ src/

# Production install (no dev extras)
RUN pip install --no-cache-dir .

# Render injects PORT — default 8000 for local docker-compose
ENV PORT=8000

# Versão deployada — passada no build (docker compose build-arg). Disponível em
# GET /version e GET /health (git_sha).
ARG GIT_SHA=unknown
ARG BUILT_AT=
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

EXPOSE 8000

# --app-dir src so uvicorn finds the ia_service package
CMD ["sh", "-c", "uvicorn ia_service.main:app --host 0.0.0.0 --port ${PORT} --app-dir src"]
