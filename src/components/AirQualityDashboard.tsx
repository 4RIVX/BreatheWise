import React, { useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import {
  findCityPreset,
  INDIAN_CITY_PRESETS,
  INDIAN_STATES,
  type IndianCityPreset,
} from "../domain/indianCities";
import type { IndianAqiCategory } from "../domain/indianAqi";
import type { TranslationBundle } from "../domain/i18n";

export interface CpcbPollutantView {
  code: string;
  rawId: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  unit: string;
}

export interface CpcbStationView {
  stationName: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  lastUpdatedRaw: string | null;
  lastUpdatedIso: string | null;
  stale: boolean;
  ageMinutes: number | null;
  pollutants: CpcbPollutantView[];
  indianAqi: {
    calculable: boolean;
    aqi: number | null;
    category: IndianAqiCategory | null;
    prominentPollutant: string | null;
    reasonIfNotCalculable: string | null;
    subIndices: {
      code: string;
      concentrationNormalized: number;
      normalizedUnit: string;
      subIndex: number;
      category: IndianAqiCategory;
      averagingPeriodHours: number;
    }[];
  };
  sourceLabel: string;
  isMeasured: true;
}

export interface MeasuredBlock {
  status: "available" | "unavailable";
  reason?: string;
  message: string;
  resourceId: string;
  stations: CpcbStationView[];
  cached: boolean;
  fetchedAtIso: string;
  totalRecordsReported?: number | null;
  isPaginationComplete?: boolean;
}

export interface ModelledHourlyRow {
  timeIso: string;
  hourLabel: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  ozone: number | null;
  coUgm3: number | null;
  windKmh: number | null;
  boundaryLayerHeightM: number | null;
}

export interface ModelledBlock {
  status: "available" | "unavailable";
  message: string;
  sourceLabel: string;
  isMeasured: false;
  latitude: number;
  longitude: number;
  currentTimeIso: string | null;
  stale: boolean;
  ageMinutes: number | null;
  currentPollutants: {
    pm25: number | null;
    pm10: number | null;
    no2: number | null;
    so2: number | null;
    ozone: number | null;
    coUgm3: number | null;
  };
  weather: {
    temperatureC: number | null;
    humidityPct: number | null;
    windKmh: number | null;
    boundaryLayerHeightM: number | null;
  };
  indianAqiFromRollingModel: {
    calculable: boolean;
    aqi: number | null;
    category: IndianAqiCategory | null;
    prominentPollutant: string | null;
    reasonIfNotCalculable: string | null;
    subIndices: {
      code: string;
      concentrationNormalized: number;
      normalizedUnit: string;
      subIndex: number;
      category: IndianAqiCategory;
      averagingPeriodHours: number;
    }[];
  };
  bestLowerPmWindow: string | null;
  hourlySeries: ModelledHourlyRow[];
  cached: boolean;
  fetchedAtIso: string;
}

export interface ActiveLocationState {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  source: "preset" | "search" | "geolocation" | "coordinates";
}

interface AirQualityDashboardProps {
  activeLocation: ActiveLocationState;
  onSelectLocation: (loc: ActiveLocationState) => void;
  measured: MeasuredBlock | null;
  modelled: ModelledBlock | null;
  selectedCpcbIndex: number;
  onSelectCpcbIndex: (idx: number) => void;
  loading: boolean;
  error: string | null;
  t: TranslationBundle;
}

export function getIndianCategoryStyle(cat: IndianAqiCategory | null): string {
  switch (cat) {
    case "Good":
      return "text-emerald-800";
    case "Satisfactory":
      return "text-teal-800";
    case "Moderate":
      return "text-amber-800";
    case "Poor":
      return "text-orange-800";
    case "Very Poor":
      return "text-rose-800";
    case "Severe":
      return "text-red-900";
    default:
      return "text-slate-700";
  }
}

export const AirQualityDashboard: React.FC<AirQualityDashboardProps> = ({
  activeLocation,
  onSelectLocation,
  measured,
  modelled,
  selectedCpcbIndex,
  onSelectCpcbIndex,
  loading,
  error,
  t,
}) => {
  const [cityQuery, setCityQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [showCoordForm, setShowCoordForm] = useState(false);
  const [latInput, setLatInput] = useState(String(activeLocation.latitude));
  const [lonInput, setLonInput] = useState(String(activeLocation.longitude));
  const [coordLabel, setCoordLabel] = useState("");

  const matchingCities = useMemo(
    () => findCityPreset(cityQuery, stateFilter).slice(0, 8),
    [cityQuery, stateFilter]
  );

  const selectedStation =
    measured?.status === "available" && measured.stations.length > 0
      ? (measured.stations[selectedCpcbIndex] ?? measured.stations[0])
      : null;

  const handleSelectPreset = (preset: IndianCityPreset) => {
    setLatInput(String(preset.latitude));
    setLonInput(String(preset.longitude));
    onSelectLocation({
      city: preset.city,
      state: preset.state,
      latitude: preset.latitude,
      longitude: preset.longitude,
      source: "preset",
    });
  };

  const handleManualCitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchingCities.length > 0) {
      handleSelectPreset(matchingCities[0]);
    }
  };

  const handleCoordinatesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return;
    }
    onSelectLocation({
      city:
        coordLabel.trim() ||
        `Coordinates (${lat.toFixed(2)}, ${lon.toFixed(2)})`,
      state: stateFilter !== "All" ? stateFilter : activeLocation.state,
      latitude: lat,
      longitude: lon,
      source: "coordinates",
    });
  };

  return (
    <section id="dashboard" className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-teal-800 tracking-wide">
            {t.tagline}
          </p>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1"
            style={{ textWrap: "balance" }}
          >
            {t.sections.dashboardTitle}
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
            {t.sections.dashboardSubtitle}
          </p>
        </div>

        <form
          onSubmit={handleManualCitySubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 w-full lg:w-[440px] shrink-0"
        >
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="city-search-input"
              className="text-xs font-medium text-slate-700"
            >
              Search Indian City & State
            </label>
            <button
              type="button"
              onClick={() => setShowCoordForm((prev) => !prev)}
              className="text-xs font-medium text-teal-800 hover:underline cursor-pointer"
            >
              {showCoordForm ? "Hide Lat/Lon" : "Enter Lat/Lon"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="relative sm:col-span-7">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="city-search-input"
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Search city (Delhi, Chennai...)"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="sm:col-span-5">
              <select
                aria-label="Filter by Indian state"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
              >
                <option value="All">All States</option>
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            role="group"
            aria-label="Quick select Indian cities"
            className="flex flex-wrap gap-1.5"
          >
            {(matchingCities.length > 0
              ? matchingCities
              : INDIAN_CITY_PRESETS.slice(0, 6)
            ).map((preset) => {
              const isSelected =
                preset.city.toLowerCase() === activeLocation.city.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-teal-700 text-white border-teal-700"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {preset.city}
                </button>
              );
            })}
          </div>
        </form>
      </div>

      {showCoordForm && (
        <form
          onSubmit={handleCoordinatesSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label
              htmlFor="custom-city-label"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Area Label
            </label>
            <input
              id="custom-city-label"
              type="text"
              value={coordLabel}
              onChange={(e) => setCoordLabel(e.target.value)}
              placeholder="e.g., Velachery, Chennai"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="lat-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Latitude
            </label>
            <input
              id="lat-input"
              type="number"
              step="0.0001"
              required
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="lon-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Longitude
            </label>
            <input
              id="lon-input"
              type="number"
              step="0.0001"
              required
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
          >
            Load Coordinates
          </button>
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-sm text-rose-900"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-700" />
          <div>
            <p className="font-medium">Air-quality fetch error</p>
            <p className="text-xs text-rose-800 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Panel 1: Official CPCB Monitoring Station Measurements */}
        <article className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="pb-4 border-b border-slate-200">
              <p className="text-xs font-medium text-slate-500">
                Measured Station Data · Resource{" "}
                {measured?.resourceId ?? "3b01bcb8"}
              </p>
              <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                {t.sections.measuredStationLabel}
              </h2>
            </div>

            {loading && !measured && (
              <div className="space-y-3 animate-pulse">
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
                <p className="text-xs text-slate-500">
                  Status: Unavailable · No fictional station values are
                  generated.
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
                    {measured.stations.length} station(s) before pagination
                    ended
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
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Monitoring Station ({measured.stations.length} available)
                    </label>
                    <select
                      id="cpcb-station-select"
                      value={selectedCpcbIndex}
                      onChange={(e) =>
                        onSelectCpcbIndex(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
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
                    <p className="text-xs text-slate-500">
                      {selectedStation.stationName} · {selectedStation.city},{" "}
                      {selectedStation.state}
                    </p>
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
                          Official Indian AQI Not Calculable
                        </p>
                        <p className="text-xs text-slate-600">
                          {selectedStation.indianAqi.reasonIfNotCalculable}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-mono tabular-nums space-y-0.5">
                  <p>
                    Updated:{" "}
                    {selectedStation.lastUpdatedRaw ?? "Timestamp missing"}
                    {selectedStation.ageMinutes !== null &&
                      ` (${selectedStation.ageMinutes} min ago)`}
                  </p>
                  <p>
                    Freshness:{" "}
                    <strong
                      className={
                        selectedStation.stale
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }
                    >
                      {selectedStation.stale ? "Stale (>3h)" : "Recent"}
                    </strong>{" "}
                    · Measured Station
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">
                    Reported Station Pollutants
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedStation.pollutants.map((p) => (
                      <div
                        key={p.rawId}
                        className="border border-slate-200 rounded-lg px-3 py-2"
                      >
                        <p className="text-xs text-slate-500">{p.code}</p>
                        <p className="text-base font-mono font-semibold tabular-nums text-slate-900">
                          {p.avg !== null ? p.avg : "NA"}{" "}
                          <span className="text-[11px] font-normal text-slate-500">
                            {p.unit}
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
            Source: Central Pollution Control Board (CPCB) via data.gov.in Open
            Government Data Platform.
          </p>
        </article>

        {/* Panel 2: Open-Meteo Modelled Regional Forecast */}
        <article className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-5">
            <div className="pb-4 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Modelled Simulation · Not a Monitoring-Station Measurement
                </p>
                <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                  {t.sections.modelledForecastLabel}
                </h2>
              </div>
              {modelled?.currentTimeIso && (
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  Model timestamp:{" "}
                  {modelled.currentTimeIso.slice(0, 16).replace("T", " ")} IST
                  {modelled.cached ? " · Cached" : ""}
                </span>
              )}
            </div>

            {loading && !modelled && (
              <div className="space-y-3 animate-pulse">
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
                    <p className="text-xs text-slate-500">
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
                          {modelled.indianAqiFromRollingModel.category} ·
                          Prominent:{" "}
                          {
                            modelled.indianAqiFromRollingModel
                              .prominentPollutant
                          }
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-amber-800 mt-1">
                        {
                          modelled.indianAqiFromRollingModel
                            .reasonIfNotCalculable
                        }
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      PM2.5 (Current Model)
                    </p>
                    <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                      {modelled.currentPollutants.pm25?.toFixed(1) ?? "—"}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        µg/m³
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                      PM10: {modelled.currentPollutants.pm10?.toFixed(1) ?? "—"}{" "}
                      µg/m³
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Trace Gases (Model)
                    </p>
                    <div className="mt-1.5 space-y-0.5 text-sm font-mono font-semibold tabular-nums text-slate-900">
                      <p>
                        NO2 {modelled.currentPollutants.no2?.toFixed(1) ?? "—"}{" "}
                        · SO2{" "}
                        {modelled.currentPollutants.so2?.toFixed(1) ?? "—"}
                      </p>
                      <p>
                        O3 {modelled.currentPollutants.ozone?.toFixed(1) ?? "—"}
                        <span className="text-xs font-normal text-slate-500">
                          {" "}
                          µg/m³
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                      CO:{" "}
                      {modelled.currentPollutants.coUgm3 !== null
                        ? `${(modelled.currentPollutants.coUgm3 / 1000).toFixed(2)} mg/m³`
                        : "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">
                      Dispersion & Weather
                    </p>
                    <p className="text-2xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                      {modelled.weather.windKmh?.toFixed(1) ?? "—"}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        km/h
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
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
                        {t.sections.indianAqiTitle} — Pollutant Sub-Indices
                        (24h/8h Modelled Averages)
                      </h3>
                      {modelled.bestLowerPmWindow && (
                        <span className="text-xs text-teal-800 font-medium font-mono tabular-nums">
                          Lowest forecast PM2.5 window:{" "}
                          {modelled.bestLowerPmWindow}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                      {modelled.indianAqiFromRollingModel.subIndices.map(
                        (sub) => (
                          <div
                            key={sub.code}
                            className="border border-slate-200 rounded-lg px-3 py-2"
                          >
                            <p className="text-xs font-medium text-slate-600">
                              {sub.code} ({sub.averagingPeriodHours}h)
                            </p>
                            <p className="text-lg font-mono font-bold tabular-nums text-slate-900 mt-0.5">
                              {sub.subIndex}
                            </p>
                            <p className="text-[11px] font-mono tabular-nums text-slate-500">
                              {sub.concentrationNormalized} {sub.normalizedUnit}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
            {t.disclaimers.modelledVsMeasured}
          </p>
        </article>
      </div>
    </section>
  );
};
