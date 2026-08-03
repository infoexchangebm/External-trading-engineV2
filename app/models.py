"""Pydantic schemas shared by the API layer and the strategy engine."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Direction(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


class FinalSignal(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    NONE = "NONE"


class TradingViewAlert(BaseModel):
    """Inbound TradingView alert payload.

    Unknown keys are preserved in ``extra`` so custom alert templates keep
    working without a schema change.
    """

    model_config = ConfigDict(extra="allow")

    symbol: str = Field(min_length=1, max_length=32)
    action: str | None = Field(default=None, max_length=32)
    price: float | None = Field(default=None, ge=0)
    strategy: str | None = Field(default=None, max_length=64)
    timeframe: str | None = Field(default=None, max_length=16)
    comment: str | None = Field(default=None, max_length=512)

    @field_validator("symbol")
    @classmethod
    def _clean_symbol(cls, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned.replace(".", "").replace("-", "").replace("_", "").replace("=", "").isalnum():
            raise ValueError("symbol contains unsupported characters")
        return cleaned


class SignalResponse(BaseModel):
    """Normalised, weighted output of the strategy engine."""

    symbol: str
    macroSignal: Direction = Direction.NEUTRAL
    orderbookSignal: Direction = Direction.NEUTRAL
    earningsSignal: Direction = Direction.NEUTRAL
    technicalSignal: Direction = Direction.NEUTRAL
    finalSignal: FinalSignal = FinalSignal.NONE
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    score: float = 0.0
    price: float | None = None
    atr: float | None = None
    stopLoss: float | None = None
    takeProfit: float | None = None
    indicators: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HealthResponse(BaseModel):
    status: str
    version: str
    env: str
    uptimeSeconds: float
    scheduler: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
