import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.agent.mcp import load_mcp_tools
from app.api import chat, notebooks, notes, sources
from app.auth import User, require_user
from app.config import get_settings
from app.db.models import Base
from app.db.session import dispose_engine, get_engine
from app.obs import metrics
from app.obs.tracing import setup_tracing

UI_DIST = Path(__file__).resolve().parent.parent / "ui" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.is_postgres:
        # zero-infra mode: sqlite schema is created in place; postgres uses alembic
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    setup_tracing()
    if not settings.llm_mock:
        metrics.register_litellm_callbacks()
    await load_mcp_tools()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="NonStick.ai", version="2.0.0", lifespan=lifespan)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def http_metrics(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", None)
        if path and path.startswith("/api"):
            method = request.method
            metrics.HTTP_REQUESTS.labels(method, path, str(response.status_code)).inc()
            metrics.HTTP_LATENCY.labels(method, path).observe(time.perf_counter() - started)
        return response

    app.include_router(notebooks.router)
    app.include_router(sources.router)
    app.include_router(chat.router)
    app.include_router(notes.router)

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.get("/metrics", include_in_schema=False)
    async def prometheus_metrics() -> Response:
        payload, content_type = metrics.render_metrics()
        return Response(content=payload, media_type=content_type)

    @app.get("/api/me")
    async def me(user: User = Depends(require_user)) -> dict:
        return {
            "id": user.id,
            "username": user.username,
            "auth_enabled": bool(settings.auth_url),
        }

    if UI_DIST.exists():
        app.mount("/assets", StaticFiles(directory=UI_DIST / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str) -> FileResponse:
            candidate = UI_DIST / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(UI_DIST / "index.html")

    return app


app = create_app()
