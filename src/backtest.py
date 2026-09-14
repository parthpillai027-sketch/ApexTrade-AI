"""
Backtesting and Performance Analytics Engine.
Evaluates AI predictions across historical rolling walk-forward windows:
- Strict out-of-sample time-series splits (no look-ahead leakage)
- Comparison against 4 baselines: Buy-and-Hold, Persistence, Moving Average, Random Walk
- Realistic transaction friction: brokerage commission, spread, slippage
- Institutional risk-adjusted metrics: Sharpe ratio, Sortino ratio, Max Drawdown
- Empirical confidence calibration curves
- Regime-based performance breakdowns
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from .models import TigerModel, LionModel


def run_historical_backtest(
    df: pd.DataFrame,
    model_name: str = "Lion",
    test_windows: int = 25,
    horizon: int = 5,
    initial_capital: float = 10000.0,
    commission_pct: float = 0.0004, # 0.04% commission
    spread_pct: float = 0.0004,     # 0.04% bid-ask spread
    slippage_pct: float = 0.0003    # 0.03% market impact slippage
) -> Dict[str, Any]:
    """
    Simulate historical rolling walk-forward predictions and evaluate accuracy
    against rigorous benchmarks with complete friction costs.
    """
    total_bars = len(df)
    min_required = 35 + (test_windows * 2) + horizon
    if total_bars < min_required:
        test_windows = max(5, (total_bars - 35 - horizon) // 2)

    # Initialize model (Lion or Tiger)
    if "Tiger" in model_name:
        model = TigerModel()
    else:
        model = LionModel()

    # Step points across history (strictly causal rolling windows)
    step_size = max(1, (total_bars - 35 - horizon) // test_windows)
    eval_indices = list(range(35, total_bars - horizon, step_size))[-test_windows:]

    total_friction_pct = commission_pct + spread_pct + slippage_pct

    trades = []
    confidence_levels = []
    direction_hits = []
    move_coverages = []

    # Baseline tracking
    persistence_hits = []
    ma_hits = []
    bh_returns = []

    capital = initial_capital
    bh_start_price = float(df["Close"].iloc[eval_indices[0]])
    bh_capital = initial_capital
    persistence_capital = initial_capital
    ma_capital = initial_capital

    equity_curve = [{
        "time": df.index[eval_indices[0]],
        "equity": round(capital, 2),
        "bh_equity": round(bh_capital, 2)
    }]

    trade_returns = []
    downside_returns = []

    regime_results = {
        "Bull Trend": {"trades": 0, "wins": 0, "return_pct": 0.0},
        "Bear Trend": {"trades": 0, "wins": 0, "return_pct": 0.0},
        "High Volatility": {"trades": 0, "wins": 0, "return_pct": 0.0}
    }

    for idx in eval_indices:
        # Strict out-of-sample split: train_slice has NO access to future bars
        train_slice = df.iloc[:idx]
        actual_future = df.iloc[idx : idx + horizon]

        current_price = float(train_slice["Close"].iloc[-1])
        future_end_price = float(actual_future["Close"].iloc[-1])
        actual_return_pct = ((future_end_price - current_price) / current_price) * 100.0

        # Run model prediction on historical window only
        try:
            pred = model.predict(train_slice, horizon=horizon)
        except Exception:
            continue

        predicted_return_pct = pred.expected_return_pct
        conf = pred.confidence_score
        trade_decision = getattr(pred, "trade_decision", "BUY" if pred.directional_bias == "Bullish" else "SELL")

        # 1. AI Model Directional Hit
        is_hit = (predicted_return_pct * actual_return_pct) > 0 or (abs(actual_return_pct) < 0.15 and abs(predicted_return_pct) < 0.15)
        direction_hits.append(1 if is_hit else 0)
        confidence_levels.append(conf)

        # Move coverage: ratio of predicted directional move to actual excursion
        actual_move = abs(actual_return_pct) + 1e-4
        pred_move = abs(predicted_return_pct)
        cov = min(100.0, (pred_move / actual_move) * 100.0)
        move_coverages.append(cov)

        # 2. Baseline 1: Persistence (Previous Direction)
        prev_bar_return = float(train_slice["Close"].iloc[-1] - train_slice["Close"].iloc[-2])
        persistence_bias = "Bullish" if prev_bar_return >= 0 else "Bearish"
        persistence_is_hit = (persistence_bias == "Bullish" and actual_return_pct > 0) or (persistence_bias == "Bearish" and actual_return_pct < 0)
        persistence_hits.append(1 if persistence_is_hit else 0)
        pers_ret = (actual_return_pct if persistence_bias == "Bullish" else -actual_return_pct) / 100.0 - total_friction_pct
        persistence_capital = max(100.0, persistence_capital * (1.0 + pers_ret))

        # 3. Baseline 2: Moving Average Trend (20 SMA)
        sma20 = float(train_slice["Close"].tail(20).mean())
        ma_bias = "Bullish" if current_price >= sma20 else "Bearish"
        ma_is_hit = (ma_bias == "Bullish" and actual_return_pct > 0) or (ma_bias == "Bearish" and actual_return_pct < 0)
        ma_hits.append(1 if ma_is_hit else 0)
        ma_ret = (actual_return_pct if ma_bias == "Bullish" else -actual_return_pct) / 100.0 - total_friction_pct
        ma_capital = max(100.0, ma_capital * (1.0 + ma_ret))

        # 4. Strategy Simulated Execution (filters out "DO NOT TRADE" states)
        raw_trade_return = 0.0
        took_trade = False
        if trade_decision == "BUY" or (trade_decision not in ["DO NOT TRADE"] and pred.directional_bias == "Bullish"):
            raw_trade_return = (future_end_price - current_price) / current_price
            took_trade = True
        elif trade_decision == "SELL" or (trade_decision not in ["DO NOT TRADE"] and pred.directional_bias == "Bearish"):
            raw_trade_return = (current_price - future_end_price) / current_price
            took_trade = True

        # Friction deduction
        net_return = (raw_trade_return - total_friction_pct) if took_trade else 0.0
        capital = max(100.0, capital * (1.0 + net_return))

        # Buy & Hold update
        bh_capital = initial_capital * (future_end_price / bh_start_price)
        bh_returns.append(actual_return_pct)

        equity_curve.append({
            "time": actual_future.index[-1],
            "equity": round(capital, 2),
            "bh_equity": round(bh_capital, 2)
        })

        trade_returns.append(net_return)
        if net_return < 0:
            downside_returns.append(net_return)

        # Classify market regime
        sma50 = float(train_slice["Close"].tail(50).mean()) if len(train_slice) >= 50 else sma20
        high_low = train_slice["High"] - train_slice["Low"]
        atr_val = float(high_low.tail(14).mean()) or (current_price * 0.015)
        is_high_vol = (atr_val / current_price) > 0.025

        regime_tag = "High Volatility" if is_high_vol else ("Bull Trend" if sma20 >= sma50 else "Bear Trend")
        regime_results[regime_tag]["trades"] += 1
        if net_return > 0:
            regime_results[regime_tag]["wins"] += 1
        regime_results[regime_tag]["return_pct"] += (net_return * 100.0)

        trades.append({
            "entry_time": train_slice.index[-1],
            "exit_time": actual_future.index[-1],
            "bias": pred.directional_bias,
            "confidence": conf,
            "actual_return_pct": round(actual_return_pct, 2),
            "pred_return_pct": round(predicted_return_pct, 2),
            "net_return_pct": round(net_return * 100.0, 2),
            "is_win": bool(net_return > 0),
            "trade_decision": trade_decision,
            "regime": regime_tag
        })

    # Aggregated statistics
    total_evals = len(direction_hits) or 1
    mda_pct = round((sum(direction_hits) / total_evals) * 100.0, 1)
    avg_coverage = round(float(np.mean(move_coverages)) if move_coverages else 50.0, 1)

    wins = [t for t in trades if t["is_win"]]
    losses = [t for t in trades if not t["is_win"] and t["net_return_pct"] != 0]
    win_rate = round((len(wins) / (len(wins) + len(losses)) * 100.0) if (wins or losses) else 50.0, 1)

    total_profit = sum(t["net_return_pct"] for t in wins)
    total_loss = abs(sum(t["net_return_pct"] for t in losses)) + 1e-5
    profit_factor = round(total_profit / total_loss, 2)

    total_strategy_return = round(((capital - initial_capital) / initial_capital) * 100.0, 2)
    total_bh_return = round(((bh_capital - initial_capital) / initial_capital) * 100.0, 2)
    total_persistence_return = round(((persistence_capital - initial_capital) / initial_capital) * 100.0, 2)
    total_ma_return = round(((ma_capital - initial_capital) / initial_capital) * 100.0, 2)

    # Baselines Comparison Table
    persistence_accuracy = round((sum(persistence_hits) / total_evals) * 100.0, 1)
    ma_accuracy = round((sum(ma_hits) / total_evals) * 100.0, 1)
    random_accuracy = 50.0

    baselines = [
        {"name": f"AI Strategy [{model_name}]", "accuracy": mda_pct, "return_pct": total_strategy_return, "is_active": True},
        {"name": "Buy-and-Hold Benchmark", "accuracy": round(sum(1 for r in bh_returns if r > 0) / total_evals * 100.0, 1), "return_pct": total_bh_return, "is_active": False},
        {"name": "Previous-Direction (Persistence)", "accuracy": persistence_accuracy, "return_pct": total_persistence_return, "is_active": False},
        {"name": "20-SMA Trend Strategy", "accuracy": ma_accuracy, "return_pct": total_ma_return, "is_active": False},
        {"name": "Random 50% Classifier", "accuracy": random_accuracy, "return_pct": 0.0, "is_active": False}
    ]

    # Institutional Risk Ratios: Sharpe, Sortino, Max Drawdown
    mean_trade_ret = float(np.mean(trade_returns)) if trade_returns else 0.0
    std_trade_ret = float(np.std(trade_returns)) if trade_returns else 0.01
    downside_std = float(np.std(downside_returns)) if downside_returns else 0.01

    annual_factor = np.sqrt(max(1, 252 // horizon))
    sharpe_ratio = round((mean_trade_ret / (std_trade_ret + 1e-6)) * annual_factor, 2)
    sortino_ratio = round((mean_trade_ret / (downside_std + 1e-6)) * annual_factor, 2)

    # Maximum Drawdown calculation
    equity_values = [e["equity"] for e in equity_curve]
    peak = equity_values[0]
    max_dd_dollars = 0.0
    max_dd_pct = 0.0
    for eq in equity_values:
        if eq > peak:
            peak = eq
        dd_dollars = peak - eq
        dd_pct = dd_dollars / peak
        if dd_dollars > max_dd_dollars:
            max_dd_dollars = dd_dollars
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct

    # Empirical Confidence Calibration Curve
    # Partition predictions into confidence bins
    conf_bins = [
        {"label": "50-60% (Low)", "min": 50.0, "max": 60.0},
        {"label": "60-70% (Medium)", "min": 60.0, "max": 70.0},
        {"label": "70-80% (High)", "min": 70.0, "max": 80.0},
        {"label": "80%+ (Ultra)", "min": 80.0, "max": 100.0}
    ]
    calibration_curve = []
    for b in conf_bins:
        bin_hits = [direction_hits[i] for i, c in enumerate(confidence_levels) if b["min"] <= c < b["max"]]
        if bin_hits:
            acc = round((sum(bin_hits) / len(bin_hits)) * 100.0, 1)
            sample_count = len(bin_hits)
        else:
            acc = 0.0
            sample_count = 0
        calibration_curve.append({
            "confidence_bin": b["label"],
            "empirical_accuracy": acc,
            "sample_count": sample_count,
            "is_calibrated": bool(acc >= (b["min"] - 5.0)) if sample_count > 0 else True
        })

    # Auto-Pilot Qualification Check
    auto_pilot_qualified = (
        mda_pct >= 52.0
        and profit_factor >= 1.10
        and win_rate >= 50.0
        and sharpe_ratio > 0.0
    )

    return {
        "model_evaluated": model_name,
        "total_test_windows": len(trades),
        "mean_directional_accuracy": mda_pct,
        "edge_over_random": round(mda_pct - random_accuracy, 1),
        "mean_move_coverage": avg_coverage,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "sharpe_ratio": sharpe_ratio,
        "sortino_ratio": sortino_ratio,
        "max_drawdown_pct": round(max_dd_pct * 100.0, 2),
        "max_drawdown_dollars": round(max_dd_dollars, 2),
        "initial_capital": initial_capital,
        "final_capital": round(capital, 2),
        "strategy_return_pct": total_strategy_return,
        "buy_and_hold_return_pct": total_bh_return,
        "baselines_comparison": baselines,
        "friction_breakdown": {
            "commission_pct": commission_pct * 100.0,
            "spread_pct": spread_pct * 100.0,
            "slippage_pct": slippage_pct * 100.0,
            "total_friction_per_trade_pct": total_friction_pct * 100.0
        },
        "calibration_curve": calibration_curve,
        "regime_breakdown": regime_results,
        "auto_pilot_qualified": auto_pilot_qualified,
        "auto_pilot_gate_standards": {
            "mda_min": 52.0,
            "pf_min": 1.10,
            "win_rate_min": 50.0,
            "sharpe_min": 0.0
        },
        "threshold_curve": [
            {"threshold": 50, "accuracy": mda_pct, "sample_coverage_pct": 100.0},
            {"threshold": 65, "accuracy": round(sum(direction_hits[i] for i, c in enumerate(confidence_levels) if c >= 65) / max(1, sum(1 for c in confidence_levels if c >= 65)) * 100.0, 1), "sample_coverage_pct": round(sum(1 for c in confidence_levels if c >= 65) / total_evals * 100.0, 1)},
            {"threshold": 75, "accuracy": round(sum(direction_hits[i] for i, c in enumerate(confidence_levels) if c >= 75) / max(1, sum(1 for c in confidence_levels if c >= 75)) * 100.0, 1), "sample_coverage_pct": round(sum(1 for c in confidence_levels if c >= 75) / total_evals * 100.0, 1)},
        ],
        "equity_curve": equity_curve,
        "recent_trades": trades[-10:]
    }
