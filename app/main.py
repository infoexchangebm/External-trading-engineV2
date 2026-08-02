from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from contextlib import asynccontextmanager
import logging
import os

from config.config import settings
from app.data_sources.macro import MacroDataFetcher
from app.data_sources.orderbook import OrderBookFetcher
from app.data_sources.earnings import EarningsFetcher
from app.strategies.engine import StrategyEngine
from app.tradingview.webhook import send_to_tradingview

# Logging setup
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/trading_engine.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("trading-engine")

scheduler = AsyncIOScheduler()
strategy_engine = StrategyEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting Trading Engine...")
    # Schedule jobs
    scheduler.add_job(fetch_and_process_data, "interval", minutes=15, id="data_fetch")
    scheduler.add_job(fetch_earnings, "cron", hour=8, minute=0, id="earnings")
    scheduler.start()
    yield
    scheduler.shutdown()
    logger.info("🛑 Trading Engine stopped")

app = FastAPI(title="External Trading Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency for API key
async def verify_api_key(request: Request):
    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return True

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/webhook/tradingview")
async def tradingview_webhook(payload: dict, authorized: bool = Depends(verify_api_key)):
    logger.info(f"Received TradingView alert: {payload}")
    # Here you could process incoming TV alerts
    return {"status": "received"}

@app.post("/signal/send")
async def manual_signal(symbol: str, authorized: bool = Depends(verify_api_key)):
    try:
        signal = await strategy_engine.generate_signal(symbol)
        if signal["finalSignal"] != "NONE":
            await send_to_tradingview(signal)
        return signal
    except Exception as e:
        logger.error(f"Signal generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def fetch_and_process_data():
    logger.info("Fetching macro + orderbook data...")
    try:
        macro = await MacroDataFetcher().fetch_all()
        orderbook = await OrderBookFetcher().fetch_all(settings.symbols)
        
        for symbol in settings.symbols:
            signal = await strategy_engine.generate_signal(symbol, macro=macro, orderbook=orderbook)
            if signal["finalSignal"] != "NONE":
                await send_to_tradingview(signal)
                logger.info(f"Signal sent for {symbol}: {signal['finalSignal']}")
    except Exception as e:
        logger.error(f"Data processing error: {e}")

async def fetch_earnings():
    logger.info("Fetching earnings calendar...")
    try:
        earnings = await EarningsFetcher().fetch_earnings()
        # Process earnings surprises in strategy engine if needed
    except Exception as e:
        logger.error(f"Earnings fetch error: {e}")