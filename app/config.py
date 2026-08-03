from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- LLM (provider-agnostic via LiteLLM; model strings decide the provider) ---
    model: str = "openai/gpt-4o-mini"
    embedding_model: str = "openai/text-embedding-3-small"
    embedding_dim: int = 1536
    llm_mock: bool = False
    llm_temperature: float = 0.2
    llm_max_tokens: int = 2048
    agent_max_iterations: int = 6

    # --- Storage ---
    database_url: str = "sqlite+aiosqlite:///./data/nonstick.db"
    vector_backend: str = "faiss"  # "pgvector" | "faiss"
    data_dir: Path = Path("./data")

    # --- Ingestion ---
    chunk_size: int = 1200
    chunk_overlap: int = 200
    max_upload_mb: int = 25
    retrieval_top_k: int = 6

    # --- Auth (unset => single-user dev mode) ---
    auth_url: str = ""

    # --- Tools ---
    tavily_api_key: str = ""
    mcp_servers_file: Path = Path("./mcp_servers.json")

    # --- Semantic cache ---
    cache_enabled: bool = True
    cache_similarity_threshold: float = 0.95
    cache_ttl_seconds: int = 24 * 3600

    # --- Observability ---
    mlflow_tracking_uri: str = ""
    mlflow_experiment: str = "nonstick"

    # --- Server ---
    port: int = 8082
    cors_origins: str = ""

    @property
    def sync_database_url(self) -> str:
        """Alembic runs against the async URL via its async env; this stays for tooling."""
        return self.database_url

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.uploads_dir.mkdir(parents=True, exist_ok=True)
    return s
