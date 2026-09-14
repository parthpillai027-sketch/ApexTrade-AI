// Client-side fallback engine for ApexTrade AI
// Provides 100% full-featured simulation in the browser for public demos,
// including dynamic live ticking, full technical indicator calculation on candles,
// 10-tier DoM orderbook, Lion/Tiger model projections, and persistent $100,000 Paper Trading.

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

// -------------------------------------------------------------------------
// 1. Technical Indicator Helpers
// -------------------------------------------------------------------------
function computeSMA(values, window) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) sum += values[j];
      result.push(parseFloat((sum / window).toFixed(2)));
    }
  }
  return result;
}

function computeEMA(values, window) {
  const result = [];
  const k = 2 / (window + 1);
  let prevEma = null;
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else if (i === window - 1) {
      let sum = 0;
      for (let j = 0; j < window; j++) sum += values[j];
      prevEma = sum / window;
      result.push(parseFloat(prevEma.toFixed(2)));
    } else {
      prevEma = values[i] * k + prevEma * (1 - k);
      result.push(parseFloat(prevEma.toFixed(2)));
    }
  }
  return result;
}

function computeRSI(closes, window = 14) {
  const result = [];
  let gains = 0, losses = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(50.0);
      continue;
    }
    const diff = closes[i] - closes[i - 1];
    if (i <= window) {
      if (diff > 0) gains += diff; else losses += Math.abs(diff);
      if (i === window) {
        let avgGain = gains / window;
        let avgLoss = losses / window;
        let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(parseFloat((100 - (100 / (1 + rs))).toFixed(2)));
      } else {
        result.push(50.0);
      }
    } else {
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? Math.abs(diff) : 0;
      gains = (gains * (window - 1) + currentGain) / window;
      losses = (losses * (window - 1) + currentLoss) / window;
      let rs = losses === 0 ? 100 : gains / losses;
      result.push(parseFloat((100 - (100 / (1 + rs))).toFixed(2)));
    }
  }
  return result;
}

// -------------------------------------------------------------------------
// 2. Market Data Generator with embedded indicators on each candle
// -------------------------------------------------------------------------
export function getClientMarketData(symbol = "AAPL", period = "6mo", interval = "1d") {
  const basePrice = TICKER_PRICES[symbol] || 150.0;
  const isCrypto = symbol.includes("USD") || symbol.includes("BTC") || symbol.includes("ETH");
  const bars = period === "1d" ? 45 : (period === "5d" ? 60 : (period === "1mo" ? 75 : 100));
  const volatility = isCrypto ? 0.024 : 0.012;

  const rawCandles = [];
  let currPrice = basePrice * 0.94;
  const now = Date.now();
  const stepMs = interval.includes("m") ? 60000 * 5 : (interval.includes("h") ? 3600000 : 86400000);

  for (let i = bars; i >= 0; i--) {
    const d = new Date(now - i * stepMs);
    const time = interval.includes("m") || interval.includes("h")
      ? `${d.toISOString().slice(5, 10)} ${d.toTimeString().slice(0, 5)}`
      : d.toISOString().split('T')[0];

    const change = (Math.random() - 0.48) * volatility * currPrice;
    const open = currPrice;
    const close = Math.max(1, currPrice + change);
    const high = Math.max(open, close) + Math.random() * (volatility * 0.6 * currPrice);
    const low = Math.min(open, close) - Math.random() * (volatility * 0.6 * currPrice);
    const volume = Math.floor(Math.random() * 5000000) + 1200000;

    rawCandles.push({
      time,
      timestamp: now - i * stepMs,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
    currPrice = close;
  }

  const closes = rawCandles.map(c => c.close);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const rsi = computeRSI(closes, 14);

  // MACD (12, 26, 9)
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, idx) => (v != null && ema26[idx] != null) ? parseFloat((v - ema26[idx]).toFixed(3)) : null);
  const validMacdValues = macdLine.map(v => v != null ? v : 0);
  const macdSignal = computeEMA(validMacdValues, 9);
  const macdHist = macdLine.map((v, idx) => (v != null && macdSignal[idx] != null) ? parseFloat((v - macdSignal[idx]).toFixed(3)) : null);

  // Attach indicators directly onto each candle for FinancialChart
  const candles = rawCandles.map((c, idx) => {
    const s20 = sma20[idx];
    const stdDev = s20 ? s20 * 0.022 : 0;
    return {
      ...c,
      sma20: s20,
      sma50: sma50[idx],
      ema9: ema9[idx],
      ema21: ema21[idx],
      bb_upper: s20 ? parseFloat((s20 + 2 * stdDev).toFixed(2)) : null,
      bb_middle: s20,
      bb_lower: s20 ? parseFloat((s20 - 2 * stdDev).toFixed(2)) : null,
      rsi: rsi[idx],
      rsi14: rsi[idx],
      macd: macdLine[idx],
      macd_signal: macdSignal[idx],
      macd_hist: macdHist[idx]
    };
  });

  const lastCandle = candles[candles.length - 1];
  const lastClose = lastCandle.close;
  const change24h = parseFloat((lastClose - basePrice).toFixed(2));
  const changePct24h = parseFloat((((lastClose - basePrice) / basePrice) * 100).toFixed(2));

  return {
    success: true,
    symbol,
    period,
    interval,
    info: {
      symbol,
      short_name: symbol,
      price: lastClose,
      base_price: basePrice,
      change_24h: change24h,
      change_24h_pct: changePct24h,
      change_pct_24h: changePct24h,
      volume: 48500000,
      market_cap: 3200000000000
    },
    quote: {
      symbol,
      regularMarketPrice: lastClose,
      regularMarketChange: change24h,
      regularMarketChangePercent: changePct24h,
      currency: "USD",
      exchange: isCrypto ? "Crypto" : "NASDAQ"
    },
    candles,
    patterns: [
      { name: "Bullish Engulfing", type: "Bullish", time: "Recent", confidence: 82, description: "Strong bullish reversal candle engulfing prior range." },
      { name: "Key Support Pivot", type: "Bullish", time: "Prior Bar", confidence: 75, description: "Price rejected lower boundary with elevated institutional volume." }
    ],
    support_levels: [parseFloat((lastClose * 0.965).toFixed(2)), parseFloat((lastClose * 0.935).toFixed(2))],
    resistance_levels: [parseFloat((lastClose * 1.035).toFixed(2)), parseFloat((lastClose * 1.070).toFixed(2))]
  };
}

// -------------------------------------------------------------------------
// 3. AI Model Predictions (🦁 Lion & 🐯 Tiger)
// -------------------------------------------------------------------------
export function getClientPrediction(symbol, lastClose, model = "Lion", horizon = 15, threshold = 65) {
  const isLion = model === "Lion";
  const bias = isLion ? "Bullish" : (Math.random() > 0.35 ? "Bullish" : "Bearish");
  const confidence = isLion ? 79.4 : 74.5;
  const returnPct = bias === "Bullish" ? 4.95 : -3.80;
  const targetPrice = parseFloat((lastClose * (1 + returnPct / 100)).toFixed(2));
  const probLoss = bias === "Bullish" ? 0.24 : 0.28;

  const future_candles = [];
  let curr = lastClose;
  const drift = (targetPrice - lastClose) / horizon;

  for (let i = 1; i <= horizon; i++) {
    const time = `+${i} Bar`;
    const open = curr;
    const noise = (Math.random() - 0.48) * (lastClose * 0.007);
    const close = parseFloat((open + drift + noise).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * (lastClose * 0.004)).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * (lastClose * 0.004)).toFixed(2));
    const spread = lastClose * 0.014 * Math.sqrt(i / 4.5);

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
    confidence_score: confidence,
    bullish_probability: bias === "Bullish" ? 0.79 : 0.25,
    bearish_probability: bias === "Bullish" ? 0.21 : 0.75,
    target_price: targetPrice,
    expected_return_pct: returnPct,
    expected_return_range: bias === "Bullish" ? { min: 2.15, max: 6.80 } : { min: -1.80, max: -5.40 },
    probability_of_loss: probLoss,
    risk_reward_ratio: isLion ? 2.4 : 2.1,
    forecast_horizon_time: `${horizon} candles`,
    trade_decision: confidence >= threshold ? (bias === "Bullish" ? "BUY" : "SELL") : "DO NOT TRADE",
    trade_rationale: isLion 
      ? `Lion Multi-Step LSTM projects consistent ${bias.toUpperCase()} sequence continuation to $${targetPrice}.`
      : `Tiger Breakout Gate confirms elevated conviction (${confidence}%) above threshold ${threshold}%.`,
    current_price: lastClose,
    move_coverage: isLion ? 82.4 : 85.1,
    threshold_exceeded: confidence >= threshold,
    summary: isLion 
      ? `Lion Deep LSTM projects ${bias.toUpperCase()} sequence continuation to $${targetPrice} (${returnPct > 0 ? '+' : ''}${returnPct}%).`
      : `Tiger [TRIGGERED] - High conviction setup (${confidence}%). Threshold: ${threshold}%. Target: $${targetPrice}.`,
    feature_drivers: [
      { feature: "Multi-Candle Momentum", impact: "Bullish", description: "Deep sequence trajectory indicates positive rate of change across prior 30 bars." },
      { feature: "RSI Momentum Slope", impact: "Bullish", description: "Healthy oscillator accumulation without entering overbought territory (>70)." },
      { feature: "DoM Liquidity Pressure", impact: "Bullish", description: "Heavy bid resting density provides strong institutional absorption floor." },
      { feature: "Bollinger Volatility Squeeze", impact: "Neutral", description: "Band width contraction preceded by expanding volatility envelope." }
    ],
    future_candles
  };
}

// -------------------------------------------------------------------------
// 4. 10-Tier Continuous Depth of Market (DoM) Orderbook
// -------------------------------------------------------------------------
export function getClientOrderbook(symbol, price = 200.0) {
  const bids = [];
  const asks = [];
  for (let i = 1; i <= 10; i++) {
    bids.push({
      price: parseFloat((price - i * 0.15).toFixed(2)),
      size: Math.floor(Math.random() * 450) + 75,
      total: 0
    });
    asks.push({
      price: parseFloat((price + i * 0.15).toFixed(2)),
      size: Math.floor(Math.random() * 450) + 75,
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

// -------------------------------------------------------------------------
// 5. Walk-Forward Backtesting Simulator
// -------------------------------------------------------------------------
export function getClientBacktest(symbol = "AAPL", model = "Lion") {
  return {
    symbol,
    model,
    evaluated_trades: 54,
    win_rate: 66.7,
    profit_factor: 1.94,
    net_return_pct: 19.8,
    max_drawdown_pct: -4.8,
    move_coverage_avg: 81.2,
    mean_directional_accuracy: 67.4,
    trades: [
      { id: 1, type: "BUY", entry_price: 211.2, exit_price: 220.5, pnl_pct: 4.40, outcome: "WIN" },
      { id: 2, type: "BUY", entry_price: 219.0, exit_price: 227.6, pnl_pct: 3.93, outcome: "WIN" },
      { id: 3, type: "SELL", entry_price: 226.4, exit_price: 228.1, pnl_pct: -0.75, outcome: "LOSS" },
      { id: 4, type: "BUY", entry_price: 221.5, exit_price: 231.0, pnl_pct: 4.29, outcome: "WIN" }
    ]
  };
}

// -------------------------------------------------------------------------
// 6. Persistent $100,000 Paper Trading Portfolio Engine
// -------------------------------------------------------------------------
const STORAGE_KEY = "apextrade_paper_portfolio_v2";

function loadStoredPortfolio() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // fallback to default
  }
  return {
    cash: 100000.0,
    equity: 100000.0,
    open_positions: [],
    trade_history: [],
    auto_pilot: false,
    daily_start_equity: 100000.0,
    risk_engine: {
      circuit_breaker_triggered: false,
      kill_switch_active: false,
      max_drawdown_limit: 0.08,
      daily_drawdown_limit: 0.04
    }
  };
}

function saveStoredPortfolio(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch (e) {
    // storage failed
  }
}

export function getClientPortfolio(currentPrices = {}) {
  const p = loadStoredPortfolio();
  let unrealizedTotal = 0;

  p.open_positions.forEach(pos => {
    const currPrice = currentPrices[pos.symbol] || pos.current_price || pos.entry_price;
    pos.current_price = currPrice;

    if (pos.side === "BUY") {
      pos.unrealized_pnl = parseFloat(((currPrice - pos.entry_price) * pos.qty).toFixed(2));
      pos.unrealized_pnl_pct = parseFloat((((currPrice - pos.entry_price) / pos.entry_price) * 100).toFixed(2));
    } else {
      pos.unrealized_pnl = parseFloat(((pos.entry_price - currPrice) * pos.qty).toFixed(2));
      pos.unrealized_pnl_pct = parseFloat((((pos.entry_price - currPrice) / pos.entry_price) * 100).toFixed(2));
    }
    unrealizedTotal += pos.unrealized_pnl;
  });

  const positionAssetValue = p.open_positions.reduce((sum, pos) => sum + (pos.qty * pos.current_price), 0);
  p.equity = parseFloat((p.cash + positionAssetValue + unrealizedTotal).toFixed(2));
  p.unrealized_pnl = parseFloat(unrealizedTotal.toFixed(2));
  p.unrealized_pnl_pct = p.equity > 0 ? parseFloat(((p.unrealized_pnl / 100000.0) * 100).toFixed(2)) : 0;

  const realizedPnl = p.trade_history.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
  p.realized_pnl = parseFloat(realizedPnl.toFixed(2));
  p.total_return_pct = parseFloat((((p.equity - 100000.0) / 100000.0) * 100).toFixed(2));

  const dailyStart = p.daily_start_equity || 100000.0;
  p.daily_pnl = parseFloat((p.equity - dailyStart).toFixed(2));
  p.daily_pnl_pct = parseFloat(((p.daily_pnl / dailyStart) * 100).toFixed(2));

  const wins = p.trade_history.filter(t => t.realized_pnl > 0);
  p.win_rate = p.trade_history.length > 0 ? parseFloat(((wins.length / p.trade_history.length) * 100).toFixed(1)) : 0;
  p.total_trades = p.trade_history.length;

  return p;
}

export function placeClientOrder(orderData, currentPrice) {
  const p = loadStoredPortfolio();
  const symbol = (orderData.symbol || "AAPL").toUpperCase();
  const side = orderData.side || "BUY";
  const qty = parseInt(orderData.qty) || 1;
  const price = currentPrice || orderData.price || 150.0;
  const cost = qty * price;

  if (p.cash < cost) {
    throw new Error(`Insufficient virtual balance: Required $${cost.toFixed(2)}, Available $${p.cash.toFixed(2)}`);
  }

  p.cash = parseFloat((p.cash - cost).toFixed(2));

  const defaultSl = side === "BUY" ? parseFloat((price * 0.97).toFixed(2)) : parseFloat((price * 1.03).toFixed(2));
  const defaultTp = side === "BUY" ? parseFloat((price * 1.06).toFixed(2)) : parseFloat((price * 0.94).toFixed(2));

  const newPosition = {
    id: `pos_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    symbol,
    side,
    qty,
    entry_price: price,
    current_price: price,
    unrealized_pnl: 0.0,
    unrealized_pnl_pct: 0.0,
    stop_loss: orderData.stop_loss ? parseFloat(orderData.stop_loss) : defaultSl,
    take_profit: orderData.take_profit ? parseFloat(orderData.take_profit) : defaultTp,
    open_time: new Date().toLocaleTimeString()
  };

  p.open_positions.unshift(newPosition);
  saveStoredPortfolio(p);
  return { success: true, portfolio: getClientPortfolio({ [symbol]: price }) };
}

export function closeClientPosition(posId, posSymbol, currentPrice, reason = "Manual Exit") {
  const p = loadStoredPortfolio();
  const idx = p.open_positions.findIndex(pos => pos.id === posId);
  if (idx === -1) {
    throw new Error("Position not found");
  }

  const pos = p.open_positions[idx];
  const price = currentPrice || pos.current_price || pos.entry_price;

  let realizedPnl = 0;
  if (pos.side === "BUY") {
    realizedPnl = (price - pos.entry_price) * pos.qty;
  } else {
    realizedPnl = (pos.entry_price - price) * pos.qty;
  }
  realizedPnl = parseFloat(realizedPnl.toFixed(2));
  const realizedPnlPct = parseFloat((((price - pos.entry_price) / pos.entry_price) * 100).toFixed(2));

  p.cash = parseFloat((p.cash + (pos.qty * pos.entry_price) + realizedPnl).toFixed(2));

  p.trade_history.unshift({
    id: `trade_${Date.now()}`,
    symbol: pos.symbol,
    side: pos.side,
    qty: pos.qty,
    entry_price: pos.entry_price,
    exit_price: price,
    realized_pnl: realizedPnl,
    realized_pnl_pct: realizedPnlPct,
    reason,
    close_time: new Date().toLocaleTimeString()
  });

  p.open_positions.splice(idx, 1);
  saveStoredPortfolio(p);
  return { success: true, portfolio: getClientPortfolio({ [posSymbol]: price }) };
}

export function toggleClientAutoPilot(enabled) {
  const p = loadStoredPortfolio();
  p.auto_pilot = enabled;
  saveStoredPortfolio(p);
  return { success: true, auto_pilot: enabled, portfolio: getClientPortfolio() };
}

export function resetClientPortfolio() {
  const fresh = {
    cash: 100000.0,
    equity: 100000.0,
    open_positions: [],
    trade_history: [],
    auto_pilot: false,
    daily_start_equity: 100000.0,
    risk_engine: {
      circuit_breaker_triggered: false,
      kill_switch_active: false,
      max_drawdown_limit: 0.08,
      daily_drawdown_limit: 0.04
    }
  };
  saveStoredPortfolio(fresh);
  return { success: true, portfolio: getClientPortfolio() };
}

export function triggerClientKillSwitch() {
  const p = loadStoredPortfolio();
  p.open_positions.forEach(pos => {
    let pnl = pos.side === "BUY" ? (pos.current_price - pos.entry_price) * pos.qty : (pos.entry_price - pos.current_price) * pos.qty;
    pnl = parseFloat(pnl.toFixed(2));
    p.cash += (pos.qty * pos.entry_price) + pnl;
    p.trade_history.unshift({
      id: `trade_${Date.now()}`,
      symbol: pos.symbol,
      side: pos.side,
      qty: pos.qty,
      entry_price: pos.entry_price,
      exit_price: pos.current_price,
      realized_pnl: pnl,
      realized_pnl_pct: parseFloat((((pos.current_price - pos.entry_price) / pos.entry_price) * 100).toFixed(2)),
      reason: "Kill Switch Emergency Exit",
      close_time: new Date().toLocaleTimeString()
    });
  });
  p.open_positions = [];
  p.auto_pilot = false;
  p.risk_engine.kill_switch_active = true;
  saveStoredPortfolio(p);
  return { success: true, portfolio: getClientPortfolio() };
}

// -------------------------------------------------------------------------
// 7. Continuous Live Market Tick Engine (Heartbeat)
// -------------------------------------------------------------------------
export function getClientLiveTick(symbol, currentPrice, candle, model = "Lion", horizon = 15, threshold = 65, repredict = false) {
  // Drift micro-tick: ensure non-zero for visible tick animation
  const rawDrift = (Math.random() - 0.48) * 0.002 * currentPrice;
  const delta = parseFloat((Math.abs(rawDrift) < 0.05 ? (rawDrift >= 0 ? 0.08 : -0.08) : rawDrift).toFixed(2));
  const newPrice = parseFloat(Math.max(1, currentPrice + delta).toFixed(2));

  const basePrice = TICKER_PRICES[symbol] || 150.0;
  const change24h = parseFloat((newPrice - basePrice).toFixed(2));
  const changePct24h = parseFloat((((newPrice - basePrice) / basePrice) * 100).toFixed(2));

  // Update current active candle preserving indicator overlay properties
  const updatedCandle = {
    ...candle,
    close: newPrice,
    high: parseFloat(Math.max(candle.high, newPrice).toFixed(2)),
    low: parseFloat(Math.min(candle.low, newPrice).toFixed(2))
  };

  // Update orderbook
  const orderbook = getClientOrderbook(symbol, newPrice);

  // Update portfolio mark-to-market and check SL / TP
  const p = loadStoredPortfolio();
  const toClose = [];

  p.open_positions.forEach(pos => {
    if (pos.symbol === symbol) {
      pos.current_price = newPrice;
      if (pos.side === "BUY") {
        if (pos.stop_loss && newPrice <= pos.stop_loss) {
          toClose.push({ pos, reason: `Stop-Loss Triggered ($${pos.stop_loss})` });
        } else if (pos.take_profit && newPrice >= pos.take_profit) {
          toClose.push({ pos, reason: `Take-Profit Triggered ($${pos.take_profit})` });
        }
      } else {
        if (pos.stop_loss && newPrice >= pos.stop_loss) {
          toClose.push({ pos, reason: `Stop-Loss Triggered ($${pos.stop_loss})` });
        } else if (pos.take_profit && newPrice <= pos.take_profit) {
          toClose.push({ pos, reason: `Take-Profit Triggered ($${pos.take_profit})` });
        }
      }
    }
  });

  // Auto-close any triggered positions
  toClose.forEach(({ pos, reason }) => {
    closeClientPosition(pos.id, pos.symbol, newPrice, reason);
  });

  // Re-predict if requested
  const prediction = repredict ? getClientPrediction(symbol, newPrice, model, horizon, threshold) : null;

  // Auto-Pilot autonomous execution if active
  if (p.auto_pilot && prediction && prediction.confidence >= threshold) {
    const existing = p.open_positions.find(pos => pos.symbol === symbol);
    if (!existing && p.cash >= 10000) {
      try {
        placeClientOrder({
          symbol,
          side: prediction.directional_bias === "Bullish" ? "BUY" : "SHORT",
          qty: Math.max(1, Math.floor(10000 / newPrice)),
          price: newPrice
        }, newPrice);
      } catch (e) {
        // order failed silently
      }
    }
  }

  const updatedPortfolio = getClientPortfolio({ [symbol]: newPrice });

  return {
    success: true,
    price: newPrice,
    tick_delta: delta,
    candle: updatedCandle,
    orderbook,
    prediction,
    portfolio: updatedPortfolio,
    info: {
      symbol,
      short_name: symbol,
      price: newPrice,
      base_price: basePrice,
      change_24h: change24h,
      change_pct_24h: changePct24h,
      change_24h_pct: changePct24h
    }
  };
}
