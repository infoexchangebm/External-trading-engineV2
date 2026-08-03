"""Strategy engine: indicator maths and weighted decision logic."""

from __future__ import annotations

import pandas as pd
import pytest

from app.strategies.engine import StrategyEngine

BULLISH_MACRO = {"fed_signal": "DOVISH"}
BEARISH_MACRO = {"fed_signal": "HAWKISH"}


@pytest.fixture
def engine() -> StrategyEngine:
    return StrategyEngine(
        weights={"macro": 0.25, "orderbook": 0.30, "earnings": 0.15, "technical": 0.30},
        threshold=0.4,
    )


class TestIndicators:
    def test_rsi_all_gains_does_not_explode(self, engine: StrategyEngine) -> None:
        """Regression: the old implementation divided by a zero average loss."""
        rising = pd.Series(range(1, 60), dtype=float)
        rsi = engine.calculate_rsi(rising)
        assert rsi == 100.0

    def test_rsi_is_bounded(self, engine: StrategyEngine, uptrend_frame: pd.DataFrame) -> None:
        rsi = engine.calculate_rsi(uptrend_frame["close"])
        assert 0.0 <= rsi <= 100.0

    def test_rsi_neutral_when_insufficient_data(self, engine: StrategyEngine) -> None:
        assert engine.calculate_rsi(pd.Series([1.0, 2.0, 3.0])) == 50.0

    def test_ema_periods_order_in_uptrend(self, engine: StrategyEngine, uptrend_frame: pd.DataFrame) -> None:
        fast = engine.calculate_ema(uptrend_frame["close"], 20)
        slow = engine.calculate_ema(uptrend_frame["close"], 50)
        assert fast is not None and slow is not None
        assert fast > slow

    def test_ema_none_on_empty_series(self, engine: StrategyEngine) -> None:
        assert engine.calculate_ema(pd.Series([], dtype=float)) is None

    def test_atr_positive(self, engine: StrategyEngine, uptrend_frame: pd.DataFrame) -> None:
        atr = engine.calculate_atr(uptrend_frame["high"], uptrend_frame["low"], uptrend_frame["close"])
        assert atr is not None and atr > 0

    def test_atr_none_on_single_row(self, engine: StrategyEngine) -> None:
        one = pd.Series([1.0])
        assert engine.calculate_atr(one, one, one) is None


class TestDecisions:
    @pytest.mark.asyncio
    async def test_no_data_yields_no_signal(self, engine: StrategyEngine) -> None:
        signal = await engine.generate_signal("BTCUSDT")
        assert signal["finalSignal"] == "NONE"
        assert signal["confidence"] == 0.0
        assert signal["symbol"] == "BTCUSDT"

    @pytest.mark.asyncio
    async def test_single_leg_cannot_fire(self, engine: StrategyEngine) -> None:
        """Macro alone carries 0.25 weight, below the 0.40 threshold."""
        signal = await engine.generate_signal("BTCUSDT", macro=BULLISH_MACRO)
        assert signal["finalSignal"] == "NONE"

    @pytest.mark.asyncio
    async def test_aligned_legs_produce_buy(
        self, engine: StrategyEngine, uptrend_frame: pd.DataFrame
    ) -> None:
        signal = await engine.generate_signal(
            "BTCUSDT",
            macro=BULLISH_MACRO,
            orderbook={"BTCUSDT": {"signal": "BULLISH"}},
            price_data=uptrend_frame,
        )
        assert signal["finalSignal"] == "BUY"
        assert signal["confidence"] > 0.5
        assert signal["stopLoss"] is not None and signal["stopLoss"] < signal["price"]
        assert signal["takeProfit"] > signal["price"]

    @pytest.mark.asyncio
    async def test_aligned_bearish_legs_produce_sell(
        self, engine: StrategyEngine, downtrend_frame: pd.DataFrame
    ) -> None:
        signal = await engine.generate_signal(
            "ETHUSDT",
            macro=BEARISH_MACRO,
            orderbook={"ETHUSDT": {"signal": "BEARISH"}},
            price_data=downtrend_frame,
        )
        assert signal["finalSignal"] == "SELL"
        assert signal["stopLoss"] > signal["price"]
        assert signal["takeProfit"] < signal["price"]

    @pytest.mark.asyncio
    async def test_conflicting_legs_cancel_out(
        self, engine: StrategyEngine, uptrend_frame: pd.DataFrame
    ) -> None:
        signal = await engine.generate_signal(
            "BTCUSDT",
            macro=BEARISH_MACRO,
            orderbook={"BTCUSDT": {"signal": "BULLISH"}},
            price_data=uptrend_frame,
        )
        assert signal["finalSignal"] == "NONE"

    @pytest.mark.asyncio
    async def test_earnings_leg_is_wired_in(self, engine: StrategyEngine) -> None:
        """The earnings weight used to be declared but never applied."""
        signal = await engine.generate_signal(
            "AAPL",
            earnings={"AAPL": {"signal": "BULLISH"}},
            orderbook={"AAPL": {"signal": "BULLISH"}},
        )
        assert signal["earningsSignal"] == "BULLISH"
        assert signal["score"] > 0

    @pytest.mark.asyncio
    async def test_symbol_is_normalised(self, engine: StrategyEngine) -> None:
        signal = await engine.generate_signal(" btcusdt ")
        assert signal["symbol"] == "BTCUSDT"

    @pytest.mark.asyncio
    async def test_confidence_never_exceeds_one(
        self, engine: StrategyEngine, uptrend_frame: pd.DataFrame
    ) -> None:
        signal = await engine.generate_signal(
            "BTCUSDT",
            macro=BULLISH_MACRO,
            orderbook={"BTCUSDT": {"signal": "BULLISH"}},
            earnings={"BTCUSDT": {"signal": "BULLISH"}},
            price_data=uptrend_frame,
        )
        assert 0.0 <= signal["confidence"] <= 1.0

    @pytest.mark.asyncio
    async def test_short_history_skips_technical_leg(self, engine: StrategyEngine) -> None:
        frame = pd.DataFrame({"close": [1.0, 2.0, 3.0], "high": [1, 2, 3], "low": [1, 2, 3]})
        signal = await engine.generate_signal("BTCUSDT", price_data=frame)
        assert signal["technicalSignal"] == "NEUTRAL"
