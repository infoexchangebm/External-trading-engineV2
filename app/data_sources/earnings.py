"""Earnings calendar ingestion (yfinance) and surprise scoring."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

from config.config import settings

logger = logging.getLogger(__name__)


def classify_surprise(estimate: float | None, reported: float | None) -> str:
    """BULLISH when a company beats consensus, BEARISH on a miss."""
    if estimate is None or reported is None:
        return "NEUTRAL"
    if estimate == 0:
        return "NEUTRAL"
    surprise = (reported - estimate) / abs(estimate)
    if surprise >= 0.02:
        return "BULLISH"
    if surprise <= -0.02:
        return "BEARISH"
    return "NEUTRAL"


class EarningsFetcher:
    """Pulls the next/last earnings dates and derives an earnings bias.

    yfinance is synchronous and blocking, so calls are pushed to a worker
    thread to keep the event loop responsive.
    """

    def __init__(self, tickers: Sequence[str] | None = None) -> None:
        self.tickers = [t.upper() for t in (tickers or settings.earnings_tickers)]

    def _fetch_sync(self, ticker: str) -> dict[str, Any]:
        import yfinance as yf  # imported lazily so tests can run without the dep

        stock = yf.Ticker(ticker)
        frame = stock.earnings_dates
        if frame is None or len(frame) == 0:
            return {"signal": "NEUTRAL", "events": []}

        events = []
        for index, row in frame.head(4).iterrows():
            estimate = row.get("EPS Estimate")
            reported = row.get("Reported EPS")
            events.append(
                {
                    "date": str(index),
                    "epsEstimate": None if estimate is None else _safe_float(estimate),
                    "epsReported": None if reported is None else _safe_float(reported),
                }
            )

        last_reported = next((e for e in events if e["epsReported"] is not None), None)
        signal = (
            classify_surprise(last_reported["epsEstimate"], last_reported["epsReported"])
            if last_reported
            else "NEUTRAL"
        )
        return {
            "signal": signal,
            "events": events,
            "nextEvent": events[0]["date"] if events else None,
            "withinWindow": _within_window(events[0]["date"]) if events else False,
        }

    async def fetch_earnings(self, tickers: Sequence[str] | None = None) -> dict[str, Any]:
        results: dict[str, Any] = {}
        for ticker in [t.upper() for t in (tickers or self.tickers)]:
            try:
                results[ticker] = await asyncio.to_thread(self._fetch_sync, ticker)
            except Exception as exc:
                logger.warning("Earnings fetch failed for %s: %s", ticker, exc)
                results[ticker] = {"signal": "NEUTRAL", "events": [], "error": str(exc)}
        return results


def _safe_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if result != result else result  # filter NaN


def _within_window(date_string: str, days: int = 3) -> bool:
    """True when an earnings event falls inside the next ``days`` days."""
    try:
        parsed = datetime.fromisoformat(date_string.replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    return now <= parsed <= now + timedelta(days=days)
