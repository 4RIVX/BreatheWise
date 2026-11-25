import React, { useState } from "react";
import type { ModelledHourlyRow } from "./AirQualityDashboard";

interface DispersionChartProps {
  series: ModelledHourlyRow[];
  locationLabel: string;
}

export const DispersionChart: React.FC<DispersionChartProps> = ({
  series,
  locationLabel,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");

  if (!series || series.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
        Hourly modelled dispersion series is currently unavailable for{" "}
        {locationLabel}.
      </div>
    );
  }

  const width = 760;
  const height = 220;
  const padLeft = 44;
  const padRight = 48;
  const padTop = 20;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const pmValues = series.map((p) => p.pm25 ?? 0);
  const windValues = series.map((p) => p.windKmh ?? 0);
  const maxPm = Math.max(80, ...pmValues.map((v) => v + 15));
  const maxWind = Math.max(25, ...windValues.map((v) => v + 5));

  const xFor = (idx: number) =>
    padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
  const yPmFor = (val: number) => padTop + plotH - (val / maxPm) * plotH;
  const yWindFor = (val: number) => padTop + plotH - (val / maxWind) * plotH;

  const pmPath = series
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yPmFor(p.pm25 ?? 0).toFixed(1)}`
    )
    .join(" ");

  const pmAreaPath = `${pmPath} L ${xFor(series.length - 1).toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${xFor(0).toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const windPath = series
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yWindFor(p.windKmh ?? 0).toFixed(1)}`
    )
    .join(" ");

  const cpcbLineY = yPmFor(60);
  const activeIdx = hoveredIdx ?? series.length - 1;
  const activePoint = series[activeIdx];

  return (
    <section
      aria-labelledby="dispersion-chart-heading"
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="dispersion-chart-heading"
            className="text-base font-semibold text-slate-900"
          >
            Hourly Modelled PM2.5 &amp; Boundary Wind ({locationLabel})
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Open-Meteo regional model · CPCB 24h PM2.5 standard at 60 µg/m³ ·
            WHO 24h guideline at 15 µg/m³
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-700">
            <span>
              <span
                aria-hidden="true"
                className="inline-block w-3 h-0.5 bg-teal-700 align-middle mr-1.5"
              />
              {activePoint.hourLabel} PM2.5:{" "}
              <strong>{activePoint.pm25?.toFixed(1) ?? "—"} µg/m³</strong>
            </span>
            <span>
              <span
                aria-hidden="true"
                className="inline-block w-3 h-0.5 border-t-2 border-dashed border-slate-500 align-middle mr-1.5"
              />
              Wind:{" "}
              <strong>{activePoint.windKmh?.toFixed(1) ?? "—"} km/h</strong>
            </span>
          </div>

          <div
            role="group"
            aria-label="Chart or data table view"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              aria-pressed={viewMode === "chart"}
              onClick={() => setViewMode("chart")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                viewMode === "chart"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Chart
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "table"}
              onClick={() => setViewMode("table")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                viewMode === "table"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Data Table
            </button>
          </div>
        </div>
      </div>

      {viewMode === "chart" ? (
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible cursor-crosshair select-none"
            role="img"
            aria-labelledby="dispersion-chart-svg-title dispersion-chart-svg-desc"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <title id="dispersion-chart-svg-title">
              Hourly modelled PM2.5 and wind speed chart for {locationLabel}
            </title>
            <desc id="dispersion-chart-svg-desc">
              {series.length} hourly intervals. Latest point at{" "}
              {activePoint.hourLabel} shows PM2.5 of{" "}
              {activePoint.pm25?.toFixed(1) ?? "unavailable"} micrograms per
              cubic meter and wind speed of{" "}
              {activePoint.windKmh?.toFixed(1) ?? "unavailable"} kilometers per
              hour. Switch to the Data Table view for full tabular values.
            </desc>
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
                    className="fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {cpcbLineY >= padTop && (
              <>
                <line
                  x1={padLeft}
                  y1={cpcbLineY}
                  x2={width - padRight}
                  y2={cpcbLineY}
                  stroke="#d97706"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={width - padRight - 4}
                  y={cpcbLineY - 4}
                  textAnchor="end"
                  className="fill-amber-800 text-[10px] font-mono"
                >
                  CPCB 60 µg/m³
                </text>
              </>
            )}

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
              const cyPm = yPmFor(p.pm25 ?? 0);
              const cyWind = yWindFor(p.windKmh ?? 0);
              const isActive = i === activeIdx;
              return (
                <g key={p.timeIso}>
                  {i % 3 === 0 && (
                    <text
                      x={cx}
                      y={height - 10}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono tabular-nums"
                    >
                      {p.hourLabel}
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
                  />
                </g>
              );
            })}

            <text
              x={width - padRight + 8}
              y={padTop + 6}
              className="fill-slate-500 text-[10px] font-mono"
            >
              {Math.round(maxWind)} km/h
            </text>
            <text
              x={width - padRight + 8}
              y={padTop + plotH}
              className="fill-slate-500 text-[10px] font-mono"
            >
              0
            </text>
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th scope="col" className="py-2 px-3 font-medium">
                  Time (IST)
                </th>
                <th scope="col" className="py-2 px-3 font-medium text-right">
                  PM2.5 (µg/m³)
                </th>
                <th scope="col" className="py-2 px-3 font-medium text-right">
                  PM10 (µg/m³)
                </th>
                <th scope="col" className="py-2 px-3 font-medium text-right">
                  NO2 (µg/m³)
                </th>
                <th scope="col" className="py-2 px-3 font-medium text-right">
                  Wind (km/h)
                </th>
                <th scope="col" className="py-2 px-3 font-medium text-right">
                  Mixing Height (m)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {series.map((row) => (
                <tr key={row.timeIso} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-slate-800">{row.hourLabel}</td>
                  <td className="py-2 px-3 text-right text-slate-900">
                    {row.pm25?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {row.pm10?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {row.no2?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {row.windKmh?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {row.boundaryLayerHeightM !== null
                      ? Math.round(row.boundaryLayerHeightM)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
