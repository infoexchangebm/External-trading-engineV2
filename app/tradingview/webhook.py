import httpx
import logging
from config.config import settings

logger = logging.getLogger(__name__)

async def send_to_tradingview(signal: dict):
    if not settings.tradingview_webhook_url:
        logger.warning("TradingView webhook URL not configured")
        return False

    payload = {
        "macroSignal": signal.get("macroSignal"),
        "orderbookSignal": signal.get("orderbookSignal"),
        "earningsSignal": signal.get("earningsSignal"),
        "technicalSignal": signal.get("technicalSignal"),
        "finalSignal": signal.get("finalSignal"),
        "symbol": signal.get("symbol"),
        "confidence": signal.get("confidence", 0.0),
        "timestamp": signal.get("timestamp")  # optional
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                settings.tradingview_webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            logger.info(f"Signal sent to TradingView: {signal['finalSignal']} for {signal['symbol']}")
            return True
    except Exception as e:
        logger.error(f"Failed to send signal to TradingView: {e}")
        return False