from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Obrigatório — sem default. O serviço não arranca sem INTERNAL_SERVICE_TOKEN
    # definido (fail-fast). Nunca usar token hardcoded como fallback.
    internal_service_token: str
    marcai_api_url: str = "http://localhost:5000"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_prefix: str = "marcai"

    evolution_api_url: str = "http://localhost:8080"
    evolution_api_key: str = ""

    ia_service_port: int = 8000
    sentry_dsn: str | None = None
    openai_api_key: str | None = None
    google_api_key: str | None = None
    anthropic_api_key: str | None = None
    # Provider can be 'gemini' (default — free tier), 'openai' or 'anthropic'
    llm_provider: str = "gemini"

    # Model overrides per role. Lets us A/B test different models in evals
    # without code changes (e.g. EXTRACTOR_MODEL=gpt-4o for one run).
    # Defaults match what production used at the time of the F1 baseline.
    extractor_model_openai: str = "gpt-4o-mini"
    extractor_model_gemini: str = "gemini-2.5-flash"

    # Agent model override (conversation agent — lead + client).
    # Default: same as extractor. Override via AGENT_MODEL_OPENAI env var.
    agent_model_openai: str = "gpt-4o-mini"
    # Gemini variant of the agent model. Override via AGENT_MODEL_GEMINI
    # to A/B test models (e.g. gemini-3.1-flash-lite) without code changes.
    agent_model_gemini: str = "gemini-2.5-flash"
    # Anthropic variant. Override via AGENT_MODEL_ANTHROPIC (e.g. Haiku 4.5).
    agent_model_anthropic: str = "claude-haiku-4-5-20251001"

    # Modelo Gemini usado SÓ para transcrever áudios (notas de voz) → texto.
    # NÃO afecta a resposta ao cliente: quem gera a resposta é o agente
    # (agent_model_gemini). Por isso fica fixo no modelo grátis e independente
    # do A/B do agente. gemini-2.5-flash lida bem com áudio (incl. ogg/opus).
    transcribe_model_gemini: str = "gemini-2.5-flash"

    # LangSmith tracing (set LANGSMITH_TRACING=true + LANGSMITH_API_KEY to
    # enable). LangChain auto-instruments on import when these env vars are
    # present — we only re-export here so other modules can decide to attach
    # extra metadata to runs (tenant_id, lead_id, turn_number).
    langsmith_tracing: bool = False
    langsmith_api_key: str | None = None
    langsmith_project: str = "marcai-ia-service"
    langsmith_endpoint: str | None = None


settings = Settings()
