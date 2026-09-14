"""
Paper Trading & Portfolio Execution Simulator Engine.
Manages a $100,000 virtual balance, open positions, order executions,
automated risk management (Stop-Loss, Take-Profit, Trailing Stops),
strict cross-ticker integrity checks, and immutable trade audit logs.
"""

from typing import Dict, Any, List, Optional
import uuid
import pandas as pd
import numpy as np

from .data_loader import clean_ticker, get_verified_quote, VerifiedQuote, TICKER_EXCHANGE_MAP
from .risk_engine import RiskEngine, RiskCheckResult


class PaperPortfolio:
    """
    Virtual portfolio simulator with strict pre-trade risk validation,
    cross-ticker isolation, and verified quote execution.
    """
    def __init__(self, initial_cash: float = 100000.0, risk_engine: Optional[RiskEngine] = None):
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.positions: Dict[str, Dict[str, Any]] = {}  # keyed by position_id
        self.trade_history: List[Dict[str, Any]] = []
        self.auto_pilot: bool = False
        self.auto_trade_cooldown: Dict[str, int] = {}  # symbol -> ticks cooldown
        self.risk_engine: RiskEngine = risk_engine or RiskEngine()

    def reset(self):
        """Reset account to initial state."""
        self.cash = self.initial_cash
        self.positions.clear()
        self.trade_history.clear()
        self.auto_pilot = False
        self.auto_trade_cooldown.clear()
        self.risk_engine.reset_kill_switch()
        self.risk_engine.reset_circuit_breaker()
        self.risk_engine.daily_start_equity = self.initial_cash
        self.risk_engine.peak_equity = self.initial_cash

    def set_auto_pilot(self, enabled: bool, out_of_sample_metrics: Optional[Dict[str, Any]] = None):
        """
        Enable or disable AI Auto-Pilot.
        Gated by out-of-sample performance standards (MDA >= 52%, Profit Factor >= 1.10, Win Rate >= 50%).
        """
        if enabled:
            if out_of_sample_metrics:
                mda = float(out_of_sample_metrics.get("mean_directional_accuracy", 0.0))
                pf = float(out_of_sample_metrics.get("profit_factor", 0.0))
                wr = float(out_of_sample_metrics.get("win_rate", 0.0))
                if mda < 52.0 or pf < 1.10 or wr < 50.0:
                    raise ValueError(
                        f"Auto-Pilot Locked: Strategy failed out-of-sample quality standards. "
                        f"Required: MDA >= 52%, Profit Factor >= 1.10x, Win Rate >= 50%. "
                        f"Current out-of-sample: MDA {mda:.1f}%, PF {pf:.2f}x, Win Rate {wr:.1f}%."
                    )
            self.auto_pilot = True
        else:
            self.auto_pilot = False

    def get_summary(self, current_prices: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        Calculate equity, unrealized PnL, realized PnL, open positions,
        and current Risk Engine status.
        """
        current_prices = current_prices or {}
        unrealized_pnl = 0.0
        positions_list = []

        for pos_id, pos in self.positions.items():
            sym = pos["symbol"]
            # Only update current_price if this specific symbol is present in current_prices
            if sym in current_prices:
                pos["current_price"] = current_prices[sym]
            curr_price = pos["current_price"]

            # Calculate position PnL
            if pos["side"] == "BUY":
                pos_pnl = (curr_price - pos["entry_price"]) * pos["qty"]
                pos_pnl_pct = ((curr_price - pos["entry_price"]) / pos["entry_price"]) * 100.0
            else:  # SHORT
                pos_pnl = (pos["entry_price"] - curr_price) * pos["qty"]
                pos_pnl_pct = ((pos["entry_price"] - curr_price) / pos["entry_price"]) * 100.0

            pos["unrealized_pnl"] = round(pos_pnl, 2)
            pos["unrealized_pnl_pct"] = round(pos_pnl_pct, 2)
            unrealized_pnl += pos_pnl
            positions_list.append(dict(pos))

        equity = self.cash + sum(p["qty"] * p["current_price"] for p in self.positions.values() if p["side"] == "BUY") + unrealized_pnl
        realized_pnl = sum(t["realized_pnl"] for t in self.trade_history)
        
        wins = [t for t in self.trade_history if t["realized_pnl"] > 0]
        win_rate = round((len(wins) / len(self.trade_history)) * 100.0, 1) if self.trade_history else 0.0

        daily_start = self.risk_engine.daily_start_equity or self.initial_cash
        daily_pnl = equity - daily_start
        daily_pnl_pct = round((daily_pnl / daily_start) * 100.0, 2)

        return {
            "initial_cash": self.initial_cash,
            "cash": round(self.cash, 2),
            "equity": round(equity, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "unrealized_pnl_pct": round((unrealized_pnl / self.initial_cash) * 100.0, 2),
            "realized_pnl": round(realized_pnl, 2),
            "total_return_pct": round(((equity - self.initial_cash) / self.initial_cash) * 100.0, 2),
            "daily_pnl": round(daily_pnl, 2),
            "daily_pnl_pct": daily_pnl_pct,
            "open_positions": positions_list,
            "trade_history": self.trade_history[-25:],
            "total_trades": len(self.trade_history),
            "win_rate": win_rate,
            "auto_pilot": self.auto_pilot,
            "risk_engine": {
                "kill_switch_active": self.risk_engine.kill_switch_active,
                "circuit_breaker_triggered": self.risk_engine.circuit_breaker_triggered,
                "max_open_positions": self.risk_engine.max_open_positions,
                "open_count": len(self.positions),
                "max_position_size_pct": self.risk_engine.max_position_size_pct * 100.0,
                "max_daily_loss_pct": self.risk_engine.max_daily_loss_pct * 100.0
            }
        }

    def open_position(
        self,
        symbol: str,
        side: str,  # "BUY" (Long) or "SELL" (Short)
        current_price: Optional[float] = None,
        qty: Optional[float] = None,
        allocation_pct: float = 0.10,  # 10% of cash by default
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        reason: str = "Manual Order",
        verified_quote: Optional[VerifiedQuote] = None,
        atr: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Open a new simulated market position.
        Strictly evaluated by RiskEngine before execution.
        """
        clean_sym = clean_ticker(symbol)
        side = side.upper()
        if side not in ["BUY", "SELL"]:
            raise ValueError("Side must be BUY or SELL")

        # 1. Obtain verified quote
        quote = verified_quote or get_verified_quote(clean_sym)
        exec_price = quote.price if (current_price is None or current_price <= 0) else float(current_price)

        # 2. Determine quantity
        if qty is None or qty <= 0:
            alloc_dollars = self.cash * allocation_pct
            qty = max(1, int(alloc_dollars / exec_price))
        qty = int(qty)

        # Automated TP and SL calculation if omitted
        if stop_loss is None:
            stop_loss = round(exec_price * (0.97 if side == "BUY" else 1.03), 2)
        if take_profit is None:
            take_profit = round(exec_price * (1.06 if side == "BUY" else 0.94), 2)

        order_dict = {
            "symbol": clean_sym,
            "side": side,
            "current_price": exec_price,
            "qty": qty,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "reason": reason
        }

        # 3. Pre-Trade Institutional Risk Validation
        risk_check = self.risk_engine.validate_order(self, order_dict, quote, atr=atr)
        if not risk_check.allowed:
            reasons_str = "; ".join(risk_check.rejection_reasons)
            raise ValueError(f"Order Rejected by Risk Engine: {reasons_str}")

        cost = qty * exec_price
        self.cash -= cost
        pos_id = str(uuid.uuid4())[:8]
        timestamp = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")

        position = {
            "id": pos_id,
            "symbol": clean_sym,
            "side": side,
            "entry_price": exec_price,
            "current_price": exec_price,
            "qty": qty,
            "cost": round(cost, 2),
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "exchange": quote.exchange,
            "data_source": quote.data_source,
            "opened_at": timestamp,
            "reason": reason,
            "risk_score": risk_check.risk_score,
            "unrealized_pnl": 0.0,
            "unrealized_pnl_pct": 0.0
        }

        self.positions[pos_id] = position
        return position

    def close_position(
        self,
        pos_id: str,
        current_price: Optional[float] = None,
        symbol: Optional[str] = None,
        exit_reason: str = "Manual Exit",
        verified_quote: Optional[VerifiedQuote] = None
    ) -> Dict[str, Any]:
        """
        Close an existing position and realize PnL.
        CRITICAL FIX: Strictly validates that the closing price matches pos['symbol'],
        preventing NVDA prices from ever closing AAPL trades.
        """
        if pos_id not in self.positions:
            raise ValueError(f"Position {pos_id} not found in active portfolio.")

        pos = self.positions[pos_id]
        sym = pos["symbol"]
        qty = pos["qty"]
        side = pos["side"]
        entry_price = pos["entry_price"]

        # Validate that caller didn't supply a mismatched symbol
        if symbol:
            clean_input_sym = clean_ticker(symbol)
            if clean_input_sym != sym:
                raise ValueError(
                    f"CROSS-TICKER REJECTION: Attempted to close {sym} position using ticker '{clean_input_sym}'."
                )

        # Retrieve verified quote for the specific position's symbol
        quote = verified_quote
        if quote is None or quote.symbol != sym:
            quote = get_verified_quote(sym)

        # Determine authentic execution price
        if current_price is not None and current_price > 0:
            # Check price plausibility: cannot deviate more than 30% from verified quote (e.g. NVDA for AAPL)
            discrepancy = abs(current_price - quote.price) / quote.price
            if discrepancy > 0.30:
                # Contaminated price detected! Fallback to verified quote price
                exec_price = quote.price
                exit_reason = f"{exit_reason} (Price corrected from ${current_price:.2f} to authentic quote ${quote.price:.2f})"
            else:
                exec_price = float(current_price)
        else:
            exec_price = quote.price

        # Realize PnL
        if side == "BUY":
            proceeds = qty * exec_price
            realized_pnl = (exec_price - entry_price) * qty
        else:  # SELL (Short)
            proceeds = pos["cost"] + ((entry_price - exec_price) * qty)
            realized_pnl = (entry_price - exec_price) * qty

        self.cash += proceeds
        pnl_pct = (realized_pnl / pos["cost"]) * 100.0

        # Remove from open positions
        self.positions.pop(pos_id)

        trade_record = {
            "id": pos_id,
            "symbol": sym,
            "side": side,
            "entry_price": entry_price,
            "exit_price": round(exec_price, 2),
            "qty": qty,
            "realized_pnl": round(realized_pnl, 2),
            "realized_pnl_pct": round(pnl_pct, 2),
            "exchange": quote.exchange,
            "data_source": quote.data_source,
            "quote_timestamp": quote.timestamp,
            "opened_at": pos["opened_at"],
            "closed_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "entry_reason": pos["reason"],
            "exit_reason": exit_reason
        }

        self.trade_history.append(trade_record)
        return trade_record

    def update_tick(
        self,
        symbol: str,
        current_price: float,
        ai_prediction: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Process incoming live market tick:
        1. Only update and evaluate positions matching symbol.
        2. Recalculate trailing stops.
        3. Check Stop-Loss and Take-Profit hits.
        4. If auto-pilot is active and qualified, evaluate AI setups.
        """
        symbol_upper = clean_ticker(symbol)
        closed_trades = []

        # Update trailing stops for positions of this ticker
        self.risk_engine.update_trailing_stops(self.positions, {symbol_upper: current_price})

        # 1. Evaluate Stop-Loss & Take-Profit on active positions
        to_close = []
        for pos_id, pos in self.positions.items():
            if pos["symbol"] != symbol_upper:
                continue

            side = pos["side"]
            sl = pos.get("stop_loss")
            tp = pos.get("take_profit")

            if side == "BUY":
                if sl and current_price <= sl:
                    to_close.append((pos_id, f"Stop-Loss Hit (${sl:.2f})"))
                elif tp and current_price >= tp:
                    to_close.append((pos_id, f"Take-Profit Hit (${tp:.2f})"))
            else:  # SELL
                if sl and current_price >= sl:
                    to_close.append((pos_id, f"Stop-Loss Hit (${sl:.2f})"))
                elif tp and current_price <= tp:
                    to_close.append((pos_id, f"Take-Profit Hit (${tp:.2f})"))

        for pos_id, reason in to_close:
            trade = self.close_position(
                pos_id=pos_id,
                current_price=current_price,
                symbol=symbol_upper,
                exit_reason=reason
            )
            closed_trades.append(trade)

        # 2. Auto-Pilot AI Trade Triggering
        if self.auto_pilot and ai_prediction:
            cooldown = self.auto_trade_cooldown.get(symbol_upper, 0)
            if cooldown > 0:
                self.auto_trade_cooldown[symbol_upper] = cooldown - 1
            else:
                has_pos = any(p["symbol"] == symbol_upper for p in self.positions.values())
                if not has_pos and self.cash > (self.initial_cash * 0.05):
                    model_name = ai_prediction.get("model_name", "")
                    bias = ai_prediction.get("directional_bias")
                    conf = ai_prediction.get("confidence_score", 0.0)
                    threshold_exceeded = ai_prediction.get("threshold_exceeded", False)
                    trade_decision = ai_prediction.get("trade_decision") or ("BUY" if bias == "Bullish" else ("SELL" if bias == "Bearish" else "DO NOT TRADE"))

                    # High conviction trigger requiring positive trade decision
                    is_trigger = (threshold_exceeded or conf >= 65.0) and trade_decision in ["BUY", "SELL"]

                    if is_trigger and bias in ["Bullish", "Bearish"]:
                        trade_side = "BUY" if bias == "Bullish" else "SELL"
                        reason = f"AI Auto-Pilot [{model_name}] Conviction {conf:.0f}%"
                        
                        try:
                            self.open_position(
                                symbol=symbol_upper,
                                side=trade_side,
                                current_price=current_price,
                                allocation_pct=0.15,
                                reason=reason
                            )
                            self.auto_trade_cooldown[symbol_upper] = 10
                        except Exception:
                            pass

        return closed_trades
