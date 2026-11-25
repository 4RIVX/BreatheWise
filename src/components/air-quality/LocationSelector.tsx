import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  findCityPreset,
  INDIAN_CITY_PRESETS,
  INDIAN_STATES,
  type IndianCityPreset,
} from "../../domain/indianCities";
import type { ActiveLocationState } from "../../domain/airQualityTypes";
import type { TranslationBundle } from "../../domain/i18n";

interface LocationSelectorProps {
  activeLocation: ActiveLocationState;
  onSelectLocation: (loc: ActiveLocationState) => void;
  t: TranslationBundle;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  activeLocation,
  onSelectLocation,
  t,
}) => {
  const [cityQuery, setCityQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [showCoordForm, setShowCoordForm] = useState(false);
  const coordKey = `${activeLocation.latitude}:${activeLocation.longitude}`;
  const [coordDraft, setCoordDraft] = useState<{
    key: string;
    lat: string;
    lon: string;
  } | null>(null);
  const latInput =
    coordDraft && coordDraft.key === coordKey
      ? coordDraft.lat
      : String(activeLocation.latitude);
  const lonInput =
    coordDraft && coordDraft.key === coordKey
      ? coordDraft.lon
      : String(activeLocation.longitude);
  const [coordLabel, setCoordLabel] = useState("");
  const [coordError, setCoordError] = useState<string | null>(null);

  const matchingCities = useMemo(
    () => findCityPreset(cityQuery, stateFilter).slice(0, 8),
    [cityQuery, stateFilter]
  );

  const handleSelectPreset = (preset: IndianCityPreset) => {
    setCoordError(null);
    setCoordDraft(null);
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
    const latTrim = latInput.trim();
    const lonTrim = lonInput.trim();
    const lat = Number(latTrim);
    const lon = Number(lonTrim);
    if (
      !latTrim ||
      !lonTrim ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      setCoordError(
        "Enter valid coordinates: latitude between -90 and 90, longitude between -180 and 180."
      );
      return;
    }
    setCoordError(null);
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
    <>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-teal-800 tracking-wide">
            {t.tagline}
          </p>
          <h1
            id="dashboard-section-heading"
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
              Search Indian City &amp; State
            </label>
            <button
              type="button"
              aria-expanded={showCoordForm}
              aria-controls="coordinate-entry-form"
              onClick={() => setShowCoordForm((prev) => !prev)}
              className="text-xs font-medium text-teal-800 hover:underline rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {showCoordForm ? "Hide Lat/Lon" : "Enter Lat/Lon"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="relative sm:col-span-7">
              <Search
                aria-hidden="true"
                className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                id="city-search-input"
                type="text"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Search city (Delhi, Chennai...)"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
              />
            </div>

            <div className="sm:col-span-5">
              <select
                aria-label="Filter by Indian state"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                  aria-pressed={isSelected}
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
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
          id="coordinate-entry-form"
          noValidate
          onSubmit={handleCoordinatesSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
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
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                min={-90}
                max={90}
                required
                value={latInput}
                onChange={(e) =>
                  setCoordDraft({
                    key: coordKey,
                    lat: e.target.value,
                    lon: lonInput,
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                min={-180}
                max={180}
                required
                value={lonInput}
                onChange={(e) =>
                  setCoordDraft({
                    key: coordKey,
                    lat: latInput,
                    lon: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Load Coordinates
            </button>
          </div>
          {coordError && (
            <p role="alert" className="text-xs text-rose-700 font-medium">
              {coordError}
            </p>
          )}
        </form>
      )}
    </>
  );
};
