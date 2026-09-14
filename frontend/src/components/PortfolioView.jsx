import React, { useState } from 'react';
import { 
  Wallet, DollarSign, ArrowUpRight, ArrowDownRight, Bot, Shield, 
  RotateCcw, CheckCircle2, AlertOctagon, TrendingUp, TrendingDown,
  Percent, Clock, Zap, Target, AlertTriangle, ShieldCheck, Flame
} from 'lucide-react';

export default function PortfolioView({
  portfolio,
  currentSymbol = 'AAPL',
  currentPrice = 100,
  prediction,
  backtestData,
  onPlaceOrder,
  onClosePosition,
  onToggleAutoPilot,
  onResetPortfolio,
  onTriggerKillSwitch
}) {
  const [orderSide, setOrderSide] = useState('BUY');
  const [allocationPct, setAllocationPct] = useState(0.10);
  const [customQty, setCustomQty] = useState('');
  const [stopLossInput, setStopLossInput] = useState('');
  const [takeProfitInput, setTakeProfitInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const [errorNotice, setErrorNotice] = useState('');

  const cash = portfolio?.cash ?? 100000;
  const equity = portfolio?.equity ?? 100000;
  const unrealizedPnl = portfolio?.unrealized_pnl ?? 0;
  const unrealizedPnlPct = portfolio?.unrealized_pnl_pct ?? 0;
  const realizedPnl = portfolio?.realized_pnl ?? 0;
  const totalReturnPct = portfolio?.total_return_pct ?? 0;
  const dailyPnl = portfolio?.daily_pnl ?? 0;
  const dailyPnlPct = portfolio?.daily_pnl_pct ?? 0;
  const winRate = portfolio?.win_rate ?? 0;
  const totalTrades = portfolio?.total_trades ?? 0;
  const autoPilot = portfolio?.auto_pilot ?? false;
  const positions = portfolio?.open_positions ?? [];
  const trades = portfolio?.trade_history ?? [];
  const riskEngine = portfolio?.risk_engine ?? {};

  // Compute calculated quantity
  const computedQty = customQty 
    ? parseInt(customQty) || 1
    : Math.max(1, Math.floor((cash * allocationPct) / (currentPrice || 1)));
  const estimatedCost = computedQty * currentPrice;

  // Default SL/TP prices
  const defaultSl = orderSide === 'BUY' 
    ? (currentPrice * 0.97).toFixed(2) 
    : (currentPrice * 1.03).toFixed(2);
  const defaultTp = orderSide === 'BUY' 
    ? (currentPrice * 1.06).toFixed(2) 
    : (currentPrice * 0.94).toFixed(2);

  // Volatility sizing guidance (1.5% risk on 2x ATR approx 3%)
  const suggestedAtrQty = Math.max(1, Math.floor((equity * 0.015) / (currentPrice * 0.03)));

  // Client-side Stop-Loss Validation
  const effectiveSl = stopLossInput ? parseFloat(stopLossInput) : parseFloat(defaultSl);
  const isSlInvalid = orderSide === 'BUY' ? (effectiveSl >= currentPrice) : (effectiveSl <= currentPrice);

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!currentPrice || currentPrice <= 0) return;
    if (isSlInvalid) {
      setErrorNotice(
        orderSide === 'BUY'
          ? `Stop-Loss ($${effectiveSl}) must be BELOW entry price ($${currentPrice.toFixed(2)}) for long orders.`
          : `Stop-Loss ($${effectiveSl}) must be ABOVE entry price ($${currentPrice.toFixed(2)}) for short orders.`
      );
      return;
    }

    setIsSubmitting(true);
    setStatusNotice('');
    setErrorNotice('');

    try {
      await onPlaceOrder({
        symbol: currentSymbol,
        side: orderSide,
        current_price: currentPrice,
        qty: customQty ? parseInt(customQty) : computedQty,
        stop_loss: effectiveSl,
        take_profit: takeProfitInput ? parseFloat(takeProfitInput) : parseFloat(defaultTp),
        reason: `Manual ${orderSide} [${currentSymbol}]`
      });
      setStatusNotice(`Executed ${orderSide} order for ${computedQty} shares of ${currentSymbol} at verified price.`);
      setTimeout(() => setStatusNotice(''), 4000);
      setCustomQty('');
      setStopLossInput('');
      setTakeProfitInput('');
    } catch (err) {
      setErrorNotice(err.message || 'Order execution failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAutoPilotQualified = backtestData?.auto_pilot_qualified ?? true;

  return (
    <div className="space-y-4">
      {/* Institutional Risk Engine State Strip */}
      <div className="bg-[#0e1320] p-3 rounded-xl border border-[#1e293b] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <Shield className={`w-4 h-4 ${riskEngine.kill_switch_active ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`} />
          <span className="font-bold text-white uppercase tracking-wider text-[11px]">Institutional Risk Engine:</span>
          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
            riskEngine.kill_switch_active 
              ? 'bg-rose-950 text-rose-400 border border-rose-800' 
              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
          }`}>
            {riskEngine.kill_switch_active ? 'KILL SWITCH ENGAGED' : 'OPERATIONAL • 12 RULES ENFORCED'}
          </span>
        </div>

        <div className="flex items-center space-x-4 font-mono text-[11px] text-slate-300">
          <div>
            <span className="text-slate-500">Daily PnL: </span>
            <strong className={dailyPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {dailyPnl >= 0 ? `+$${dailyPnl.toFixed(2)}` : `-$${Math.abs(dailyPnl).toFixed(2)}`} ({dailyPnlPct}%)
            </strong>
          </div>
          <div>
            <span className="text-slate-500">Max Loss Circuit Breaker: </span>
            <strong className="text-white">3.0%</strong>
          </div>
          <div>
            <span className="text-slate-500">Open Limits: </span>
            <strong className="text-cyan-400">{positions.length}/{riskEngine.max_open_positions || 5}</strong>
          </div>
        </div>

        {/* Emergency Kill Switch Button */}
        <button
          onClick={() => {
            if (window.confirm("EMERGENCY KILL SWITCH: This will immediately market-close ALL open positions, halt Auto-Pilot, and block all new orders. Confirm?")) {
              if (onTriggerKillSwitch) onTriggerKillSwitch();
            }
          }}
          className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-300 font-mono font-bold text-[10px] flex items-center space-x-1.5 transition-colors"
          title="Emergency Close All Positions and Halt Trading"
        >
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>EMERGENCY KILL SWITCH</span>
        </button>
      </div>

      {/* Top Portfolio KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Equity */}
        <div className="bg-[#0e1320] p-4 rounded-xl border border-[#1e293b]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Total Equity</span>
            <Wallet className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-black font-mono text-white mt-1">
            ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`flex items-center text-xs font-mono font-bold mt-1 ${totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalReturnPct >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
            {totalReturnPct >= 0 ? `+${totalReturnPct.toFixed(2)}%` : `${totalReturnPct.toFixed(2)}%`}
          </div>
        </div>

        {/* Available Cash */}
        <div className="bg-[#0e1320] p-4 rounded-xl border border-[#1e293b]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Available Cash</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono text-white mt-1">
            ${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">$100,000 Virtual Cap</span>
        </div>

        {/* Unrealized PnL */}
        <div className="bg-[#0e1320] p-4 rounded-xl border border-[#1e293b]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Unrealized PnL</span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className={`text-xl font-black font-mono mt-1 ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {unrealizedPnl >= 0 ? `+$${unrealizedPnl.toFixed(2)}` : `-$${Math.abs(unrealizedPnl).toFixed(2)}`}
          </div>
          <span className={`text-[11px] font-mono font-bold ${unrealizedPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {unrealizedPnlPct >= 0 ? `+${unrealizedPnlPct.toFixed(2)}%` : `${unrealizedPnlPct.toFixed(2)}%`}
          </span>
        </div>

        {/* Realized PnL */}
        <div className="bg-[#0e1320] p-4 rounded-xl border border-[#1e293b]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Realized PnL</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className={`text-xl font-black font-mono mt-1 ${realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {realizedPnl >= 0 ? `+$${realizedPnl.toFixed(2)}` : `-$${Math.abs(realizedPnl).toFixed(2)}`}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">{totalTrades} closed trades</span>
        </div>

        {/* Win Rate */}
        <div className="bg-[#0e1320] p-4 rounded-xl border border-[#1e293b]">
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>Win Rate</span>
            <Percent className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-black font-mono text-cyan-400 mt-1">
            {winRate.toFixed(1)}%
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Profit factor benchmark</span>
        </div>

        {/* AI Auto-Pilot Status */}
        <div className={`p-4 rounded-xl border transition-all ${
          autoPilot 
            ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/20' 
            : 'bg-[#0e1320] border-[#1e293b]'
        }`}>
          <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
            <span>AI Auto-Pilot</span>
            <Bot className={`w-3.5 h-3.5 ${autoPilot ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`text-lg font-black font-mono ${autoPilot ? 'text-emerald-400' : 'text-slate-400'}`}>
              {autoPilot ? 'ACTIVE' : 'LOCKED / OFF'}
            </span>
          </div>
          <button
            onClick={() => {
              if (!autoPilot && !isAutoPilotQualified) {
                alert("Auto-Pilot Locked: Strategy must pass out-of-sample standards (MDA >= 52%, Profit Factor >= 1.10x) before Auto-Pilot is permitted.");
                return;
              }
              onToggleAutoPilot(!autoPilot, backtestData);
            }}
            className={`mt-1.5 w-full py-1 rounded text-[11px] font-bold tracking-wide transition-all ${
              autoPilot 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/30' 
                : 'bg-[#1a2438] text-slate-300 border border-[#2a3852] hover:bg-[#25334d]'
            }`}
          >
            {autoPilot ? 'Disable Auto-Pilot' : 'Engage Auto-Pilot'}
          </button>
        </div>
      </div>

      {/* Main Row: Order Execution Ticket + AI Strategy Guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1 & 2: Quick Order Execution Terminal */}
        <div className="lg:col-span-2 bg-[#0e1320] rounded-xl border border-[#1e293b] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <span>⚡ Institutional Order Execution Ticket</span>
                <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800 text-[10px] font-mono text-cyan-400">
                  {currentSymbol} @ ${currentPrice?.toFixed(2)}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every trade is checked against position caps, sector limits, stop-loss direction, and cross-ticker validation.
              </p>
            </div>

            <button
              onClick={() => {
                if (window.confirm('Reset portfolio back to $100,000 initial capital?')) {
                  onResetPortfolio();
                }
              }}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[#141b2b] hover:bg-rose-950/40 hover:text-rose-400 border border-[#223049] text-xs font-mono text-slate-400 transition-colors"
              title="Reset portfolio to $100,000"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset $100k</span>
            </button>
          </div>

          {statusNotice && (
            <div className="mb-3 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-xs font-mono flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{statusNotice}</span>
            </div>
          )}

          {errorNotice && (
            <div className="mb-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-700 text-rose-300 text-xs font-mono flex items-center space-x-2">
              <AlertOctagon className="w-4 h-4 flex-shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          <form onSubmit={handleOrderSubmit} className="space-y-4">
            {/* Side Selection */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-2.5 rounded-lg font-mono font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400'
                    : 'bg-[#141b2b] text-slate-400 hover:text-white border border-[#223049]'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>BUY (LONG)</span>
              </button>

              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-2.5 rounded-lg font-mono font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                  orderSide === 'SELL'
                    ? 'bg-rose-500 text-black shadow-lg shadow-rose-500/25 ring-2 ring-rose-400'
                    : 'bg-[#141b2b] text-slate-400 hover:text-white border border-[#223049]'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                <span>SELL (SHORT)</span>
              </button>
            </div>

            {/* Position Size / Allocation Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Capital Allocation &amp; Sizing:</span>
                <span className="font-mono text-cyan-400 text-[11px]">
                  Suggested ATR Sizing: <strong>{suggestedAtrQty} shares</strong> (~${(suggestedAtrQty * currentPrice).toFixed(0)})
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: '5%', pct: 0.05 },
                  { label: '10%', pct: 0.10 },
                  { label: '15%', pct: 0.15 },
                  { label: '20% (Cap)', pct: 0.20 }
                ].map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setAllocationPct(item.pct);
                      setCustomQty('');
                    }}
                    className={`py-1.5 rounded-md font-mono text-xs font-semibold border transition-all ${
                      !customQty && allocationPct === item.pct
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                        : 'bg-[#141b2b] text-slate-400 border-[#223049] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <input
                  type="number"
                  placeholder="Custom Shares"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  className="px-2 py-1.5 rounded-md bg-[#141b2b] border border-[#223049] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-center"
                />
              </div>
            </div>

            {/* Stop Loss and Take Profit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className={`p-3 rounded-lg border transition-colors ${
                isSlInvalid ? 'bg-rose-950/30 border-rose-600' : 'bg-[#090d15] border-[#1e293b]'
              }`}>
                <label className="text-[11px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                  <span className="flex items-center text-rose-400 font-bold">
                    <AlertOctagon className="w-3 h-3 mr-1" /> Stop-Loss Target (Required)
                  </span>
                  <span className="text-slate-500">{orderSide === 'BUY' ? 'Must be < Entry' : 'Must be > Entry'}</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`$${defaultSl}`}
                  value={stopLossInput}
                  onChange={(e) => setStopLossInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#141b2b] border border-[#223049] text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="bg-[#090d15] p-3 rounded-lg border border-[#1e293b]">
                <label className="text-[11px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                  <span className="flex items-center text-emerald-400 font-bold">
                    <Target className="w-3 h-3 mr-1" /> Take-Profit Target
                  </span>
                  <span className="text-slate-500">Default +6%</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`$${defaultTp}`}
                  value={takeProfitInput}
                  onChange={(e) => setTakeProfitInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#141b2b] border border-[#223049] text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            {/* Order Summary & Submit Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#1e293b]">
              <div className="text-xs font-mono text-slate-400">
                <span>Est. Order: </span>
                <strong className="text-white">{computedQty} shares</strong>
                <span> ≈ </span>
                <strong className="text-cyan-400">${estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || estimatedCost > cash || computedQty <= 0 || isSlInvalid}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-mono font-bold text-xs tracking-wider flex items-center justify-center space-x-2 transition-all ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-md shadow-emerald-500/20'
                    : 'bg-rose-500 hover:bg-rose-400 text-black shadow-md shadow-rose-500/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'VERIFYING RISK...' : `PLACE ${orderSide} ORDER`}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Column 3: AI Forecast vs Trade Decision Panel */}
        <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white text-base">Trade Decision Engine</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Separates what the AI model predicts from whether expected returns remain attractive after deducting friction and risk:
            </p>

            <div className="mt-3 space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#090d15] border border-[#1e293b]">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Model Forecast Direction:</div>
                <div className={`font-mono font-bold text-sm mt-0.5 ${
                  prediction?.directional_bias === 'Bullish' ? 'text-emerald-400' : (prediction?.directional_bias === 'Bearish' ? 'text-rose-400' : 'text-amber-400')
                }`}>
                  {prediction?.directional_bias || 'Neutral'} ({prediction?.confidence_score ?? 50}% Conviction)
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#090d15] border border-[#1e293b]">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">Cost-Adjusted Trade Decision:</div>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                    prediction?.trade_decision === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' :
                    (prediction?.trade_decision === 'SELL' ? 'bg-rose-950 text-rose-400 border border-rose-700' : 'bg-slate-900 text-slate-400 border border-slate-700')
                  }`}>
                    {prediction?.trade_decision || 'DO NOT TRADE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  {prediction?.trade_rationale || "Evaluates expected return minus spread, commission, and loss probability."}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#090d15] p-3 rounded-lg border border-[#1e293b] space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Risk-to-Reward:</span>
              <strong className="text-white">{prediction?.risk_reward_ratio ? `${prediction.risk_reward_ratio}x` : 'N/A'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Probability of Loss:</span>
              <strong className={prediction?.probability_of_loss > 0.45 ? 'text-rose-400' : 'text-emerald-400'}>
                {prediction?.probability_of_loss ? `${(prediction.probability_of_loss * 100).toFixed(1)}%` : '50.0%'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Forecast Horizon:</span>
              <span className="text-slate-300 text-[11px]">{prediction?.forecast_horizon_time || "15 candles"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Positions Table */}
      <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <span>📊 Active Simulated Positions</span>
              <span className="px-2 py-0.5 rounded-full bg-[#1a2438] text-[10px] font-mono text-cyan-400">
                {positions.length} Open
              </span>
            </h3>
            <p className="text-xs text-slate-400">Verified exchange feeds with automatic Trailing Stop-Loss &amp; Take-Profit monitoring.</p>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-mono border border-dashed border-[#1c2637] rounded-lg">
            No open positions. Use the order ticket above to place simulated trades.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="text-slate-400 border-b border-[#1c2637]">
                  <th className="pb-2">ASSET</th>
                  <th className="pb-2">EXCHANGE</th>
                  <th className="pb-2">SIDE</th>
                  <th className="pb-2">SHARES</th>
                  <th className="pb-2">ENTRY</th>
                  <th className="pb-2">VERIFIED PRICE</th>
                  <th className="pb-2">STOP-LOSS</th>
                  <th className="pb-2">TAKE-PROFIT</th>
                  <th className="pb-2">UNREALIZED PnL</th>
                  <th className="pb-2 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141b2b]">
                {positions.map(pos => {
                  const isProfit = (pos.unrealized_pnl || 0) >= 0;
                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/20">
                      <td className="py-3 text-white font-bold">{pos.symbol}</td>
                      <td className="py-3 text-slate-400 text-[11px]">{pos.exchange || 'NASDAQ'}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pos.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {pos.side === 'BUY' ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300">{pos.qty}</td>
                      <td className="py-3 text-slate-300">${pos.entry_price?.toFixed(2)}</td>
                      <td className="py-3 text-white font-bold">${pos.current_price?.toFixed(2)}</td>
                      <td className="py-3 text-rose-400">${pos.stop_loss?.toFixed(2)}</td>
                      <td className="py-3 text-emerald-400">${pos.take_profit?.toFixed(2)}</td>
                      <td className={`py-3 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? `+$${pos.unrealized_pnl.toFixed(2)}` : `-$${Math.abs(pos.unrealized_pnl).toFixed(2)}`}
                        <span className="ml-1 text-[10px]">({isProfit ? '+' : ''}{pos.unrealized_pnl_pct.toFixed(1)}%)</span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onClosePosition(pos.id, pos.symbol, 'Manual Close')}
                          className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[11px] font-bold transition-colors"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade History Log */}
      <div className="bg-[#0e1320] rounded-xl border border-[#1e293b] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-white text-base flex items-center space-x-2">
              <span>📜 Immutable Trade Audit Journal</span>
              <span className="px-2 py-0.5 rounded-full bg-[#1a2438] text-[10px] font-mono text-slate-400">
                {trades.length} Recorded
              </span>
            </h3>
            <p className="text-xs text-slate-400">Auditable transaction log with cross-ticker verification, execution exchange, and timestamp.</p>
          </div>
        </div>

        {trades.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs font-mono border border-dashed border-[#1c2637] rounded-lg">
            No completed trades yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="text-slate-400 border-b border-[#1c2637]">
                  <th className="pb-2">ASSET</th>
                  <th className="pb-2">EXCHANGE</th>
                  <th className="pb-2">SIDE</th>
                  <th className="pb-2">SHARES</th>
                  <th className="pb-2">ENTRY</th>
                  <th className="pb-2">EXIT</th>
                  <th className="pb-2">REALIZED PnL</th>
                  <th className="pb-2">EXIT REASON</th>
                  <th className="pb-2">CLOSED AT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141b2b]">
                {trades.slice().reverse().map(t => {
                  const isWin = (t.realized_pnl || 0) >= 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/20">
                      <td className="py-2.5 text-white font-bold">{t.symbol}</td>
                      <td className="py-2.5 text-slate-400 text-[11px]">{t.exchange || 'NASDAQ'}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300">{t.qty}</td>
                      <td className="py-2.5 text-slate-300">${t.entry_price?.toFixed(2)}</td>
                      <td className="py-2.5 text-white font-bold">${t.exit_price?.toFixed(2)}</td>
                      <td className={`py-2.5 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isWin ? `+$${t.realized_pnl.toFixed(2)}` : `-$${Math.abs(t.realized_pnl).toFixed(2)}`}
                        <span className="ml-1 text-[10px]">({isWin ? '+' : ''}{t.realized_pnl_pct.toFixed(1)}%)</span>
                      </td>
                      <td className="py-2.5 text-slate-300 text-[11px]">
                        {t.exit_reason}
                      </td>
                      <td className="py-2.5 text-slate-500 text-[10px]">{t.closed_at}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
