import React, { useState } from "react";
import type { HourlyPoint } from "../types/breathewise";

interface DispersionChartProps {
  series: HourlyPoint[];
  districtName: string;
  inversionActive: boolean;
}

export const DispersionChart: React.FC<DispersionChartProps> = ({
  series,
  districtName,
  inversionActive,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 720;
  const height = 220;
  const padLeft = 42;
  const padRight = 42;
  const padTop = 20;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxPm = Math.max(120, ...series.map((p) => p.pm25 + 12));
  const maxWind = Math.max(25, ...series.map((p) => p.windKmh + 4));

  const xFor = (idx: number) =>
    padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
  const yPmFor = (val: number) => padTop + plotH - (val / maxPm) * plotH;
  const yWindFor = (val: number) => padTop + plotH - (val / maxWind) * plotH;

  const pmPath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yPmFor(p.pm25).toFixed(1)}`)
    .join(" ");

  const pmAreaPath = `${pmPath} L ${xFor(series.length - 1).toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const windPath = series
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yWindFor(p.windKmh).toFixed(1)}`
    )
    .join(" ");

  const whoLineY = yPmFor(15);
  const activeIdx = hoveredIdx ?? series.length - 1;
  const activePoint = series[activeIdx];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            24-Hour Winter Dispersion & Boundary Wind
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {districtName} · WHO 24h PM2.5 guideline at 15 µg/m³ ·{" "}
            {inversionActive ? "Thermal inversion trap active" : "Air column mixing"}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
          <span>
            <span className="inline-block w-3 h-0.5 bg-teal-700 align-middle mr-1.5" />
            {activePoint.hour} PM2.5: <strong>{activePoint.pm25} µg/m³</strong>
          </span>
          <span>
            <span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-slate-500 align-middle mr-1.5" />
            Wind: <strong>{activePoint.windKmh} km/h</strong>
          </span>
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible cursor-crosshair select-none"
          role="img"
          aria-label={`24 hour PM2.5 and wind speed chart for ${districtName}`}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="pmFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f766e" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padTop + plotH * (1 - t);
            const val = Math.round(maxPm * t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  {val}
                </text>
              </g>
            );
          })}

          <line
            x1={padLeft}
            y1={whoLineY}
            x2={width - padRight}
            y2={whoLineY}
            stroke="#d97706"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text
            x={width - padRight - 4}
            y={whoLineY - 4}
            textAnchor="end"
            className="fill-amber-700 text-[10px] font-mono"
          >
            WHO 15 µg/m³
          </text>

          <path d={pmAreaPath} fill="url(#pmFill)" />
          <path
            d={pmPath}
            fill="none"
            stroke="#0f766e"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          <path
            d={windPath}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.6"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />

          {hoveredIdx !== null && (
            <line
              x1={xFor(hoveredIdx)}
              y1={padTop}
              x2={xFor(hoveredIdx)}
              y2={padTop + plotH}
              stroke="#94a3b8"
              strokeWidth="1"
            />
          )}

          {series.map((p, i) => {
            const cx = xFor(i);
            const cyPm = yPmFor(p.pm25);
            const cyWind = yWindFor(p.windKmh);
            const isActive = i === activeIdx;
            return (
              <g key={p.hour}>
                {i % 2 === 0 && (
                  <text
                    x={cx}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-mono tabular-nums"
                  >
                    {p.hour}
                  </text>
                )}

                <circle
                  cx={cx}
                  cy={cyPm}
                  r={isActive ? 4.5 : 2.5}
                  className={isActive ? "fill-teal-700" : "fill-teal-600/80"}
                />
                <circle
                  cx={cx}
                  cy={cyWind}
                  r={isActive ? 3.5 : 2}
                  className="fill-slate-500"
                />

                <rect
                  x={cx - plotW / (series.length * 2)}
                  y={padTop}
                  width={plotW / series.length}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onFocus={() => setHoveredIdx(i)}
                />
              </g>
            );
          })}

          <text
            x={width - padRight + 8}
            y={padTop + 6}
            className="fill-slate-400 text-[10px] font-mono"
          >
            {maxWind} km/h
          </text>
          <text
            x={width - padRight + 8}
            y={padTop + plotH}
            className="fill-slate-400 text-[10px] font-mono"
          >
            0
          </text>
        </svg>
      </div>
    </div>
  );
};
