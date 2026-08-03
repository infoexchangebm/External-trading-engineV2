"""API surface: authentication, validation and response shape."""

from __future__ import annotations

import pandas as pd
import pytest


class TestHealth:
    def test_health_is_public(self, client) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "healthy"
        assert body["version"]
        assert "scheduler" in body

    def test_security_headers_present(self, client) -> None:
        response = client.get("/health")
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"


class TestAuth:
    def test_metrics_requires_key(self, client) -> None:
        assert client.get("/metrics").status_code == 401

    def test_metrics_rejects_wrong_key(self, client) -> None:
        response = client.get("/metrics", headers={"X-API-Key": "nope"})
        assert response.status_code == 401

    def test_metrics_with_key(self, client, api_key: str) -> None:
        response = client.get("/metrics", headers={"X-API-Key": api_key})
        assert response.status_code == 200
        body = response.json()
        assert "scans_total" in body
        assert "weights" in body

    def test_webhook_requires_key(self, client) -> None:
        response = client.post("/webhook/tradingview", json={"symbol": "BTCUSDT"})
        assert response.status_code == 401


class TestWebhook:
    def test_invalid_payload_rejected(self, client, api_key: str) -> None:
        response = client.post("/webhook/tradingview", json={"action": "buy"}, headers={"X-API-Key": api_key})
        assert response.status_code == 422

    def test_symbol_injection_rejected(self, client, api_key: str) -> None:
        response = client.post(
            "/webhook/tradingview",
            json={"symbol": "BTC; DROP TABLE trades"},
            headers={"X-API-Key": api_key},
        )
        assert response.status_code == 422

    def test_valid_alert_accepted(self, client, api_key: str, monkeypatch, uptrend_frame) -> None:
        async def fake_ohlcv(*_args, **_kwargs) -> pd.DataFrame:
            return uptrend_frame

        async def fake_book(*_args, **_kwargs) -> dict:
            return {"BTCUSDT": {"signal": "BULLISH", "imbalance": 0.4}}

        from app import main
        from app.data_sources.orderbook import OrderBookFetcher

        monkeypatch.setattr(main.price_fetcher, "fetch_ohlcv", fake_ohlcv)
        monkeypatch.setattr(OrderBookFetcher, "fetch_all", fake_book)

        response = client.post(
            "/webhook/tradingview",
            json={"symbol": "BTCUSDT", "action": "buy", "price": 100.0},
            headers={"X-API-Key": api_key},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "received"
        assert body["signal"]["symbol"] == "BTCUSDT"


class TestManualSignal:
    def test_bad_symbol_rejected(self, client, api_key: str) -> None:
        response = client.post("/signal/send?symbol=BTC/USDT", headers={"X-API-Key": api_key})
        assert response.status_code == 422

    def test_signal_returned_without_dispatch(self, client, api_key: str, monkeypatch, uptrend_frame) -> None:
        async def fake_ohlcv(*_args, **_kwargs) -> pd.DataFrame:
            return uptrend_frame

        async def fake_book(*_args, **_kwargs) -> dict:
            return {"BTCUSDT": {"signal": "BULLISH", "imbalance": 0.4}}

        from app import main
        from app.data_sources.orderbook import OrderBookFetcher

        monkeypatch.setattr(main.price_fetcher, "fetch_ohlcv", fake_ohlcv)
        monkeypatch.setattr(OrderBookFetcher, "fetch_all", fake_book)

        response = client.post("/signal/send?symbol=BTCUSDT&dispatch=false", headers={"X-API-Key": api_key})
        assert response.status_code == 200
        body = response.json()
        assert body["finalSignal"] in {"BUY", "SELL", "NONE"}
        assert 0.0 <= body["confidence"] <= 1.0


class TestScanLoop:
    @pytest.mark.asyncio
    async def test_scan_survives_upstream_failure(self, monkeypatch) -> None:
        from app import main
        from app.data_sources.macro import MacroDataFetcher

        async def boom(*_args, **_kwargs):
            raise RuntimeError("upstream down")

        monkeypatch.setattr(MacroDataFetcher, "fetch_all", boom)
        before = main.METRICS["scan_errors_total"]
        result = await main.fetch_and_process_data(["BTCUSDT"])
        assert result == []
        assert main.METRICS["scan_errors_total"] == before + 1
