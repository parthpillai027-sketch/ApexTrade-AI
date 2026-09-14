"""
Unit tests for backtesting and orderbook modules.
"""

import unittest
import pandas as pd
import numpy as np
from src.backtest import run_historical_backtest
from src.orderbook import generate_simulated_orderbook


class TestBacktestAndOrderbook(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2025-01-01", periods=80, freq="D")
        close = 150.0 + np.cumsum(np.random.randn(80) * 1.5)
        self.df = pd.DataFrame({
            "Open": close - 0.5,
            "High": close + 1.5,
            "Low": close - 1.5,
            "Close": close,
            "Volume": np.random.randint(500000, 2000000, size=80)
        }, index=dates)

    def test_run_historical_backtest(self):
        res = run_historical_backtest(self.df, model_name="Bobcat", test_windows=5, horizon=3)
        self.assertIn("mean_directional_accuracy", res)
        self.assertIn("win_rate", res)
        self.assertIn("threshold_curve", res)
        self.assertIn("equity_curve", res)
        self.assertGreater(len(res["equity_curve"]), 0)

    def test_orderbook_generation(self):
        book = generate_simulated_orderbook(current_price=250.0, recent_volume=1000000, levels=10)
        self.assertIn("bids", book)
        self.assertIn("asks", book)
        self.assertEqual(len(book["bids"]), 10)
        self.assertEqual(len(book["asks"]), 10)
        self.assertGreater(book["asks"][0]["price"], book["bids"][0]["price"])
        self.assertGreater(book["imbalance_ratio"], 0.0)


if __name__ == "__main__":
    unittest.main()
