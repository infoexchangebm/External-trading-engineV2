from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    port: int = 8000
    env: str = "production"
    log_level: str = "INFO"
    
    fred_api_key: str = ""
    alphavantage_api_key: str = ""
    finnhub_api_key: str = ""
    
    binance_api_key: str = ""
    binance_secret: str = ""
    
    tradingview_webhook_url: str = ""
    
    api_key: str = ""
    allowed_ips: List[str] = ["127.0.0.1"]
    
    symbols: List[str] = ["BTCUSDT", "ETHUSDT"]
    
    class Config:
        env_file = ".env"

settings = Settings()