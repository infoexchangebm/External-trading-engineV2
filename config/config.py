"""Application settings for the Python signal engine.

All values can be provided via environment variables or a local ``.env`` file.
List-style variables (``SYMBOLS``, ``ALLOWED_IPS``, ``CORS_ORIGINS``) accept a
comma-separated string, e.g. ``SYMBOLS=BTCUSDT,ETHUSDT``.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _split_csv(value: Any) -> Any:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    """Runtime configuration, validated at import time."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Server ---------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000
    env: str = "production"
    log_level: str = "INFO"
    log_file: str = "logs/trading_engine.log"

    # --- Security -------------------------------------------------------
    api_key: str = ""
    allow_insecure: bool = False  # escape hatch: run without API key in production
    allowed_ips: Annotated[list[str], NoDecode] = ["127.0.0.1"]
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://localhost:24212",
    ]

    # --- Market data providers ------------------------------------------
    fred_api_key: str = ""
    alphavantage_api_key: str = ""
    finnhub_api_key: str = ""
    binance_api_key: str = ""
    binance_secret: str = ""
    binance_base_url: str = "https://api.binance.com"
    http_timeout_seconds: float = 10.0
    http_max_retries: int = 3

    # --- Engine ---------------------------------------------------------
    symbols: Annotated[list[str], NoDecode] = ["BTCUSDT", "ETHUSDT"]
    earnings_tickers: Annotated[list[str], NoDecode] = ["AAPL", "MSFT", "GOOGL"]
    scan_interval_minutes: int = 15
    signal_threshold: float = 0.4
    orderbook_imbalance_threshold: float = 0.15
    atr_stop_multiplier: float = 1.5
    atr_target_multiplier: float = 3.0
    weight_macro: float = 0.25
    weight_orderbook: float = 0.30
    weight_earnings: float = 0.15
    weight_technical: float = 0.30

    # --- Outbound integrations ------------------------------------------
    tradingview_webhook_url: str = ""
    dry_run: bool = False

    # --- Internal service wiring ------------------------------------------
    # Node owns Postgres (Drizzle) and exposes it over HTTP; this engine has
    # no direct DB driver on purpose, to avoid two services independently
    # knowing the schema. Default matches the docker-compose service name,
    # reachable by DNS on the default compose network. Same shared secret as
    # api_key -- the Express server's apiKeyAuth() checks X-API-Key against
    # one API_KEY value for both.
    node_api_url: str = "http://api-server:8080"

    @field_validator("allowed_ips", "cors_origins", "symbols", "earnings_tickers", mode="before")
    @classmethod
    def _parse_csv(cls, value: Any) -> Any:
        return _split_csv(value)

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalise_log_level(cls, value: Any) -> Any:
        if isinstance(value, str):
            level = value.strip().upper()
            allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
            if level not in allowed:
                raise ValueError(f"log_level must be one of {sorted(allowed)}, got {value!r}")
            return level
        return value

    @field_validator("symbols", "earnings_tickers")
    @classmethod
    def _uppercase_symbols(cls, value: list[str]) -> list[str]:
        return [item.upper() for item in value]

    @field_validator("port")
    @classmethod
    def _valid_port(cls, value: int) -> int:
        if not 1 <= value <= 65535:
            raise ValueError(f"port must be between 1 and 65535, got {value}")
        return value

    @field_validator("signal_threshold")
    @classmethod
    def _valid_threshold(cls, value: float) -> float:
        if not 0 < value <= 1:
            raise ValueError("signal_threshold must be within (0, 1]")
        return value

    @model_validator(mode="after")
    def _check_production_hardening(self) -> Settings:
        if self.is_production and not self.api_key and not self.allow_insecure:
            # Fail loudly rather than exposing unauthenticated trading endpoints.
            raise ValueError(
                "API_KEY must be set when ENV=production (or set ALLOW_INSECURE=true to override). "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"production", "prod"}

    @property
    def weights(self) -> dict:
        return {
            "macro": self.weight_macro,
            "orderbook": self.weight_orderbook,
            "earnings": self.weight_earnings,
            "technical": self.weight_technical,
        }


settings = Settings()
