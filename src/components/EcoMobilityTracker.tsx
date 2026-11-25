import React, { useMemo, useState } from "react";
import {
  calculateEcoImpact,
  EMISSION_FACTORS_INDIA,
  type EmissionFactorRecord,
  type TransportModeId,
} from "../domain/ecoImpact";
import type { TranslationBundle } from "../domain/i18n";
import type { FirestoreEcoTripLog } from "../firebase/firestoreService";

interface EcoMobilityTrackerProps {
  isSignedIn: boolean;
  savedLogs: FirestoreEcoTripLog[];
  onSaveTripLog: (log: {
    distanceKm: number;
    originalMode: string;
    alternativeMode: string;
    journeys: number;
    co2AvoidedKg: number;
    factorVersion: string;
  }) => Promise<void>;
  t: TranslationBundle;
}

const MODE_LIST = Object.values(EMISSION_FACTORS_INDIA);

interface EmissionFactorCardProps {
  titlePrefix: string;
  factor: EmissionFactorRecord;
}

const EmissionFactorCard: React.FC<EmissionFactorCardProps> = ({
  titlePrefix,
  factor,
}) => (
  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-semibold text-slate-800">
        {titlePrefix} · {factor.factorVersion} ({factor.publicationYear})
      </p>
      {factor.isIllustrativeEstimate && (
        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-100 text-amber-900 border border-amber-300">
          Illustrative Estimate
        </span>
      )}
    </div>
    <p>Scope: {factor.pollutantScope}</p>
    <p>
      Source: {factor.source} ({factor.pageOrTableRef})
    </p>
    {factor.verifiedGridFactorNote && (
      <p className="text-slate-700">{factor.verifiedGridFactorNote}</p>
    )}
    {factor.assumptionNote && (
      <p className="text-amber-900 font-medium">{factor.assumptionNote}</p>
    )}
    <p>
      Reference:{" "}
      <a
        href={factor.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-teal-800 underline break-all rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {factor.sourceUrl}
      </a>
    </p>
    <p>Units: {factor.units}</p>
    <p>Region: {factor.geographicRelevance}</p>
    <p>Limitations: {factor.limitations}</p>
  </div>
);

export const EcoMobilityTracker: React.FC<EcoMobilityTrackerProps> = ({
  isSignedIn,
  savedLogs,
  onSaveTripLog,
  t,
}) => {
  const [distanceKm, setDistanceKm] = useState<number>(12);
  const [originalMode, setOriginalMode] =
    useState<TransportModeId>("car_petrol");
  const [alternativeMode, setAlternativeMode] =
    useState<TransportModeId>("metro_rail");
  const [originalOccupancy, setOriginalOccupancy] = useState<number>(1);
  const [alternativeOccupancy, setAlternativeOccupancy] = useState<number>(1);
  const [journeys, setJourneys] = useState<number>(10);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  const origFactor = EMISSION_FACTORS_INDIA[originalMode];
  const altFactor = EMISSION_FACTORS_INDIA[alternativeMode];

  const impact = useMemo(() => {
    try {
      return calculateEcoImpact({
        distanceKm,
        originalMode,
        alternativeMode,
        originalOccupancy,
        alternativeOccupancy,
        journeys,
      });
    } catch {
      return null;
    }
  }, [
    distanceKm,
    originalMode,
    alternativeMode,
    originalOccupancy,
    alternativeOccupancy,
    journeys,
  ]);

  const handleSave = async () => {
    if (!impact || impact.emissionsAvoidedKg === null || !isSignedIn) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      await onSaveTripLog({
        distanceKm,
        originalMode: impact.originalFactor.label,
        alternativeMode: impact.alternativeFactor.label,
        journeys,
        co2AvoidedKg: impact.emissionsAvoidedKg,
        factorVersion: `${impact.originalFactor.factorVersion}/${impact.alternativeFactor.factorVersion}`,
      });
      setSaveFeedback({
        message: "Commute comparison saved to your Firestore log.",
        isError: false,
      });
    } catch (err) {
      setSaveFeedback({
        message:
          err instanceof Error ? err.message : "Could not save trip log.",
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="mobility"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="pb-5 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.sections.mobilityTitle}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Compare Indian commuting modes using documented, versioned emission
            factors.
          </p>
        </div>

        <button
          type="button"
          disabled={
            !isSignedIn ||
            !impact ||
            impact.emissionsAvoidedKg === null ||
            saving
          }
          onClick={handleSave}
          className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          {saving
            ? "Saving..."
            : isSignedIn
              ? "Save Commute Log"
              : "Sign in to Save Log"}
        </button>
      </div>

      {saveFeedback && (
        <p
          role={saveFeedback.isError ? "alert" : "status"}
          className={`text-xs font-medium ${saveFeedback.isError ? "text-rose-700" : "text-teal-800"}`}
        >
          {saveFeedback.message}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label
            htmlFor="commute-distance-input"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            One-Way Distance (km)
          </label>
          <input
            id="commute-distance-input"
            type="number"
            min={0.5}
            max={500}
            step={0.5}
            value={distanceKm}
            onChange={(e) =>
              setDistanceKm(Math.max(0.5, Number(e.target.value) || 0.5))
            }
            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
          />
        </div>

        <div>
          <label
            htmlFor="original-mode-select"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Original Transport Mode
          </label>
          <select
            id="original-mode-select"
            value={originalMode}
            onChange={(e) => setOriginalMode(e.target.value as TransportModeId)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
          >
            {MODE_LIST.map((m) => (
              <option key={m.modeId} value={m.modeId}>
                {m.label} ({m.fuelType})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="alternative-mode-select"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Alternative Transport Mode
          </label>
          <select
            id="alternative-mode-select"
            value={alternativeMode}
            onChange={(e) =>
              setAlternativeMode(e.target.value as TransportModeId)
            }
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
          >
            {MODE_LIST.map((m) => (
              <option key={m.modeId} value={m.modeId}>
                {m.label} ({m.fuelType})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="journeys-count-input"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Number of Journeys
          </label>
          <input
            id="journeys-count-input"
            type="number"
            min={1}
            max={365}
            value={journeys}
            onChange={(e) =>
              setJourneys(
                Math.max(1, Math.min(365, Number(e.target.value) || 1))
              )
            }
            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="orig-occ-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Orig. Occupants
            </label>
            <input
              id="orig-occ-input"
              type="number"
              min={1}
              max={6}
              disabled={!origFactor.supportsOccupancy}
              value={origFactor.supportsOccupancy ? originalOccupancy : 1}
              onChange={(e) =>
                setOriginalOccupancy(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="alt-occ-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Alt. Occupants
            </label>
            <input
              id="alt-occ-input"
              type="number"
              min={1}
              max={6}
              disabled={!altFactor.supportsOccupancy}
              value={altFactor.supportsOccupancy ? alternativeOccupancy : 1}
              onChange={(e) =>
                setAlternativeOccupancy(
                  Math.max(1, Number(e.target.value) || 1)
                )
              }
              className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>
        </div>
      </div>

      {impact && (
        <div className="space-y-5 pt-4 border-t border-slate-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-600">
                Estimated {impact.emissionsAvoidedMetricLabel} Avoided
              </p>
              {impact.emissionsAvoidedKg !== null ? (
                <p
                  className={`text-3xl font-mono font-bold tabular-nums mt-1 ${
                    impact.emissionsAvoidedKg >= 0
                      ? "text-emerald-800"
                      : "text-amber-800"
                  }`}
                >
                  {impact.emissionsAvoidedKg}{" "}
                  <span className="text-xs font-normal text-slate-600">kg</span>
                </p>
              ) : (
                <p className="text-sm font-semibold text-amber-800 mt-2">
                  Not subtracted (incompatible scopes)
                </p>
              )}
              <p className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                {impact.totalDistanceKm} km total
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-600">Vehicle Trips Avoided</p>
              <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                {impact.vehicleTripsAvoided}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Private motorized trips displaced
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-600">Baseline Mode Footprint</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                {impact.originalEmissionsKg}{" "}
                <span className="text-xs font-normal text-slate-600">
                  kg{" "}
                  {impact.originalEmissionsMetric === "ZERO"
                    ? "CO2 / CO2e"
                    : impact.originalEmissionsMetric}
                </span>
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {impact.originalFactor.label}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-600">Alternative Footprint</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                {impact.alternativeEmissionsKg}{" "}
                <span className="text-xs font-normal text-slate-600">
                  kg{" "}
                  {impact.alternativeEmissionsMetric === "ZERO"
                    ? "CO2 / CO2e"
                    : impact.alternativeEmissionsMetric}
                </span>
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                {impact.alternativeFactor.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
            <EmissionFactorCard
              titlePrefix="Original Factor"
              factor={impact.originalFactor}
            />
            <EmissionFactorCard
              titlePrefix="Alternative Factor"
              factor={impact.alternativeFactor}
            />
          </div>

          <div className="space-y-1 text-xs text-slate-600">
            {impact.scopeWarning && (
              <p className="text-amber-800 font-medium">
                {impact.scopeWarning}
              </p>
            )}
            <p>{impact.personalExposureDistinction}</p>
            <p>{impact.communityImpactDistinction}</p>
          </div>
        </div>
      )}

      {savedLogs.length > 0 && (
        <div className="pt-4 border-t border-slate-200">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            Saved Commute Comparisons (Firestore)
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {savedLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-slate-700">
                  {log.originalMode} → {log.alternativeMode} ({log.distanceKm}{" "}
                  km × {log.journeys})
                </span>
                <span className="font-mono tabular-nums text-emerald-800 font-semibold">
                  {log.co2AvoidedKg} kg GHG · {log.factorVersion}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
