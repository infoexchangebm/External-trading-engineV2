"""Outbound TradingView webhook delivery with retries and dry-run support."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from config.config import settings

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


def build_payload(signal: dict[str, Any]) -> dict[str, Any]:
    """Project an engine signal onto the wire format TradingView expects."""
    return {
        "symbol": signal.get("symbol"),
        "macroSignal": signal.get("macroSignal"),
        "orderbookSignal": signal.get("orderbookSignal"),
        "earningsSignal": signal.get("earningsSignal"),
        "technicalSignal": signal.get("technicalSignal"),
        "finalSignal": signal.get("finalSignal"),
        "confidence": signal.get("confidence", 0.0),
        "price": signal.get("price"),
        "stopLoss": signal.get("stopLoss"),
        "takeProfit": signal.get("takeProfit"),
        "timestamp": signal.get("timestamp") or datetime.now(UTC).isoformat(),
    }


async def send_to_tradingview(
    signal: dict[str, Any],
    *,
    client: httpx.AsyncClient | None = None,
    max_retries: int | None = None,
) -> bool:
    """POST a signal to the configured webhook. Returns True on success."""
    if not settings.tradingview_webhook_url:
        logger.warning("TRADINGVIEW_WEBHOOK_URL not configured - signal not dispatched")
        return False

    payload = build_payload(signal)

    if settings.dry_run:
        logger.info("DRY_RUN enabled - would send %s", payload)
        return True

    attempts = max(1, max_retries if max_retries is not None else settings.http_max_retries)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=settings.http_timeout_seconds)

    try:
        for attempt in range(1, attempts + 1):
            try:
                response = await http.post(
                    settings.tradingview_webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                if response.status_code in RETRYABLE_STATUS:
                    raise httpx.HTTPStatusError(
                        f"retryable status {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                response.raise_for_status()
                logger.info(
                    "Signal delivered: %s %s (confidence %.2f)",
                    payload["symbol"],
                    payload["finalSignal"],
                    float(payload.get("confidence") or 0.0),
                )
                return True
            except Exception as exc:
                if attempt == attempts:
                    logger.error("Webhook delivery failed after %s attempt(s): %s", attempts, exc)
                    return False
                backoff = min(2 ** (attempt - 1) * 0.5, 8.0)
                logger.warning("Webhook attempt %s/%s failed: %s", attempt, attempts, exc)
                await asyncio.sleep(backoff)
    finally:
        if owns_client:
            await http.aclose()

    return False
