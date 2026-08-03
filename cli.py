"""Local CLI: zero-infra mode (sqlite + FAISS) for ingesting a directory and
chatting with it from the terminal. The web service shares the same pipeline.
"""

import asyncio
from pathlib import Path

import typer

app = typer.Typer(help="NonStick.ai — chat with your documents", no_args_is_help=True)

CLI_USER = "cli"


def _run(coro):
    return asyncio.run(coro)


async def _ensure_schema() -> None:
    from app.db.models import Base
    from app.db.session import get_engine

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _get_or_create_notebook(title: str) -> str:
    from sqlalchemy import select

    from app.db.models import Notebook
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as db:
        nb = (
            await db.execute(
                select(Notebook).where(Notebook.user_id == CLI_USER, Notebook.title == title)
            )
        ).scalar_one_or_none()
        if nb is None:
            nb = Notebook(user_id=CLI_USER, title=title)
            db.add(nb)
            await db.commit()
        return nb.id


@app.command()
def ingest(
    directory: Path = typer.Argument(..., exists=True, file_okay=False),
    notebook: str = typer.Option("cli", help="Notebook title to ingest into"),
):
    """Ingest every supported document under DIRECTORY."""

    async def run() -> None:
        from sqlalchemy import select

        from app.db.models import Source, SourceStatus
        from app.db.session import get_sessionmaker
        from app.rag.ingest import SUPPORTED_EXTENSIONS, content_hash, ingest_source

        await _ensure_schema()
        notebook_id = await _get_or_create_notebook(notebook)
        files = sorted(
            p
            for p in directory.rglob("*")
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
        )
        if not files:
            typer.echo(f"No supported documents found ({sorted(SUPPORTED_EXTENSIONS)})")
            raise typer.Exit(1)

        for path in files:
            data = path.read_bytes()
            digest = content_hash(data)
            async with get_sessionmaker()() as db:
                dup = (
                    await db.execute(
                        select(Source.id).where(
                            Source.notebook_id == notebook_id, Source.content_hash == digest
                        )
                    )
                ).first()
                if dup:
                    typer.echo(f"  skip (already ingested): {path.name}")
                    continue
                source = Source(
                    notebook_id=notebook_id,
                    user_id=CLI_USER,
                    filename=path.name,
                    size_bytes=len(data),
                    content_hash=digest,
                )
                db.add(source)
                await db.commit()
                source_id = source.id
            await ingest_source(source_id, path)
            async with get_sessionmaker()() as db:
                source = (
                    await db.execute(select(Source).where(Source.id == source_id))
                ).scalar_one()
            marker = "ok" if source.status == SourceStatus.READY else f"FAILED: {source.error}"
            typer.echo(f"  {path.name}: {marker} ({source.chunk_count} chunks)")

    _run(run())


@app.command()
def chat(notebook: str = typer.Option("cli", help="Notebook title to chat with")):
    """Interactive REPL over an ingested notebook."""

    async def run() -> None:
        from app.agent.pipeline import run_chat_pipeline

        await _ensure_schema()
        notebook_id = await _get_or_create_notebook(notebook)
        typer.echo("NonStick chat — empty line to exit")
        history: list[dict] = []
        while True:
            try:
                question = input("\nyou> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not question:
                break
            answer, citations = "", []
            async for event in run_chat_pipeline(question, history, notebook_id, CLI_USER):
                if event["type"] == "token":
                    print(event["text"], end="", flush=True)
                elif event["type"] == "tool_start":
                    print(f"  [{event['tool']}...]", flush=True)
                elif event["type"] == "blocked":
                    print(f"  blocked: {event['reason']}")
                elif event["type"] == "final":
                    answer, citations = event["answer"], event.get("citations", [])
            print()
            for c in citations:
                where = f" p.{c['page']}" if c.get("page") else ""
                print(f"    [{c['ref']}] {c.get('filename', c.get('url', ''))}{where}")
            history += [
                {"role": "user", "content": question},
                {"role": "assistant", "content": answer},
            ]

    _run(run())


@app.command()
def serve(host: str = "0.0.0.0", port: int = 0):
    """Run the API server."""
    import uvicorn

    from app.config import get_settings

    uvicorn.run("app.main:app", host=host, port=port or get_settings().port)


if __name__ == "__main__":
    app()
