import aiohttp
import asyncio
from config.config import settings
import logging

logger = logging.getLogger(__name__)

class MacroDataFetcher:
    async def fetch_all(self):
        results = {}
        async with aiohttp.ClientSession() as session:
            try:
                # FRED example (US GDP)
                if settings.fred_api_key:
                    url = f"https://fred.stlouisfed.org/fred/series/observations?series_id=GDP&api_key={settings.fred_api_key}&file_type=json&limit=1"
                    async with session.get(url) as resp:
                        data = await resp.json()
                        results["gdp"] = data.get("observations", [{}])[-1].get("value")
            except Exception as e:
                logger.warning(f"FRED fetch failed: {e}")
            
            results["inflation_signal"] = "NEUTRAL"  # placeholder logic
            results["fed_signal"] = "NEUTRAL"
        return results