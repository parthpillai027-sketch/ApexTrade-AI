import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, TrendingDown, Activity, Cpu, Search, 
  BarChart2, Layers, Award, AlertTriangle, RefreshCw, 
  Play, Pause, Zap, ArrowUpRight, ArrowDownRight, ShieldCheck,
  Wallet, Shield, Info, X, Flame, CheckCircle2, ChevronRight
} from 'lucide-react';

import FinancialChart from './components/FinancialChart';
import OrderbookView from './components/OrderbookView';
import BacktestView from './components/BacktestView';
import PortfolioView from './components/PortfolioView';

const QUICK_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT", "BTC-USD", "ETH-USD", "SPY", "QQQ"];
const TIMEFRAME_PRESETS = [
  { label: "1D", period: "1d", interval: "1m", desc: "1-Minute Intraday" },
  { label: "5D", period: "5d", interval: "5m", desc: "5-Minute Tactical" },
  { label: "1M", period: "1mo", interval: "1h", desc: "1-Hour Swing" },
  { label: "6M", period: "6mo", interval: "1d", desc: "Daily Trend (Default)" },
  { label: "1Y", period: "1y", interval: "1d", desc: "1-Year Daily" },
  { label: "5Y", period: "5y", interval: "1wk", desc: "5-Year Macro Weekly" },
];
const API_BASE = (typeof window !== 'undefined' && window.location && window.location.hostname)
  ? `http://${window.location.hostname}:5001`
  : "http://localhost:5001";

export default function App() {
  const [symbol, setSymbol] = useState("AAPL");
  const [customInput, setCustomInput] = useState("");
  const [period, setPeriod] = useState("6mo");
  const [barInterval, setBarInterval] = useState("1d");
  
  // Model Configuration
  const [model, setModel] = useState("Lion");
  const [horizon, setHorizon] = useState(15);
  const [threshold, setThreshold] = useState(65);

  // Live Continuous Market Streaming State
  const [isLiveStreaming, setIsLiveStreaming] = useState(true);
  const [tickSpeed, setTickSpeed] = useState(2000); // 2 seconds per tick
  const [tickCount, setTickCount] = useState(0);
  const [tickDirection, setTickDirection] = useState(null);
  const [ticksUntilAiSync, setTicksUntilAiSync] = useState(3);

  // Architecture & Disclosure Modal
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [showFeatureDriversModal, setShowFeatureDriversModal] = useState(false);

  // Overlays and Subcharts Toggles
  const [overlays, setOverlays] = useState({
    sma20: true,
    sma50: true,
    ema9: false,
    ema21: false,
    bb: true,
    pivots: true
  });
  const [subcharts, setSubcharts] = useState({
    volume: true,
    macd: true,
    rsi: true
  });

  // State Data
  const [marketData, setMarketData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [orderbook, setOrderbook] = useState(null);
  const [backtestData, setBacktestData] = useState(null);
  const [portfolio, setPortfolio] = useState(null);

  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingPredict, setLoadingPredict] = useState(false);
  const [loadingBacktest, setLoadingBacktest] = useState(false);
  const [activeTab, setActiveTab] = useState("portfolio");
  const [errorMsg, setErrorMsg] = useState("");

  // Refs for stable closure in continuous live loop
  const stateRef = useRef({
    symbol,
    period,
    barInterval,
    model,
    horizon,
    threshold,
    marketData,
    prediction,
    isLiveStreaming,
    tickCount
  });

  useEffect(() => {
    stateRef.current = {
      symbol,
      period,
      barInterval,
      model,
      horizon,
      threshold,
      marketData,
      prediction,
      isLiveStreaming,
      tickCount
    };
  }, [symbol, period, barInterval, model, horizon, threshold, marketData, prediction, isLiveStreaming, tickCount]);

  // 1. Initial Market Data Load
  const loadMarketData = async (targetSymbol = symbol, targetPeriod = period, targetInterval = barInterval) => {
    setLoadingMarket(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/market-data?symbol=${targetSymbol}&period=${targetPeriod}&interval=${targetInterval}`);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to load market data");
      }
      setMarketData(data);
      
      // Load DoM Orderbook
      fetchOrderbook(targetSymbol);

      // Run initial AI Prediction
      runModelPrediction(targetSymbol, targetPeriod, targetInterval, model, horizon, threshold);

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to fetch market data from research feed");
    } finally {
      setLoadingMarket(false);
    }
  };

  // 2. Fetch Orderbook
  const fetchOrderbook = async (targetSymbol = symbol) => {
    try {
      const res = await fetch(`${API_BASE}/api/orderbook?symbol=${targetSymbol}`);
      const data = await res.json();
      if (data.success) setOrderbook(data.orderbook);
    } catch (err) {
      console.error("Orderbook fetch error:", err);
    }
  };

  // 3. Run AI Prediction
  const runModelPrediction = async (
    s = symbol, p = period, i = barInterval, m = model, h = horizon, th = threshold
  ) => {
    setLoadingPredict(true);
    try {
      const res = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: s, period: p, interval: i, model: m, horizon: h, threshold: th })
      });
      const data = await res.json();
      if (data.success) {
        setPrediction(data);
      }
    } catch (err) {
      console.error("Prediction error:", err);
    } finally {
      setLoadingPredict(false);
    }
  };

  // 4. Run Backtest
  const handleRunBacktest = async () => {
    setLoadingBacktest(true);
    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, period: "1y", interval: barInterval, model, horizon: 5 })
      });
      const data = await res.json();
      if (data.success) {
        setBacktestData(data.backtest);
      }
    } catch (err) {
      console.error("Backtest error:", err);
    } finally {
      setLoadingBacktest(false);
    }
  };

  // 5. Portfolio Operations
  const fetchPortfolio = async (s = symbol) => {
    try {
      const res = await fetch(`${API_BASE}/api/portfolio?symbol=${s}`);
      const data = await res.json();
      if (data.success) {
        setPortfolio(data.portfolio);
      }
    } catch (err) {
      console.error("Portfolio fetch error:", err);
    }
  };

  const handlePlaceOrder = async (orderData) => {
    const res = await fetch(`${API_BASE}/api/portfolio/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to execute order");
    }
    if (data.portfolio) {
      setPortfolio(data.portfolio);
    }
    return data;
  };

  // CRITICAL FIX: Cross-Ticker Price Contamination Fix
  // Sends posId and posSymbol; server resolves and verifies authentic price for posSymbol
  const handleClosePosition = async (posId, posSymbol, reason = "Manual Exit") => {
    const res = await fetch(`${API_BASE}/api/portfolio/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_id: posId, symbol: posSymbol, reason })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to close position");
    }
    if (data.portfolio) {
      setPortfolio(data.portfolio);
    }
    return data;
  };

  const handleToggleAutoPilot = async (enabled, backtestMetrics = null) => {
    const res = await fetch(`${API_BASE}/api/portfolio/auto-pilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, metrics: backtestMetrics })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || "Auto-Pilot cannot be engaged.");
      return;
    }
    if (data.auto_pilot !== undefined) {
      setPortfolio(prev => prev ? { ...prev, auto_pilot: data.auto_pilot } : prev);
    }
  };

  const handleResetPortfolio = async () => {
    const res = await fetch(`${API_BASE}/api/portfolio/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success && data.portfolio) {
      setPortfolio(data.portfolio);
    }
  };

  const handleTriggerKillSwitch = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/risk/kill-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: "Manual Emergency Kill Switch Triggered by Operator" })
      });
      const data = await res.json();
      if (data.portfolio) {
        setPortfolio(data.portfolio);
      }
      alert("EMERGENCY KILL SWITCH ENGAGED: All open positions have been closed and Auto-Pilot is halted.");
    } catch (err) {
      alert("Failed to trigger kill switch: " + err.message);
    }
  };

  // Initial load on symbol/period/barInterval change
  useEffect(() => {
    loadMarketData();
    fetchPortfolio(symbol);
  }, [symbol, period, barInterval]);

  // 6. CONTINUOUS LIVE MARKET TICK ENGINE
  useEffect(() => {
    if (!isLiveStreaming) return;

    const timer = window.setInterval(async () => {
      const {
        symbol: currSymbol,
        barInterval: currInterval,
        model: currModel,
        horizon: currHorizon,
        threshold: currThreshold,
        marketData: currMD,
        tickCount: currentTicks
      } = stateRef.current;

      if (!currMD || !currMD.candles || currMD.candles.length === 0) return;

      const lastCandle = currMD.candles[currMD.candles.length - 1];
      const shouldRepredict = (currentTicks % 3 === 0);

      try {
        const res = await fetch(`${API_BASE}/api/live-tick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: currSymbol,
            current_price: lastCandle.close,
            candle: lastCandle,
            model: currModel,
            horizon: currHorizon,
            threshold: currThreshold,
            interval: currInterval,
            repredict: shouldRepredict
          })
        });
        const data = await res.json();
        if (data.success) {
          const dir = data.tick_delta >= 0 ? "up" : "down";
          setTickDirection(dir);
          setTimeout(() => setTickDirection(null), 600);

          setTickCount(prev => prev + 1);
          setTicksUntilAiSync(prev => (prev <= 1 ? 3 : prev - 1));

          setMarketData(prev => {
            if (!prev || !prev.candles || prev.candles.length === 0) return prev;
            const newCandles = [...prev.candles];
            newCandles[newCandles.length - 1] = {
              ...newCandles[newCandles.length - 1],
              ...data.candle
            };

            const prevBasePrice = prev.info?.price ? (prev.info.price - (prev.info.change_24h || 0)) : data.price;
            const newChange = data.price - prevBasePrice;
            const newChangePct = prevBasePrice > 0 ? (newChange / prevBasePrice) * 100 : 0;

            return {
              ...prev,
              candles: newCandles,
              info: {
                ...prev.info,
                price: data.price,
                change_24h: newChange,
                change_pct_24h: newChangePct
              }
            };
          });

          if (data.orderbook) {
            setOrderbook(data.orderbook);
          }

          if (data.prediction) {
            setPrediction(data.prediction);
          }

          if (data.portfolio) {
            setPortfolio(data.portfolio);
          }
        }
      } catch (err) {
        console.error("Live tick sync error:", err);
      }
    }, tickSpeed);

    return () => window.clearInterval(timer);
  }, [isLiveStreaming, tickSpeed]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (customInput.trim()) {
      const cleaned = customInput.trim().toUpperCase();
      setSymbol(cleaned);
      setCustomInput("");
    }
  };

  const info = marketData?.info || {};
  const quote = marketData?.quote || {};
  const currentPrice = info.price || (marketData?.candles?.length ? marketData.candles[marketData.candles.length - 1].close : 0);
  const isPositiveChange = (info.change_pct_24h || 0) >= 0;

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-[#0c101a]/95 backdrop-blur border-b border-[#1c2638] px-4 lg:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center font-bold text-black text-base shadow-lg shadow-cyan-500/20">
            ⚡
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-white text-base tracking-tight">ApexTrade AI</span>
              
              {/* Continuous Live Streaming Badge */}
              <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                isLiveStreaming 
                  ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/80 shadow-sm shadow-emerald-500/20" 
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}>
                <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                <span>{isLiveStreaming ? "SIMULATED TICK STREAM" : "STREAM PAUSED"}</span>
                {isLiveStreaming && <span className="font-mono text-[9px] text-emerald-300">#{tickCount}</span>}
              </div>

              {/* Data Feed Attribution Badge */}
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-400" title="Yahoo Finance research feed (15-min delayed during market hours)">
                Data: {quote.data_source ? "Yahoo (Research / 15m Delayed)" : "Verified Feed"}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Institutional AI Forecast Engine • Risk Controlled Execution Framework
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-3">
          {/* Architecture & Disclaimers Modal Trigger */}
          <button
            onClick={() => setShowComplianceModal(true)}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-[#141b2b] hover:bg-[#1f2a40] border border-[#223049] text-xs font-mono text-cyan-400 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Architecture &amp; Disclaimers</span>
          </button>

          {/* Emergency Kill Switch Header Button */}
          <button
            onClick={handleTriggerKillSwitch}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-300 text-xs font-mono font-bold transition-colors"
            title="Emergency Close All Positions"
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden md:inline">KILL SWITCH</span>
          </button>

          {/* Live Streaming Controls */}
          <div className="flex items-center space-x-1.5 bg-[#141b2b] px-2 py-1 rounded-lg border border-[#223049] text-xs font-mono">
            <button
              onClick={() => setIsLiveStreaming(!isLiveStreaming)}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-xs font-bold transition-all ${
                isLiveStreaming
                  ? "bg-emerald-500 text-black hover:bg-emerald-400"
                  : "bg-amber-500 text-black hover:bg-amber-400"
              }`}
              title={isLiveStreaming ? "Pause continuous market ticks" : "Resume continuous market ticks"}
            >
              {isLiveStreaming ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isLiveStreaming ? "Live" : "Resume"}</span>
            </button>

            {/* Speed Selector */}
            <div className="flex items-center space-x-1 text-[11px] text-slate-400 pl-1 border-l border-slate-700">
              <Zap className="w-3 h-3 text-cyan-400" />
              {[
                { label: "1s", val: 1000 },
                { label: "2s", val: 2000 },
                { label: "5s", val: 5000 }
              ].map(s => (
                <button
                  key={s.val}
                  onClick={() => setTickSpeed(s.val)}
                  className={`px-1.5 py-0.5 rounded ${
                    tickSpeed === s.val ? "bg-cyan-500/20 text-cyan-400 font-bold" : "hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Ticker Switcher */}
          <div className="hidden lg:flex items-center space-x-1 overflow-x-auto py-1">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => setSymbol(t)}
                className={`px-2 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                  symbol === t
                    ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/30"
                    : "bg-[#141b2b] text-slate-300 hover:bg-[#1f2a40]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Ticker..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="w-28 sm:w-36 pl-8 pr-2 py-1.5 rounded-lg bg-[#141b2b] border border-[#223049] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </form>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 space-y-5">
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 rounded-xl text-rose-200 text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Asset Quote & AI Prediction Header Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Main Price Box with Live Flash */}
          <div className={`p-4 rounded-xl border transition-all duration-300 lg:col-span-1 ${
            tickDirection === "up" 
              ? "bg-emerald-950/50 border-emerald-500 shadow-md shadow-emerald-500/20" 
              : (tickDirection === "down" 
                ? "bg-rose-950/50 border-rose-500 shadow-md shadow-rose-500/20" 
                : "bg-[#0e1320] border-[#1e293b]")
          }`}>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{symbol}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#1c2638] text-[10px] font-mono text-cyan-400">
                {quote.exchange || "NASDAQ"}
              </span>
            </div>
            
            <div className="text-2xl font-black font-mono text-white mt-1 flex items-baseline space-x-2">
              <span>${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-xs font-bold font-mono flex items-center ${isPositiveChange ? "text-emerald-400" : "text-rose-400"}`}>
                {isPositiveChange ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {isPositiveChange ? '+' : ''}{info.change_pct_24h?.toFixed(2) || '0.00'}%
              </span>
            </div>

            {/* AI Decision Indicator */}
            {prediction && (
              <div className="mt-2 pt-2 border-t border-[#1a2333] flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 text-[11px]">Decision:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  prediction.trade_decision === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' :
                  (prediction.trade_decision === 'SELL' ? 'bg-rose-950 text-rose-400 border border-rose-700' : 'bg-slate-900 text-slate-400 border border-slate-700')
                }`}>
                  {prediction.trade_decision || 'DO NOT TRADE'}
                </span>
              </div>
            )}
          </div>

          {/* KPI 1: AI Expected Return Range */}
          <div className="bg-[#0e1320] p-3.5 rounded-xl border border-[#1e293b]">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Expected Return Range</span>
            <div className={`text-lg font-bold font-mono mt-1 ${
              (prediction?.expected_return_pct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}>
              {prediction ? `${prediction.expected_return_pct > 0 ? '+' : ''}${prediction.expected_return_pct.toFixed(2)}%` : '--'}
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {prediction?.expected_return_range 
                ? `[${prediction.expected_return_range.min}% to ${prediction.expected_return_range.max}%]` 
                : `Over ${horizon} candles`}
            </span>
          </div>

          {/* KPI 2: Probability of Loss */}
          <div className="bg-[#0e1320] p-3.5 rounded-xl border border-[#1e293b]">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Probability of Loss</span>
            <div className={`text-lg font-bold font-mono mt-1 ${
              (prediction?.probability_of_loss || 0.5) > 0.44 ? "text-rose-400" : "text-emerald-400"
            }`}>
              {prediction ? `${(prediction.probability_of_loss * 100).toFixed(1)}%` : '--'}
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Conviction: {prediction?.confidence_score ?? 50}%
            </span>
          </div>

          {/* KPI 3: Risk-to-Reward Ratio */}
          <div className="bg-[#0e1320] p-3.5 rounded-xl border border-[#1e293b]">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Risk-to-Reward Ratio</span>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
              {prediction?.risk_reward_ratio ? `${prediction.risk_reward_ratio}x` : '1.0x'}
            </div>
            <span className="text-[11px] text-slate-500">Benchmark &gt; 1.4x</span>
          </div>

          {/* KPI 4: Forecast Horizon & Features */}
          <div className="bg-[#0e1320] p-3.5 rounded-xl border border-[#1e293b] flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Forecast Horizon</span>
              <div className="text-xs font-bold font-mono text-white mt-1">
                {prediction?.forecast_horizon_time || `${horizon} candles`}
              </div>
            </div>
            <button
              onClick={() => setShowFeatureDriversModal(true)}
              className="mt-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <span>Explain Drivers (4)</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* AI Model Strategy Ribbon */}
        <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center">
              <Cpu className="w-3.5 h-3.5 mr-1 text-cyan-400" /> Model Architecture:
            </span>

            {/* Model Selector */}
            <div className="flex items-center space-x-1.5 bg-[#080b11] p-1 rounded-lg border border-[#1a2333]">
              {[
                { id: "Lion", label: "🦁 Lion (LSTM)", desc: "Deep multi-step sequence projection" },
                { id: "Tiger", label: "🐯 Tiger (Breakout)", desc: "High-confidence threshold gated setup" }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    runModelPrediction(symbol, period, barInterval, m.id, horizon, threshold);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    model === m.id
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title={m.desc}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Timeframe Presets */}
            <div className="flex items-center space-x-1 bg-[#080b11] p-1 rounded-lg border border-[#1a2333] text-xs font-mono">
              {TIMEFRAME_PRESETS.map(tf => {
                const isActive = period === tf.period && barInterval === tf.interval;
                return (
                  <button
                    key={tf.label}
                    onClick={() => {
                      setPeriod(tf.period);
                      setBarInterval(tf.interval);
                    }}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      isActive
                        ? "bg-slate-700 text-cyan-400 font-bold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title={`${tf.desc} (${tf.period} / ${tf.interval})`}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders & Recalculate */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Horizon:</span>
              <input
                type="range"
                min="5"
                max="30"
                value={horizon}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setHorizon(val);
                  runModelPrediction(symbol, period, barInterval, model, val, threshold);
                }}
                className="w-20 accent-cyan-400 cursor-pointer"
              />
              <span className="font-bold text-cyan-400">{horizon}c</span>
            </div>

            <button
              onClick={() => runModelPrediction()}
              disabled={loadingPredict}
              className="p-1.5 rounded-lg bg-[#1a2333] hover:bg-[#25324a] text-slate-300 transition-colors flex items-center"
              title="Force Instant AI Re-Prediction"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPredict ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* AI Insight Bar */}
        {prediction?.summary && (
          <div className="bg-[#0f172a]/70 border-l-4 border-cyan-400 rounded-lg p-3 text-xs text-slate-300 flex items-center justify-between">
            <div>
              <strong className="text-cyan-400 font-bold mr-1">AI Market Insight:</strong>
              {prediction.summary}
            </div>
            {prediction.trade_decision && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ml-2 flex-shrink-0 ${
                prediction.trade_decision === "BUY" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                (prediction.trade_decision === "SELL" ? "bg-rose-950 text-rose-400 border border-rose-800" : "bg-slate-900 text-slate-400 border border-slate-700")
              }`}>
                {prediction.trade_decision}
              </span>
            )}
          </div>
        )}

        {/* Interactive Financial Chart Section */}
        <div className="space-y-2">
          {/* Indicator Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Overlays:</span>
              {[
                { id: "sma20", label: "SMA 20", color: "#38bdf8" },
                { id: "sma50", label: "SMA 50", color: "#f59e0b" },
                { id: "bb", label: "Bollinger Bands", color: "#a855f7" },
                { id: "pivots", label: "Pivots (S/R)", color: "#10b981" },
              ].map(item => (
                <label key={item.id} className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={overlays[item.id]}
                    onChange={(e) => setOverlays({ ...overlays, [item.id]: e.target.checked })}
                    className="rounded border-[#2a3852] bg-[#141b2b] text-cyan-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span style={{ color: overlays[item.id] ? item.color : '#94a3b8' }}>{item.label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Sub-charts:</span>
              {[
                { id: "volume", label: "Volume" },
                { id: "macd", label: "MACD" },
                { id: "rsi", label: "RSI (14)" },
              ].map(item => (
                <label key={item.id} className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={subcharts[item.id]}
                    onChange={(e) => setSubcharts({ ...subcharts, [item.id]: e.target.checked })}
                    className="rounded border-[#2a3852] bg-[#141b2b] text-cyan-400 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Chart Container */}
          <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-4">
            {loadingMarket ? (
              <div className="h-[450px] flex flex-col items-center justify-center space-y-3">
                <Activity className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-xs text-slate-400 font-mono">Loading candlesticks &amp; verifying quote feed...</p>
              </div>
            ) : (
              <FinancialChart
                candles={marketData?.candles || []}
                historicalCandles={marketData?.candles || []}
                predictionCandles={prediction?.future_candles || []}
                futureCandles={prediction?.future_candles || []}
                overlays={overlays}
                subcharts={subcharts}
                supportLevels={marketData?.support_levels || []}
                resistanceLevels={marketData?.resistance_levels || []}
                patterns={marketData?.patterns || []}
                isLiveStreaming={isLiveStreaming}
              />
            )}
          </div>
        </div>

        {/* Deep Dive Tabs */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-[#1e293b]">
            {[
              { id: "portfolio", label: "💼 Paper Trading & Risk Engine", icon: Wallet },
              { id: "dom", label: "📊 Simulated Order Book (DoM)", icon: Layers },
              { id: "backtest", label: "📈 Walk-Forward Backtesting", icon: Award },
              { id: "patterns", label: "🔍 Candlestick Formations", icon: BarChart2 }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: Paper Trading Portfolio */}
          {activeTab === "portfolio" && (
            <PortfolioView
              portfolio={portfolio}
              currentSymbol={symbol}
              currentPrice={currentPrice}
              prediction={prediction}
              backtestData={backtestData}
              onPlaceOrder={handlePlaceOrder}
              onClosePosition={handleClosePosition}
              onToggleAutoPilot={handleToggleAutoPilot}
              onResetPortfolio={handleResetPortfolio}
              onTriggerKillSwitch={handleTriggerKillSwitch}
            />
          )}

          {/* TAB 2: Depth of Market */}
          {activeTab === "dom" && (
            <OrderbookView orderbook={orderbook} />
          )}

          {/* TAB 3: Backtesting Studio */}
          {activeTab === "backtest" && (
            <BacktestView
              backtestData={backtestData}
              isRunning={loadingBacktest}
              onRunBacktest={handleRunBacktest}
            />
          )}

          {/* TAB 4: Candlestick Formations */}
          {activeTab === "patterns" && (
            <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-5">
              <h3 className="font-bold text-white text-base mb-1">Detected Formations &amp; Pivots</h3>
              <p className="text-xs text-slate-400 mb-4">
                Automated candlestick recognition scanner identifying classical continuation and reversal setups.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(marketData?.patterns || []).map((p, idx) => (
                  <div key={idx} className="bg-[#090d15] p-3 rounded-lg border border-[#1e293b]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{p.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.type === "Bullish" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                      }`}>
                        {p.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 font-mono">{p.time}</div>
                    <p className="text-xs text-slate-300 mt-1.5">{p.description}</p>
                  </div>
                ))}
              </div>

              {/* Support & Resistance */}
              <div className="mt-6 pt-4 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 font-bold uppercase mr-2">Key Resistance:</span>
                  <span className="text-rose-400">{(marketData?.resistance_levels || []).map(r => `$${r}`).join('  |  ')}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase mr-2">Key Support:</span>
                  <span className="text-emerald-400">{(marketData?.support_levels || []).map(s => `$${s}`).join('  |  ')}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Feature Drivers Modal */}
      {showFeatureDriversModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1320] border border-[#1e293b] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Key Feature Driver Attribution</h3>
              </div>
              <button onClick={() => setShowFeatureDriversModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              The neural and sequence models analyze multiple indicator regimes to synthesize directional conviction and expected excursions:
            </p>

            <div className="space-y-3">
              {(prediction?.feature_drivers || []).map((d, i) => (
                <div key={i} className="bg-[#090d15] p-3 rounded-lg border border-[#1e293b] space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">{d.feature}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      d.impact === "Bullish" ? "bg-emerald-950 text-emerald-400" :
                      (d.impact === "Bearish" ? "bg-rose-950 text-rose-400" : "bg-slate-800 text-slate-300")
                    }`}>
                      {d.impact}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{d.description}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowFeatureDriversModal(false)}
              className="w-full py-2 rounded-lg bg-[#141b2b] hover:bg-[#1f2a40] border border-[#223049] text-xs font-mono font-bold text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Compliance, Architecture & Model Cards Modal */}
      {showComplianceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e1320] border border-[#1e293b] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#1e293b]">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">System Architecture &amp; Regulatory Disclosures</h3>
              </div>
              <button onClick={() => setShowComplianceModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Architecture Diagram */}
            <div className="p-4 rounded-xl bg-[#090d15] border border-[#1e293b] space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                Non-Custodial Real Trading Flow Architecture
              </span>
              <div className="p-3 rounded bg-[#06080d] border border-[#141b2b] font-mono text-[11px] text-slate-300 overflow-x-auto">
                <code>Authenticated User ➔ ApexTrade AI ➔ Institutional Risk Engine ➔ Regulated Broker API ➔ Exchange Execution ➔ Broker-Held Funds ➔ User Bank Account</code>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong>ApexTrade AI is non-custodial software:</strong> It never holds customer funds, processes bank withdrawals, or stores broker passwords. Live orders require authorization through official regulated broker OAuth/API gateways.
              </p>
            </div>

            {/* SEBI & SEC Regulatory Disclosures */}
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <h4 className="font-bold text-white uppercase text-[11px] tracking-wider text-amber-400">
                Regulatory Notices &amp; Data Terms:
              </h4>
              <ul className="space-y-1.5 list-disc pl-4 text-slate-400 text-[11px]">
                <li>
                  <strong>Yahoo Finance Data Terms:</strong> Market data retrieved via public endpoints is intended strictly for personal research and educational use under Yahoo API Terms. It is not an authorized real-time execution feed.
                </li>
                <li>
                  <strong>SEBI Algorithmic Trading Framework (India):</strong> Under SEBI's retail algorithmic trading circular (Feb 2025), algorithmic orders placed through broker terminals require specialized exchange compliance, audit trails, and broker-level risk controls.
                </li>
                <li>
                  <strong>Simulated Order Book:</strong> Depth of Market order ladder is mathematically synthesized via a normal distribution algorithm for educational microstructure analysis and is not actual exchange liquidity.
                </li>
              </ul>
            </div>

            {/* Model Limitations */}
            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-white uppercase text-[11px] tracking-wider text-cyan-400">
                AI Model Cards &amp; Out-of-Sample Standards:
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded bg-[#090d15] border border-[#1e293b]">
                  <strong className="text-white block">🦁 Lion (Deep LSTM)</strong>
                  <span className="text-slate-400">Sequence memory model. Best in established trends; requires 25+ bars.</span>
                </div>
                <div className="p-2.5 rounded bg-[#090d15] border border-[#1e293b]">
                  <strong className="text-white block">🐯 Tiger (Breakout)</strong>
                  <span className="text-slate-400">Selective volatility squeeze filter. Fires infrequently on volume surges.</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowComplianceModal(false)}
              className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs"
            >
              I Understand &amp; Agree
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1c2638] px-6 py-3 bg-[#0a0d14] text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>ApexTrade AI • Institutional Risk &amp; Forecasting Engine</span>
        <span>Research &amp; Educational Sandbox • Not a solicitation to buy or sell securities.</span>
      </footer>
    </div>
  );
}
