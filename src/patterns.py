"""
Candlestick and Chart Pattern Recognition Module.
Detects traditional reversal/continuation patterns and pivot support/resistance levels.
"""

from typing import List, Dict, Any, Tuple
import pandas as pd
import numpy as np


def detect_candlestick_patterns(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Scan the recent candles in the DataFrame and return detected candlestick patterns.
    """
    patterns = []
    if len(df) < 5:
        return patterns

    # We inspect the most recent candles (up to last 10 candles)
    n = len(df)
    
    # Precompute metrics
    body = (df["Close"] - df["Open"]).abs()
    rng = (df["High"] - df["Low"]).clip(lower=1e-6)
    upper_wick = df["High"] - df[["Open", "Close"]].max(axis=1)
    lower_wick = df[["Open", "Close"]].min(axis=1) - df["Low"]
    is_bullish = df["Close"] >= df["Open"]
    
    # Average body size for relative scale
    avg_body = body.rolling(14, min_periods=3).mean()

    # 1. Doji (Indecision) on recent candle
    for i in range(max(0, n - 3), n):
        if body.iloc[i] <= 0.1 * rng.iloc[i]:
            patterns.append({
                "name": "Doji (Indecision)",
                "type": "Neutral",
                "index": df.index[i],
                "candle_idx": i,
                "confidence": 70,
                "description": "Open and close are virtually equal. Indicates market indecision or potential trend pause."
            })

    # 2. Hammer & Inverted Hammer / Shooting Star (Reversal)
    for i in range(max(1, n - 3), n):
        idx = df.index[i]
        c_body = body.iloc[i]
        c_rng = rng.iloc[i]
        l_wick = lower_wick.iloc[i]
        u_wick = upper_wick.iloc[i]

        # Bullish Hammer: long lower shadow (>= 2x body), tiny upper shadow
        if l_wick >= 2.0 * c_body and u_wick <= 0.25 * c_body and not is_bullish.iloc[i-1]:
            patterns.append({
                "name": "Bullish Hammer",
                "type": "Bullish",
                "index": idx,
                "candle_idx": i,
                "confidence": 75,
                "description": "Long lower shadow rejection after downward push. Signals buyers stepping in strongly."
            })
        
        # Shooting Star / Inverted Hammer: long upper shadow (>= 2x body), tiny lower shadow
        if u_wick >= 2.0 * c_body and l_wick <= 0.25 * c_body and is_bullish.iloc[i-1]:
            patterns.append({
                "name": "Shooting Star (Bearish Reversal)",
                "type": "Bearish",
                "index": idx,
                "candle_idx": i,
                "confidence": 75,
                "description": "Long upper shadow rejection after upward push. Signals sellers exhausting upward momentum."
            })

    # 3. Engulfing Patterns (2 candles)
    for i in range(max(1, n - 3), n):
        idx = df.index[i]
        curr_open, curr_close = df["Open"].iloc[i], df["Close"].iloc[i]
        prev_open, prev_close = df["Open"].iloc[i-1], df["Close"].iloc[i-1]
        
        # Bullish Engulfing: prev bearish, curr bullish and completely engulfs prev body
        if not is_bullish.iloc[i-1] and is_bullish.iloc[i]:
            if curr_open <= prev_close and curr_close >= prev_open and body.iloc[i] > body.iloc[i-1]:
                patterns.append({
                    "name": "Bullish Engulfing",
                    "type": "Bullish",
                    "index": idx,
                    "candle_idx": i,
                    "confidence": 85,
                    "description": "Strong green candle fully engulfs previous red candle body. High probability bullish turnaround."
                })
                
        # Bearish Engulfing: prev bullish, curr bearish and completely engulfs prev body
        if is_bullish.iloc[i-1] and not is_bullish.iloc[i]:
            if curr_open >= prev_close and curr_close <= prev_open and body.iloc[i] > body.iloc[i-1]:
                patterns.append({
                    "name": "Bearish Engulfing",
                    "type": "Bearish",
                    "index": idx,
                    "candle_idx": i,
                    "confidence": 85,
                    "description": "Strong red candle fully engulfs previous green candle body. High probability bearish reversal."
                })

    # 4. Morning Star & Evening Star (3 candles)
    for i in range(max(2, n - 3), n):
        idx = df.index[i]
        c1_bull = is_bullish.iloc[i-2]
        c2_body = body.iloc[i-1]
        c3_bull = is_bullish.iloc[i]
        
        # Morning Star: Bearish -> Small Star -> Bullish
        if (not c1_bull) and (c2_body < 0.4 * avg_body.iloc[i-1]) and c3_bull:
            if df["Close"].iloc[i] > (df["Open"].iloc[i-2] + df["Close"].iloc[i-2]) / 2.0:
                patterns.append({
                    "name": "Morning Star",
                    "type": "Bullish",
                    "index": idx,
                    "candle_idx": i,
                    "confidence": 88,
                    "description": "3-candle bullish reversal: large red candle, small indecision star, followed by strong green surge."
                })

        # Evening Star: Bullish -> Small Star -> Bearish
        if c1_bull and (c2_body < 0.4 * avg_body.iloc[i-1]) and (not c3_bull):
            if df["Close"].iloc[i] < (df["Open"].iloc[i-2] + df["Close"].iloc[i-2]) / 2.0:
                patterns.append({
                    "name": "Evening Star",
                    "type": "Bearish",
                    "index": idx,
                    "candle_idx": i,
                    "confidence": 88,
                    "description": "3-candle bearish reversal: large green candle, stall star, followed by heavy red selling."
                })

    # 5. Three White Soldiers / Three Black Crows
    if n >= 3:
        b1, b2, b3 = is_bullish.iloc[-3], is_bullish.iloc[-2], is_bullish.iloc[-1]
        if b1 and b2 and b3 and (df["Close"].iloc[-1] > df["Close"].iloc[-2] > df["Close"].iloc[-3]):
            patterns.append({
                "name": "Three White Soldiers",
                "type": "Bullish",
                "index": df.index[-1],
                "candle_idx": n - 1,
                "confidence": 82,
                "description": "Three consecutive advancing green candles closing near highs. Persistent aggressive accumulation."
            })
        elif (not b1) and (not b2) and (not b3) and (df["Close"].iloc[-1] < df["Close"].iloc[-2] < df["Close"].iloc[-3]):
            patterns.append({
                "name": "Three Black Crows",
                "type": "Bearish",
                "index": df.index[-1],
                "candle_idx": n - 1,
                "confidence": 82,
                "description": "Three consecutive declining red candles closing near lows. Sustained institutional distribution."
            })

    return patterns


def detect_support_resistance_pivots(
    df: pd.DataFrame,
    window: int = 10,
    max_levels: int = 5
) -> Tuple[List[float], List[float]]:
    """
    Find key horizontal Support and Resistance price pivot levels using rolling extrema.
    """
    if len(df) < window * 2:
        return [float(df["Low"].min())], [float(df["High"].max())]

    highs = df["High"].values
    lows = df["Low"].values
    
    resistance_levels = []
    support_levels = []

    for i in range(window, len(df) - window):
        # Local peak
        if highs[i] == max(highs[i - window : i + window + 1]):
            resistance_levels.append(float(highs[i]))
        # Local valley
        if lows[i] == min(lows[i - window : i + window + 1]):
            support_levels.append(float(lows[i]))

    # Cluster close levels together (within 1%)
    def cluster_levels(levels: List[float]) -> List[float]:
        if not levels:
            return []
        levels.sort()
        clusters = []
        curr_cluster = [levels[0]]
        for val in levels[1:]:
            if (val - curr_cluster[-1]) / curr_cluster[-1] < 0.012:
                curr_cluster.append(val)
            else:
                clusters.append(float(np.mean(curr_cluster)))
                curr_cluster = [val]
        clusters.append(float(np.mean(curr_cluster)))
        return clusters

    clustered_res = cluster_levels(resistance_levels)[-max_levels:]
    clustered_sup = cluster_levels(support_levels)[:max_levels]

    current_price = float(df["Close"].iloc[-1])
    # Keep support below current price, resistance above current price
    active_sup = [s for s in clustered_sup if s <= current_price * 1.005]
    active_res = [r for r in clustered_res if r >= current_price * 0.995]

    if not active_sup:
        active_sup = [float(df["Low"].min())]
    if not active_res:
        active_res = [float(df["High"].max())]

    return sorted(active_sup), sorted(active_res)


def detect_breakout_events(df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """
    Identify if the current candle is breaking out of a recent range with above-average volume.
    """
    if len(df) < 25:
        return None

    recent_20 = df.iloc[-21:-1]
    curr = df.iloc[-1]
    
    recent_high = recent_20["High"].max()
    recent_low = recent_20["Low"].min()
    avg_vol = recent_20["Volume"].mean()
    
    is_high_vol = bool(curr["Volume"] > (1.3 * avg_vol)) if avg_vol > 0 else True

    if curr["Close"] > recent_high:
        return {
            "type": "Bullish Breakout",
            "level": float(recent_high),
            "volume_surge": bool(is_high_vol),
            "confidence": int(85 if is_high_vol else 68),
            "detail": f"Price broke above 20-period resistance at {recent_high:.2f} with {'strong' if is_high_vol else 'moderate'} volume."
        }
    elif curr["Close"] < recent_low:
        return {
            "type": "Bearish Breakdown",
            "level": float(recent_low),
            "volume_surge": bool(is_high_vol),
            "confidence": int(85 if is_high_vol else 68),
            "detail": f"Price broke below 20-period support at {recent_low:.2f} with {'elevated' if is_high_vol else 'moderate'} volume."
        }

    return None
