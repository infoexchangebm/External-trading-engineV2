"""Data source parsing, classification and validation."""

from __future__ import annotations

import pytest

from app.data_sources.earnings import classify_surprise
from app.data_sources.macro import classify_fed, classify_inflation
from app.data_sources.orderbook import compute_imbalance, is_valid_symbol
from app.data_sources.prices import klines_to_frame


class TestOrderBook:
    def test_bid_heavy_book_is_bullish(self) -> None:
        result = compute_imbalance([["100", "10"]], [["101", "1"]], depth=5, threshold=0.15)
        assert result["signal"] == "BULLISH"
        assert result["imbalance"] > 0.15

    def test_ask_heavy_book_is_bearish(self) -> None:
        result = compute_imbalance([["100", "1"]], [["101", "10"]], depth=5, threshold=0.15)
        assert result["signal"] == "BEARISH"

    def test_balanced_book_is_neutral(self) -> None:
        result = compute_imbalance([["100", "5"]], [["100", "5"]], depth=5, threshold=0.15)
        assert result["signal"] == "NEUTRAL"
        assert result["imbalance"] == 0.0

    def test_empty_book_does_not_divide_by_zero(self) -> None:
        result = compute_imbalance([], [], depth=5)
        assert result["imbalance"] == 0.0
        assert result["midPrice"] is None

    def test_malformed_levels_are_skipped(self) -> None:
        result = compute_imbalance([["abc", "x"], ["100", "2"]], [["100", "2"]], depth=5)
        assert result["signal"] == "NEUTRAL"

    def test_notional_weighting_beats_raw_quantity(self) -> None:
        """A dust wall must not outweigh size near the mid price."""
        bids = [["100", "1"]]
        asks = [["0.01", "50"]]
        assert compute_imbalance(bids, asks, depth=5)["signal"] == "BULLISH"

    def test_depth_limit_is_respected(self) -> None:
        bids = [["100", "1"]] + [["1", "1000"]] * 50
        result = compute_imbalance(bids, [["100", "1"]], depth=1)
        assert result["imbalance"] == 0.0

    @pytest.mark.parametrize("symbol", ["BTCUSDT", "ethusdt", "XAUUSD"])
    def test_valid_symbols(self, symbol: str) -> None:
        assert is_valid_symbol(symbol)

    @pytest.mark.parametrize("symbol", ["BTC/USDT", "'; DROP TABLE--", "AB", ""])
    def test_invalid_symbols_rejected(self, symbol: str) -> None:
        assert not is_valid_symbol(symbol)


class TestMacro:
    def test_accelerating_cpi_is_rising(self) -> None:
        assert classify_inflation([100, 101, 102, 104]) == "RISING"

    def test_decelerating_cpi_is_falling(self) -> None:
        assert classify_inflation([100, 104, 106, 106.5]) == "FALLING"

    def test_short_history_is_neutral(self) -> None:
        assert classify_inflation([100, 101]) == "NEUTRAL"

    def test_rate_cuts_are_dovish(self) -> None:
        assert classify_fed([5.5, 5.25, 5.0], "NEUTRAL") == "DOVISH"

    def test_rate_hikes_are_hawkish(self) -> None:
        assert classify_fed([4.5, 4.75, 5.0], "NEUTRAL") == "HAWKISH"

    def test_flat_rates_follow_inflation(self) -> None:
        assert classify_fed([5.0, 5.0, 5.0], "FALLING") == "DOVISH"
        assert classify_fed([5.0, 5.0, 5.0], "RISING") == "HAWKISH"
        assert classify_fed([5.0, 5.0, 5.0], "NEUTRAL") == "NEUTRAL"


class TestEarnings:
    def test_beat_is_bullish(self) -> None:
        assert classify_surprise(1.00, 1.10) == "BULLISH"

    def test_miss_is_bearish(self) -> None:
        assert classify_surprise(1.00, 0.90) == "BEARISH"

    def test_inline_is_neutral(self) -> None:
        assert classify_surprise(1.00, 1.001) == "NEUTRAL"

    def test_missing_inputs_are_neutral(self) -> None:
        assert classify_surprise(None, 1.0) == "NEUTRAL"
        assert classify_surprise(0.0, 1.0) == "NEUTRAL"


class TestPrices:
    def test_klines_are_typed(self) -> None:
        rows = [
            [
                1700000000000,
                "100.0",
                "101.0",
                "99.0",
                "100.5",
                "12.5",
                1700000899999,
                "1250.0",
                30,
                "6.0",
                "600.0",
                "0",
            ],
        ]
        frame = klines_to_frame(rows)
        assert len(frame) == 1
        assert frame["close"].dtype.kind == "f"
        assert frame["high"].iloc[0] == 101.0

    def test_empty_payload_returns_empty_frame(self) -> None:
        frame = klines_to_frame([])
        assert frame.empty
        assert "close" in frame.columns

    def test_rows_with_bad_numbers_are_dropped(self) -> None:
        rows = [
            [1700000000000, "x", "x", "x", "x", "x", 0, "0", 0, "0", "0", "0"],
            [1700000900000, "1", "2", "0.5", "1.5", "10", 0, "0", 0, "0", "0", "0"],
        ]
        assert len(klines_to_frame(rows)) == 1
