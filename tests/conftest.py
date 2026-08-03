"""Shared pytest fixtures.

Environment is pinned before ``config.config`` is imported anywhere so tests
never read a developer's real ``.env``.
"""

from __future__ import annotations

import os

os.environ.setdefault("ENV", "test")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("SYMBOLS", "BTCUSDT,ETHUSDT")
os.environ.setdefault("TRADINGVIEW_WEBHOOK_URL", "")
os.environ.setdefault("DRY_RUN", "true")
os.environ.setdefault("LOG_FILE", "logs/test.log")

import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def api_key() -> str:
    return os.environ["API_KEY"]


@pytest.fixture
def uptrend_frame() -> pd.DataFrame:
    """Deterministic rising series (EMA20 > EMA50, RSI below 70)."""
    close = np.linspace(100, 130, 120) + np.tile([0, 0.4, -0.3, 0.2], 30)
    return pd.DataFrame(
        {
            "open": close - 0.2,
            "high": close + 0.5,
            "low": close - 0.5,
            "close": close,
            "volume": np.full(120, 1000.0),
        }
    )


@pytest.fixture
def downtrend_frame(uptrend_frame: pd.DataFrame) -> pd.DataFrame:
    frame = uptrend_frame.copy()
    for column in ("open", "high", "low", "close"):
        frame[column] = frame[column].iloc[::-1].to_numpy()
    frame["high"] = frame[["open", "close"]].max(axis=1) + 0.5
    frame["low"] = frame[["open", "close"]].min(axis=1) - 0.5
    return frame


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
