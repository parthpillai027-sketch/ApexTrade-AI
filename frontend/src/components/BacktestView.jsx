import React from 'react';
import { Target, TrendingUp, Award, Activity, CheckCircle2, XCircle, ShieldCheck, AlertOctagon, BarChart3, Percent, DollarSign } from 'lucide-react';

export default function BacktestView({ backtestData, isRunning, onRunBacktest }) {
  if (isRunning) {
    return (
      <div className="bg-[#0e131f] rounded-xl border border-[#1e293b] p-12 text-center">
        <Activity className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
        <h4 className="text-white font-bold text-base">Running Walk-Forward Historical Backtest...</h4>
        <p className="text-xs text-slate-400 mt-1">Evaluating rolling out-of-sample directional accuracy, 4 baselines, and friction costs.</p>
      </div>
    );
  }

  if (!backtestData) {
    return (
      <div className="bg-[#0e131f] rounded-xl border border-[#1e293b] p-8 text-center">
        <Award className="w-10 h-10 text-slate-500 mx-auto mb-2" />
        <h4 className="text-white font-bold text-base">Institutional Walk-Forward Backtester</h4>
        <p className="text-sm text-slate-400 mt-1">Simulate rolling out-of-sample predictions tested against 4 baselines with real trading friction.</p>
        <button 
          onClick={onRunBacktest}
          className="mt-4 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-cyan-500/20">
          Run Historical Walk-Forward Backtest
        </button>
      </div>
    );
  }

  const {
    model_evaluated = "Lion",
    mean_directional_accuracy = 50.0,
    edge_over_random = 0.0,
    mean_move_coverage = 50.0,
    win_rate = 50.0,
    profit_factor = 1.0,
    sharpe_ratio = 0.0,
    sortino_ratio = 0.0,
    max_drawdown_pct = 0.0,
    max_drawdown_dollars = 0.0,
    strategy_return_pct = 0.0,
    buy_and_hold_return_pct = 0.0,
    baselines_comparison = [],
    friction_breakdown = {},
    calibration_curve = [],
    auto_pilot_qualified = false,
    equity_curve = [],
    recent_trades = []
  } = backtestData;

  return (
    <div className="bg-[#0e131f] rounded-xl border border-[#1e293b] p-5 space-y-6">
      {/* Top Banner & Run Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#1e293b]">
        <div>
          <div className="flex items-center space-x-2">
            <Target className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">Walk-Forward Backtest & Benchmark Baselines</h3>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-cyan-400 border border-slate-700">
              Model: {model_evaluated}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Strict out-of-sample rolling validation with no lookahead leakage. Includes commissions, spread, and slippage.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Auto-Pilot Qualification Badge */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold flex items-center space-x-1.5 ${
            auto_pilot_qualified 
              ? 'bg-emerald-950/50 border-emerald-500 text-emerald-400' 
              : 'bg-rose-950/50 border-rose-500 text-rose-400'
          }`}>
            {auto_pilot_qualified ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertOctagon className="w-3.5 h-3.5" />}
            <span>{auto_pilot_qualified ? "AUTO-PILOT QUALIFIED" : "AUTO-PILOT LOCKED (SUB-BASELINE)"}</span>
          </div>

          <button 
            onClick={onRunBacktest}
            className="px-4 py-1.5 rounded-lg bg-[#1a2436] hover:bg-[#233148] border border-[#2a3a55] text-cyan-400 font-semibold text-xs transition-colors">
            Re-run Simulation
          </button>
        </div>
      </div>

      {/* KPI Cards: 6 core institutional metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Directional Accuracy */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Directional Accuracy (MDA)</div>
          <div className="text-xl font-bold font-mono text-white mt-1">{mean_directional_accuracy}%</div>
          <div className={`text-[11px] font-semibold mt-0.5 ${edge_over_random >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {edge_over_random >= 0 ? `+${edge_over_random}%` : `${edge_over_random}%`} vs Random
          </div>
        </div>

        {/* Win Rate & Profit Factor */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Simulated Win Rate</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">{win_rate}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Profit Factor: <strong className="text-white">{profit_factor}x</strong></div>
        </div>

        {/* Sharpe Ratio */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Sharpe Ratio (Ann.)</div>
          <div className={`text-xl font-bold font-mono mt-1 ${sharpe_ratio >= 1.0 ? "text-emerald-400" : (sharpe_ratio > 0 ? "text-white" : "text-rose-400")}`}>
            {sharpe_ratio}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Benchmark: &gt; 1.0x</div>
        </div>

        {/* Sortino Ratio */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Sortino Ratio (Ann.)</div>
          <div className={`text-xl font-bold font-mono mt-1 ${sortino_ratio >= 1.0 ? "text-emerald-400" : "text-white"}`}>
            {sortino_ratio}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Downside volatility risk</div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Maximum Drawdown</div>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">-{max_drawdown_pct}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">${max_drawdown_dollars.toLocaleString()} peak drop</div>
        </div>

        {/* Strategy Net PnL */}
        <div className="bg-[#090d15] p-3.5 rounded-lg border border-[#1e293b]">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Strategy Return (Net)</div>
          <div className={`text-xl font-bold font-mono mt-1 ${strategy_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {strategy_return_pct >= 0 ? `+${strategy_return_pct}%` : `${strategy_return_pct}%`}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Buy & Hold: {buy_and_hold_return_pct >= 0 ? `+${buy_and_hold_return_pct}%` : `${buy_and_hold_return_pct}%`}</div>
        </div>
      </div>

      {/* Baseline Comparisons Table */}
      <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>Out-of-Sample Benchmark Comparisons</span>
          </h4>
          <span className="text-[11px] font-mono text-slate-400">Friction deducted: {friction_breakdown.total_friction_per_trade_pct?.toFixed(2)}% / trade</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          A predictive model must consistently beat simple baseline heuristics (random walk, persistence, moving average) to validate authentic alpha.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left">
            <thead>
              <tr className="text-slate-400 border-b border-[#1c2637]">
                <th className="pb-2">STRATEGY / BASELINE</th>
                <th className="pb-2">DIRECTIONAL ACCURACY</th>
                <th className="pb-2">CUMULATIVE RETURN</th>
                <th className="pb-2">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#131b2c]">
              {baselines_comparison.map((b, idx) => (
                <tr key={idx} className={b.is_active ? "bg-cyan-950/20 font-bold" : "hover:bg-slate-800/20"}>
                  <td className="py-2.5 text-white flex items-center space-x-2">
                    {b.is_active && <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />}
                    <span>{b.name}</span>
                  </td>
                  <td className="py-2.5">
                    <span className={b.accuracy >= 52 ? "text-emerald-400" : (b.accuracy >= 50 ? "text-amber-400" : "text-rose-400")}>
                      {b.accuracy}%
                    </span>
                  </td>
                  <td className={`py-2.5 ${b.return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {b.return_pct >= 0 ? `+${b.return_pct}%` : `${b.return_pct}%`}
                  </td>
                  <td className="py-2.5">
                    {b.is_active ? (
                      <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px]">
                        EVALUATED MODEL
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                        BENCHMARK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calibration Curve & Equity Curve Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Empirical Confidence Calibration Curve */}
        <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Confidence Calibration Analysis</h4>
            <span className="text-[11px] text-slate-500">Predicted vs Realized Accuracy</span>
          </div>
          <p className="text-xs text-slate-400">
            Tests probability calibration: a "70% confidence" signal should historically succeed approximately 70% of the time.
          </p>

          <div className="space-y-3 pt-2">
            {calibration_curve.map((c, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400 font-semibold">{c.confidence_bin}</span>
                  <span className={c.empirical_accuracy >= 60 ? "text-emerald-400 font-bold" : (c.empirical_accuracy >= 50 ? "text-amber-400 font-bold" : "text-rose-400")}>
                    {c.empirical_accuracy}% Win Rate ({c.sample_count} samples)
                  </span>
                </div>
                <div className="h-2 w-full bg-[#151c2c] rounded-full overflow-hidden flex">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${c.is_calibrated ? "bg-emerald-400" : "bg-amber-400"}`}
                    style={{ width: `${Math.min(100, c.empirical_accuracy)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Equity Curve Visualizer */}
        <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Walk-Forward Equity vs Buy-and-Hold</h4>
              <span className="text-xs font-mono text-emerald-400">
                Strategy: ${equity_curve[equity_curve.length - 1]?.equity?.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              Comparing AI strategy equity curve (green) with passive Buy-and-Hold (dashed slate).
            </p>
          </div>

          {equity_curve.length > 1 && (
            <div className="w-full h-40 relative mt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 400 120" preserveAspectRatio="none">
                {(() => {
                  const values = equity_curve.map(e => e.equity);
                  const bhValues = equity_curve.map(e => e.bh_equity || e.equity);
                  const allVals = [...values, ...bhValues];
                  const min = Math.min(...allVals) * 0.98;
                  const max = Math.max(...allVals) * 1.02;
                  const range = max - min || 1;

                  const stratPoints = values.map((val, idx) => {
                    const x = (idx / (values.length - 1)) * 400;
                    const y = 120 - ((val - min) / range) * 120;
                    return `${x},${y}`;
                  }).join(' ');

                  const bhPoints = bhValues.map((val, idx) => {
                    const x = (idx / (bhValues.length - 1)) * 400;
                    const y = 120 - ((val - min) / range) * 120;
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <polygon points={`0,120 ${stratPoints} 400,120`} fill="url(#eqGrad)" />
                      <polyline points={bhPoints} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" />
                      <polyline points={stratPoints} fill="none" stroke="#10b981" strokeWidth="2.5" />
                    </>
                  );
                })()}
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Recent Evaluated Trades Table */}
      {recent_trades.length > 0 && (
        <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">Recent Out-of-Sample Walk-Forward Executions</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left">
              <thead>
                <tr className="text-slate-500 border-b border-[#1c2637]">
                  <th className="pb-2">ENTRY</th>
                  <th className="pb-2">EXIT</th>
                  <th className="pb-2">REGIME</th>
                  <th className="pb-2">BIAS</th>
                  <th className="pb-2">DECISION</th>
                  <th className="pb-2">CONF</th>
                  <th className="pb-2">PRED MOVE</th>
                  <th className="pb-2">ACTUAL MOVE</th>
                  <th className="pb-2">NET RETURN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#131b2c]">
                {recent_trades.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/20">
                    <td className="py-2 text-slate-400">{t.entry_time}</td>
                    <td className="py-2 text-slate-400">{t.exit_time}</td>
                    <td className="py-2 text-slate-300">{t.regime}</td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.bias === "Bullish" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"}`}>
                        {t.bias}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        t.trade_decision === "BUY" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                        (t.trade_decision === "SELL" ? "bg-rose-950 text-rose-400 border border-rose-800" : "bg-slate-900 text-slate-400 border border-slate-700")
                      }`}>
                        {t.trade_decision}
                      </span>
                    </td>
                    <td className="py-2 text-white">{t.confidence}%</td>
                    <td className="py-2 text-slate-300">{t.pred_return_pct > 0 ? `+${t.pred_return_pct}%` : `${t.pred_return_pct}%`}</td>
                    <td className="py-2 text-slate-300">{t.actual_return_pct > 0 ? `+${t.actual_return_pct}%` : `${t.actual_return_pct}%`}</td>
                    <td className="py-2 flex items-center space-x-1">
                      {t.is_win ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">{`+${t.net_return_pct}%`}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-400 font-bold">{`${t.net_return_pct}%`}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
