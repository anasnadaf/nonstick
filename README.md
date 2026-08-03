# NonStick.ai

**A multi-user, NotebookLM-style research & study assistant.** Upload your documents into notebooks, chat with them through an agentic RAG pipeline with inline citations, and pull in fresh context from the web — provider-agnostic (LiteLLM → Bedrock/OpenAI/Gemini), observable (MLflow tracing + Prometheus), and product-grade (guardrails, semantic caching, per-user isolation).

> Modernized rebuild of the original 2024 NonStick.ai (Flask + LangChain + GPT-3.5 + FAISS).

## Stack

- **API**: FastAPI (SSE streaming chat)
- **Agent**: LangGraph tool-calling loop — document retrieval, Tavily web search, pluggable MCP tools
- **LLM**: LiteLLM Router (model/provider set purely via env)
- **Vector store**: pgvector (FAISS fallback for zero-infra local mode)
- **Observability**: MLflow GenAI tracing, Prometheus metrics
- **UI**: React (Vite) — three-pane NotebookLM-style layout: sources / chat / notes

Live at [nonstick.anasnadaf.com](https://nonstick.anasnadaf.com).
