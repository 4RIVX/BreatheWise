export type HouseholdProfileId =
  | "children"
  | "respiratory"
  | "seniors"
  | "commuter"
  | "general";

export type AqiStatusLabel =
  | "Good"
  | "Moderate"
  | "Sensitive Groups"
  | "Unhealthy";

export interface HourlyPoint {
  hour: string;
  pm25: number;
  windKmh: number;
}

export interface StationReading {
  id: string;
  district: string;
  corridor: string;
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  tempC: number;
  windKmh: number;
  humidityPct: number;
  inversionActive: boolean;
  inversionCeilingM: number;
  statusLabel: AqiStatusLabel;
  updatedAt: string;
  hourlySeries: HourlyPoint[];
}

export type SmogSourceType =
  | "Wood Smoke"
  | "Traffic Haze"
  | "Industrial Plume"
  | "Construction Dust"
  | "Inversion Fog";

export type ReportSeverity = "Mild" | "Moderate" | "Severe";

export interface SmogReport {
  id: string;
  neighborhood: string;
  districtId: string;
  sourceType: SmogSourceType;
  severity: ReportSeverity;
  notes: string;
  reportedAt: string;
  reporterLabel: string;
  verifiedCount: number;
}

export interface PersonalizedGuidance {
  headline: string;
  exposureWindow: string;
  outdoorAdvice: string;
  indoorProtocol: string[];
  maskGuidance: string;
  commuteRecommendation: string;
  generatedAt: string;
}

export type RoutineCategory =
  | "Mobility"
  | "Heating"
  | "Ventilation"
  | "Community";

export interface LowEmissionRoutine {
  id: string;
  title: string;
  description: string;
  category: RoutineCategory;
  pm25AvoidedGrams: number;
  co2SavedKg: number;
  cleanAirHours: number;
  completed: boolean;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
