import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="nonstick-test-")
os.environ.update(
    {
        "LLM_MOCK": "1",
        "DATABASE_URL": f"sqlite+aiosqlite:///{_TMP}/test.db",
        "VECTOR_BACKEND": "faiss",
        "DATA_DIR": _TMP,
        "AUTH_URL": "",
        "TAVILY_API_KEY": "",
        "EMBEDDING_DIM": "64",
        "CACHE_TTL_SECONDS": "3600",
        "MLFLOW_TRACKING_URI": "",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.db.models import Base  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def parse_sse(body: str) -> list[tuple[str, dict]]:
    import json

    events = []
    for block in body.strip().split("\n\n"):
        event, data = None, None
        for line in block.splitlines():
            if line.startswith("event: "):
                event = line[len("event: ") :]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: ") :])
        if event is not None:
            events.append((event, data or {}))
    return events
