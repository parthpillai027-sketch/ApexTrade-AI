"""
Unit tests for AI Model Zoo (Bobcat, Panther, Tiger, Lion).
"""

import unittest
import pandas as pd
import numpy as np
from src.models import (
    BobcatModel, PantherModel, TigerModel, LionModel,
    get_model_suite, ModelPredictionResult
)


class TestModels(unittest.TestCase):
    def setUp(self):
        np.random.seed(123)
        dates = pd.date_range("2025-01-01", periods=60, freq="D")
        close = 100.0 + np.cumsum(np.random.randn(60) * 1.5)
        self.df = pd.DataFrame({
            "Open": close - 0.4,
            "High": close + 1.2,
            "Low": close - 1.2,
            "Close": close,
            "Volume": np.random.randint(1000000, 5000000, size=60)
        }, index=dates)

    def test_model_suite_initialization(self):
        suite = get_model_suite()
        self.assertIn("Lion", suite)
        self.assertIn("Tiger", suite)
        self.assertEqual(len(suite), 2)
        self.assertNotIn("Bobcat", suite)
        self.assertNotIn("Panther", suite)

    def test_bobcat_prediction(self):
        model = BobcatModel()
        res = model.predict(self.df, horizon=10)
        self.assertIsInstance(res, ModelPredictionResult)
        self.assertEqual(len(res.future_candles), 10)
        self.assertIn(res.directional_bias, ["Bullish", "Bearish", "Neutral"])
        self.assertGreaterEqual(res.confidence_score, 0.0)
        self.assertLessEqual(res.confidence_score, 100.0)

    def test_panther_directional_bias(self):
        model = PantherModel()
        res = model.predict(self.df, horizon=10)
        self.assertIsInstance(res, ModelPredictionResult)
        self.assertEqual(len(res.future_candles), 10)
        self.assertAlmostEqual(res.bullish_probability + res.bearish_probability, 1.0, places=2)

    def test_tiger_prediction(self):
        model = TigerModel()
        res = model.predict(self.df, horizon=10, confidence_threshold=65.0)
        self.assertIsInstance(res, ModelPredictionResult)
        self.assertEqual(len(res.future_candles), 10)
        self.assertIsInstance(res.threshold_exceeded, (bool, np.bool_))

    def test_lion_deep_lstm_prediction(self):
        model = LionModel()
        res = model.predict(self.df, horizon=8, epochs=5)
        self.assertIsInstance(res, ModelPredictionResult)
        self.assertEqual(len(res.future_candles), 8)
        for candle in res.future_candles:
            self.assertGreaterEqual(candle.high, candle.low)
            self.assertGreaterEqual(candle.upper_band, candle.lower_band)


if __name__ == "__main__":
    unittest.main()
