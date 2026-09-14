"""
AI Stock Market Predictor - Core Package
Inspired by Krafer's 'I made an AI learn Stock Market Patterns'
"""
__version__ = "2.0.0"

from .data_loader import (
    fetch_stock_data, fetch_ticker_info, clean_ticker,
    VerifiedQuote, get_verified_quote, POPULAR_TICKERS, TICKER_EXCHANGE_MAP
)
from .risk_engine import RiskEngine, RiskCheckResult

