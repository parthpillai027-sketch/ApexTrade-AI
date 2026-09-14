"""
Unit tests for Paper Trading & Portfolio Execution Simulator.
"""

import unittest
from src.portfolio import PaperPortfolio


class TestPaperPortfolio(unittest.TestCase):
    def setUp(self):
        self.portfolio = PaperPortfolio(initial_cash=100000.0)

    def test_initial_state(self):
        summary = self.portfolio.get_summary()
        self.assertEqual(summary["cash"], 100000.0)
        self.assertEqual(summary["equity"], 100000.0)
        self.assertEqual(summary["total_trades"], 0)
        self.assertEqual(len(summary["open_positions"]), 0)

    def test_open_and_close_position(self):
        # Open position
        pos = self.portfolio.open_position(
            symbol="AAPL",
            side="BUY",
            current_price=200.0,
            qty=50,
            stop_loss=190.0,
            take_profit=220.0
        )
        self.assertEqual(pos["symbol"], "AAPL")
        self.assertEqual(pos["qty"], 50)
        self.assertEqual(self.portfolio.cash, 100000.0 - (50 * 200.0))

        # Close position at profit
        closed = self.portfolio.close_position(pos["id"], current_price=210.0)
        self.assertEqual(closed["realized_pnl"], 500.0)
        self.assertEqual(self.portfolio.cash, 100500.0)
        self.assertEqual(len(self.portfolio.trade_history), 1)

    def test_stop_loss_trigger(self):
        pos = self.portfolio.open_position(
            symbol="NVDA",
            side="BUY",
            current_price=150.0,
            qty=20,
            stop_loss=140.0,
            take_profit=170.0
        )
        # Tick below stop loss
        closed_trades = self.portfolio.update_tick("NVDA", current_price=139.0)
        self.assertEqual(len(closed_trades), 1)
        self.assertIn("Stop-Loss", closed_trades[0]["exit_reason"])
        self.assertEqual(len(self.portfolio.positions), 0)

    def test_auto_pilot_trigger(self):
        self.portfolio.set_auto_pilot(True)
        ai_pred = {
            "model_name": "Tiger Breakout",
            "directional_bias": "Bullish",
            "confidence_score": 75.0,
            "threshold_exceeded": True
        }
        self.portfolio.update_tick("TSLA", current_price=250.0, ai_prediction=ai_pred)
        self.assertEqual(len(self.portfolio.positions), 1)
        pos = list(self.portfolio.positions.values())[0]
        self.assertEqual(pos["symbol"], "TSLA")
        self.assertEqual(pos["side"], "BUY")


if __name__ == "__main__":
    unittest.main()
