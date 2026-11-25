import React from "react";
import {
  getIndianCategoryStyle,
  type CpcbStationView,
  type MeasuredBlock,
} from "../../domain/airQualityTypes";
import type { TranslationBundle } from "../../domain/i18n";

interface MeasuredStationCardProps {
  measured: MeasuredBlock | null;
  selectedStation: CpcbStationView | null;
  selectedCpcbIndex: number;
  onSelectCpcbIndex: (idx: number) => void;
  loading: boolean;
  t: TranslationBundle;
}

export const MeasuredStationCard: React.FC<MeasuredStationCardProps> = ({
  measured,
  selectedStation,
  selectedCpcbIndex,
  onSelectCpcbIndex,
  loading,
  t,
}) => {
  const isOpenAqStation = Boolean(
    selectedStation &&
    (selectedStation.feedOrigin === "openaq_v3" ||
      selectedStation.sourceLabel.includes("OpenAQ"))
  );

  return (
    <article className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
      <div className="space-y-4">
        <div className="pb-4 border-b border-slate-200">
          <p className="text-xs font-medium text-slate-600">
            {isOpenAqStation
              ? "Measured Station Data · OpenAQ v3 Hourly Feed"
              : `Measured Station Data · Resource ${measured?.resourceId ?? "3b01bcb8"}`}
          </p>
          <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
            {isOpenAqStation
              ? t.sections.openAqStationLabel
              : t.sections.measuredStationLabel}
          </h2>
        </div>

        {loading && !measured && (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <div className="h-6 bg-slate-200 rounded w-1/2" />
            <div className="h-20 bg-slate-100 rounded" />
          </div>
        )}

        {measured?.status === "unavailable" && (
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              Official CPCB Station Data Unavailable
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              {measured.message}
            </p>
            <p className="text-xs text-slate-600">
              Status: Unavailable · No fictional station values are generated.
            </p>
          </div>
        )}

        {measured?.status === "available" && selectedStation && (
          <div className="space-y-4">
            {measured.isPaginationComplete === false && (
              <div
                role="status"
                className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
              >
                Partial CPCB catalog notice: upstream API returned{" "}
                {measured.stations.length} station(s) before pagination ended
                {measured.totalRecordsReported
                  ? ` (reported total: ${measured.totalRecordsReported} records)`
                  : ""}
                . Verified AI context withholds incomplete station datasets.
              </div>
            )}

            {measured.stations.length > 1 && (
              <div>
                <label
                  htmlFor="cpcb-station-select"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Monitoring Station ({measured.stations.length} available)
                </label>
                <select
                  id="cpcb-station-select"
                  value={selectedCpcbIndex}
                  onChange={(e) => onSelectCpcbIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
                >
                  {measured.stations.map((st, idx) => (
                    <option key={st.stationName} value={idx}>
                      {st.stationName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <p className="text-xs text-slate-600">
                  {selectedStation.stationName} · {selectedStation.city},{" "}
                  {selectedStation.state}
                </p>
                {isOpenAqStation && (
                  <p className="text-xs text-slate-600 mt-1">
                    Upstream Provider:{" "}
                    {selectedStation.providerName || "OpenAQ v3 network"}
                    {selectedStation.ownerName &&
                    selectedStation.ownerName !== selectedStation.providerName
                      ? ` · Owner: ${selectedStation.ownerName}`
                      : ""}
                    {selectedStation.licenseAttribution
                      ? ` · License: ${selectedStation.licenseAttribution}`
                      : ""}
                  </p>
                )}
                {selectedStation.indianAqi.calculable ? (
                  <div className="mt-1 flex items-baseline gap-2.5">
                    <span className="text-4xl font-mono font-bold tabular-nums text-slate-900">
                      {selectedStation.indianAqi.aqi}
                    </span>
                    <span
                      className={`text-sm font-semibold ${getIndianCategoryStyle(
                        selectedStation.indianAqi.category
                      )}`}
                    >
                      {selectedStation.indianAqi.category} (Indian AQI)
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 space-y-1">
                    <p className="text-sm font-semibold text-amber-800">
                      Indian National AQI Not Calculable
                    </p>
                    <p className="text-xs text-slate-600">
                      {selectedStation.indianAqi.reasonIfNotCalculable}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-600 font-mono tabular-nums space-y-0.5">
              <p>
                Updated: {selectedStation.lastUpdatedRaw ?? "Timestamp missing"}
                {selectedStation.ageMinutes !== null &&
                  ` (${selectedStation.ageMinutes} min ago)`}
              </p>
              <p>
                Freshness:{" "}
                <strong
                  className={
                    selectedStation.stale
                      ? "text-amber-800"
                      : "text-emerald-800"
                  }
                >
                  {selectedStation.stale ? "Stale (>3h)" : "Recent"}
                </strong>{" "}
                ·{" "}
                {isOpenAqStation
                  ? "OpenAQ Hourly Station"
                  : "CPCB Measured Station"}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-700 mb-2">
                Reported Station Pollutants
              </p>
              <div className="grid grid-cols-2 gap-3">
                {selectedStation.pollutants.map((p) => (
                  <div
                    key={p.rawId}
                    className="border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <p className="text-xs text-slate-600">{p.code}</p>
                    <p className="text-base font-mono font-semibold tabular-nums text-slate-900">
                      {p.avg !== null ? p.avg : "NA"}{" "}
                      <span className="text-[11px] font-normal text-slate-600">
                        {p.unit}
                      </span>
                    </p>
                    {(p.stale === true || p.alignedWithStation === false) && (
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        {p.stale
                          ? "Stale (>3h) — excluded"
                          : "Unaligned (>1h) — excluded"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-600 pt-3 border-t border-slate-100">
        {isOpenAqStation
          ? `Source: OpenAQ v3 Hourly Monitoring Measurements${selectedStation?.providerName ? ` · Provider: ${selectedStation.providerName}` : ""}${selectedStation?.ownerName ? ` · Owner: ${selectedStation.ownerName}` : ""}. Indian AQI calculated by BreatheWise using CPCB methodology.`
          : "Source: Central Pollution Control Board (CPCB) via data.gov.in Open Government Data Platform."}
      </p>
    </article>
  );
};
