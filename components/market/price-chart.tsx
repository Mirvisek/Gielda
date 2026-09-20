"use client";

import { useState } from "react";
import { OHLCV } from "@/lib/market/types";

interface Props {
  candles: OHLCV[];
  timeframe: "1w" | "1m" | "3m" | "6m" | "1y";
  onTimeframeChange: (tf: "1w" | "1m" | "3m" | "6m" | "1y") => void;
  loading?: boolean;
}

export default function PriceChart({
  candles,
  timeframe,
  onTimeframeChange,
  loading = false,
}: Props) {
  const [chartType, setChartType] = useState<"CANDLE" | "LINE">("LINE");
  const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);

  if (candles.length === 0 && !loading) {
    return (
      <div className="h-64 flex items-center justify-center bg-slate-950/40 border border-slate-800/80 rounded-2xl text-xs text-slate-500">
        Brak danych historycznych dla wybranego zakresu.
      </div>
    );
  }

  // Wymiary SVG
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 60, bottom: 30, left: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Zakres cen
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  candles.forEach((c) => {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  });

  // Dodaj 5% marginesu na górze i dole
  const priceRange = maxPrice - minPrice || 1;
  const yMin = Math.max(0, minPrice - priceRange * 0.05);
  const yMax = maxPrice + priceRange * 0.05;

  const getY = (val: number) => {
    return padding.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
  };

  const getX = (index: number) => {
    if (candles.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (candles.length - 1)) * plotWidth;
  };

  // Ścieżka dla wykresu liniowego
  const linePoints = candles
    .map((c, i) => `${getX(i).toFixed(1)},${getY(c.close).toFixed(1)}`)
    .join(" ");

  // Gradient area
  const areaPoints = `${linePoints} ${getX(candles.length - 1).toFixed(1)},${height - padding.bottom} ${getX(0).toFixed(1)},${height - padding.bottom}`;

  const isPositive =
    candles.length > 1 ? candles[candles.length - 1].close >= candles[0].close : true;
  const strokeColor = isPositive ? "#10b981" : "#ef4444";

  const timeframes: ("1w" | "1m" | "3m" | "6m" | "1y")[] = ["1w", "1m", "3m", "6m", "1y"];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* Pasek kontrolny */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            Wykres Ceny
          </span>
          {hoveredCandle && (
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300">
              <span>O: {hoveredCandle.open.toFixed(2)}</span>
              <span>H: {hoveredCandle.high.toFixed(2)}</span>
              <span>L: {hoveredCandle.low.toFixed(2)}</span>
              <span className="font-bold text-slate-100">C: {hoveredCandle.close.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Przełącznik Liniowy / Świecowy */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setChartType("LINE")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                chartType === "LINE" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Linia
            </button>
            <button
              onClick={() => setChartType("CANDLE")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                chartType === "CANDLE" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Świece
            </button>
          </div>

          {/* Timeframe */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-colors cursor-pointer uppercase ${
                  timeframe === tf ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: "300px" }}>
        {loading && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center text-xs text-blue-400 z-10">
            Ładowanie notowań...
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Siatka pozioma */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight * ratio;
            const priceLabel = (yMax - ratio * (yMax - yMin)).toFixed(2);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                />
                <text
                  x={width - padding.right + 8}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {priceLabel}
                </text>
              </g>
            );
          })}

          {/* Wykres Liniowy */}
          {chartType === "LINE" && candles.length > 1 && (
            <>
              <polygon points={areaPoints} fill="url(#areaGradient)" />
              <polyline
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={linePoints}
              />
            </>
          )}

          {/* Wykres Świecowy */}
          {chartType === "CANDLE" &&
            candles.map((c, i) => {
              const x = getX(i);
              const isUp = c.close >= c.open;
              const candleColor = isUp ? "#10b981" : "#ef4444";
              const candleWidth = Math.max(2, Math.min(8, (plotWidth / candles.length) * 0.7));

              const openY = getY(c.open);
              const closeY = getY(c.close);
              const highY = getY(c.high);
              const lowY = getY(c.low);

              const bodyY = Math.min(openY, closeY);
              const bodyHeight = Math.max(1, Math.abs(closeY - openY));

              return (
                <g
                  key={i}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseEnter={() => setHoveredCandle(c)}
                  onMouseLeave={() => setHoveredCandle(null)}
                >
                  {/* Cień świecy (High-Low wick) */}
                  <line x1={x} y1={highY} x2={x} y2={lowY} stroke={candleColor} strokeWidth="1" />
                  {/* Ciało świecy */}
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyY}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={candleColor}
                    rx="1"
                  />
                </g>
              );
            })}

          {/* Oś czasu (pierwsza i ostatnia data) */}
          {candles.length > 0 && (
            <>
              <text
                x={padding.left}
                y={height - 5}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {new Date(candles[0].timestamp).toLocaleDateString()}
              </text>
              <text
                x={width - padding.right - 60}
                y={height - 5}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {new Date(candles[candles.length - 1].timestamp).toLocaleDateString()}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
