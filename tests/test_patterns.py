"""
Unit tests for candlestick patterns and pivot levels.
"""

import unittest
import pandas as pd
import numpy as np
from src.patterns import detect_candlestick_patterns, detect_support_resistance_pivots, detect_breakout_events


class TestPatterns(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2025-01-01", periods=50, freq="D")
        close = 200.0 + np.cumsum(np.random.randn(50) * 2.0)
        self.df = pd.DataFrame({
            "Open": close - 0.5,
            "High": close + 1.5,
            "Low": close - 1.5,
            "Close": close,
            "Volume": np.random.randint(500000, 2000000, size=50)
        }, index=dates)

    def test_detect_candlestick_patterns(self):
        patterns = detect_candlestick_patterns(self.df)
        self.assertIsInstance(patterns, list)
        for p in patterns:
            self.assertIn("name", p)
            self.assertIn("type", p)
            self.assertIn("confidence", p)

    def test_detect_support_resistance_pivots(self):
        sup, res = detect_support_resistance_pivots(self.df, window=5)
        self.assertIsInstance(sup, list)
        self.assertIsInstance(res, list)
        self.assertGreater(len(sup), 0)
        self.assertGreater(len(res), 0)

    def test_detect_breakout_events(self):
        event = detect_breakout_events(self.df)
        if event is not None:
            self.assertIn("type", event)
            self.assertIn("confidence", event)


if __name__ == "__main__":
    unittest.main()
