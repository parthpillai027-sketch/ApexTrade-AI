"""
Unit tests for data_loader module.
"""

import unittest
import pandas as pd
import numpy as np
from src.data_loader import clean_ticker, fetch_stock_data, fetch_ticker_info, POPULAR_TICKERS


class TestDataLoader(unittest.TestCase):
    def test_clean_ticker(self):
        self.assertEqual(clean_ticker("  aapl  "), "AAPL")
        self.assertEqual(clean_ticker("btc-usd"), "BTC-USD")

    def test_popular_tickers_structure(self):
        self.assertIn("Tech Leaders", POPULAR_TICKERS)
        self.assertIn("Crypto", POPULAR_TICKERS)
        self.assertIn("AAPL", POPULAR_TICKERS["Tech Leaders"])
        self.assertIn("BTC-USD", POPULAR_TICKERS["Crypto"])

    def test_synthetic_data_integrity(self):
        dates = pd.date_range("2025-01-01", periods=50, freq="D")
        np.random.seed(42)
        close = 100 + np.cumsum(np.random.randn(50))
        df = pd.DataFrame({
            "Open": close - 0.5,
            "High": close + 1.0,
            "Low": close - 1.0,
            "Close": close,
            "Volume": 1000000
        }, index=dates)
        
        self.assertEqual(len(df), 50)
        self.assertListEqual(list(df.columns), ["Open", "High", "Low", "Close", "Volume"])


if __name__ == "__main__":
    unittest.main()
