import React from "react";
import {
  getIndianCategoryStyle,
  type ModelledBlock,
} from "../../domain/airQualityTypes";
import type { TranslationBundle } from "../../domain/i18n";

interface ModelledForecastCardProps {
  modelled: ModelledBlock | null;
  loading: boolean;
  t: TranslationBundle;
}

export const ModelledForecastCard: React.FC<ModelledForecastCardProps> = ({
  modelled,
  loading,
  t,
}) => {
  return (
    <article className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
      <div className="space-y-5">
        <div className="pb-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-600">
              Modelled Simulation · Not a Monitoring-Station Measurement
            </p>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
              {t.sections.modelledForecastLabel}
            </h2>
          </div>
          {modelled?.currentTimeIso && (
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Model timestamp:{" "}
              {modelled.currentTimeIso.slice(0, 16).replace("T", " ")} IST
              {modelled.cached ? " · Cached" : ""}
            </span>
          )}
        </div>

        {loading && !modelled && (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <div className="h-8 bg-slate-200 rounded w-1/3" />
            <div className="h-24 bg-slate-100 rounded" />
          </div>
        )}

        {modelled?.status === "unavailable" && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              Modelled Forecast Unavailable
            </p>
            <p className="text-xs text-slate-600">{modelled.message}</p>
          </div>
        )}

        {modelled?.status === "available" && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <div>
                <p className="text-xs text-slate-600">
                  Modelled Rolling Indian AQI
                </p>
                {modelled.indianAqiFromRollingModel.calculable ? (
                  <>
                    <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                      {modelled.indianAqiFromRollingModel.aqi}
                    </p>
                    <p
                      className={`text-xs font-semibold mt-1 ${getIndianCategoryStyle(
                        modelled.indianAqiFromRollingModel.category
                      )}`}
                    >
                      {modelled.indianAqiFromRollingModel.category} · Prominent:{" "}
                      {modelled.indianAqiFromRollingModel.prominentPollutant}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-800 mt-1">
                    {modelled.indianAqiFromRollingModel.reasonIfNotCalculable}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-600">PM2.5 (Current Model)</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {modelled.currentPollutants.pm25?.toFixed(1) ?? "—"}{" "}
                  <span className="text-xs font-normal text-slate-600">
                    µg/m³
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                  PM10: {modelled.currentPollutants.pm10?.toFixed(1) ?? "—"}{" "}
                  µg/m³
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-600">Trace Gases (Model)</p>
                <div className="mt-1.5 space-y-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900">
                  <p className="flex flex-wrap gap-x-2">
                    <span className="whitespace-nowrap">
                      NO2 {modelled.currentPollutants.no2?.toFixed(1) ?? "—"}
                    </span>
                    <span className="whitespace-nowrap">
                      SO2 {modelled.currentPollutants.so2?.toFixed(1) ?? "—"}
                    </span>
                  </p>
                  <p className="whitespace-nowrap">
                    O3 {modelled.currentPollutants.ozone?.toFixed(1) ?? "—"}
                    <span className="text-xs font-normal text-slate-600">
                      {" "}
                      µg/m³
                    </span>
                  </p>
                </div>
                <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                  CO:{" "}
                  {modelled.currentPollutants.coUgm3 !== null
                    ? `${(modelled.currentPollutants.coUgm3 / 1000).toFixed(2)} mg/m³`
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-600">
                  Dispersion &amp; Weather
                </p>
                <p className="text-2xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {modelled.weather.windKmh?.toFixed(1) ?? "—"}{" "}
                  <span className="text-xs font-normal text-slate-600">
                    km/h
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                  {modelled.weather.temperatureC ?? "—"}°C ·{" "}
                  {modelled.weather.humidityPct ?? "—"}% RH · BLH{" "}
                  {modelled.weather.boundaryLayerHeightM !== null
                    ? `${Math.round(modelled.weather.boundaryLayerHeightM)} m`
                    : "—"}
                </p>
              </div>
            </div>

            {modelled.indianAqiFromRollingModel.subIndices.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-slate-700">
                    {t.sections.indianAqiTitle} — Pollutant Sub-Indices (24h/8h
                    Modelled Averages)
                  </h3>
                  {modelled.bestLowerPmWindow && (
                    <span className="text-xs text-teal-800 font-medium font-mono tabular-nums">
                      Lowest forecast PM2.5 window: {modelled.bestLowerPmWindow}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  {modelled.indianAqiFromRollingModel.subIndices.map((sub) => (
                    <div
                      key={sub.code}
                      className="border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <p className="text-xs font-medium text-slate-700">
                        {sub.code} ({sub.averagingPeriodHours}h)
                      </p>
                      <p className="text-lg font-mono font-bold tabular-nums text-slate-900 mt-0.5">
                        {sub.subIndex}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-600">
                        {sub.concentrationNormalized} {sub.normalizedUnit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-slate-600 pt-3 border-t border-slate-100">
        {t.disclaimers.modelledVsMeasured}
      </p>
    </article>
  );
};
