"""
Unit test verifying the fix for cross-ticker price contamination.
Ensures an AAPL position cannot be contaminated or closed by an NVDA price.
"""

import unittest
from src.portfolio import PaperPortfolio
from src.data_loader import VerifiedQuote, get_verified_quote


class TestCrossTickerFix(unittest.TestCase):
    def setUp(self):
        self.portfolio = PaperPortfolio(initial_cash=100000.0)

    def test_cross_ticker_close_with_mismatched_symbol_rejected(self):
        """Verify that passing symbol='NVDA' to close an AAPL position is rejected."""
        pos = self.portfolio.open_position(
            symbol="AAPL",
            side="BUY",
            current_price=224.50,
            qty=20,
            stop_loss=215.0,
            take_profit=240.0
        )
        self.assertEqual(pos["symbol"], "AAPL")

        # Attempting to close with mismatched symbol "NVDA" must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            self.portfolio.close_position(
                pos_id=pos["id"],
                symbol="NVDA",
                current_price=119.54,
                exit_reason="Manual Close from NVDA Chart"
            )
        self.assertIn("CROSS-TICKER REJECTION", str(ctx.exception))
        # Position must remain open
        self.assertIn(pos["id"], self.portfolio.positions)

    def test_cross_ticker_contaminated_price_auto_corrected(self):
        """
        If a client sends NVDA price ($119.54) while closing an AAPL position ($224.50),
        the portfolio detects >30% price discrepancy and executes at the verified AAPL price.
        """
        pos = self.portfolio.open_position(
            symbol="AAPL",
            side="BUY",
            current_price=224.50,
            qty=10,
            stop_loss=210.0,
            take_profit=245.0
        )

        # Close with contaminated NVDA price ($119.54)
        trade = self.portfolio.close_position(
            pos_id=pos["id"],
            current_price=119.54,  # NVDA's price!
            exit_reason="Client clicked close"
        )

        # The exit price must NOT be $119.54; it must be corrected to authentic AAPL price ($224.50)
        self.assertEqual(trade["symbol"], "AAPL")
        self.assertNotEqual(trade["exit_price"], 119.54)
        self.assertGreater(trade["exit_price"], 200.0)
        self.assertIn("Price corrected", trade["exit_reason"])
        self.assertIn("exchange", trade)
        self.assertIn("data_source", trade)

    def test_open_position_cross_ticker_quote_mismatch(self):
        """Risk Engine must reject opening AAPL order with NVDA quote object."""
        nvda_quote = VerifiedQuote(
            symbol="NVDA",
            price=119.80,
            bid=119.75,
            ask=119.85,
            timestamp="2026-09-14 12:00:00 UTC",
            exchange="NASDAQ",
            data_source="Yahoo Finance",
            is_live=False,
            is_delayed=True,
            is_simulated=False
        )

        with self.assertRaises(ValueError) as ctx:
            self.portfolio.open_position(
                symbol="AAPL",
                side="BUY",
                current_price=224.50,
                qty=10,
                verified_quote=nvda_quote
            )
        self.assertIn("CROSS-TICKER CONTAMINATION REJECTED", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
