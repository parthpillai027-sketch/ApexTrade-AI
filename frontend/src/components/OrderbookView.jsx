import React from 'react';
import { Layers, ArrowUpRight, ArrowDownRight, ShieldAlert, AlertTriangle, Info } from 'lucide-react';

export default function OrderbookView({ orderbook }) {
  if (!orderbook) {
    return (
      <div className="bg-[#0e131f] rounded-xl border border-[#1e293b] p-8 text-center text-slate-500 font-mono text-xs">
        Loading Simulated Orderbook Depth of Market...
      </div>
    );
  }

  const { bids = [], asks = [], spread, spread_pct, imbalance_ratio, bias, disclaimer } = orderbook;
  const isBuyPressure = imbalance_ratio >= 1.15;
  const isSellPressure = imbalance_ratio <= 0.85;

  return (
    <div className="bg-[#0e131f] rounded-xl border border-[#1e293b] p-5 space-y-4">
      {/* Prominent Simulated Disclaimer Banner */}
      <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs">
        <div className="flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider text-[11px] block">
              Simulated Order Book • Educational & Microstructure Visualization Only
            </span>
            <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
              {disclaimer || "Generated via Krafer's Gaussian normal distribution algorithm. This ladder simulates theoretical institutional market depth and buy/sell pressure; it does NOT represent actual exchange liquidity."}
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-wide border border-amber-500/40 flex-shrink-0">
          Synthetic Model
        </span>
      </div>

      {/* Header & Metrics Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[#1e293b]">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-base">
              Simulated Depth of Market (DoM) Ladder
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Synthetic Gaussian distribution algorithm modeling resting limit orders around market spread.
          </p>
        </div>

        {/* Spread & Imbalance Metrics */}
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Simulated Spread</span>
            <span className="font-mono font-bold text-white">${spread?.toFixed(3)} ({spread_pct?.toFixed(2)}%)</span>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Imbalance Ratio</span>
            <div className="flex items-center space-x-1 font-mono font-bold">
              <span className={isBuyPressure ? "text-emerald-400" : (isSellPressure ? "text-rose-400" : "text-amber-400")}>
                {imbalance_ratio}x
              </span>
              {isBuyPressure && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
              {isSellPressure && <ArrowDownRight className="w-4 h-4 text-rose-400" />}
            </div>
          </div>

          <div
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
            style={{
              backgroundColor: isBuyPressure ? "rgba(16, 185, 129, 0.15)" : (isSellPressure ? "rgba(244, 63, 94, 0.15)" : "rgba(245, 158, 11, 0.15)"),
              borderColor: isBuyPressure ? "#10b981" : (isSellPressure ? "#f43f5e" : "#f59e0b"),
              color: isBuyPressure ? "#34d399" : (isSellPressure ? "#fb7185" : "#fbbf24")
            }}
          >
            {bias}
          </div>
        </div>
      </div>

      {/* Side-by-side Orderbook Ladder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BIDS LADDER */}
        <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-3">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-400 pb-2 border-b border-[#1a2333]">
            <span>SIM BID (USD)</span>
            <span>SIZE</span>
            <span>CUMULATIVE</span>
            <span>DEPTH</span>
          </div>

          <div className="divide-y divide-[#151c2c] text-xs font-mono">
            {bids.map((b, i) => (
              <div key={i} className="relative flex items-center justify-between py-1.5 px-1 overflow-hidden group hover:bg-emerald-950/20 transition-colors">
                {/* Visual Depth Bar */}
                <div 
                  className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 pointer-events-none transition-all duration-300"
                  style={{ width: `${b.depth_pct}%` }}
                />
                
                <div className="flex items-center space-x-1.5 z-10">
                  <span className="font-semibold text-emerald-400">${b.price.toFixed(2)}</span>
                  {b.is_wall && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-sans flex items-center">
                      <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> WALL
                    </span>
                  )}
                </div>
                <span className="text-slate-300 z-10">{b.size.toLocaleString()}</span>
                <span className="text-slate-400 z-10">{b.cum_size.toLocaleString()}</span>
                <span className="text-emerald-500/70 z-10 text-[11px]">{b.depth_pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* ASKS LADDER */}
        <div className="bg-[#090d15] rounded-lg border border-[#1e293b] p-3">
          <div className="flex items-center justify-between text-xs font-bold text-rose-400 pb-2 border-b border-[#1a2333]">
            <span>SIM ASK (USD)</span>
            <span>SIZE</span>
            <span>CUMULATIVE</span>
            <span>DEPTH</span>
          </div>

          <div className="divide-y divide-[#151c2c] text-xs font-mono">
            {asks.map((a, i) => (
              <div key={i} className="relative flex items-center justify-between py-1.5 px-1 overflow-hidden group hover:bg-rose-950/20 transition-colors">
                {/* Visual Depth Bar */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-rose-500/10 pointer-events-none transition-all duration-300"
                  style={{ width: `${a.depth_pct}%` }}
                />

                <div className="flex items-center space-x-1.5 z-10">
                  <span className="font-semibold text-rose-400">${a.price.toFixed(2)}</span>
                  {a.is_wall && (
                    <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-sans flex items-center">
                      <ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> WALL
                    </span>
                  )}
                </div>
                <span className="text-slate-300 z-10">{a.size.toLocaleString()}</span>
                <span className="text-slate-400 z-10">{a.cum_size.toLocaleString()}</span>
                <span className="text-rose-500/70 z-10 text-[11px]">{a.depth_pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
