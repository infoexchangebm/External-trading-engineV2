"""Shared async HTTP helper with timeouts, retries and exponential backoff.

Every outbound call in the engine goes through :func:`get_json` so that a slow
or flaky upstream provider can never hang a scan cycle indefinitely.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

import httpx

from config.config import settings

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


class UpstreamError(RuntimeError):
    """Raised when an upstream provider cannot be reached or returns an error."""


async def get_json(
    url: str,
    *,
    params: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float | None = None,
    max_retries: int | None = None,
    client: httpx.AsyncClient | None = None,
) -> Any:
    """GET ``url`` and return decoded JSON, retrying transient failures.

    Raises:
        UpstreamError: after all retries are exhausted.
    """
    attempts = max_retries if max_retries is not None else settings.http_max_retries
    attempts = max(1, attempts)
    request_timeout = timeout if timeout is not None else settings.http_timeout_seconds

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=request_timeout)
    last_error: Exception | None = None

    try:
        for attempt in range(1, attempts + 1):
            try:
                response = await http.get(url, params=params, headers=headers, timeout=request_timeout)
                if response.status_code in RETRYABLE_STATUS:
                    raise UpstreamError(f"{url} returned retryable status {response.status_code}")
                response.raise_for_status()
                return response.json()
            except Exception as exc:
                last_error = exc
                if attempt == attempts:
                    break
                backoff = min(2 ** (attempt - 1) * 0.5, 8.0)
                logger.warning(
                    "GET %s failed (attempt %s/%s): %s - retrying in %.1fs",
                    url,
                    attempt,
                    attempts,
                    exc,
                    backoff,
                )
                await asyncio.sleep(backoff)
    finally:
        if owns_client:
            await http.aclose()

    raise UpstreamError(f"GET {url} failed after {attempts} attempt(s): {last_error}")
