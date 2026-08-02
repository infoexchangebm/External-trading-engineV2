import yfinance as yf
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class EarningsFetcher:
    async def fetch_earnings(self, tickers=None):
        if tickers is None:
            tickers = ["AAPL", "MSFT", "GOOGL"]
        results = {}
        for ticker in tickers:
            try:
                stock = yf.Ticker(ticker)
                earnings = stock.earnings_dates
                if earnings is not None and len(earnings) > 0:
                    results[ticker] = earnings.head(2).to_dict()
            except Exception as e:
                logger.warning(f"Earnings fetch failed for {ticker}: {e}")
        return results