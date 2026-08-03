"""Prometheus metrics. Scraped from /metrics; deployed Prometheus federates this
into the existing portfolio Grafana."""

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Histogram,
    generate_latest,
)

HTTP_REQUESTS = Counter(
    "nonstick_http_requests_total",
    "HTTP requests",
    ["method", "route", "status"],
)
HTTP_LATENCY = Histogram(
    "nonstick_http_request_seconds",
    "HTTP request latency",
    ["method", "route"],
)

CHAT_REQUESTS = Counter(
    "nonstick_chat_requests_total",
    "Chat pipeline runs by outcome",
    ["outcome"],  # answered | cached | blocked | error
)
CHAT_LATENCY = Histogram(
    "nonstick_chat_pipeline_seconds",
    "End-to-end chat pipeline latency",
    buckets=[0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60],
)
CACHE_EVENTS = Counter(
    "nonstick_semantic_cache_events_total",
    "Semantic cache lookups",
    ["event"],  # hit | miss
)
TOOL_CALLS = Counter(
    "nonstick_tool_calls_total",
    "Agent tool invocations",
    ["tool"],
)
GUARDRAIL_BLOCKS = Counter(
    "nonstick_guardrail_events_total",
    "Guardrail interventions",
    ["stage"],  # input_block | output_redaction
)
INGESTED_CHUNKS = Counter(
    "nonstick_ingested_chunks_total",
    "Chunks embedded and stored",
)
INGEST_FAILURES = Counter(
    "nonstick_ingest_failures_total",
    "Failed source ingestions",
)
LLM_TOKENS = Counter(
    "nonstick_llm_tokens_total",
    "LLM tokens by direction",
    ["direction"],  # input | output
)
LLM_COST = Counter(
    "nonstick_llm_cost_usd_total",
    "Cumulative LLM spend as reported by LiteLLM",
)


def record_usage(usage: object, model: str = "") -> None:
    """Account one response's usage.

    Called from the streaming loop because litellm's success_callback does not
    fire for streaming calls issued through a Router — which is every chat this
    app makes, so without this the token and cost counters never move.
    """
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    if prompt:
        LLM_TOKENS.labels("input").inc(prompt)
    if completion:
        LLM_TOKENS.labels("output").inc(completion)
    if not model:
        return
    try:
        import litellm

        prompt_cost, completion_cost = litellm.cost_per_token(
            model=model, prompt_tokens=prompt, completion_tokens=completion
        )
        LLM_COST.inc(float(prompt_cost) + float(completion_cost))
    except Exception:  # unknown model in the cost map, offline, etc.
        pass


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST


def register_litellm_callbacks() -> None:
    """Token/cost accounting straight from LiteLLM's success callback."""
    import litellm

    def _on_success(kwargs, completion_response, start_time, end_time):  # noqa: ANN001
        usage = getattr(completion_response, "usage", None)
        if usage:
            LLM_TOKENS.labels("input").inc(getattr(usage, "prompt_tokens", 0) or 0)
            LLM_TOKENS.labels("output").inc(getattr(usage, "completion_tokens", 0) or 0)
        cost = kwargs.get("response_cost")
        if cost:
            LLM_COST.inc(float(cost))

    if _on_success not in litellm.success_callback:
        litellm.success_callback.append(_on_success)
