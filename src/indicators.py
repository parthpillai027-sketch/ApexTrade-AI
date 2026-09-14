"""
Technical Indicators Module for AI Stock Market Predictor.
Computes trend, momentum, volatility, and volume indicators.
"""

from typing import Tuple
import pandas as pd
import numpy as np


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    """Add Simple and Exponential Moving Averages."""
    res = df.copy()
    close = res["Close"]
    
    # Simple Moving Averages
    res["SMA_20"] = close.rolling(window=20, min_periods=1).mean()
    res["SMA_50"] = close.rolling(window=50, min_periods=1).mean()
    res["SMA_200"] = close.rolling(window=200, min_periods=1).mean()
    
    # Exponential Moving Averages
    res["EMA_9"] = close.ewm(span=9, adjust=False).mean()
    res["EMA_21"] = close.ewm(span=21, adjust=False).mean()
    res["EMA_55"] = close.ewm(span=55, adjust=False).mean()
    
    return res


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Compute Wilder's Relative Strength Index (RSI).
    """
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    # Exponential moving average with alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    
    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def compute_macd(
    series: pd.Series,
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """
    Compute MACD line, Signal line, and MACD Histogram.
    """
    ema_fast = series.ewm(span=fast_period, adjust=False).mean()
    ema_slow = series.ewm(span=slow_period, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    macd_hist = macd_line - signal_line
    return macd_line, signal_line, macd_hist


def compute_bollinger_bands(
    series: pd.Series,
    period: int = 20,
    num_std: float = 2.0
) -> Tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    """
    Compute Bollinger Bands (Upper, Middle, Lower, Bandwidth).
    """
    middle = series.rolling(window=period, min_periods=1).mean()
    std = series.rolling(window=period, min_periods=1).std().fillna(0.0)
    upper = middle + (num_std * std)
    lower = middle - (num_std * std)
    bandwidth = (upper - lower) / (middle + 1e-10) * 100.0
    return upper, middle, lower, bandwidth


def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Compute Average True Range (ATR).
    """
    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    prev_close = close.shift(1)
    
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = true_range.rolling(window=period, min_periods=1).mean()
    return atr


def compute_vwap(df: pd.DataFrame) -> pd.Series:
    """
    Compute Volume Weighted Average Price (VWAP).
    """
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3.0
    vp = typical_price * df["Volume"]
    
    # Cumulative sums over the dataframe
    cum_vp = vp.cumsum()
    cum_vol = df["Volume"].cumsum()
    
    vwap = cum_vp / (cum_vol + 1e-10)
    return vwap


def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute and append all standard technical indicators to the dataframe.
    """
    res = add_moving_averages(df)
    
    # RSI
    res["RSI_14"] = compute_rsi(res["Close"], period=14)
    
    # MACD
    macd_line, signal_line, macd_hist = compute_macd(res["Close"])
    res["MACD_Line"] = macd_line
    res["MACD_Signal"] = signal_line
    res["MACD_Hist"] = macd_hist
    
    # Bollinger Bands
    bb_upper, bb_middle, bb_lower, bb_width = compute_bollinger_bands(res["Close"], period=20, num_std=2.0)
    res["BB_Upper"] = bb_upper
    res["BB_Middle"] = bb_middle
    res["BB_Lower"] = bb_lower
    res["BB_Width"] = bb_width
    
    # ATR
    res["ATR_14"] = compute_atr(res, period=14)
    
    # VWAP
    res["VWAP"] = compute_vwap(res)
    
    # Candlestick anatomy & returns
    res["Return"] = res["Close"].pct_change().fillna(0.0)
    res["Log_Return"] = np.log(res["Close"] / res["Close"].shift(1)).fillna(0.0)
    res["Volatility_20"] = res["Return"].rolling(window=20, min_periods=1).std().fillna(0.0) * np.sqrt(252)
    
    # Candle geometry
    res["Candle_Body"] = (res["Close"] - res["Open"]).abs()
    res["Is_Bullish"] = (res["Close"] >= res["Open"]).astype(int)
    res["Upper_Shadow"] = res["High"] - res[["Open", "Close"]].max(axis=1)
    res["Lower_Shadow"] = res[["Open", "Close"]].min(axis=1) - res["Low"]
    
    return res
