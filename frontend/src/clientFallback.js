// Client-side fallback generator for GitHub Pages & Cloud Demo
// Ensures the terminal is 100% interactive and functional even when no local Flask server is running.

const TICKER_PRICES = {
  "AAPL": 224.50,
  "NVDA": 118.20,
  "TSLA": 215.80,
  "MSFT": 428.60,
  "BTC-USD": 58400.0,
  "ETH-USD": 2340.0,
  "SPY": 558.40,
  "QQQ": 476.20
};

export function getClientMarketData(symbol = "AAPL", period = "6mo", interval = "1d") {
  const basePrice = TICKER_PRICES[symbol] || 150.0;
  const isCrypto = symbol.includes("USD") || symbol.includes("BTC") || symbol.includes("ETH");
  const bars = period === "1d" ? 40 : (period === "5d" ? 60 : 100);
  const volatility = isCrypto ? 0.025 : 0.012;

  const candles = [];
  let currPrice = basePrice * 0.92;
  const now = Date.now();
  const stepMs = interval.includes("m") ? 60000 * 5 : (interval.includes("h") ? 3600000 : 86400000);

  for (let i = bars; i >= 0; i--) {
    const time = new Date(now - i * stepMs).toISOString().split('T')[0];
    const change = (Math.random() - 0.48) * volatility * currPrice;
    const open = currPrice;
    const close = Math.max(1, currPrice + change);
    const high = Math.max(open, close) + Math.random() * (volatility * 0.8 * currPrice);
    const low = Math.min(open, close) - Math.random() * (volatility * 0.8 * currPrice);
    const volume = Math.floor(Math.random() * 5000000) + 1000000;

    candles.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
    currPrice = close;
  }

  const closes = candles.map(c => c.close);
  const lastClose = closes[closes.length - 1];

  // Moving averages
  const calcSMA = (n) => closes.map((_, idx, arr) => {
    if (idx < n - 1) return null;
    const slice = arr.slice(idx - n + 1, idx + 1);
    return parseFloat((slice.reduce((a, b) => a + b, 0) / n).toFixed(2));
  });

  return {
    success: true,
    symbol,
    period,
    interval,
    info: {
      symbol,
      short_name: symbol,
      price: lastClose,
      change_24h: parseFloat((lastClose - basePrice).toFixed(2)),
      change_24h_pct: parseFloat((((lastClose - basePrice) / basePrice) * 100).toFixed(2)),
      volume: 48500000,
      market_cap: 3200000000000
    },
    candles,
    indicators: {
      sma20: calcSMA(20),
      sma50: calcSMA(50),
      ema9: calcSMA(9),
      ema21: calcSMA(21),
      bb_upper: calcSMA(20).map(v => v ? parseFloat((v * 1.03).toFixed(2)) : null),
      bb_lower: calcSMA(20).map(v => v ? parseFloat((v * 0.97).toFixed(2)) : null),
      bb_middle: calcSMA(20),
      rsi: closes.map(() => parseFloat((45 + Math.random() * 25).toFixed(1))),
      macd: closes.map(() => parseFloat(((Math.random() - 0.45) * 2).toFixed(2))),
      macd_signal: closes.map(() => parseFloat(((Math.random() - 0.45) * 1.5).toFixed(2))),
      macd_hist: closes.map(() => parseFloat(((Math.random() - 0.5) * 1).toFixed(2)))
    },
    patterns: [
      { name: "Bullish Engulfing", type: "Bullish", time: "Recent", confidence: 82, description: "Strong bullish reversal candle engulfing prior range." },
      { name: "Key Support Bounce", type: "Bullish", time: "Prior Bar", confidence: 75, description: "Price rejected lower boundary with high volume." }
    ],
    support_levels: [parseFloat((lastClose * 0.96).toFixed(2)), parseFloat((lastClose * 0.93).toFixed(2))],
    resistance_levels: [parseFloat((lastClose * 1.04).toFixed(2)), parseFloat((lastClose * 1.08).toFixed(2))]
  };
}

export function getClientPrediction(symbol, lastClose, model = "Lion", horizon = 15, threshold = 65) {
  const isLion = model === "Lion";
  const bias = isLion ? "Bullish" : (Math.random() > 0.4 ? "Bullish" : "Bearish");
  const confidence = isLion ? 78.4 : 73.0;
  const returnPct = bias === "Bullish" ? 4.85 : -3.90;
  const targetPrice = parseFloat((lastClose * (1 + returnPct / 100)).toFixed(2));

  const future_candles = [];
  let curr = lastClose;
  const drift = (targetPrice - lastClose) / horizon;
  const now = Date.now();

  for (let i = 1; i <= horizon; i++) {
    const time = `+${i} Bar`;
    const open = curr;
    const noise = (Math.random() - 0.48) * (lastClose * 0.008);
    const close = parseFloat((open + drift + noise).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * (lastClose * 0.005)).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * (lastClose * 0.005)).toFixed(2));
    const spread = lastClose * 0.015 * Math.sqrt(i / 5);

    future_candles.push({
      time,
      open,
      high,
      low,
      close,
      upper_band: parseFloat((close + spread).toFixed(2)),
      lower_band: parseFloat((close - spread).toFixed(2))
    });
    curr = close;
  }

  return {
    success: true,
    model_name: isLion ? "🦁 Lion (LSTM Trajectory)" : "🐯 Tiger (Breakout Gate)",
    directional_bias: bias,
    confidence: confidence,
    target_price: targetPrice,
    expected_return_pct: returnPct,
    current_price: lastClose,
    move_coverage: isLion ? 81.2 : 84.5,
    threshold_exceeded: confidence >= threshold,
    summary: isLion 
      ? `Lion Deep LSTM projects ${bias.toUpperCase()} continuation. Target: $${targetPrice} (${returnPct > 0 ? '+' : ''}${returnPct}%).`
      : `Tiger [TRIGGERED (High Conviction)] - Confidence: ${confidence}% exceeds ${threshold}% threshold. Target: $${targetPrice}.`,
    future_candles
  };
}

export function getClientOrderbook(symbol, price = 200.0) {
  const bids = [];
  const asks = [];
  for (let i = 1; i <= 10; i++) {
    bids.push({
      price: parseFloat((price - i * 0.15).toFixed(2)),
      size: Math.floor(Math.random() * 400) + 50,
      total: 0
    });
    asks.push({
      price: parseFloat((price + i * 0.15).toFixed(2)),
      size: Math.floor(Math.random() * 400) + 50,
      total: 0
    });
  }
  let bTot = 0, aTot = 0;
  bids.forEach(b => { bTot += b.size; b.total = bTot; });
  asks.forEach(a => { aTot += a.size; a.total = aTot; });

  return {
    symbol,
    mid_price: price,
    spread: 0.30,
    imbalance_ratio: parseFloat((bTot / (bTot + aTot)).toFixed(3)),
    bids,
    asks
  };
}

export function getClientBacktest(symbol = "AAPL", model = "Lion") {
  return {
    symbol,
    model,
    evaluated_trades: 48,
    win_rate: 64.6,
    profit_factor: 1.88,
    net_return_pct: 18.4,
    max_drawdown_pct: -5.2,
    move_coverage_avg: 79.4,
    trades: [
      { id: 1, type: "BUY", entry_price: 210.5, exit_price: 219.8, pnl_pct: 4.42, outcome: "WIN" },
      { id: 2, type: "BUY", entry_price: 218.0, exit_price: 226.4, pnl_pct: 3.85, outcome: "WIN" },
      { id: 3, type: "SELL", entry_price: 225.0, exit_price: 227.1, pnl_pct: -0.93, outcome: "LOSS" },
      { id: 4, type: "BUY", entry_price: 220.2, exit_price: 229.0, pnl_pct: 4.00, outcome: "WIN" }
    ]
  };
}
