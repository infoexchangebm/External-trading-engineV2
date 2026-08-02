import pandas as pd
import numpy as np
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class StrategyEngine:
    def __init__(self):
        self.weights = {
            "macro": 0.25,
            "orderbook": 0.30,
            "earnings": 0.15,
            "technical": 0.30
        }

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> float:
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return float(100 - (100 / (1 + rs.iloc[-1])))

    def calculate_ema(self, prices: pd.Series, period: int = 20) -> float:
        return float(prices.ewm(span=period, adjust=False).mean().iloc[-1])

    def calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float:
        tr = pd.concat([
            high - low,
            abs(high - close.shift()),
            abs(low - close.shift())
        ], axis=1).max(axis=1)
        return float(tr.rolling(period).mean().iloc[-1])

    async def generate_signal(self, symbol: str, macro: Dict = None, orderbook: Dict = None, 
                             earnings: Dict = None, price_data: pd.DataFrame = None) -> Dict[str, Any]:
        
        signals = {
            "macroSignal": "NEUTRAL",
            "orderbookSignal": "NEUTRAL",
            "earningsSignal": "NEUTRAL",
            "technicalSignal": "NEUTRAL",
            "finalSignal": "NONE",
            "symbol": symbol,
            "confidence": 0.0
        }

        score = 0.0

        # Macro signal
        if macro:
            if macro.get("fed_signal") == "DOVISH":
                signals["macroSignal"] = "BULLISH"
                score += self.weights["macro"]
            elif macro.get("fed_signal") == "HAWKISH":
                signals["macroSignal"] = "BEARISH"
                score -= self.weights["macro"]

        # Order book imbalance
        if orderbook and symbol in orderbook:
            ob_signal = orderbook[symbol].get("signal", "NEUTRAL")
            signals["orderbookSignal"] = ob_signal
            if ob_signal == "BULLISH":
                score += self.weights["orderbook"]
            elif ob_signal == "BEARISH":
                score -= self.weights["orderbook"]

        # Technical indicators (simulated if no price_data)
        if price_data is not None and len(price_data) > 20:
            close = price_data['close']
            rsi = self.calculate_rsi(close)
            ema20 = self.calculate_ema(close, 20)
            ema50 = self.calculate_ema(close, 50)
            atr = self.calculate_atr(price_data['high'], price_data['low'], close)

            if ema20 > ema50 and rsi < 70:
                signals["technicalSignal"] = "BULLISH"
                score += self.weights["technical"]
            elif ema20 < ema50 and rsi > 30:
                signals["technicalSignal"] = "BEARISH"
                score -= self.weights["technical"]

        # Final decision
        if score >= 0.4:
            signals["finalSignal"] = "BUY"
            signals["confidence"] = round(min(score, 1.0), 2)
        elif score <= -0.4:
            signals["finalSignal"] = "SELL"
            signals["confidence"] = round(min(abs(score), 1.0), 2)
        else:
            signals["finalSignal"] = "NONE"

        logger.info(f"Signal generated for {symbol}: {signals['finalSignal']} (score: {score:.2f})")
        return signals