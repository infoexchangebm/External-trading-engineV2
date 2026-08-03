"""OHLCV price ingestion (Binance klines).

The technical leg of the strategy engine used to be dead code: nothing ever
passed ``price_data`` into ``generate_signal``, so RSI/EMA/ATR were never
evaluated. This module supplies real candles so technical scoring is live.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

import httpx
import pandas as pd

from app.data_sources.orderbook import is_valid_symbol
from app.http import UpstreamError, get_json
from config.config import settings

logger = logging.getLogger(__name__)

KLINE_COLUMNS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
    "taker_buy_base",
    "taker_buy_quote",
    "ignore",
]

NUMERIC_COLUMNS = ["open", "high", "low", "close", "volume"]


def klines_to_frame(rows: Sequence[Sequence[Any]]) -> pd.DataFrame:
    """Convert raw Binance kline rows into a typed OHLCV frame."""
    if not rows:
        return pd.DataFrame(columns=["open_time", *NUMERIC_COLUMNS])

    frame = pd.DataFrame(list(rows), columns=KLINE_COLUMNS[: len(rows[0])])
    for column in NUMERIC_COLUMNS:
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if "open_time" in frame:
        frame["open_time"] = pd.to_datetime(frame["open_time"], unit="ms", utc=True, errors="coerce")
    frame = frame.dropna(subset=[column for column in NUMERIC_COLUMNS if column in frame])
    return frame.reset_index(drop=True)


class PriceFetcher:
    """Fetches recent candles for one or many symbols."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.binance_base_url).rstrip("/")

    async def fetch_ohlcv(
        self,
        symbol: str,
        interval: str = "15m",
        limit: int = 200,
        client: httpx.AsyncClient | None = None,
    ) -> pd.DataFrame:
        normalised = symbol.upper().strip()
        if not is_valid_symbol(normalised):
            logger.warning("Skipping invalid price symbol: %r", symbol)
            return klines_to_frame([])

        try:
            payload = await get_json(
                f"{self.base_url}/api/v3/klines",
                params={"symbol": normalised, "interval": interval, "limit": limit},
                client=client,
            )
        except UpstreamError as exc:
            logger.warning("Price fetch failed for %s: %s", normalised, exc)
            return klines_to_frame([])

        rows: list[Sequence[Any]] = payload if isinstance(payload, list) else []
        return klines_to_frame(rows)

    async def fetch_many(
        self,
        symbols: Sequence[str],
        interval: str = "15m",
        limit: int = 200,
    ) -> dict:
        frames = {}
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            for symbol in symbols:
                frames[symbol.upper()] = await self.fetch_ohlcv(
                    symbol, interval=interval, limit=limit, client=client
                )
        return frames
