"""
Unit tests for technical indicators module.
"""

import unittest
import pandas as pd
import numpy as np
from src.indicators import add_all_indicators, compute_rsi, compute_macd, compute_bollinger_bands


class TestIndicators(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2025-01-01", periods=60, freq="D")
        close = 150.0 + np.cumsum(np.random.randn(60) * 1.5)
        self.df = pd.DataFrame({
            "Open": close - 0.5,
            "High": close + 1.2,
            "Low": close - 1.2,
            "Close": close,
            "Volume": np.random.randint(500000, 2000000, size=60)
        }, index=dates)

    def test_compute_rsi(self):
        rsi = compute_rsi(self.df["Close"], period=14)
        self.assertEqual(len(rsi), len(self.df))
        self.assertTrue((rsi >= 0.0).all() and (rsi <= 100.0).all())

    def test_compute_macd(self):
        macd, signal, hist = compute_macd(self.df["Close"])
        self.assertEqual(len(macd), len(self.df))
        self.assertEqual(len(signal), len(self.df))
        self.assertEqual(len(hist), len(self.df))
        # Hist should equal macd - signal
        np.testing.assert_allclose(hist.values, (macd - signal).values, rtol=1e-5)

    def test_compute_bollinger_bands(self):
        upper, mid, lower, width = compute_bollinger_bands(self.df["Close"], period=20)
        self.assertTrue((upper >= mid).all())
        self.assertTrue((mid >= lower).all())

    def test_add_all_indicators(self):
        res = add_all_indicators(self.df)
        expected_cols = [
            "SMA_20", "SMA_50", "EMA_9", "EMA_21",
            "RSI_14", "MACD_Line", "MACD_Signal", "MACD_Hist",
            "BB_Upper", "BB_Middle", "BB_Lower", "ATR_14", "VWAP"
        ]
        for col in expected_cols:
            self.assertIn(col, res.columns)
            self.assertFalse(res[col].isna().all(), f"Column {col} is all NaN")


if __name__ == "__main__":
    unittest.main()
