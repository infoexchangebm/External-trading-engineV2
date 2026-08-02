import aiohttp
import logging
from config.config import settings

logger = logging.getLogger(__name__)

class OrderBookFetcher:
    async def fetch_all(self, symbols):
        results = {}
        async with aiohttp.ClientSession() as session:
            for symbol in symbols:
                try:
                    url = f"https://api.binance.com/api/v3/depth?symbol={symbol}&limit=100"
                    async with session.get(url) as resp:
                        data = await resp.json()
                        bids = sum(float(b[1]) for b in data.get("bids", []))
                        asks = sum(float(a[1]) for a in data.get("asks", []))
                        imbalance = (bids - asks) / (bids + asks) if (bids + asks) > 0 else 0
                        results[symbol] = {
                            "imbalance": round(imbalance, 4),
                            "signal": "BULLISH" if imbalance > 0.15 else "BEARISH" if imbalance < -0.15 else "NEUTRAL"
                        }
                except Exception as e:
                    logger.warning(f"Orderbook fetch failed for {symbol}: {e}")
        return results