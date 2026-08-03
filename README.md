# NonStick.ai

**A multi-user, NotebookLM-style research & study assistant.** Upload your documents into notebooks, chat with them through an agentic RAG pipeline with inline citations, and pull in fresh context from the web — provider-agnostic (LiteLLM → Bedrock/OpenAI/Gemini), observable (MLflow tracing + Prometheus), and product-grade (guardrails, semantic caching, per-user isolation).

## Stack

- **API**: FastAPI (SSE streaming chat)
- **Agent**: LangGraph tool-calling loop — document retrieval, Tavily web search, pluggable MCP tools
- **LLM**: LiteLLM Router (model/provider set purely via env)
- **Vector store**: pgvector (FAISS fallback for zero-infra local mode)
- **Observability**: MLflow GenAI tracing, Prometheus metrics
- **UI**: React (Vite) + Tailwind v4 + shadcn/ui — an editorial, paper-and-ink
  reading surface over a resizable three-pane workspace: sources / chat / notes

Live at [nonstick.anasnadaf.com](https://nonstick.anasnadaf.com).

## How it works

```
user message
   → input guardrails (injection heuristics, size limits)
   → semantic cache lookup ── hit ──→ cached answer
        │ miss
        ▼
   LangGraph agent (LiteLLM chat with tools bound)
        ⇄ search_documents (this notebook only) │ tavily_search │ MCP tools
        ▼
   answer with [n] citations resolved back to source chunks
   → output scrub (credential redaction) → cache store → SSE stream
```

Every document, chunk, chat and note is scoped to `(user_id, notebook_id)`, and
retrieval filters on both — one user's material can never surface in another's
answers.

## Quick start

### Zero-infra local mode (no database, no API keys)

```bash
uv sync --group dev
LLM_MOCK=1 uv run nonstick serve          # http://localhost:8082
```

`LLM_MOCK=1` swaps in a deterministic offline model that still exercises the
full tool-calling loop, so you can explore the product without credentials.
Drop it and set `MODEL` / `EMBEDDING_MODEL` (plus the matching provider key) for
real answers.

There is also a terminal workflow:

```bash
uv run nonstick ingest ~/papers --notebook research
uv run nonstick chat --notebook research
```

### Full stack (Postgres + pgvector, MLflow, Prometheus)

```bash
cp .env.example .env      # set MODEL, EMBEDDING_MODEL and your provider key
docker compose up --build
```

| Service | URL |
|---|---|
| App | http://localhost:8082 |
| MLflow | http://localhost:5000 |
| Prometheus | http://localhost:9090 |

### UI development

```bash
cd ui && npm install && npm run dev   # Vite dev server proxies /api to :8082
```

Routes: `/` is a public landing page, `/notebooks` the index, `/notebook/:id` the
workspace. `⌘K` opens the command palette; the masthead toggle switches between
the paper and ink themes.

The landing hero is a three.js "ink lattice" — documents, their chunks, and the
citation edges that cross between them, drawn as an engraving rather than a
particle field. It is reached through a dynamic `import()` so three.js stays in
its own chunk and never loads on the workspace routes, and it degrades to an SVG
plate when WebGL is unavailable. `prefers-reduced-motion` renders a single
frame, and the render loop suspends when the canvas scrolls out of view or the
tab is backgrounded.

## Configuration

Everything is environment-driven — see [`.env.example`](.env.example). The
model strings alone decide the provider, so switching from OpenAI to Bedrock is
a config change:

```bash
MODEL=bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
EMBEDDING_MODEL=bedrock/amazon.titan-embed-text-v2:0
EMBEDDING_DIM=1024
```

Notable settings: `VECTOR_BACKEND` (`pgvector` | `faiss`), `AUTH_URL` (unset =
single-user dev mode; set = bearer tokens verified against your auth service),
`TAVILY_API_KEY` (enables the web-search tool), `MLFLOW_TRACKING_URI`,
`CACHE_SIMILARITY_THRESHOLD`.

### Adding tools

Agent capabilities are extensible without code. Declare MCP servers in
`mcp_servers.json` and they are loaded as tools at startup:

```json
{
  "servers": {
    "fetch": { "transport": "stdio", "command": "uvx", "args": ["mcp-server-fetch"] }
  }
}
```

## API

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/notebooks` | list / create notebooks |
| `POST /api/notebooks/{id}/sources` | upload a PDF, DOCX, MD or TXT (ingested in the background) |
| `POST /api/notebooks/{id}/chat` | SSE stream: `token`, `tool_start`, `tool_end`, `citations`, `final` |
| `POST /api/notebooks/{id}/notes/generate` | generate a summary, study guide or FAQ |
| `GET /metrics` | Prometheus exposition |

## Tests

```bash
uv run pytest                      # sqlite + FAISS, no API keys needed
NONSTICK_TEST_DATABASE_URL=postgresql+asyncpg://... \
NONSTICK_TEST_EMBEDDING_DIM=1536 uv run pytest    # same suite against pgvector
```
