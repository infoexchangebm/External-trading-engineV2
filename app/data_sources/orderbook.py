"""Order book depth ingestion and imbalance scoring (Binance spot).

Improvements over the original implementation:

* one shared HTTP client with timeouts + retries instead of a bare request
* notional-weighted imbalance (price x quantity) instead of raw quantity, so a
  wall of dust orders far from mid can no longer dominate the reading
* only the top N levels around mid are considered
* symbols are validated before hitting the API
* failures are recorded per symbol instead of silently disappearing
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable, Sequence
from typing import Any

import httpx

from app.http import UpstreamError, get_json
from config.config import settings

logger = logging.getLogger(__name__)

SYMBOL_RE = re.compile(r"^[A-Z0-9]{4,20}$")


def is_valid_symbol(symbol: str) -> bool:
    return bool(SYMBOL_RE.match(symbol.upper()))


def _notional(levels: Sequence[Sequence[Any]], depth: int) -> float:
    total = 0.0
    for level in list(levels)[:depth]:
        try:
            price = float(level[0])
            quantity = float(level[1])
        except (TypeError, ValueError, IndexError):
            continue
        total += price * quantity
    return total


def compute_imbalance(
    bids: Sequence[Sequence[Any]],
    asks: Sequence[Sequence[Any]],
    depth: int = 20,
    threshold: float | None = None,
) -> dict[str, Any]:
    """Return notional-weighted book imbalance in ``[-1, 1]`` plus a direction."""
    limit = threshold if threshold is not None else settings.orderbook_imbalance_threshold
    bid_notional = _notional(bids, depth)
    ask_notional = _notional(asks, depth)
    total = bid_notional + ask_notional

    imbalance = (bid_notional - ask_notional) / total if total > 0 else 0.0
    if imbalance > limit:
        signal = "BULLISH"
    elif imbalance < -limit:
        signal = "BEARISH"
    else:
        signal = "NEUTRAL"

    mid_price = None
    try:
        mid_price = (float(bids[0][0]) + float(asks[0][0])) / 2
    except (IndexError, TypeError, ValueError):
        pass

    return {
        "imbalance": round(imbalance, 4),
        "signal": signal,
        "bidNotional": round(bid_notional, 2),
        "askNotional": round(ask_notional, 2),
        "midPrice": mid_price,
        "depth": depth,
    }


class OrderBookFetcher:
    """Fetches L2 depth for a set of symbols and scores the imbalance."""

    def __init__(self, base_url: str | None = None, depth: int = 20) -> None:
        self.base_url = (base_url or settings.binance_base_url).rstrip("/")
        self.depth = depth

    async def fetch_all(self, symbols: Iterable[str]) -> dict[str, Any]:
        results: dict[str, Any] = {}
        wanted: list[str] = []
        for symbol in symbols:
            normalised = symbol.upper().strip()
            if not is_valid_symbol(normalised):
                logger.warning("Skipping invalid order book symbol: %r", symbol)
                continue
            wanted.append(normalised)

        if not wanted:
            return results

        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            for symbol in wanted:
                try:
                    payload = await get_json(
                        f"{self.base_url}/api/v3/depth",
                        params={"symbol": symbol, "limit": 100},
                        client=client,
                    )
                    results[symbol] = compute_imbalance(
                        payload.get("bids", []),
                        payload.get("asks", []),
                        depth=self.depth,
                    )
                except UpstreamError as exc:
                    logger.warning("Order book fetch failed for %s: %s", symbol, exc)
                    results[symbol] = {"signal": "NEUTRAL", "imbalance": 0.0, "error": str(exc)}
        return results
