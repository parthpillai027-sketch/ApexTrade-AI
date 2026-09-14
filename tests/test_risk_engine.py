"""
Unit tests for the standalone Risk Management Engine.
"""

import unittest
import datetime
from src.risk_engine import RiskEngine
from src.portfolio import PaperPortfolio
from src.data_loader import VerifiedQuote


class TestRiskEngine(unittest.TestCase):
    def setUp(self):
        self.risk_engine = RiskEngine()
        self.portfolio = PaperPortfolio(initial_cash=100000.0, risk_engine=self.risk_engine)
        self.quote_aapl = VerifiedQuote(
            symbol="AAPL",
            price=220.0,
            bid=219.90,
            ask=220.10,
            timestamp="2026-09-14 14:30:00 UTC",
            exchange="NASDAQ",
            data_source="Yahoo Finance",
            is_live=False,
            is_delayed=True,
            is_simulated=False,
            data_freshness_seconds=5.0
        )

    def test_invalid_stop_loss_direction_rejected(self):
        """BUY order with stop-loss ABOVE current price must be rejected."""
        order = {
            "symbol": "AAPL",
            "side": "BUY",
            "current_price": 220.0,
            "qty": 10,
            "stop_loss": 225.0  # Invalid: above entry price for a long
        }
        res = self.risk_engine.validate_order(self.portfolio, order, self.quote_aapl)
        self.assertFalse(res.allowed)
        self.assertTrue(any("must be BELOW entry price" in r for r in res.rejection_reasons))

    def test_invalid_short_stop_loss_rejected(self):
        """SELL (Short) order with stop-loss BELOW current price must be rejected."""
        order = {
            "symbol": "AAPL",
            "side": "SELL",
            "current_price": 220.0,
            "qty": 10,
            "stop_loss": 210.0  # Invalid: below entry price for a short
        }
        res = self.risk_engine.validate_order(self.portfolio, order, self.quote_aapl)
        self.assertFalse(res.allowed)
        self.assertTrue(any("must be ABOVE entry price" in r for r in res.rejection_reasons))

    def test_max_position_size_limit_rejected(self):
        """Order exceeding 20% of account equity must be rejected."""
        order = {
            "symbol": "AAPL",
            "side": "BUY",
            "current_price": 220.0,
            "qty": 150,  # 150 * 220 = $33,000 > $20,000 cap
            "stop_loss": 210.0
        }
        res = self.risk_engine.validate_order(self.portfolio, order, self.quote_aapl)
        self.assertFalse(res.allowed)
        self.assertTrue(any("MAX POSITION SIZE EXCEEDED" in r for r in res.rejection_reasons))

    def test_emergency_kill_switch(self):
        """Kill switch must close all open positions and lock auto-pilot."""
        self.portfolio.open_position(
            symbol="AAPL",
            side="BUY",
            current_price=220.0,
            qty=20,
            stop_loss=210.0,
            verified_quote=self.quote_aapl
        )
        self.assertEqual(len(self.portfolio.positions), 1)

        res = self.risk_engine.trigger_kill_switch(self.portfolio, reason="Manual emergency drill")
        self.assertTrue(self.risk_engine.kill_switch_active)
        self.assertEqual(len(self.portfolio.positions), 0)
        self.assertEqual(len(self.portfolio.trade_history), 1)
        self.assertIn("Kill Switch", self.portfolio.trade_history[0]["exit_reason"])

        # Any new order must now be rejected
        with self.assertRaises(ValueError) as ctx:
            self.portfolio.open_position(
                symbol="AAPL",
                side="BUY",
                current_price=220.0,
                qty=10,
                stop_loss=210.0,
                verified_quote=self.quote_aapl
            )
        self.assertIn("KILL SWITCH ACTIVE", str(ctx.exception))

    def test_short_eligibility_for_crypto(self):
        """Spot cryptocurrency shorting must be prohibited."""
        res = self.risk_engine.check_short_eligibility("BTC-USD")
        self.assertFalse(res["eligible"])
        self.assertIn("Spot cryptocurrency cannot be shorted", res["reason"])

    def test_volatility_based_position_sizing(self):
        """Higher ATR assets should receive smaller recommended position size."""
        # Low volatility asset: ATR = $2 on $100 price (2%)
        size_low_vol = self.risk_engine.compute_volatility_position_size(price=100.0, equity=100000.0, atr=2.0)
        # High volatility asset: ATR = $10 on $100 price (10%)
        size_high_vol = self.risk_engine.compute_volatility_position_size(price=100.0, equity=100000.0, atr=10.0)

        self.assertGreater(size_low_vol["suggested_qty"], size_high_vol["suggested_qty"])


if __name__ == "__main__":
    unittest.main()
