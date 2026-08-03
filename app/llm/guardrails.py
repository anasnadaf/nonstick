"""Lightweight guardrail pipeline.

Input: size limits + prompt-injection heuristics (block before any model call).
Output: secret/credential scrubbing — user documents legitimately contain PII
like emails, so only credential-shaped material is redacted.
"""

import re
from dataclasses import dataclass

MAX_INPUT_CHARS = 8000

_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+instructions",
        r"disregard\s+(all\s+|any\s+)?(previous|prior|your)\s+(instructions|rules|guidelines)",
        r"(reveal|print|show|repeat|output)\s+(your\s+)?(the\s+)?system\s+prompt",
        r"you\s+are\s+now\s+(?:in\s+)?(?:dan|developer\s+mode|jailbreak)",
        r"pretend\s+(that\s+)?you\s+(are|have)\s+no\s+(rules|restrictions|guidelines)",
        r"forget\s+everything\s+(you|above)",
    ]
]

_SECRET_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED-AWS-KEY]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "[REDACTED-API-KEY]"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"), "[REDACTED-GITHUB-TOKEN]"),
    (re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "[REDACTED-SLACK-TOKEN]"),
    (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
        "[REDACTED-PRIVATE-KEY]",
    ),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b"),
        "[REDACTED-JWT]",
    ),
]


@dataclass(frozen=True)
class InputVerdict:
    allowed: bool
    reason: str = ""


def check_input(text: str) -> InputVerdict:
    if not text.strip():
        return InputVerdict(False, "Empty message")
    if len(text) > MAX_INPUT_CHARS:
        return InputVerdict(False, f"Message too long (max {MAX_INPUT_CHARS} characters)")
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return InputVerdict(False, "Message flagged by prompt-injection guardrail")
    return InputVerdict(True)


def scrub_output(text: str) -> tuple[str, int]:
    """Redact credential-shaped strings; returns (clean_text, redaction_count)."""
    count = 0
    for pattern, replacement in _SECRET_PATTERNS:
        text, n = pattern.subn(replacement, text)
        count += n
    return text, count
