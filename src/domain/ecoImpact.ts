export type TransportModeId =
  | "car_petrol"
  | "car_diesel"
  | "car_cng"
  | "car_ev"
  | "two_wheeler_petrol"
  | "auto_cng"
  | "city_bus_diesel"
  | "city_bus_electric"
  | "metro_rail"
  | "suburban_rail"
  | "bicycle_walk";

export interface EmissionFactorRecord {
  modeId: TransportModeId;
  label: string;
  fuelType: string;
  kgCo2ePerVehicleKm: number | null;
  kgCo2ePerPassengerKm: number;
  defaultOccupancy: number;
  supportsOccupancy: boolean;
  isPrivateMotorizedVehicle: boolean;
  source: string;
  publicationYear: number;
  units: string;
  calculationMethod: string;
  geographicRelevance: string;
  limitations: string;
  factorVersion: string;
}

export const EMISSION_FACTORS_INDIA: Record<
  TransportModeId,
  EmissionFactorRecord
> = {
  car_petrol: {
    modeId: "car_petrol",
    label: "Petrol Car",
    fuelType: "Petrol (BS-IV/VI avg fleet)",
    kgCo2ePerVehicleKm: 0.171,
    kgCo2ePerPassengerKm: 0.171,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India / CII / TERI) — Road Transport v2.0",
    publicationYear: 2015,
    units: "kg CO2e per vehicle-km (divided by occupancy)",
    calculationMethod:
      "Tank-to-Wheel distance-based average passenger car factor",
    geographicRelevance: "India urban & highway passenger fleet",
    limitations:
      "Excludes upstream fuel refining; actual emissions vary with traffic congestion, AC load, and engine displacement.",
    factorVersion: "IN-GHG-ROAD-2015-v2",
  },
  car_diesel: {
    modeId: "car_diesel",
    label: "Diesel Car",
    fuelType: "Diesel",
    kgCo2ePerVehicleKm: 0.167,
    kgCo2ePerPassengerKm: 0.167,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India / CII / TERI) — Road Transport v2.0",
    publicationYear: 2015,
    units: "kg CO2e per vehicle-km (divided by occupancy)",
    calculationMethod: "Tank-to-Wheel distance-based average diesel car factor",
    geographicRelevance: "India urban passenger fleet",
    limitations:
      "CO2e only; diesel engines emit disproportionately higher NOx and PM2.5 than petrol per km.",
    factorVersion: "IN-GHG-ROAD-2015-v2",
  },
  car_cng: {
    modeId: "car_cng",
    label: "CNG Car",
    fuelType: "Compressed Natural Gas",
    kgCo2ePerVehicleKm: 0.129,
    kgCo2ePerPassengerKm: 0.129,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India) — CNG Passenger Vehicle Factor",
    publicationYear: 2015,
    units: "kg CO2e per vehicle-km (divided by occupancy)",
    calculationMethod: "Tank-to-Wheel distance-based CNG passenger factor",
    geographicRelevance: "Indian metro cities (Delhi NCR, Mumbai, Ahmedabad)",
    limitations: "Excludes upstream methane leakage in distribution pipelines.",
    factorVersion: "IN-GHG-CNG-2015-v2",
  },
  car_ev: {
    modeId: "car_ev",
    label: "Electric Car (India Grid)",
    fuelType: "Grid Electricity (0.716 kg CO2/kWh)",
    kgCo2ePerVehicleKm: 0.115,
    kgCo2ePerPassengerKm: 0.115,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source:
      "CEA CO2 Baseline Database for Indian Power Sector v19.0 + ARAI EV consumption (~0.16 kWh/km)",
    publicationYear: 2023,
    units: "kg CO2e per vehicle-km (grid-weighted, divided by occupancy)",
    calculationMethod:
      "Average Indian grid weighted emission factor (0.716 kg CO2/kWh) × 0.16 kWh/km",
    geographicRelevance: "All-India Grid (2022-23 baseline)",
    limitations:
      "Zero tailpipe exhaust, but upstream grid intensity depends on state renewable share and charging losses.",
    factorVersion: "CEA-GRID-2023-v19",
  },
  two_wheeler_petrol: {
    modeId: "two_wheeler_petrol",
    label: "Petrol Two-Wheeler",
    fuelType: "Petrol (Motorcycle / Scooter)",
    kgCo2ePerVehicleKm: 0.049,
    kgCo2ePerPassengerKm: 0.049,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India) — Two-Wheeler Fleet Average",
    publicationYear: 2015,
    units: "kg CO2e per vehicle-km (divided by occupancy)",
    calculationMethod: "Tank-to-Wheel Indian two-wheeler average (100–150cc)",
    geographicRelevance: "India urban commuting fleet",
    limitations:
      "Rider faces direct roadside PM2.5/NO2 exposure without cabin filtration.",
    factorVersion: "IN-GHG-2W-2015-v2",
  },
  auto_cng: {
    modeId: "auto_cng",
    label: "CNG Auto-Rickshaw",
    fuelType: "CNG",
    kgCo2ePerVehicleKm: 0.068,
    kgCo2ePerPassengerKm: 0.068,
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: false,
    source: "India GHG Program / WRI India — Three-Wheeler Urban Factor",
    publicationYear: 2015,
    units: "kg CO2e per vehicle-km (divided by passenger occupancy)",
    calculationMethod: "Tank-to-Wheel distance-based CNG three-wheeler factor",
    geographicRelevance: "Indian urban corridors",
    limitations:
      "Open-cabin design offers minimal protection against ambient traffic particulate spikes.",
    factorVersion: "IN-GHG-3W-2015-v2",
  },
  city_bus_diesel: {
    modeId: "city_bus_diesel",
    label: "City Bus (Diesel)",
    fuelType: "Diesel (Public Transit)",
    kgCo2ePerVehicleKm: null,
    kgCo2ePerPassengerKm: 0.032,
    defaultOccupancy: 35,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source: "India GHG Program (WRI India) / ASRTU Public Bus Benchmark",
    publicationYear: 2015,
    units: "kg CO2e per passenger-km",
    calculationMethod:
      "Average urban bus emissions divided by typical 35-passenger load",
    geographicRelevance: "Indian state & municipal transport undertakings",
    limitations:
      "Per-passenger footprint rises during off-peak low-occupancy hours.",
    factorVersion: "IN-GHG-BUS-2015-v2",
  },
  city_bus_electric: {
    modeId: "city_bus_electric",
    label: "Electric Bus (India Grid)",
    fuelType: "Grid Electricity",
    kgCo2ePerVehicleKm: null,
    kgCo2ePerPassengerKm: 0.018,
    defaultOccupancy: 35,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source:
      "CEA CO2 Baseline v19.0 + FAME-II Urban E-Bus Benchmark (~0.88 kWh/km)",
    publicationYear: 2023,
    units: "kg CO2e per passenger-km",
    calculationMethod:
      "Grid factor (0.716 kg/kWh) × 0.88 kWh/km ÷ 35 avg passengers",
    geographicRelevance: "Indian smart city e-bus corridors",
    limitations:
      "Actual kWh/km depends on air-conditioning load and stop-and-go congestion.",
    factorVersion: "CEA-EBUS-2023-v1",
  },
  metro_rail: {
    modeId: "metro_rail",
    label: "Metro Rail",
    fuelType: "Grid Electricity",
    kgCo2ePerVehicleKm: null,
    kgCo2ePerPassengerKm: 0.024,
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source: "DMRC / CEA Grid Emission Baseline (0.716 kg CO2/kWh)",
    publicationYear: 2023,
    units: "kg CO2e per passenger-km",
    calculationMethod:
      "Traction & station electricity per passenger-km on Indian metro networks",
    geographicRelevance:
      "Delhi, Chennai, Mumbai, Bengaluru, Kolkata Metro systems",
    limitations:
      "Grid carbon intensity varies if metro procures dedicated solar/renewable PPAs.",
    factorVersion: "IN-METRO-2023-v1",
  },
  suburban_rail: {
    modeId: "suburban_rail",
    label: "Suburban Rail (EMU)",
    fuelType: "Electric Traction",
    kgCo2ePerVehicleKm: null,
    kgCo2ePerPassengerKm: 0.015,
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source: "India GHG Program / Indian Railways Suburban Passenger Factor",
    publicationYear: 2015,
    units: "kg CO2e per passenger-km",
    calculationMethod: "High-occupancy electric multiple unit traction factor",
    geographicRelevance: "Mumbai, Chennai, Kolkata suburban networks",
    limitations: "Peak overcrowding alters true per-passenger load factor.",
    factorVersion: "IN-SUBURBAN-2015-v1",
  },
  bicycle_walk: {
    modeId: "bicycle_walk",
    label: "Walking or Bicycle",
    fuelType: "Human-powered (Zero tailpipe)",
    kgCo2ePerVehicleKm: 0,
    kgCo2ePerPassengerKm: 0,
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source: "IPCC 2006 / Zero Direct Operational Tailpipe Emissions",
    publicationYear: 2006,
    units: "kg CO2e per passenger-km",
    calculationMethod: "Zero direct fuel combustion or grid electricity draw",
    geographicRelevance: "Universal",
    limitations:
      "Increases respiratory minute ventilation; avoid heavy arterial roads when PM2.5/AQI is Poor or higher.",
    factorVersion: "IPCC-ACTIVE-2006",
  },
};

export interface EcoImpactInput {
  distanceKm: number;
  originalMode: TransportModeId;
  alternativeMode: TransportModeId;
  originalOccupancy?: number;
  alternativeOccupancy?: number;
  journeys: number;
}

export interface EcoImpactResult {
  totalDistanceKm: number;
  originalCo2eKg: number;
  alternativeCo2eKg: number;
  co2eAvoidedKg: number;
  vehicleTripsAvoided: number;
  originalFactor: EmissionFactorRecord;
  alternativeFactor: EmissionFactorRecord;
  personalExposureDistinction: string;
  communityImpactDistinction: string;
  methodologyNote: string;
}

export function getEffectivePassengerFactor(
  factor: EmissionFactorRecord,
  occupancy: number = 1
): number {
  const safeOcc = Math.max(1, Math.min(8, Math.round(occupancy)));
  if (factor.supportsOccupancy && factor.kgCo2ePerVehicleKm !== null) {
    return factor.kgCo2ePerVehicleKm / safeOcc;
  }
  return factor.kgCo2ePerPassengerKm;
}

export function calculateEcoImpact(input: EcoImpactInput): EcoImpactResult {
  const {
    distanceKm,
    originalMode,
    alternativeMode,
    originalOccupancy = 1,
    alternativeOccupancy = 1,
    journeys,
  } = input;

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new Error("Distance must be greater than 0 km.");
  }
  if (!Number.isFinite(journeys) || journeys < 1) {
    throw new Error("Number of journeys must be at least 1.");
  }

  const originalFactor = EMISSION_FACTORS_INDIA[originalMode];
  const alternativeFactor = EMISSION_FACTORS_INDIA[alternativeMode];

  const totalDistanceKm = Number((distanceKm * journeys).toFixed(2));
  const origPerPkm = getEffectivePassengerFactor(
    originalFactor,
    originalOccupancy
  );
  const altPerPkm = getEffectivePassengerFactor(
    alternativeFactor,
    alternativeOccupancy
  );

  const originalCo2eKg = Number((totalDistanceKm * origPerPkm).toFixed(2));
  const alternativeCo2eKg = Number((totalDistanceKm * altPerPkm).toFixed(2));
  const co2eAvoidedKg = Number((originalCo2eKg - alternativeCo2eKg).toFixed(2));

  let vehicleTripsAvoided = 0;
  if (
    originalFactor.isPrivateMotorizedVehicle &&
    !alternativeFactor.isPrivateMotorizedVehicle
  ) {
    vehicleTripsAvoided = Math.round(journeys);
  } else if (
    originalFactor.isPrivateMotorizedVehicle &&
    alternativeFactor.isPrivateMotorizedVehicle &&
    alternativeMode === originalMode &&
    alternativeOccupancy > originalOccupancy
  ) {
    // Carpool trip reduction estimate
    const ratio = 1 - originalOccupancy / alternativeOccupancy;
    vehicleTripsAvoided = Number((journeys * ratio).toFixed(1));
  }

  const personalExposureDistinction =
    alternativeMode === "bicycle_walk" ||
    alternativeMode === "two_wheeler_petrol"
      ? "Personal Exposure Note: Active travel or open two-wheelers can increase inhaled PM2.5 during poor air-quality hours unless routed along low-traffic corridors or paired with a well-fitted N95/FFP2 mask."
      : alternativeMode === "metro_rail"
        ? "Personal Exposure Note: Air-conditioned metro rail generally reduces roadside exhaust exposure compared with open-road commuting, though platform/corridor air still varies."
        : "Personal Exposure Note: Personal exposure depends on cabin ventilation/recirculation settings and corridor traffic density.";

  const communityImpactDistinction =
    "Community Distinction: These figures estimate greenhouse gas (CO2e) emissions avoided and private vehicle trips removed. Individual commute changes alone do not produce a measurable drop in neighbourhood AQI readings, which reflect regional meteorology and aggregate emissions.";

  return {
    totalDistanceKm,
    originalCo2eKg,
    alternativeCo2eKg,
    co2eAvoidedKg,
    vehicleTripsAvoided,
    originalFactor,
    alternativeFactor,
    personalExposureDistinction,
    communityImpactDistinction,
    methodologyNote: `Computed using ${originalFactor.factorVersion} (${originalFactor.publicationYear}) vs ${alternativeFactor.factorVersion} (${alternativeFactor.publicationYear}).`,
  };
}
