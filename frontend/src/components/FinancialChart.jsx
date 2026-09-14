import React, { useRef, useEffect, useState } from 'react';

export default function FinancialChart({
  candles = [],
  historicalCandles = [],
  predictionCandles = [],
  futureCandles = [],
  supportLevels = [],
  resistanceLevels = [],
  overlays = { sma20: true, sma50: true, ema9: false, ema21: false, bb: true, pivots: true },
  subcharts = { volume: true, macd: true, rsi: true },
  patterns = [],
  isLiveStreaming = false
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [mousePos, setMousePos] = useState({ x: null, y: null });

  const actualHistoricalCandles = (candles && candles.length > 0) ? candles : historicalCandles;
  const actualFutureCandles = (predictionCandles && predictionCandles.length > 0) ? predictionCandles : futureCandles;

  const allCandles = [
    ...actualHistoricalCandles.map(c => ({ ...c, isFuture: false })),
    ...actualFutureCandles.map(c => ({ ...c, isFuture: true }))
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || allCandles.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 580;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Layout configuration
    const padding = { top: 25, right: 65, bottom: 25, left: 15 };
    const plotWidth = width - padding.left - padding.right;

    // Subcharts heights
    const volumeHeight = subcharts.volume ? 65 : 0;
    const macdHeight = subcharts.macd ? 65 : 0;
    const rsiHeight = subcharts.rsi ? 55 : 0;
    const totalSubHeight = volumeHeight + macdHeight + rsiHeight;
    const mainHeight = height - padding.top - padding.bottom - totalSubHeight - (totalSubHeight > 0 ? 20 : 0);

    // Calculate Price Extents (Min and Max)
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    allCandles.forEach(c => {
      const low = c.isFuture && c.lower_band ? Math.min(c.low, c.lower_band) : c.low;
      const high = c.isFuture && c.upper_band ? Math.max(c.high, c.upper_band) : c.high;
      if (low < minPrice) minPrice = low;
      if (high > maxPrice) maxPrice = high;
      if (overlays.bb && c.bb_upper && c.bb_upper > maxPrice) maxPrice = c.bb_upper;
      if (overlays.bb && c.bb_lower && c.bb_lower < minPrice) minPrice = c.bb_lower;
    });

    if (overlays.pivots) {
      supportLevels.forEach(s => { if (s < minPrice) minPrice = s; });
      resistanceLevels.forEach(r => { if (r > maxPrice) maxPrice = r; });
    }

    const priceMargin = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= priceMargin;
    maxPrice += priceMargin;

    const priceRange = maxPrice - minPrice || 1;
    const priceToY = (price) => padding.top + (1 - (price - minPrice) / priceRange) * mainHeight;

    // Calculate Volume Extents
    let maxVol = 1;
    actualHistoricalCandles.forEach(c => { if (c.volume > maxVol) maxVol = c.volume; });

    // Background and Grid
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(0, 0, width, height);

    // Horizontal Price Grid Lines
    ctx.strokeStyle = "rgba(30, 41, 59, 0.7)";
    ctx.lineWidth = 1;
    const priceSteps = 6;
    for (let i = 0; i <= priceSteps; i++) {
      const p = minPrice + (i / priceSteps) * priceRange;
      const y = priceToY(p);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Price text labels on right
      ctx.fillStyle = "#64748b";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(p.toFixed(2), width - padding.right + 6, y + 3);
    }

    const nCandles = allCandles.length;
    const candleWidth = Math.max(3, Math.min(18, (plotWidth / nCandles) * 0.72));
    const stepX = plotWidth / nCandles;
    const getCandleX = (i) => padding.left + i * stepX + stepX / 2;

    // 1. Support & Resistance Pivots
    if (overlays.pivots) {
      ctx.setLineDash([4, 4]);
      supportLevels.forEach(s => {
        const y = priceToY(s);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.45)";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      });
      resistanceLevels.forEach(r => {
        const y = priceToY(r);
        ctx.strokeStyle = "rgba(244, 63, 94, 0.45)";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // 2. Future Forecast Uncertainty Band (95% Envelope)
    if (actualFutureCandles.length > 0) {
      const firstFutureIdx = actualHistoricalCandles.length;
      ctx.beginPath();
      for (let i = 0; i < actualFutureCandles.length; i++) {
        const idx = firstFutureIdx + i;
        const x = getCandleX(idx);
        const yUpper = priceToY(actualFutureCandles[i].upper_band || actualFutureCandles[i].high);
        if (i === 0) ctx.moveTo(x, yUpper);
        else ctx.lineTo(x, yUpper);
      }
      for (let i = actualFutureCandles.length - 1; i >= 0; i--) {
        const idx = firstFutureIdx + i;
        const x = getCandleX(idx);
        const yLower = priceToY(actualFutureCandles[i].lower_band || actualFutureCandles[i].low);
        ctx.lineTo(x, yLower);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(0, 229, 255, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 229, 255, 0.28)";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertical Split Line separating historical and AI prediction
      const splitX = getCandleX(firstFutureIdx - 1) + stepX / 2;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(splitX, padding.top);
      ctx.lineTo(splitX, padding.top + mainHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // AI Forecast Marker Text
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px Plus Jakarta Sans, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("AI FORECAST ZONE ▶", splitX + 8, padding.top + 16);
    }

    // 3. Technical Indicator Overlays Lines
    const drawLine = (prop, color, dash = []) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      actualHistoricalCandles.forEach((c, idx) => {
        if (c[prop] != null) {
          const x = getCandleX(idx);
          const y = priceToY(c[prop]);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        }
      });
      if (started) ctx.stroke();
      ctx.setLineDash([]);
    };

    if (overlays.sma20) drawLine('sma20', '#f59e0b');
    if (overlays.sma50) drawLine('sma50', '#3b82f6');
    if (overlays.ema9) drawLine('ema9', '#ec4899');
    if (overlays.ema21) drawLine('ema21', '#8b5cf6');
    if (overlays.bb) {
      drawLine('bb_upper', 'rgba(148, 163, 184, 0.45)', [3, 3]);
      drawLine('bb_lower', 'rgba(148, 163, 184, 0.45)', [3, 3]);
    }

    // 4. Candlesticks (Historical and Projected)
    allCandles.forEach((c, idx) => {
      const x = getCandleX(idx);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);
      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const isUp = c.close >= c.open;

      let candleColor;
      if (c.isFuture) {
        candleColor = isUp ? "#00E5FF" : "#FF9100";
      } else {
        candleColor = isUp ? "#10b981" : "#f43f5e";
      }

      // Wick
      ctx.strokeStyle = candleColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
      
      if (c.isFuture) {
        ctx.fillStyle = isUp ? "rgba(0, 229, 255, 0.35)" : "rgba(255, 145, 0, 0.35)";
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = 1.2;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
        ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      } else {
        ctx.fillStyle = candleColor;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    });

    // 4.5. Live Price Current Line and Tag
    if (actualHistoricalCandles.length > 0) {
      const lastHistCandle = actualHistoricalCandles[actualHistoricalCandles.length - 1];
      const liveY = priceToY(lastHistCandle.close);
      const isUp = lastHistCandle.close >= lastHistCandle.open;
      const lineColor = isUp ? "#10b981" : "#f43f5e";
      
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(padding.left, liveY);
      ctx.lineTo(width - padding.right, liveY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price badge on right axis
      ctx.fillStyle = lineColor;
      ctx.fillRect(width - padding.right, liveY - 9, padding.right, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${lastHistCandle.close.toFixed(2)}`, width - padding.right + 4, liveY + 3.5);

      // Live pulse dot at latest candle
      const latestX = getCandleX(actualHistoricalCandles.length - 1);
      ctx.beginPath();
      ctx.arc(latestX, liveY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    let currentSubY = padding.top + mainHeight + 15;

    // 5. Volume Subchart
    if (subcharts.volume) {
      // Subchart separator
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, currentSubY);
      ctx.lineTo(width - padding.right, currentSubY);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText("VOL", padding.left + 4, currentSubY + 12);

      actualHistoricalCandles.forEach((c, idx) => {
        const x = getCandleX(idx);
        const vHeight = (c.volume / maxVol) * (volumeHeight - 15);
        const y = currentSubY + volumeHeight - vHeight;
        const isUp = c.close >= c.open;
        ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.5)" : "rgba(244, 63, 94, 0.5)";
        ctx.fillRect(x - candleWidth / 2, y, candleWidth, vHeight);
      });

      currentSubY += volumeHeight + 10;
    }

    // 6. MACD Subchart
    if (subcharts.macd) {
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(padding.left, currentSubY);
      ctx.lineTo(width - padding.right, currentSubY);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText("MACD (12,26,9)", padding.left + 4, currentSubY + 12);

      // Find macd extents
      let maxMacd = 0.5;
      actualHistoricalCandles.forEach(c => {
        if (c.macd != null && Math.abs(c.macd) > maxMacd) maxMacd = Math.abs(c.macd);
        if (c.macd_hist != null && Math.abs(c.macd_hist) > maxMacd) maxMacd = Math.abs(c.macd_hist);
      });

      const macdZeroY = currentSubY + macdHeight / 2;
      const macdScale = (macdHeight / 2 - 8) / maxMacd;

      // Draw Histogram
      actualHistoricalCandles.forEach((c, idx) => {
        if (c.macd_hist != null) {
          const x = getCandleX(idx);
          const hHeight = c.macd_hist * macdScale;
          ctx.fillStyle = c.macd_hist >= 0 ? "rgba(16, 185, 129, 0.7)" : "rgba(244, 63, 94, 0.7)";
          ctx.fillRect(x - candleWidth / 2, macdZeroY - hHeight, candleWidth, hHeight);
        }
      });

      // Draw MACD and Signal line
      const drawMacdLine = (prop, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        actualHistoricalCandles.forEach((c, idx) => {
          if (c[prop] != null) {
            const x = getCandleX(idx);
            const y = macdZeroY - c[prop] * macdScale;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else { ctx.lineTo(x, y); }
          }
        });
        if (started) ctx.stroke();
      };

      drawMacdLine('macd', '#38bdf8');
      drawMacdLine('macd_signal', '#f97316');

      currentSubY += macdHeight + 10;
    }

    // 7. RSI Subchart
    if (subcharts.rsi) {
      ctx.strokeStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(padding.left, currentSubY);
      ctx.lineTo(width - padding.right, currentSubY);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "10px JetBrains Mono, monospace";
      ctx.fillText("RSI (14)", padding.left + 4, currentSubY + 12);

      const rsiToY = (val) => currentSubY + (1 - val / 100) * (rsiHeight - 12);
      
      // 70 and 30 reference lines
      ctx.strokeStyle = "rgba(244, 63, 94, 0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, rsiToY(70));
      ctx.lineTo(width - padding.right, rsiToY(70));
      ctx.stroke();

      ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
      ctx.beginPath();
      ctx.moveTo(padding.left, rsiToY(30));
      ctx.lineTo(width - padding.right, rsiToY(30));
      ctx.stroke();
      ctx.setLineDash([]);

      // RSI Curve
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let started = false;
      actualHistoricalCandles.forEach((c, idx) => {
        if (c.rsi14 != null) {
          const x = getCandleX(idx);
          const y = rsiToY(c.rsi14);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else { ctx.lineTo(x, y); }
        }
      });
      if (started) ctx.stroke();
    }

    // 8. Crosshair Cursor & Tooltip HUD
    if (mousePos.x != null && mousePos.y != null && mousePos.x >= padding.left && mousePos.x <= width - padding.right) {
      // Find nearest candle
      const relX = mousePos.x - padding.left;
      const nearestIdx = Math.max(0, Math.min(nCandles - 1, Math.floor(relX / stepX)));
      const activeCandle = allCandles[nearestIdx];
      const candleX = getCandleX(nearestIdx);

      // Draw crosshair lines
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(candleX, padding.top);
      ctx.lineTo(candleX, height - padding.bottom);
      ctx.stroke();

      // Horizontal line in main chart
      if (mousePos.y <= padding.top + mainHeight) {
        ctx.beginPath();
        ctx.moveTo(padding.left, mousePos.y);
        ctx.lineTo(width - padding.right, mousePos.y);
        ctx.stroke();

        // Price tag on axis
        const hoverPrice = minPrice + (1 - (mousePos.y - padding.top) / mainHeight) * priceRange;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(width - padding.right, mousePos.y - 9, padding.right, 18);
        ctx.fillStyle = "#ffffff";
        ctx.font = "10px JetBrains Mono, monospace";
        ctx.fillText(`$${hoverPrice.toFixed(2)}`, width - padding.right + 6, mousePos.y + 3);
      }
      ctx.setLineDash([]);

      // Update state for HUD display
      if (activeCandle !== hoveredCandle) {
        setHoveredCandle(activeCandle);
      }
    }

  }, [actualHistoricalCandles, actualFutureCandles, overlays, subcharts, mousePos, supportLevels, resistanceLevels]);

  const handleMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: null, y: null });
    setHoveredCandle(null);
  };

  const displayCandle = hoveredCandle || allCandles[allCandles.length - 1] || null;

  return (
    <div className="flex flex-col w-full bg-[#0a0d14] rounded-xl border border-[#1e293b] overflow-hidden">
      {/* Dynamic HUD Strip */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-[#0d121c] border-b border-[#1e293b] text-xs font-mono">
        <div className="flex items-center space-x-4">
          <span className="text-slate-400 font-semibold">{displayCandle?.time || 'Live'}</span>
          {displayCandle?.isFuture && (
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-bold">
              AI FORECAST
            </span>
          )}
          <span>O: <strong className="text-white">${displayCandle?.open?.toFixed(2)}</strong></span>
          <span>H: <strong className="text-white">${displayCandle?.high?.toFixed(2)}</strong></span>
          <span>L: <strong className="text-white">${displayCandle?.low?.toFixed(2)}</strong></span>
          <span>C: <strong className={displayCandle?.close >= displayCandle?.open ? "text-emerald-400" : "text-rose-400"}>
            ${displayCandle?.close?.toFixed(2)}
          </strong></span>
          {displayCandle?.volume != null && (
            <span className="text-slate-400">Vol: <strong className="text-slate-200">{displayCandle.volume.toLocaleString()}</strong></span>
          )}
        </div>

        <div className="flex items-center space-x-4 text-[11px] text-slate-400">
          {overlays.sma20 && displayCandle?.sma20 && <span>SMA20: <span className="text-amber-400">${displayCandle.sma20}</span></span>}
          {overlays.sma50 && displayCandle?.sma50 && <span>SMA50: <span className="text-blue-400">${displayCandle.sma50}</span></span>}
          {subcharts.rsi && displayCandle?.rsi14 && <span>RSI: <span className="text-purple-400">{displayCandle.rsi14}</span></span>}
          {subcharts.macd && displayCandle?.macd && <span>MACD: <span className="text-cyan-400">{displayCandle.macd}</span></span>}
        </div>
      </div>

      {/* Main Canvas Chart */}
      <div ref={containerRef} className="relative w-full cursor-crosshair">
        {allCandles.length === 0 ? (
          <div className="h-[520px] w-full flex items-center justify-center text-slate-500 font-mono text-xs">
            Connecting to market data feed...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="block w-full"
          />
        )}
      </div>
    </div>
  );
}
