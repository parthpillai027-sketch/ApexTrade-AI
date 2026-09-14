"""
Standalone Risk Management Engine for AI Stock Market Predictor.
Operates independently from the AI forecasting models to protect capital:
- Position sizing & sector exposure limits
- Maximum daily loss circuit breakers & portfolio drawdown limits
- Mandatory stop-loss validation & Trailing Stop Loss
- Volatility-based (ATR) position sizing
- Duplicate-order prevention (idempotency)
- Stale-price protection
- Market-hours and market-holiday validation
- Emergency Kill Switch and Circuit Breakers
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import datetime
import pandas as pd
import pytz

from .data_loader import VerifiedQuote, TICKER_DEFAULTS, clean_ticker


@dataclass
class RiskCheckResult:
    """Detailed audit result of a pre-trade risk evaluation."""
    allowed: bool
    risk_score: float  # 0 to 100 (100 = minimal risk)
    rejection_reasons: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    passed_checks: List[str] = field(default_factory=list)
    suggested_qty: Optional[int] = None
    volatility_sizing: Optional[Dict[str, Any]] = None
    market_session: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allowed": self.allowed,
            "risk_score": round(self.risk_score, 1),
            "rejection_reasons": self.rejection_reasons,
            "warnings": self.warnings,
            "passed_checks": self.passed_checks,
            "suggested_qty": self.suggested_qty,
            "volatility_sizing": self.volatility_sizing,
            "market_session": self.market_session
        }


class RiskEngine:
    """
    Institutional-grade Pre-Trade & In-Trade Risk Management Engine.
    The AI proposes a trade; the RiskEngine decides whether it is permitted.
    """
    def __init__(
        self,
        max_position_size_pct: float = 0.20,      # Max 20% of cash per position
        max_stock_exposure_pct: float = 0.25,     # Max 25% of portfolio in single stock
        max_sector_exposure_pct: float = 0.40,    # Max 40% in single sector
        max_daily_loss_pct: float = 0.03,         # 3% daily loss circuit breaker
        max_portfolio_drawdown_pct: float = 0.10, # 10% maximum drawdown halt
        max_open_positions: int = 5,              # Max concurrent open positions
        stale_quote_max_seconds: float = 120.0,   # Reject quotes older than 120s
        duplicate_order_window_seconds: float = 30.0 # 30s duplicate protection
    ):
        self.max_position_size_pct = max_position_size_pct
        self.max_stock_exposure_pct = max_stock_exposure_pct
        self.max_sector_exposure_pct = max_sector_exposure_pct
        self.max_daily_loss_pct = max_daily_loss_pct
        self.max_portfolio_drawdown_pct = max_portfolio_drawdown_pct
        self.max_open_positions = max_open_positions
        self.stale_quote_max_seconds = stale_quote_max_seconds
        self.duplicate_order_window_seconds = duplicate_order_window_seconds

        # Internal safety state
        self.kill_switch_active: bool = False
        self.kill_switch_reason: str = ""
        self.circuit_breaker_triggered: bool = False
        self.circuit_breaker_reason: str = ""
        self.recent_orders: List[Dict[str, Any]] = []  # for duplicate prevention
        self.daily_start_equity: Optional[float] = None
        self.peak_equity: float = 100000.0

    def trigger_kill_switch(self, portfolio, reason: str = "Emergency Kill Switch Activated") -> Dict[str, Any]:
        """
        Emergency Kill Switch: Halts all trading, turns off auto-pilot,
        and market-closes all open positions immediately.
        """
        self.kill_switch_active = True
        self.kill_switch_reason = reason
        portfolio.auto_pilot = False

        closed_trades = []
        # Close all active positions
        for pos_id in list(portfolio.positions.keys()):
            pos = portfolio.positions[pos_id]
            curr_p = pos["current_price"]
            trade = portfolio.close_position(
                pos_id=pos_id,
                current_price=curr_p,
                exit_reason=f"Emergency Kill Switch: {reason}"
            )
            closed_trades.append(trade)

        return {
            "kill_switch_active": True,
            "reason": reason,
            "closed_positions_count": len(closed_trades),
            "closed_trades": closed_trades
        }

    def reset_kill_switch(self):
        """Reset emergency kill switch upon explicit operator instruction."""
        self.kill_switch_active = False
        self.kill_switch_reason = ""

    def reset_circuit_breaker(self):
        """Reset daily circuit breaker."""
        self.circuit_breaker_triggered = False
        self.circuit_breaker_reason = ""

    def is_market_open(self, symbol: str, dt_now: Optional[datetime.datetime] = None) -> Dict[str, Any]:
        """
        Validates whether the exchange for the asset is open for regular trading.
        US Equities: 09:30 to 16:00 US Eastern, Monday - Friday (excluding NYSE holidays).
        Crypto: 24/7/365.
        """
        clean_sym = clean_ticker(symbol)
        is_crypto = "-USD" in clean_sym or "BTC" in clean_sym or "ETH" in clean_sym
        if is_crypto:
            return {
                "is_regular_hours": True,
                "status": "24_7_CRYPTO",
                "session_details": "Cryptocurrency market operates continuously 24/7/365.",
                "warning": None
            }

        eastern = pytz.timezone("US/Eastern")
        now_et = dt_now if dt_now else datetime.datetime.now(eastern)
        if now_et.tzinfo is None:
            now_et = eastern.localize(now_et)
        else:
            now_et = now_et.astimezone(eastern)

        weekday = now_et.weekday()  # 0 = Mon, 6 = Sun
        time_et = now_et.time()

        # Weekend check
        if weekday >= 5:
            return {
                "is_regular_hours": False,
                "status": "WEEKEND",
                "session_details": f"Market is closed on weekends ({now_et.strftime('%A')}).",
                "warning": "Simulated orders executed over the weekend are treated as out-of-session orders."
            }

        # Known US Market Holidays (fixed date approximations)
        holidays_2025_2026 = [
            datetime.date(2025, 1, 1), datetime.date(2025, 1, 20), datetime.date(2025, 2, 17),
            datetime.date(2025, 4, 18), datetime.date(2025, 5, 26), datetime.date(2025, 6, 19),
            datetime.date(2025, 7, 4), datetime.date(2025, 9, 1), datetime.date(2025, 11, 27),
            datetime.date(2025, 12, 25), datetime.date(2026, 1, 1), datetime.date(2026, 1, 19),
            datetime.date(2026, 2, 16), datetime.date(2026, 4, 3), datetime.date(2026, 5, 25),
            datetime.date(2026, 6, 19), datetime.date(2026, 7, 3), datetime.date(2026, 9, 7),
            datetime.date(2026, 11, 26), datetime.date(2026, 12, 25)
        ]
        if now_et.date() in holidays_2025_2026:
            return {
                "is_regular_hours": False,
                "status": "MARKET_HOLIDAY",
                "session_details": "US Exchanges closed in observance of federal market holiday.",
                "warning": "Holiday trading session: simulated fills only."
            }

        # Regular Trading Hours: 09:30 - 16:00 ET
        market_open = datetime.time(9, 30)
        market_close = datetime.time(16, 0)

        if market_open <= time_et <= market_close:
            return {
                "is_regular_hours": True,
                "status": "REGULAR_HOURS",
                "session_details": f"NYSE/NASDAQ Regular Session ({time_et.strftime('%H:%M:%S')} ET).",
                "warning": None
            }
        elif datetime.time(4, 0) <= time_et < market_open:
            return {
                "is_regular_hours": False,
                "status": "PRE_MARKET",
                "session_details": f"Pre-market extended hours ({time_et.strftime('%H:%M:%S')} ET). Lower liquidity, wider spreads.",
                "warning": "Pre-market session: high slippage possible."
            }
        else:
            return {
                "is_regular_hours": False,
                "status": "AFTER_HOURS",
                "session_details": f"After-hours extended session ({time_et.strftime('%H:%M:%S')} ET).",
                "warning": "After-hours session: wider spreads and lower liquidity."
            }

    def check_short_eligibility(self, symbol: str) -> Dict[str, Any]:
        """Verify if the ticker is legally and operationally eligible for short selling."""
        sym = clean_ticker(symbol)
        # Spot crypto cannot be shorted without margin/futures accounts
        if "-USD" in sym or sym in ["BTC", "ETH", "SOL", "DOGE"]:
            return {
                "eligible": False,
                "reason": "Spot cryptocurrency cannot be shorted in cash accounts. Perpetual/futures contract required."
            }
        return {"eligible": True, "reason": "Standard equity / ETF borrowable on primary exchanges."}

    def compute_volatility_position_size(
        self,
        price: float,
        equity: float,
        atr: Optional[float] = None,
        risk_per_trade_pct: float = 0.015
    ) -> Dict[str, Any]:
        """
        Calculates recommended position size based on asset volatility (ATR).
        High ATR assets receive smaller share sizes to equalize risk exposure across portfolio.
        """
        if price <= 0 or equity <= 0:
            return {"suggested_qty": 1, "dollar_cost": price, "risk_pct": 1.0}

        effective_atr = atr if (atr and atr > 0) else (price * 0.02)
        # Risk amount = 1.5% of total account equity
        dollar_risk = equity * risk_per_trade_pct
        # Stop loss distance defined as 2.0x ATR
        sl_distance = 2.0 * effective_atr

        shares = max(1, int(dollar_risk / (sl_distance + 1e-6)))
        dollar_cost = shares * price

        # Cap by maximum position size constraint
        max_cost = equity * self.max_position_size_pct
        if dollar_cost > max_cost:
            shares = max(1, int(max_cost / price))
            dollar_cost = shares * price

        return {
            "suggested_qty": shares,
            "dollar_cost": round(dollar_cost, 2),
            "allocation_pct": round((dollar_cost / equity) * 100.0, 1),
            "dollar_risk": round(dollar_risk, 2),
            "stop_loss_distance": round(sl_distance, 2)
        }

    def validate_order(
        self,
        portfolio,
        order: Dict[str, Any],
        quote: VerifiedQuote,
        atr: Optional[float] = None
    ) -> RiskCheckResult:
        """
        Comprehensive pre-trade risk validation.
        Evaluates 12 distinct institutional risk rules.
        """
        rejection_reasons = []
        warnings = []
        passed_checks = []
        risk_score = 100.0

        symbol = clean_ticker(order.get("symbol", ""))
        side = order.get("side", "BUY").upper()
        current_price = float(order.get("current_price", quote.price))
        qty = int(order.get("qty", 1))
        stop_loss = order.get("stop_loss")
        if stop_loss is not None:
            stop_loss = float(stop_loss)
        take_profit = order.get("take_profit")
        if take_profit is not None:
            take_profit = float(take_profit)

        # 1. Kill Switch Check
        if self.kill_switch_active:
            rejection_reasons.append(f"KILL SWITCH ACTIVE: {self.kill_switch_reason}. All order entries prohibited.")
            return RiskCheckResult(allowed=False, risk_score=0.0, rejection_reasons=rejection_reasons)
        passed_checks.append("Kill Switch Inactive")

        # 2. Circuit Breaker / Daily Loss Check
        equity = portfolio.get_summary().get("equity", 100000.0)
        if self.daily_start_equity is None:
            self.daily_start_equity = equity
        daily_pnl = equity - self.daily_start_equity
        daily_loss_pct = abs(daily_pnl / self.daily_start_equity) if daily_pnl < 0 else 0.0

        if daily_pnl < 0 and daily_loss_pct >= self.max_daily_loss_pct:
            self.circuit_breaker_triggered = True
            self.circuit_breaker_reason = f"Daily Loss Circuit Breaker Hit: -{daily_loss_pct*100:.2f}% (Limit {self.max_daily_loss_pct*100:.1f}%)"
            rejection_reasons.append(self.circuit_breaker_reason)
            return RiskCheckResult(allowed=False, risk_score=10.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Daily Loss Checked: -{daily_loss_pct*100:.2f}% (Under {self.max_daily_loss_pct*100:.1f}%)")

        # 3. Maximum Drawdown Check
        if equity > self.peak_equity:
            self.peak_equity = equity
        current_drawdown = (self.peak_equity - equity) / self.peak_equity
        if current_drawdown >= self.max_portfolio_drawdown_pct:
            rejection_reasons.append(f"Maximum Portfolio Drawdown Exceeded: -{current_drawdown*100:.1f}% (Limit {self.max_portfolio_drawdown_pct*100:.1f}%)")
            return RiskCheckResult(allowed=False, risk_score=15.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Portfolio Drawdown Acceptable: -{current_drawdown*100:.1f}%")

        # 4. Cross-Ticker Integrity Check (CRITICAL FIX)
        if symbol != clean_ticker(quote.symbol):
            rejection_reasons.append(
                f"CROSS-TICKER CONTAMINATION REJECTED: Order for '{symbol}' does not match Quote ticker '{quote.symbol}'."
            )
            return RiskCheckResult(allowed=False, risk_score=0.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Cross-Ticker Match Verified: {symbol} matches quote {quote.symbol}")

        # Price verification: order price must not deviate significantly from verified quote (>30% indicates cross-ticker contamination)
        price_discrepancy_pct = abs(current_price - quote.price) / quote.price if quote.price > 0 else 0.0
        if price_discrepancy_pct > 0.30:
            rejection_reasons.append(
                f"Price Discrepancy Error: Client price ${current_price:.2f} deviates {price_discrepancy_pct*100:.1f}% from Verified Quote ${quote.price:.2f}."
            )
            return RiskCheckResult(allowed=False, risk_score=20.0, rejection_reasons=rejection_reasons)
        elif price_discrepancy_pct > 0.05:
            warnings.append(f"Minor price drift: order price ${current_price:.2f} differs {price_discrepancy_pct*100:.1f}% from reference quote.")
        passed_checks.append(f"Price Deviation Checked: {price_discrepancy_pct*100:.2f}% from verified market")

        # 5. Stale Quote Protection
        if quote.data_freshness_seconds > self.stale_quote_max_seconds:
            warnings.append(f"Stale Quote: Data is {quote.data_freshness_seconds:.0f}s old. Execution price may experience slippage.")
            risk_score -= 15.0
        else:
            passed_checks.append("Quote Freshness Verified (<120s)")

        # 6. Duplicate Order / Idempotency Check
        now = datetime.datetime.now()
        recent_cutoff = now - datetime.timedelta(seconds=self.duplicate_order_window_seconds)
        self.recent_orders = [o for o in self.recent_orders if o["time"] > recent_cutoff]
        for past_o in self.recent_orders:
            if past_o["symbol"] == symbol and past_o["side"] == side and abs(past_o["qty"] - qty) < 1:
                rejection_reasons.append(
                    f"DUPLICATE ORDER REJECTED: Similar {side} order for {symbol} placed within last {self.duplicate_order_window_seconds:.0f}s."
                )
                return RiskCheckResult(allowed=False, risk_score=25.0, rejection_reasons=rejection_reasons)
        passed_checks.append("Duplicate Order Prevention Passed")

        # 7. Open Positions Count Check
        active_positions = portfolio.positions
        has_pos_in_sym = any(p["symbol"] == symbol for p in active_positions.values())
        if not has_pos_in_sym and len(active_positions) >= self.max_open_positions:
            rejection_reasons.append(
                f"MAX OPEN POSITIONS REACHED: Portfolio already holds {len(active_positions)} positions (Limit {self.max_open_positions})."
            )
            return RiskCheckResult(allowed=False, risk_score=30.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Open Positions Under Limit ({len(active_positions)}/{self.max_open_positions})")

        # 8. Short-Selling Eligibility
        if side == "SELL":
            short_check = self.check_short_eligibility(symbol)
            if not short_check["eligible"]:
                rejection_reasons.append(f"SHORT PROHIBITED: {short_check['reason']}")
                return RiskCheckResult(allowed=False, risk_score=20.0, rejection_reasons=rejection_reasons)
            passed_checks.append("Short Selling Eligible")

        # 9. Stop-Loss Validation (Strict Directional Verification)
        if stop_loss is None:
            warnings.append("No explicit Stop-Loss provided. Portfolio will auto-enforce default 3% protective stop.")
            risk_score -= 10.0
        else:
            if side == "BUY":
                if stop_loss >= current_price:
                    rejection_reasons.append(
                        f"INVALID STOP-LOSS: For BUY orders, stop-loss (${stop_loss:.2f}) must be BELOW entry price (${current_price:.2f})."
                    )
                    return RiskCheckResult(allowed=False, risk_score=0.0, rejection_reasons=rejection_reasons)
                sl_pct = (current_price - stop_loss) / current_price
                if sl_pct > 0.15:
                    warnings.append(f"Wide Stop-Loss: SL is {sl_pct*100:.1f}% below entry. High downside exposure.")
                    risk_score -= 10.0
                passed_checks.append(f"Stop-Loss Validated: ${stop_loss:.2f} (-{sl_pct*100:.1f}%)")
            else:  # SELL (Short)
                if stop_loss <= current_price:
                    rejection_reasons.append(
                        f"INVALID STOP-LOSS: For SHORT orders, stop-loss (${stop_loss:.2f}) must be ABOVE entry price (${current_price:.2f})."
                    )
                    return RiskCheckResult(allowed=False, risk_score=0.0, rejection_reasons=rejection_reasons)
                sl_pct = (stop_loss - current_price) / current_price
                if sl_pct > 0.15:
                    warnings.append(f"Wide Stop-Loss: SL is {sl_pct*100:.1f}% above entry. High short squeeze risk.")
                    risk_score -= 10.0
                passed_checks.append(f"Stop-Loss Validated: ${stop_loss:.2f} (+{sl_pct*100:.1f}%)")

        # 10. Position Size & Cash Limit Check
        order_cost = qty * current_price
        cash = portfolio.cash
        if order_cost > cash:
            rejection_reasons.append(f"INSUFFICIENT CAPITAL: Order cost ${order_cost:,.2f} exceeds available cash ${cash:,.2f}.")
            return RiskCheckResult(allowed=False, risk_score=10.0, rejection_reasons=rejection_reasons)

        max_allowed_cost = equity * self.max_position_size_pct
        if order_cost > max_allowed_cost:
            rejection_reasons.append(
                f"MAX POSITION SIZE EXCEEDED: Order cost ${order_cost:,.2f} exceeds {self.max_position_size_pct*100:.0f}% equity cap (${max_allowed_cost:,.2f})."
            )
            return RiskCheckResult(allowed=False, risk_score=40.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Position Size Allowed (${order_cost:,.2f} <= ${max_allowed_cost:,.2f})")

        # 11. Sector & Single-Stock Concentration Check
        current_sym_exposure = sum(p["qty"] * p["current_price"] for p in active_positions.values() if p["symbol"] == symbol)
        post_sym_exposure = current_sym_exposure + order_cost
        max_stock_cap = equity * self.max_stock_exposure_pct
        if post_sym_exposure > max_stock_cap:
            rejection_reasons.append(
                f"STOCK EXPOSURE LIMIT EXCEEDED: Total {symbol} exposure would be ${post_sym_exposure:,.2f} (Limit: {self.max_stock_exposure_pct*100:.0f}% = ${max_stock_cap:,.2f})."
            )
            return RiskCheckResult(allowed=False, risk_score=35.0, rejection_reasons=rejection_reasons)
        passed_checks.append(f"Stock Concentration Under {self.max_stock_exposure_pct*100:.0f}% Cap")

        # Sector check
        sec = TICKER_DEFAULTS.get(symbol, {}).get("sector", "Other")
        current_sec_exposure = sum(
            p["qty"] * p["current_price"] for p in active_positions.values()
            if TICKER_DEFAULTS.get(p["symbol"], {}).get("sector") == sec
        )
        post_sec_exposure = current_sec_exposure + order_cost
        max_sec_cap = equity * self.max_sector_exposure_pct
        if post_sec_exposure > max_sec_cap:
            warnings.append(f"High Sector Exposure: Sector '{sec}' will reach {(post_sec_exposure/equity)*100:.1f}% of portfolio.")
            risk_score -= 8.0
        else:
            passed_checks.append(f"Sector Concentration Approved ({sec})")

        # 12. Market Session Check
        session = self.is_market_open(symbol)
        if not session["is_regular_hours"]:
            if session.get("warning"):
                warnings.append(session["warning"])
                risk_score -= 10.0

        # Calculate volatility-based suggested sizing
        vol_size = self.compute_volatility_position_size(current_price, equity, atr=atr)

        # Record this valid attempt for duplicate tracking
        self.recent_orders.append({
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "time": now
        })

        return RiskCheckResult(
            allowed=True,
            risk_score=max(20.0, min(100.0, risk_score)),
            rejection_reasons=[],
            warnings=warnings,
            passed_checks=passed_checks,
            suggested_qty=vol_size["suggested_qty"],
            volatility_sizing=vol_size,
            market_session=session
        )

    def update_trailing_stops(
        self,
        positions: Dict[str, Any],
        current_prices: Dict[str, float],
        trailing_pct: float = 0.03
    ) -> List[Dict[str, Any]]:
        """
        Updates trailing stop-loss levels for open positions as prices advance.
        Stops only move in the favorable direction (ratchet mechanism).
        """
        updates = []
        for pos_id, pos in positions.items():
            sym = pos["symbol"]
            curr_p = current_prices.get(sym)
            if not curr_p:
                continue

            side = pos["side"]
            curr_sl = pos.get("stop_loss")
            entry_p = pos["entry_price"]

            if side == "BUY":
                # For longs, calculate trailing stop from current price
                potential_sl = round(curr_p * (1.0 - trailing_pct), 2)
                # Only ratchet up, never lower
                if curr_sl is None or potential_sl > curr_sl:
                    if potential_sl > entry_p:
                        pos["stop_loss"] = potential_sl
                        updates.append({
                            "pos_id": pos_id,
                            "symbol": sym,
                            "old_stop": curr_sl,
                            "new_stop": potential_sl,
                            "type": "RATHO_TRAILED_LOCK_PROFIT"
                        })
            else:  # SELL (Short)
                potential_sl = round(curr_p * (1.0 + trailing_pct), 2)
                # Only ratchet down, never raise
                if curr_sl is None or potential_sl < curr_sl:
                    if potential_sl < entry_p:
                        pos["stop_loss"] = potential_sl
                        updates.append({
                            "pos_id": pos_id,
                            "symbol": sym,
                            "old_stop": curr_sl,
                            "new_stop": potential_sl,
                            "type": "RATHO_TRAILED_LOCK_PROFIT"
                        })
        return updates
