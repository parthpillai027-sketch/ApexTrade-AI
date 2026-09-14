"""
Full-Stack REST API Server for ApexTrade AI.
Provides endpoints for market data, indicators, patterns, Big Cat model predictions,
Depth of Market (DoM) orderbook simulation, walk-forward backtesting,
institutional Risk Management Engine, and non-custodial paper trading.
"""

import os
from typing import Any, Dict, Optional
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask.json.provider import DefaultJSONProvider

from src.data_loader import (
    fetch_stock_data, fetch_ticker_info, POPULAR_TICKERS, clean_ticker,
    VerifiedQuote, get_verified_quote, TICKER_EXCHANGE_MAP
)
from src.indicators import add_all_indicators
from src.patterns import detect_candlestick_patterns, detect_support_resistance_pivots, detect_breakout_events
from src.models import get_model_suite
from src.orderbook import generate_simulated_orderbook
from src.backtest import run_historical_backtest
from src.portfolio import PaperPortfolio
from src.risk_engine import RiskEngine


class NumpyJSONProvider(DefaultJSONProvider):
    """Custom Flask JSON provider that converts NumPy types to native Python types."""
    def default(self, obj):
        if isinstance(obj, (np.bool_, np.bool)):
            return bool(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist"))

app = Flask(
    __name__,
    static_folder=FRONTEND_DIST if os.path.exists(FRONTEND_DIST) else None,
    static_url_path="/"
)
app.json = NumpyJSONProvider(app)
CORS(app)

model_suite = get_model_suite()
risk_engine = RiskEngine()
portfolio = PaperPortfolio(initial_cash=100000.0, risk_engine=risk_engine)


@app.route("/", methods=["GET"])
def index():
    """Serve the Web Application UI directly or return backend operational status."""
    if os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({
        "service": "ApexTrade AI Backend API",
        "status": "online",
        "version": "2.0.0",
        "web_terminal_url": "http://localhost:3001",
        "models_active": list(model_suite.keys()),
        "endpoints": {
            "health": "/api/health",
            "system_status": "/api/system-status",
            "market_data": "/api/market-data?symbol=AAPL",
            "predict": "/api/predict (POST)",
            "backtest": "/api/backtest (POST)",
            "portfolio": "/api/portfolio",
            "risk_status": "/api/risk/status"
        }
    })


@app.route("/<path:path>", methods=["GET"])
def static_proxy(path):
    """Serve frontend static assets or fallback to index.html for SPA client routing."""
    if path.startswith("api/"):
        return jsonify({"error": f"API endpoint /{path} not found"}), 404
    if os.path.exists(os.path.join(FRONTEND_DIST, path)):
        return send_from_directory(FRONTEND_DIST, path)
    if os.path.exists(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"error": f"Path /{path} not found"}), 404


@app.route("/api/health", methods=["GET"])
def health_check():
    """System health check and regulatory metadata endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "ApexTrade AI API",
        "version": "2.0.0",
        "models_available": list(model_suite.keys()),
        "data_source_policy": "Yahoo Finance is used strictly for research and educational purposes under Yahoo API terms. Not for production execution.",
        "regulatory_notice": "Non-custodial trading software. Customer funds and orders must be managed through regulated broker-dealers. Indian users: see SEBI retail algorithmic trading circular (Feb 2025).",
        "risk_engine_status": {
            "kill_switch_active": risk_engine.kill_switch_active,
            "circuit_breaker_triggered": risk_engine.circuit_breaker_triggered
        }
    })


@app.route("/api/system-status", methods=["GET"])
def system_status():
    """Detailed platform status, model cards, and architecture disclosure."""
    symbol = request.args.get("symbol", "AAPL")
    session = risk_engine.is_market_open(symbol)
    quote = get_verified_quote(symbol)

    model_cards = [
        {
            "name": "Lion Deep LSTM",
            "type": "Deep PyTorch Recurrent Neural Network",
            "horizon": "15 candles",
            "strengths": "Learns non-linear temporal dependencies across normalized OHLCV sequences with Monte Carlo uncertainty bounds.",
            "limitations": "Requires at least 25 bars of clean historical data for online sequence adaptation."
        },
        {
            "name": "Tiger High-Confidence",
            "type": "Breakout & Volatility Squeeze Specialist",
            "horizon": "5-15 candles",
            "strengths": "Filters out sideways market chop. Triggers only on volume surge and volatility expansion.",
            "limitations": "Fires infrequently; waits on sidelines during low-volume consolidation."
        }
    ]

    return jsonify({
        "success": True,
        "symbol": clean_ticker(symbol),
        "quote": quote.to_dict(),
        "market_session": session,
        "risk_engine": {
            "kill_switch_active": risk_engine.kill_switch_active,
            "circuit_breaker_triggered": risk_engine.circuit_breaker_triggered,
            "max_position_size_pct": risk_engine.max_position_size_pct * 100.0,
            "max_stock_exposure_pct": risk_engine.max_stock_exposure_pct * 100.0,
            "max_sector_exposure_pct": risk_engine.max_sector_exposure_pct * 100.0,
            "max_daily_loss_pct": risk_engine.max_daily_loss_pct * 100.0,
            "max_open_positions": risk_engine.max_open_positions
        },
        "model_cards": model_cards,
        "disclaimers": {
            "order_book": "The order book Depth of Market (DoM) is a simulated Gaussian liquidity ladder for educational visualization and does not represent real exchange market depth.",
            "market_data": "Market quotes are fetched from Yahoo Finance (15-min delayed during market hours) or deterministic offline generators. Subject to Yahoo API terms.",
            "broker_custody": "ApexTrade AI never holds customer funds or bank credentials. All live executions require authenticated connectivity to a regulated broker."
        }
    })


@app.route("/api/tickers", methods=["GET"])
def get_tickers():
    """Return categorized popular tickers."""
    return jsonify({
        "categories": POPULAR_TICKERS,
        "supported_periods": ["5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"],
        "supported_intervals": ["1m", "5m", "15m", "1h", "1d"]
    })


@app.route("/api/quote", methods=["GET"])
def get_quote():
    """Return strictly verified asset quote and company metadata."""
    symbol = request.args.get("symbol", "AAPL")
    try:
        quote = get_verified_quote(symbol)
        info = fetch_ticker_info(symbol)
        info["verified_quote"] = quote.to_dict()
        return jsonify({"success": True, "data": info, "quote": quote.to_dict()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/market-data", methods=["GET"])
def get_market_data():
    """
    Fetch OHLCV data, compute all indicators, patterns, support/resistance pivots,
    and attach verified quote metadata.
    """
    symbol = request.args.get("symbol", "AAPL")
    period = request.args.get("period", "6mo")
    interval = request.args.get("interval", "1d")

    try:
        df_raw = fetch_stock_data(symbol, period=period, interval=interval)
        if df_raw.empty or len(df_raw) < 5:
            return jsonify({"success": False, "error": f"Insufficient data for {symbol}"}), 404

        df = add_all_indicators(df_raw)
        info = fetch_ticker_info(symbol)
        quote = get_verified_quote(symbol)
        
        # Detected patterns and pivots
        patterns = detect_candlestick_patterns(df)
        sup_levels, res_levels = detect_support_resistance_pivots(df, window=8)
        breakout = detect_breakout_events(df)

        # Format candles for JSON response
        candles = []
        for idx, row in df.iterrows():
            candles.append({
                "time": idx.strftime("%Y-%m-%d %H:%M") if "m" in interval or "h" in interval else idx.strftime("%Y-%m-%d"),
                "timestamp": int(idx.timestamp() * 1000),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
                "sma20": round(float(row["SMA_20"]), 2) if not np.isnan(row["SMA_20"]) else None,
                "sma50": round(float(row["SMA_50"]), 2) if not np.isnan(row["SMA_50"]) else None,
                "ema9": round(float(row["EMA_9"]), 2) if not np.isnan(row["EMA_9"]) else None,
                "ema21": round(float(row["EMA_21"]), 2) if not np.isnan(row["EMA_21"]) else None,
                "bb_upper": round(float(row["BB_Upper"]), 2) if not np.isnan(row["BB_Upper"]) else None,
                "bb_middle": round(float(row["BB_Middle"]), 2) if not np.isnan(row["BB_Middle"]) else None,
                "bb_lower": round(float(row["BB_Lower"]), 2) if not np.isnan(row["BB_Lower"]) else None,
                "rsi14": round(float(row["RSI_14"]), 2) if not np.isnan(row["RSI_14"]) else None,
                "macd": round(float(row["MACD_Line"]), 3) if not np.isnan(row["MACD_Line"]) else None,
                "macd_signal": round(float(row["MACD_Signal"]), 3) if not np.isnan(row["MACD_Signal"]) else None,
                "macd_hist": round(float(row["MACD_Hist"]), 3) if not np.isnan(row["MACD_Hist"]) else None,
                "atr14": round(float(row["ATR_14"]), 2) if not np.isnan(row["ATR_14"]) else None,
                "vwap": round(float(row["VWAP"]), 2) if not np.isnan(row["VWAP"]) else None
            })

        # Format patterns
        serializable_patterns = []
        for p in patterns:
            serializable_patterns.append({
                "name": p["name"],
                "type": p["type"],
                "time": p["index"].strftime("%Y-%m-%d %H:%M") if hasattr(p["index"], "strftime") else str(p["index"]),
                "confidence": p["confidence"],
                "description": p["description"]
            })

        return jsonify({
            "success": True,
            "symbol": clean_ticker(symbol),
            "period": period,
            "interval": interval,
            "info": info,
            "quote": quote.to_dict(),
            "candles": candles,
            "patterns": serializable_patterns[-6:],
            "support_levels": [round(s, 2) for s in sup_levels],
            "resistance_levels": [round(r, 2) for r in res_levels],
            "breakout_event": breakout
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/predict", methods=["POST"])
def predict_stock():
    """
    Execute selected AI Model (Lion, Tiger, Panther, Bobcat) on historical data.
    Returns calibrated confidence, intervals, feature drivers, and trade decisions.
    """
    data = request.get_json() or {}
    symbol = data.get("symbol", "AAPL")
    period = data.get("period", "6mo")
    interval = data.get("interval", "1d")
    model_name = data.get("model", "Lion")
    horizon = int(data.get("horizon", 15))
    confidence_threshold = float(data.get("threshold", 65.0))

    try:
        df_raw = fetch_stock_data(symbol, period=period, interval=interval)
        if df_raw.empty or len(df_raw) < 10:
            return jsonify({"success": False, "error": f"Insufficient data for {symbol}"}), 400

        if model_name.lower() == "tiger":
            result = model_suite["Tiger"].predict(df_raw, horizon=horizon, interval=interval, confidence_threshold=confidence_threshold)
        else:
            result = model_suite["Lion"].predict(df_raw, horizon=horizon, interval=interval)

        # Serialize future candles with 80% and 95% bands
        future_candles = []
        for c in result.future_candles:
            future_candles.append({
                "time": c.time.strftime("%Y-%m-%d %H:%M") if "m" in interval or "h" in interval else c.time.strftime("%Y-%m-%d"),
                "timestamp": int(c.time.timestamp() * 1000),
                "open": round(c.open, 2),
                "high": round(c.high, 2),
                "low": round(c.low, 2),
                "close": round(c.close, 2),
                "upper_band": round(c.upper_band, 2),
                "lower_band": round(c.lower_band, 2),
                "upper_95": round(c.upper_95, 2) if hasattr(c, "upper_95") else round(c.upper_band * 1.01, 2),
                "lower_95": round(c.lower_95, 2) if hasattr(c, "lower_95") else round(c.lower_band * 0.99, 2)
            })

        quote = get_verified_quote(symbol)

        return jsonify({
            "success": True,
            "symbol": clean_ticker(symbol),
            "model_name": result.model_name,
            "directional_bias": result.directional_bias,
            "bullish_probability": result.bullish_probability,
            "bearish_probability": result.bearish_probability,
            "confidence_score": result.confidence_score,
            "expected_return_pct": result.expected_return_pct,
            "expected_return_range": result.expected_return_range,
            "probability_of_loss": result.probability_of_loss,
            "risk_reward_ratio": result.risk_reward_ratio,
            "forecast_horizon_time": result.forecast_horizon_time,
            "trade_decision": result.trade_decision,
            "trade_rationale": result.trade_rationale,
            "feature_drivers": result.feature_drivers,
            "move_coverage": result.move_coverage,
            "threshold_exceeded": bool(result.threshold_exceeded),
            "summary": result.summary,
            "future_candles": future_candles,
            "model_version": result.model_version,
            "dataset_version": result.dataset_version,
            "last_trained": result.last_trained,
            "quote": quote.to_dict()
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orderbook", methods=["GET"])
def get_orderbook():
    """
    Generate Depth of Market (DoM) orderbook with Gaussian order distribution.
    Explicitly tags simulation metadata.
    """
    symbol = request.args.get("symbol", "AAPL")
    try:
        quote = get_verified_quote(symbol)
        vol = 1000000.0
        try:
            df_raw = fetch_stock_data(symbol, period="5d", interval="1d")
            vol = float(df_raw["Volume"].iloc[-1])
            ret = df_raw["Close"].pct_change().dropna()
            volatility = float(ret.std()) if len(ret) > 1 else 0.015
        except Exception:
            volatility = 0.015

        dom = generate_simulated_orderbook(
            current_price=quote.price,
            recent_volume=vol,
            volatility=volatility,
            levels=15
        )
        return jsonify({
            "success": True,
            "symbol": clean_ticker(symbol),
            "quote": quote.to_dict(),
            "orderbook": dom
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/backtest", methods=["POST"])
def run_backtest():
    """
    Execute out-of-sample historical walk-forward backtest with 4 baselines
    and realistic friction deductions.
    """
    data = request.get_json() or {}
    symbol = data.get("symbol", "AAPL")
    period = data.get("period", "1y")
    interval = data.get("interval", "1d")
    model_name = data.get("model", "Lion")
    horizon = int(data.get("horizon", 5))

    try:
        df_raw = fetch_stock_data(symbol, period=period, interval=interval)
        if len(df_raw) < 30:
            return jsonify({"success": False, "error": "Insufficient history for backtest"}), 400

        res = run_historical_backtest(df_raw, model_name=model_name, test_windows=20, horizon=horizon)
        
        # Serialize timestamps in equity curve
        serializable_equity = []
        for eq in res["equity_curve"]:
            serializable_equity.append({
                "time": eq["time"].strftime("%Y-%m-%d") if hasattr(eq["time"], "strftime") else str(eq["time"]),
                "equity": eq["equity"],
                "bh_equity": eq.get("bh_equity", eq["equity"])
            })
        res["equity_curve"] = serializable_equity

        # Serialize timestamps in recent trades
        serializable_trades = []
        for t in res["recent_trades"]:
            serializable_trades.append({
                "entry_time": t["entry_time"].strftime("%Y-%m-%d") if hasattr(t["entry_time"], "strftime") else str(t["entry_time"]),
                "exit_time": t["exit_time"].strftime("%Y-%m-%d") if hasattr(t["exit_time"], "strftime") else str(t["exit_time"]),
                "bias": t["bias"],
                "confidence": t["confidence"],
                "actual_return_pct": t["actual_return_pct"],
                "pred_return_pct": t["pred_return_pct"],
                "net_return_pct": t["net_return_pct"],
                "is_win": t["is_win"],
                "trade_decision": t.get("trade_decision", "BUY"),
                "regime": t.get("regime", "Standard")
            })
        res["recent_trades"] = serializable_trades

        return jsonify({"success": True, "symbol": clean_ticker(symbol), "backtest": res})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/live-tick", methods=["POST"])
def live_tick():
    """
    Continuous real-time market tick generator and AI re-evaluator.
    """
    data = request.get_json() or {}
    symbol = data.get("symbol", "AAPL")
    current_price = float(data.get("current_price", 100.0))
    candle = data.get("candle", {})
    model_name = data.get("model", "Lion")
    horizon = int(data.get("horizon", 15))
    confidence_threshold = float(data.get("threshold", 65.0))
    interval = data.get("interval", "1m")
    repredict = bool(data.get("repredict", True))

    is_crypto = "-USD" in symbol or "BTC" in symbol or "ETH" in symbol
    vol_scale = 0.0012 if is_crypto else 0.0006

    random_drift = float(np.random.normal(loc=0.0, scale=vol_scale))
    tick_delta = current_price * random_drift
    new_price = round(max(0.01, current_price + tick_delta), 2)
    trade_size = int(np.random.exponential(scale=250) + 10)

    c_open = float(candle.get("open", new_price))
    c_high = max(float(candle.get("high", new_price)), new_price)
    c_low = min(float(candle.get("low", new_price)), new_price)
    c_volume = int(candle.get("volume", 0)) + trade_size
    c_time = candle.get("time") or pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")

    updated_candle = {
        "time": c_time,
        "open": round(c_open, 2),
        "high": round(c_high, 2),
        "low": round(c_low, 2),
        "close": round(new_price, 2),
        "volume": c_volume
    }

    orderbook = generate_simulated_orderbook(
        current_price=new_price,
        recent_volume=max(100000.0, float(c_volume * 10)),
        volatility=vol_scale * 10,
        levels=12
    )

    response = {
        "success": True,
        "symbol": clean_ticker(symbol),
        "price": new_price,
        "tick_delta": round(tick_delta, 3),
        "tick_delta_pct": round((tick_delta / current_price) * 100.0, 3) if current_price > 0 else 0.0,
        "trade_size": trade_size,
        "candle": updated_candle,
        "orderbook": orderbook
    }

    # Optional fast model re-prediction
    if repredict:
        try:
            df_raw = fetch_stock_data(symbol, period="5d", interval=interval)
            if not df_raw.empty:
                df_raw.iloc[-1, df_raw.columns.get_loc("Close")] = new_price
                df_raw.iloc[-1, df_raw.columns.get_loc("High")] = max(float(df_raw["High"].iloc[-1]), new_price)
                df_raw.iloc[-1, df_raw.columns.get_loc("Low")] = min(float(df_raw["Low"].iloc[-1]), new_price)

                if model_name.lower() == "tiger":
                    res = model_suite["Tiger"].predict(df_raw, horizon=horizon, interval=interval, confidence_threshold=confidence_threshold)
                else:
                    res = model_suite["Lion"].predict(df_raw, horizon=horizon, interval=interval)

                future_candles = []
                for c in res.future_candles:
                    future_candles.append({
                        "time": c.time.strftime("%Y-%m-%d %H:%M") if "m" in interval or "h" in interval else c.time.strftime("%Y-%m-%d"),
                        "timestamp": int(c.time.timestamp() * 1000),
                        "open": round(c.open, 2),
                        "high": round(c.high, 2),
                        "low": round(c.low, 2),
                        "close": round(c.close, 2),
                        "upper_band": round(c.upper_band, 2),
                        "lower_band": round(c.lower_band, 2),
                        "upper_95": round(c.upper_95, 2) if hasattr(c, "upper_95") else round(c.upper_band * 1.01, 2),
                        "lower_95": round(c.lower_95, 2) if hasattr(c, "lower_95") else round(c.lower_band * 0.99, 2)
                    })

                response["prediction"] = {
                    "model_name": res.model_name,
                    "directional_bias": res.directional_bias,
                    "bullish_probability": res.bullish_probability,
                    "bearish_probability": res.bearish_probability,
                    "confidence_score": res.confidence_score,
                    "expected_return_pct": res.expected_return_pct,
                    "expected_return_range": res.expected_return_range,
                    "probability_of_loss": res.probability_of_loss,
                    "risk_reward_ratio": res.risk_reward_ratio,
                    "forecast_horizon_time": res.forecast_horizon_time,
                    "trade_decision": res.trade_decision,
                    "trade_rationale": res.trade_rationale,
                    "feature_drivers": res.feature_drivers,
                    "move_coverage": res.move_coverage,
                    "threshold_exceeded": bool(res.threshold_exceeded),
                    "summary": res.summary,
                    "future_candles": future_candles
                }
        except Exception:
            pass

    # Tick update for Paper Trading portfolio (strict symbol isolation & trailing stops)
    try:
        ai_pred = response.get("prediction")
        closed = portfolio.update_tick(symbol=symbol, current_price=new_price, ai_prediction=ai_pred)
        response["portfolio"] = portfolio.get_summary(current_prices={clean_ticker(symbol): new_price})
        if closed:
            response["portfolio_closed_trades"] = closed
    except Exception as pe:
        response["portfolio_error"] = str(pe)

    return jsonify(response)


# ---------------------------------------------------------
# Institutional Risk & Pre-Trade Endpoints
# ---------------------------------------------------------

@app.route("/api/risk/status", methods=["GET"])
def get_risk_status():
    """Retrieve active Risk Engine limits, circuit breaker, and market status."""
    symbol = request.args.get("symbol", "AAPL")
    session = risk_engine.is_market_open(symbol)
    quote = get_verified_quote(symbol)

    return jsonify({
        "success": True,
        "symbol": clean_ticker(symbol),
        "quote": quote.to_dict(),
        "market_session": session,
        "risk_limits": {
            "max_position_size_pct": risk_engine.max_position_size_pct * 100.0,
            "max_stock_exposure_pct": risk_engine.max_stock_exposure_pct * 100.0,
            "max_sector_exposure_pct": risk_engine.max_sector_exposure_pct * 100.0,
            "max_daily_loss_pct": risk_engine.max_daily_loss_pct * 100.0,
            "max_portfolio_drawdown_pct": risk_engine.max_portfolio_drawdown_pct * 100.0,
            "max_open_positions": risk_engine.max_open_positions
        },
        "state": {
            "kill_switch_active": risk_engine.kill_switch_active,
            "kill_switch_reason": risk_engine.kill_switch_reason,
            "circuit_breaker_triggered": risk_engine.circuit_breaker_triggered,
            "circuit_breaker_reason": risk_engine.circuit_breaker_reason,
            "open_positions_count": len(portfolio.positions)
        }
    })


@app.route("/api/risk/kill-switch", methods=["POST"])
def trigger_kill_switch():
    """Emergency Kill Switch: closes all positions and locks trading."""
    data = request.get_json() or {}
    reason = data.get("reason", "Operator Manual Emergency Kill Switch Activated")
    res = risk_engine.trigger_kill_switch(portfolio, reason=reason)
    return jsonify({
        "success": True,
        "message": "EMERGENCY KILL SWITCH ACTIVATED. All positions closed, Auto-Pilot halted.",
        "kill_switch": res,
        "portfolio": portfolio.get_summary()
    })


@app.route("/api/risk/kill-switch/reset", methods=["POST"])
def reset_kill_switch():
    """Reset emergency kill switch upon human supervisor confirmation."""
    risk_engine.reset_kill_switch()
    risk_engine.reset_circuit_breaker()
    return jsonify({
        "success": True,
        "message": "Kill switch and circuit breakers reset to NORMAL operational status.",
        "state": {
            "kill_switch_active": risk_engine.kill_switch_active,
            "circuit_breaker_triggered": risk_engine.circuit_breaker_triggered
        }
    })


@app.route("/api/portfolio/propose-order", methods=["POST"])
def propose_order():
    """
    Pre-Trade Risk Clearance Endpoint:
    The AI or user proposes a trade; the Risk Engine evaluates whether it is permitted.
    Does NOT execute until confirmed.
    """
    data = request.get_json() or {}
    symbol = data.get("symbol", "AAPL")
    quote = get_verified_quote(symbol)

    atr = None
    try:
        df_raw = fetch_stock_data(symbol, period="1mo", interval="1d")
        high_low = df_raw["High"] - df_raw["Low"]
        atr = float(high_low.tail(14).mean())
    except Exception:
        atr = quote.price * 0.02

    check = risk_engine.validate_order(portfolio, data, quote, atr=atr)

    return jsonify({
        "success": True,
        "symbol": clean_ticker(symbol),
        "quote": quote.to_dict(),
        "risk_check": check.to_dict()
    })


# ---------------------------------------------------------
# Automated Paper Trading Portfolio Endpoints
# ---------------------------------------------------------

@app.route("/api/portfolio", methods=["GET"])
def get_portfolio():
    """Retrieve current virtual portfolio summary, positions, and trades."""
    symbol = request.args.get("symbol")
    price = request.args.get("price")
    current_prices = {}
    if symbol and price:
        try:
            current_prices[clean_ticker(symbol)] = float(price)
        except ValueError:
            pass
    return jsonify({"success": True, "portfolio": portfolio.get_summary(current_prices)})


@app.route("/api/portfolio/order", methods=["POST"])
def place_order():
    """Place a simulated trade passing through institutional risk validation."""
    data = request.get_json() or {}
    symbol = data.get("symbol", "AAPL")
    side = data.get("side", "BUY")
    current_price = data.get("current_price")
    if current_price is not None:
        current_price = float(current_price)
    qty = data.get("qty")
    if qty is not None:
        qty = float(qty)
    allocation_pct = float(data.get("allocation_pct", 0.10))
    stop_loss = data.get("stop_loss")
    if stop_loss is not None:
        stop_loss = float(stop_loss)
    take_profit = data.get("take_profit")
    if take_profit is not None:
        take_profit = float(take_profit)
    reason = data.get("reason", "Manual Order")

    try:
        pos = portfolio.open_position(
            symbol=clean_ticker(symbol),
            side=side,
            current_price=current_price,
            qty=qty,
            allocation_pct=allocation_pct,
            stop_loss=stop_loss,
            take_profit=take_profit,
            reason=reason
        )
        return jsonify({
            "success": True,
            "position": pos,
            "portfolio": portfolio.get_summary()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/portfolio/close", methods=["POST"])
def close_order():
    """
    Close an open position and realize PnL.
    CRITICAL FIX: Strictly validates symbol and prevents cross-ticker price contamination.
    """
    data = request.get_json() or {}
    pos_id = data.get("pos_id")
    symbol = data.get("symbol")
    current_price = data.get("current_price")
    if current_price is not None:
        current_price = float(current_price)
    exit_reason = data.get("reason", "Manual Exit")

    if not pos_id:
        return jsonify({"success": False, "error": "Missing pos_id"}), 400

    try:
        trade = portfolio.close_position(
            pos_id=pos_id,
            symbol=symbol,
            current_price=current_price,
            exit_reason=exit_reason
        )
        return jsonify({
            "success": True,
            "trade": trade,
            "portfolio": portfolio.get_summary()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/portfolio/auto-pilot", methods=["POST"])
def toggle_auto_pilot():
    """
    Enable or disable AI Auto-Pilot automated trading.
    Gated by strict out-of-sample performance standards.
    """
    data = request.get_json() or {}
    enabled = bool(data.get("enabled", False))
    metrics = data.get("metrics")

    try:
        portfolio.set_auto_pilot(enabled, out_of_sample_metrics=metrics)
        return jsonify({
            "success": True,
            "auto_pilot": portfolio.auto_pilot,
            "message": f"AI Auto-Pilot {'ACTIVATED' if enabled else 'DEACTIVATED'}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/portfolio/reset", methods=["POST"])
def reset_portfolio():
    """Reset virtual account back to $100,000 initial capital and clear risk locks."""
    portfolio.reset()
    return jsonify({
        "success": True,
        "message": "Portfolio reset to $100,000 virtual balance. Risk limits restored.",
        "portfolio": portfolio.get_summary()
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
