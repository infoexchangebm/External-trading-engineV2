"""Macro data ingestion (FRED).

Previously this module pointed at ``fred.stlouisfed.org/fred/...`` which is not
the API host and always failed, so the macro leg of every signal was hardcoded
to NEUTRAL. It now uses the documented ``api.stlouisfed.org`` endpoint and
derives real inflation / policy-rate direction from the series it pulls.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.http import UpstreamError, get_json
from config.config import settings

logger = logging.getLogger(__name__)

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"

# series_id -> result key
SERIES = {
    "GDP": "gdp",
    "CPIAUCSL": "cpi",
    "FEDFUNDS": "fed_funds",
    "UNRATE": "unemployment",
    "T10Y2Y": "yield_curve",
}


def _to_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result


def classify_inflation(cpi_history: list[float]) -> str:
    """Return RISING / FALLING / NEUTRAL from a CPI level series (oldest first)."""
    if len(cpi_history) < 4:
        return "NEUTRAL"
    recent = cpi_history[-1] - cpi_history[-2]
    prior = cpi_history[-3] - cpi_history[-4]
    if recent > prior * 1.05:
        return "RISING"
    if recent < prior * 0.95:
        return "FALLING"
    return "NEUTRAL"


def classify_fed(fed_history: list[float], inflation_signal: str) -> str:
    """Infer the policy stance from the effective funds rate trajectory."""
    if len(fed_history) < 3:
        return "NEUTRAL"
    change = fed_history[-1] - fed_history[-3]
    if change <= -0.10:
        return "DOVISH"
    if change >= 0.10:
        return "HAWKISH"
    # Flat rates: inflation direction tilts the expected next move.
    if inflation_signal == "FALLING":
        return "DOVISH"
    if inflation_signal == "RISING":
        return "HAWKISH"
    return "NEUTRAL"


class MacroDataFetcher:
    """Fetches macro series and reduces them to tradeable regime signals."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.fred_api_key

    async def _series(self, client: httpx.AsyncClient, series_id: str, limit: int = 8) -> list[float]:
        payload = await get_json(
            FRED_URL,
            params={
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": limit,
            },
            client=client,
        )
        observations = payload.get("observations", []) if isinstance(payload, dict) else []
        values = [_to_float(obs.get("value")) for obs in observations]
        # FRED returns newest first; flip to oldest-first and drop missing points.
        return [value for value in reversed(values) if value is not None]

    async def fetch_all(self) -> dict[str, Any]:
        results: dict[str, Any] = {
            "inflation_signal": "NEUTRAL",
            "fed_signal": "NEUTRAL",
            "source": "fred",
        }

        if not self.api_key:
            logger.info("FRED_API_KEY not configured - macro leg stays NEUTRAL")
            results["source"] = "unconfigured"
            return results

        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            history: dict[str, list[float]] = {}
            for series_id, key in SERIES.items():
                try:
                    history[key] = await self._series(client, series_id)
                except UpstreamError as exc:
                    logger.warning("FRED series %s unavailable: %s", series_id, exc)
                    history[key] = []

        for key, values in history.items():
            results[key] = values[-1] if values else None

        results["inflation_signal"] = classify_inflation(history.get("cpi", []))
        results["fed_signal"] = classify_fed(history.get("fed_funds", []), results["inflation_signal"])
        results["yield_curve_inverted"] = bool(
            results.get("yield_curve") is not None and results["yield_curve"] < 0
        )
        logger.info(
            "Macro regime: fed=%s inflation=%s curve_inverted=%s",
            results["fed_signal"],
            results["inflation_signal"],
            results.get("yield_curve_inverted"),
        )
        return results
