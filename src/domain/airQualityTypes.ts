import type { IndianAqiCategory } from "./indianAqi";

export interface CpcbPollutantView {
  code: string;
  rawId: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  unit: string;
  fresh?: boolean;
  stale?: boolean;
  ageMinutes?: number | null;
  alignedWithStation?: boolean;
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
  feedOrigin?: "cpcb_datagovin" | "openaq_v3";
  providerName?: string | null;
  ownerName?: string | null;
  licenseAttribution?: string | null;
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
