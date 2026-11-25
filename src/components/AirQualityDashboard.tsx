import React from "react";
import { AlertCircle } from "lucide-react";
import type {
  ActiveLocationState,
  MeasuredBlock,
  ModelledBlock,
} from "../domain/airQualityTypes";
import type { TranslationBundle } from "../domain/i18n";
import { LocationSelector } from "./air-quality/LocationSelector";
import { MeasuredStationCard } from "./air-quality/MeasuredStationCard";
import { ModelledForecastCard } from "./air-quality/ModelledForecastCard";

export {
  getIndianCategoryStyle,
  type ActiveLocationState,
  type CpcbPollutantView,
  type CpcbStationView,
  type MeasuredBlock,
  type ModelledBlock,
  type ModelledHourlyRow,
} from "../domain/airQualityTypes";

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
  const selectedStation =
    measured?.status === "available" && measured.stations.length > 0
      ? (measured.stations[selectedCpcbIndex] ?? measured.stations[0])
      : null;

  return (
    <section
      id="dashboard"
      aria-labelledby="dashboard-section-heading"
      className="space-y-6"
    >
      <LocationSelector
        activeLocation={activeLocation}
        onSelectLocation={onSelectLocation}
        t={t}
      />

      {error && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-sm text-rose-900"
        >
          <AlertCircle
            aria-hidden="true"
            className="w-4 h-4 mt-0.5 shrink-0 text-rose-700"
          />
          <div>
            <p className="font-medium">Air-quality fetch error</p>
            <p className="text-xs text-rose-800 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <MeasuredStationCard
          measured={measured}
          selectedStation={selectedStation}
          selectedCpcbIndex={selectedCpcbIndex}
          onSelectCpcbIndex={onSelectCpcbIndex}
          loading={loading}
          t={t}
        />

        <ModelledForecastCard modelled={modelled} loading={loading} t={t} />
      </div>
    </section>
  );
};
