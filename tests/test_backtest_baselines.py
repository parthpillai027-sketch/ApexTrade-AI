"""
Unit tests for walk-forward backtesting with baselines and friction deductions.
"""

import unittest
import pandas as pd
import numpy as np
from src.backtest import run_historical_backtest


class TestBacktestBaselines(unittest.TestCase):
    def setUp(self):
        np.random.seed(42)
        dates = pd.date_range("2025-01-01", periods=100, freq="D")
        close = 150.0 + np.cumsum(np.random.randn(100) * 1.5)
        self.df = pd.DataFrame({
            "Open": close - 0.5,
            "High": close + 1.5,
            "Low": close - 1.5,
            "Close": close,
            "Volume": np.random.randint(500000, 2000000, size=100)
        }, index=dates)

    def test_backtest_baselines_and_metrics(self):
        res = run_historical_backtest(self.df, model_name="Bobcat", test_windows=8, horizon=4)

        # Baseline comparison checks
        self.assertIn("baselines_comparison", res)
        baseline_names = [b["name"] for b in res["baselines_comparison"]]
        self.assertTrue(any("Buy-and-Hold" in n for n in baseline_names))
        self.assertTrue(any("Persistence" in n for n in baseline_names))
        self.assertTrue(any("20-SMA" in n for n in baseline_names))
        self.assertTrue(any("Random 50%" in n for n in baseline_names))

        # Risk-adjusted metrics checks
        self.assertIn("sharpe_ratio", res)
        self.assertIn("sortino_ratio", res)
        self.assertIn("max_drawdown_pct", res)
        self.assertIn("friction_breakdown", res)
        self.assertIn("calibration_curve", res)
        self.assertIn("auto_pilot_qualified", res)

        # Friction should be tracked
        self.assertGreater(res["friction_breakdown"]["total_friction_per_trade_pct"], 0.0)

        # Calibration curve checks
        self.assertEqual(len(res["calibration_curve"]), 4)


if __name__ == "__main__":
    unittest.main()
