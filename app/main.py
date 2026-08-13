"""FastAPI application for the Python signal engine.

Hardening applied in this revision:

* logging no longer crashes when ``logs/`` does not exist (rotating file handler)
* API keys are compared in constant time via :func:`secrets.compare_digest`
* CORS is restricted to a configured allowlist instead of ``*``
* the scan loop passes live candles into the strategy engine so the technical
  leg actually contributes
* ``/metrics`` exposes scan/signal counters, ``/health`` reports scheduler state
* every handler returns typed, validated responses
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.data_sources.earnings import EarningsFetcher
from app.data_sources.macro import MacroDataFetcher
from app.data_sources.orderbook import OrderBookFetcher, is_valid_symbol
from app.data_sources.prices import PriceFetcher, push_market_feeds
from app.models import HealthResponse, SignalResponse, TradingViewAlert
from app.strategies.engine import StrategyEngine
from app.tradingview.webhook import send_to_tradingview
from config.config import settings

VERSION = "2.0.0"


def configure_logging() -> logging.Logger:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    log_path = settings.log_file
    try:
        directory = os.path.dirname(log_path) or "."
        os.makedirs(directory, exist_ok=True)
        handlers.append(
            logging.handlers.RotatingFileHandler(
                log_path, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
            )
        )
    except OSError as exc:  # read-only filesystem / container without a volume
        logging.getLogger(__name__).warning("File logging disabled (%s)", exc)

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=handlers,
        force=True,
    )
    return logging.getLogger("trading-engine")


logger = configure_logging()

scheduler = AsyncIOScheduler(timezone="UTC")
strategy_engine = StrategyEngine()
price_fetcher = PriceFetcher()

STARTED_AT = time.monotonic()
METRICS: dict[str, Any] = {
    "scans_total": 0,
    "scan_errors_total": 0,
    "signals_generated_total": 0,
    "signals_dispatched_total": 0,
    "dispatch_failures_total": 0,
    "last_scan_at": None,
    "last_signal": None,
}

# Cache of the most recent macro snapshot; refreshed by the scan loop.
_macro_cache: dict[str, Any] = {}
_earnings_cache: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting Trading Engine v%s (env=%s)", VERSION, settings.env)
    if not settings.api_key:
        logger.warning("API_KEY is empty - authenticated endpoints will reject every request")
    scheduler.add_job(
        fetch_and_process_data,
        "interval",
        minutes=settings.scan_interval_minutes,
        id="data_fetch",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.add_job(
        refresh_earnings,
        "cron",
        hour=8,
        minute=0,
        id="earnings",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        logger.info("Trading Engine stopped")


app = FastAPI(
    title="External Trading Engine",
    version=VERSION,
    description="Multi-signal trading engine: macro + order book + earnings + technical.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


async def verify_api_key(request: Request) -> bool:
    """Constant-time API key check on the ``X-API-Key`` header."""
    provided = request.headers.get("X-API-Key", "")
    expected = settings.api_key
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return True


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    jobs = [
        {
            "id": job.id,
            "nextRunTime": job.next_run_time.isoformat() if job.next_run_time else None,
        }
        for job in scheduler.get_jobs()
    ]
    return HealthResponse(
        status="healthy",
        version=VERSION,
        env=settings.env,
        uptimeSeconds=round(time.monotonic() - STARTED_AT, 2),
        scheduler={"running": scheduler.running, "jobs": jobs},
    )


@app.get("/metrics", tags=["system"])
async def metrics(_: bool = Depends(verify_api_key)) -> dict[str, Any]:
    return {
        **METRICS,
        "uptimeSeconds": round(time.monotonic() - STARTED_AT, 2),
        "symbols": settings.symbols,
        "threshold": settings.signal_threshold,
        "weights": settings.weights,
        "dryRun": settings.dry_run,
    }


@app.post("/webhook/tradingview", tags=["webhook"])
async def tradingview_webhook(
    alert: TradingViewAlert,
    _: bool = Depends(verify_api_key),
) -> dict[str, Any]:
    """Accept an inbound TradingView alert and evaluate it against the engine."""
    logger.info("Inbound TradingView alert: %s", alert.model_dump(exclude_none=True))
    frame = await price_fetcher.fetch_ohlcv(alert.symbol)
    orderbook = await OrderBookFetcher().fetch_all([alert.symbol]) if is_valid_symbol(alert.symbol) else {}
    signal = await strategy_engine.generate_signal(
        alert.symbol,
        macro=_macro_cache,
        orderbook=orderbook,
        earnings=_earnings_cache,
        price_data=frame,
    )
    METRICS["signals_generated_total"] += 1
    METRICS["last_signal"] = signal
    return {"status": "received", "alert": alert.model_dump(exclude_none=True), "signal": signal}


@app.post("/signal/send", response_model=SignalResponse, tags=["signals"])
async def manual_signal(
    symbol: str = Query(min_length=2, max_length=32),
    dispatch: bool = Query(default=True, description="Send to TradingView when actionable"),
    _: bool = Depends(verify_api_key),
) -> SignalResponse:
    normalised = symbol.upper().strip()
    if not is_valid_symbol(normalised):
        raise HTTPException(status_code=422, detail=f"Unsupported symbol: {symbol}")

    try:
        frame = await price_fetcher.fetch_ohlcv(normalised)
        orderbook = await OrderBookFetcher().fetch_all([normalised])
        signal = await strategy_engine.generate_signal(
            normalised,
            macro=_macro_cache,
            orderbook=orderbook,
            earnings=_earnings_cache,
            price_data=frame,
        )
    except Exception as exc:
        logger.exception("Signal generation failed for %s", normalised)
        raise HTTPException(status_code=502, detail=f"Signal generation failed: {exc}") from exc

    METRICS["signals_generated_total"] += 1
    METRICS["last_signal"] = signal

    if dispatch and signal["finalSignal"] != "NONE":
        delivered = await send_to_tradingview(signal)
        METRICS["signals_dispatched_total" if delivered else "dispatch_failures_total"] += 1

    return SignalResponse(**signal)


@app.get("/signal/latest", tags=["signals"])
async def latest_signal(_: bool = Depends(verify_api_key)) -> dict[str, Any]:
    return {"signal": METRICS["last_signal"], "lastScanAt": METRICS["last_scan_at"]}


async def fetch_and_process_data(symbols: list[str] | None = None) -> list[dict[str, Any]]:
    """Scheduled scan: refresh market data, score every symbol, dispatch signals."""
    watchlist = symbols or settings.symbols
    logger.info("Scan cycle starting for %s", watchlist)
    generated: list[dict[str, Any]] = []

    try:
        _macro_cache.update(await MacroDataFetcher().fetch_all())
        orderbook = await OrderBookFetcher().fetch_all(watchlist)
        frames = await price_fetcher.fetch_many(watchlist)

        # Best-effort: persistence must never block signal generation below,
        # so failures here are swallowed and logged rather than re-raised.
        try:
            await push_market_feeds(frames)
        except Exception:
            logger.exception("market_feeds persistence failed; continuing scan cycle without it")

        for symbol in watchlist:
            signal = await strategy_engine.generate_signal(
                symbol,
                macro=_macro_cache,
                orderbook=orderbook,
                earnings=_earnings_cache,
                price_data=frames.get(symbol.upper()),
            )
            generated.append(signal)
            METRICS["signals_generated_total"] += 1
            METRICS["last_signal"] = signal

            if signal["finalSignal"] != "NONE":
                delivered = await send_to_tradingview(signal)
                METRICS["signals_dispatched_total" if delivered else "dispatch_failures_total"] += 1

        METRICS["scans_total"] += 1
        METRICS["last_scan_at"] = datetime.now(UTC).isoformat()
    except Exception:
        METRICS["scan_errors_total"] += 1
        logger.exception("Scan cycle failed")

    return generated


async def refresh_earnings() -> dict[str, Any]:
    """Scheduled daily earnings refresh feeding the earnings leg of the engine."""
    try:
        _earnings_cache.update(await EarningsFetcher().fetch_earnings())
        logger.info("Earnings cache refreshed for %s tickers", len(_earnings_cache))
    except Exception:
        logger.exception("Earnings refresh failed")
    return _earnings_cache
