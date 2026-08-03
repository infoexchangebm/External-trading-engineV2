"""Weighted multi-signal strategy engine.

Fixes and upgrades over the original implementation:

* RSI used a simple rolling mean and divided by ``loss`` without guarding
  against zero, producing ``inf``/``NaN`` on one-sided candles. It now uses
  Wilder smoothing with an explicit zero-loss branch.
* The score was compared against a fixed threshold even when only one leg had
  data, so a single NEUTRAL-heavy cycle could still fire. The score is now
  normalised by the weight of the legs that actually contributed.
* The ``earnings`` weight was declared but never used - earnings bias is now
  wired in.
* Signals carry ATR-derived stop-loss / take-profit levels, the indicator
  snapshot used for the decision, and a UTC timestamp.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from app.models import Direction, FinalSignal, SignalResponse
from config.config import settings

logger = logging.getLogger(__name__)


class StrategyEngine:
    """Combines macro, order book, earnings and technical evidence."""

    def __init__(
        self,
        weights: dict[str, float] | None = None,
        threshold: float | None = None,
    ) -> None:
        self.weights = dict(weights or settings.weights)
        self.threshold = threshold if threshold is not None else settings.signal_threshold

    # ------------------------------------------------------------------
    # Indicators
    # ------------------------------------------------------------------
    @staticmethod
    def calculate_rsi(prices: pd.Series, period: int = 14) -> float:
        """Wilder RSI. Returns 50.0 when there is not enough data."""
        series = pd.to_numeric(pd.Series(prices), errors="coerce").dropna()
        if len(series) <= period:
            return 50.0

        delta = series.diff()
        gain = delta.clip(lower=0.0)
        loss = -delta.clip(upper=0.0)

        avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean().iloc[-1]
        avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean().iloc[-1]

        if avg_loss == 0:
            return 100.0 if avg_gain > 0 else 50.0
        rs = avg_gain / avg_loss
        return float(round(100 - (100 / (1 + rs)), 4))

    @staticmethod
    def calculate_ema(prices: pd.Series, period: int = 20) -> float | None:
        series = pd.to_numeric(pd.Series(prices), errors="coerce").dropna()
        if series.empty:
            return None
        return float(series.ewm(span=period, adjust=False).mean().iloc[-1])

    @staticmethod
    def calculate_atr(
        high: pd.Series,
        low: pd.Series,
        close: pd.Series,
        period: int = 14,
    ) -> float | None:
        """Wilder ATR (True Range smoothed with an EMA of alpha=1/period)."""
        high_s = pd.to_numeric(pd.Series(high), errors="coerce")
        low_s = pd.to_numeric(pd.Series(low), errors="coerce")
        close_s = pd.to_numeric(pd.Series(close), errors="coerce")
        if len(close_s.dropna()) < 2:
            return None

        true_range = pd.concat(
            [
                high_s - low_s,
                (high_s - close_s.shift()).abs(),
                (low_s - close_s.shift()).abs(),
            ],
            axis=1,
        ).max(axis=1)
        atr = true_range.ewm(alpha=1 / period, adjust=False).mean().iloc[-1]
        if atr != atr:  # NaN
            return None
        return float(round(atr, 8))

    # ------------------------------------------------------------------
    # Leg scoring
    # ------------------------------------------------------------------
    def _score_macro(self, macro: dict[str, Any] | None) -> Direction:
        if not macro:
            return Direction.NEUTRAL
        fed = str(macro.get("fed_signal", "NEUTRAL")).upper()
        if fed == "DOVISH":
            return Direction.BULLISH
        if fed == "HAWKISH":
            return Direction.BEARISH
        return Direction.NEUTRAL

    def _score_orderbook(self, symbol: str, orderbook: dict[str, Any] | None) -> Direction:
        if not orderbook:
            return Direction.NEUTRAL
        entry = orderbook.get(symbol) or orderbook.get(symbol.upper()) or {}
        value = str(entry.get("signal", "NEUTRAL")).upper()
        return Direction(value) if value in Direction.__members__ else Direction.NEUTRAL

    def _score_earnings(self, symbol: str, earnings: dict[str, Any] | None) -> Direction:
        if not earnings:
            return Direction.NEUTRAL
        entry = earnings.get(symbol) or earnings.get(symbol.upper()) or {}
        value = str(entry.get("signal", "NEUTRAL")).upper()
        return Direction(value) if value in Direction.__members__ else Direction.NEUTRAL

    def _score_technical(self, price_data: pd.DataFrame | None) -> tuple[Direction, dict[str, Any]]:
        indicators: dict[str, Any] = {}
        if price_data is None or len(price_data) < 55 or "close" not in price_data:
            return Direction.NEUTRAL, indicators

        close = price_data["close"]
        rsi = self.calculate_rsi(close)
        ema20 = self.calculate_ema(close, 20)
        ema50 = self.calculate_ema(close, 50)
        atr = None
        if {"high", "low"}.issubset(price_data.columns):
            atr = self.calculate_atr(price_data["high"], price_data["low"], close)

        indicators = {
            "rsi14": rsi,
            "ema20": ema20,
            "ema50": ema50,
            "atr14": atr,
            "lastClose": float(close.iloc[-1]),
        }

        if ema20 is None or ema50 is None:
            return Direction.NEUTRAL, indicators

        # Trend filter + momentum guard: do not chase overbought/oversold extremes.
        if ema20 > ema50 and rsi < 70:
            return Direction.BULLISH, indicators
        if ema20 < ema50 and rsi > 30:
            return Direction.BEARISH, indicators
        return Direction.NEUTRAL, indicators

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def generate_signal(
        self,
        symbol: str,
        macro: dict[str, Any] | None = None,
        orderbook: dict[str, Any] | None = None,
        earnings: dict[str, Any] | None = None,
        price_data: pd.DataFrame | None = None,
    ) -> dict[str, Any]:
        """Return a normalised signal dictionary for ``symbol``."""
        symbol = symbol.upper().strip()

        legs: dict[str, Direction] = {
            "macro": self._score_macro(macro),
            "orderbook": self._score_orderbook(symbol, orderbook),
            "earnings": self._score_earnings(symbol, earnings),
        }
        technical, indicators = self._score_technical(price_data)
        legs["technical"] = technical

        raw_score = 0.0
        active_weight = 0.0
        for leg, direction in legs.items():
            weight = self.weights.get(leg, 0.0)
            if direction is Direction.NEUTRAL:
                continue
            active_weight += weight
            raw_score += weight if direction is Direction.BULLISH else -weight

        # Normalise by contributing weight so a single-leg cycle cannot be
        # mistaken for broad multi-signal agreement.
        total_weight = sum(self.weights.values()) or 1.0
        score = raw_score / total_weight
        conviction = abs(raw_score) / active_weight if active_weight else 0.0

        final = FinalSignal.NONE
        confidence = 0.0
        if score >= self.threshold:
            final = FinalSignal.BUY
        elif score <= -self.threshold:
            final = FinalSignal.SELL
        if final is not FinalSignal.NONE:
            confidence = round(min(abs(score) * 0.5 + conviction * 0.5, 1.0), 4)

        price = indicators.get("lastClose")
        atr = indicators.get("atr14")
        stop_loss, take_profit = self._risk_levels(final, price, atr)

        signal = SignalResponse(
            symbol=symbol,
            macroSignal=legs["macro"],
            orderbookSignal=legs["orderbook"],
            earningsSignal=legs["earnings"],
            technicalSignal=legs["technical"],
            finalSignal=final,
            confidence=confidence,
            score=round(score, 4),
            price=price,
            atr=atr,
            stopLoss=stop_loss,
            takeProfit=take_profit,
            indicators=indicators,
            timestamp=datetime.now(UTC),
        )

        logger.info(
            "Signal %s -> %s (score=%.3f confidence=%.2f legs=%s)",
            symbol,
            final.value,
            score,
            confidence,
            {leg: direction.value for leg, direction in legs.items()},
        )
        return signal.model_dump(mode="json")

    def _risk_levels(
        self,
        final: FinalSignal,
        price: float | None,
        atr: float | None,
    ) -> tuple[float | None, float | None]:
        if final is FinalSignal.NONE or not price or not atr:
            return None, None
        stop_distance = atr * settings.atr_stop_multiplier
        target_distance = atr * settings.atr_target_multiplier
        if final is FinalSignal.BUY:
            return round(price - stop_distance, 8), round(price + target_distance, 8)
        return round(price + stop_distance, 8), round(price - target_distance, 8)
