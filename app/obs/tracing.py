"""MLflow GenAI tracing. Enabled only when MLFLOW_TRACKING_URI is set; every
LiteLLM call is autologged and the chat pipeline gets a parent span."""

import logging
from contextlib import contextmanager, nullcontext

from app.config import get_settings

logger = logging.getLogger(__name__)

_enabled = False


def setup_tracing() -> None:
    global _enabled
    settings = get_settings()
    if not settings.mlflow_tracking_uri:
        return
    try:
        import mlflow

        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        mlflow.set_experiment(settings.mlflow_experiment)
        mlflow.litellm.autolog()
        _enabled = True
        logger.info("MLflow tracing enabled → %s", settings.mlflow_tracking_uri)
    except Exception:
        logger.exception("MLflow tracing setup failed; continuing without tracing")


@contextmanager
def pipeline_span(name: str, attributes: dict | None = None):
    """Parent span for a chat pipeline run; no-op when tracing is disabled."""
    if not _enabled:
        with nullcontext():
            yield None
        return
    try:
        import mlflow

        with mlflow.start_span(name=name) as span:
            if attributes:
                span.set_attributes(attributes)
            yield span
    except Exception:
        logger.exception("MLflow span failed; continuing")
        with nullcontext():
            yield None
