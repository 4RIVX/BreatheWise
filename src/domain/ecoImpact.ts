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

export type GhgMetric = "CO2" | "CO2e" | "ZERO";

export interface EmissionFactorRecord {
  modeId: TransportModeId;
  label: string;
  fuelType: string;
  kgEmissionsPerVehicleKm: number | null;
  kgEmissionsPerPassengerKm: number;
  ghgMetric: GhgMetric;
  defaultOccupancy: number;
  supportsOccupancy: boolean;
  isPrivateMotorizedVehicle: boolean;
  source: string;
  sourceUrl: string;
  publisher: string;
  publicationYear: number;
  pageOrTableRef: string;
  pollutantScope: string;
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
    kgEmissionsPerVehicleKm: 0.171,
    kgEmissionsPerPassengerKm: 0.171,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India / CII / TERI) — Road Transport v2.0",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India, CII & TERI",
    publicationYear: 2015,
    pageOrTableRef: "Table 4.2, Road Transport Emission Factors (kg CO2/km)",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes non-CO2 GHGs CH4/N2O)",
    units: "kg CO2 per vehicle-km (divided by occupancy)",
    calculationMethod:
      "Tank-to-Wheel distance-based average passenger car CO2 factor with real-world uplift",
    geographicRelevance: "India urban & highway passenger fleet",
    limitations:
      "Reports CO2 only (not full CO2e) and excludes upstream fuel refining; actual emissions vary with congestion, AC load, and engine displacement.",
    factorVersion: "IN-GHG-ROAD-2015-v2",
  },
  car_diesel: {
    modeId: "car_diesel",
    label: "Diesel Car",
    fuelType: "Diesel",
    kgEmissionsPerVehicleKm: 0.167,
    kgEmissionsPerPassengerKm: 0.167,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India / CII / TERI) — Road Transport v2.0",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India, CII & TERI",
    publicationYear: 2015,
    pageOrTableRef: "Table 4.3, Diesel Passenger Vehicles (kg CO2/km)",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes non-CO2 GHGs CH4/N2O)",
    units: "kg CO2 per vehicle-km (divided by occupancy)",
    calculationMethod:
      "Tank-to-Wheel distance-based average diesel car CO2 factor",
    geographicRelevance: "India urban passenger fleet",
    limitations:
      "Reports CO2 only (not full CO2e); diesel engines emit disproportionately higher NOx and PM2.5 than petrol per km.",
    factorVersion: "IN-GHG-ROAD-2015-v2",
  },
  car_cng: {
    modeId: "car_cng",
    label: "CNG Car",
    fuelType: "Compressed Natural Gas",
    kgEmissionsPerVehicleKm: 0.129,
    kgEmissionsPerPassengerKm: 0.129,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India) — CNG Passenger Vehicle Factor",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India",
    publicationYear: 2015,
    pageOrTableRef: "Table 4.5, CNG Fleet Factors (kg CO2/km)",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes upstream CH4 leakage)",
    units: "kg CO2 per vehicle-km (divided by occupancy)",
    calculationMethod:
      "Tank-to-Wheel distance-based CNG passenger car CO2 factor",
    geographicRelevance: "Indian metro cities (Delhi NCR, Mumbai, Ahmedabad)",
    limitations:
      "Reports CO2 only and excludes upstream methane (CH4) leakage in gas distribution pipelines.",
    factorVersion: "IN-GHG-CNG-2015-v2",
  },
  car_ev: {
    modeId: "car_ev",
    label: "Electric Car (India Grid)",
    fuelType: "Grid Electricity (0.675 kg CO2/kWh, CEA v22.0)",
    kgEmissionsPerVehicleKm: 0.108,
    kgEmissionsPerPassengerKm: 0.108,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source:
      "CEA CO2 Baseline Database for the Indian Power Sector v22.0 (Aug 2026) + EV consumption (~0.16 kWh/km)",
    sourceUrl: "https://cea.nic.in/cdm-co2-baseline-view/",
    publisher: "Central Electricity Authority (CEA) India & ARAI",
    publicationYear: 2026,
    pageOrTableRef:
      "Version 22.0 (FY 2025–26 All-India Weighted Average Grid Factor: 0.675 kg CO2/kWh)",
    pollutantScope: "CO2 (Grid Power Generation)",
    units: "kg CO2 per vehicle-km (grid-weighted, divided by occupancy)",
    calculationMethod:
      "All-India weighted average grid factor (0.675 kg CO2/kWh, CEA v22.0) × 0.16 kWh/km",
    geographicRelevance: "All-India Grid (FY 2025–26 baseline)",
    limitations:
      "Reflects CO2 from power generation only (not full CO2e); zero tailpipe exhaust, but upstream intensity depends on regional grid mix and charging losses.",
    factorVersion: "CEA-GRID-2026-v22",
  },
  two_wheeler_petrol: {
    modeId: "two_wheeler_petrol",
    label: "Petrol Two-Wheeler",
    fuelType: "Petrol (Motorcycle / Scooter)",
    kgEmissionsPerVehicleKm: 0.049,
    kgEmissionsPerPassengerKm: 0.049,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: true,
    source: "India GHG Program (WRI India) — Two-Wheeler Fleet Average",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India",
    publicationYear: 2015,
    pageOrTableRef: "Table 5.1, Two-Wheeler Factors (kg CO2/km)",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes non-CO2 GHGs)",
    units: "kg CO2 per vehicle-km (divided by occupancy)",
    calculationMethod:
      "Tank-to-Wheel Indian two-wheeler CO2 factor (mid-displacement fleet with uplift)",
    geographicRelevance: "India urban commuting fleet",
    limitations:
      "Reports CO2 only; rider faces direct roadside PM2.5/NO2 exposure without cabin filtration.",
    factorVersion: "IN-GHG-2W-2015-v2",
  },
  auto_cng: {
    modeId: "auto_cng",
    label: "CNG Auto-Rickshaw",
    fuelType: "CNG (Three-Wheeler)",
    kgEmissionsPerVehicleKm: 0.10768,
    kgEmissionsPerPassengerKm: 0.10768,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: true,
    isPrivateMotorizedVehicle: false,
    source:
      "India GHG Program / WRI India — Three-Wheeler CNG Factor (0.10768 kg CO2/km)",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India, CII & TERI",
    publicationYear: 2015,
    pageOrTableRef: "Summary Table, Three-Wheeler (CNG): 0.10768 kg CO2/km",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes CH4/N2O)",
    units: "kg CO2 per vehicle-km (divided by passenger occupancy)",
    calculationMethod:
      "Distance-based CNG three-wheeler CO2 factor (distinct from small <800cc CNG passenger cars at 0.068 kg CO2/km)",
    geographicRelevance: "Indian urban auto-rickshaw corridors",
    limitations:
      "Reports CO2 only; open-cabin design offers minimal protection against ambient traffic particulate spikes.",
    factorVersion: "IN-GHG-3W-2015-v2",
  },
  city_bus_diesel: {
    modeId: "city_bus_diesel",
    label: "City Bus (Diesel)",
    fuelType: "Diesel (Standard Urban Public Transit)",
    kgEmissionsPerVehicleKm: null,
    kgEmissionsPerPassengerKm: 0.015161,
    ghgMetric: "CO2",
    defaultOccupancy: 35,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source:
      "WRI India / Shakti Sustainable Energy Foundation — India-Specific Road Transport Emission Factors",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "WRI India & Shakti Foundation",
    publicationYear: 2015,
    pageOrTableRef:
      "Table 4.10, Standard City Bus Factor: 0.015161 kg CO2/p-km",
    pollutantScope: "CO2 (Tank-to-Wheel; excludes N2O/CH4)",
    units: "kg CO2 per passenger-km",
    calculationMethod:
      "Average municipal standard transit bus CO2 emissions per passenger-km under urban driving cycle",
    geographicRelevance:
      "Indian state & municipal transport undertakings (BMTC, DTC, MTC, BEST)",
    limitations:
      "Reflects CO2 only, not full CO2e; diesel buses generate high local NOx and PM2.5. Off-peak routes with lower ridership exhibit higher per-passenger intensity.",
    factorVersion: "WRI-INDIA-BUS-2015-v2",
  },
  city_bus_electric: {
    modeId: "city_bus_electric",
    label: "Electric Bus (India Grid)",
    fuelType: "Grid Electricity (CEA v22.0)",
    kgEmissionsPerVehicleKm: null,
    kgEmissionsPerPassengerKm: 0.017,
    ghgMetric: "CO2",
    defaultOccupancy: 35,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source:
      "CEA CO2 Baseline v22.0 (Aug 2026) + FAME-II Urban E-Bus Benchmark (~0.88 kWh/km)",
    sourceUrl: "https://cea.nic.in/cdm-co2-baseline-view/",
    publisher: "CEA India & FAME-II",
    publicationYear: 2026,
    pageOrTableRef:
      "Version 22.0 Grid Factor (0.675 kg CO2/kWh) + E-Bus Energy Benchmarks",
    pollutantScope: "CO2 (Grid Generation per Passenger-km)",
    units: "kg CO2 per passenger-km",
    calculationMethod:
      "Grid factor (0.675 kg CO2/kWh, CEA v22.0) × 0.88 kWh/km ÷ 35 avg passengers",
    geographicRelevance: "Indian smart city e-bus corridors",
    limitations:
      "Reflects CO2 only (not full CO2e); actual kWh/km depends on air-conditioning load and stop-and-go congestion.",
    factorVersion: "CEA-EBUS-2026-v22",
  },
  metro_rail: {
    modeId: "metro_rail",
    label: "Metro Rail",
    fuelType: "Grid Electricity (CEA v22.0)",
    kgEmissionsPerVehicleKm: null,
    kgEmissionsPerPassengerKm: 0.023,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source:
      "DMRC Intensity Benchmark × CEA Grid Baseline v22.0 (0.675 kg CO2/kWh)",
    sourceUrl: "https://cea.nic.in/cdm-co2-baseline-view/",
    publisher: "Delhi Metro Rail Corporation (DMRC) & CEA",
    publicationYear: 2026,
    pageOrTableRef:
      "CEA CO2 Baseline Database v22.0 (0.675 kg CO2/kWh) + DMRC (~0.034 kWh/p-km)",
    pollutantScope: "CO2 (Traction & Station Power)",
    units: "kg CO2 per passenger-km",
    calculationMethod:
      "Traction & station electricity (~0.034 kWh/p-km) × All-India grid factor (0.675 kg CO2/kWh, CEA v22.0)",
    geographicRelevance:
      "Delhi, Chennai, Mumbai, Bengaluru, Kolkata Metro systems",
    limitations:
      "Reflects CO2 only (not full CO2e); grid carbon intensity is lower where metros procure dedicated solar/renewable PPAs.",
    factorVersion: "IN-METRO-2026-v22",
  },
  suburban_rail: {
    modeId: "suburban_rail",
    label: "Suburban Rail (EMU)",
    fuelType: "Electric Traction",
    kgEmissionsPerVehicleKm: null,
    kgEmissionsPerPassengerKm: 0.007976,
    ghgMetric: "CO2",
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source:
      "India GHG Program / WRI India — India-Specific Rail Transport Emission Factors (0.007976 kg CO2/p-km)",
    sourceUrl:
      "https://shaktifoundation.in/wp-content/uploads/2021/12/WRI-2015-India-Specific-Road-Transport-Emission-Factors.pdf",
    publisher: "Indian Railways & WRI India / TERI",
    publicationYear: 2015,
    pageOrTableRef:
      "Suburban Rail Passenger Factor: 7.976 g CO2/p-km (0.007976 kg CO2/p-km)",
    pollutantScope: "CO2 (Electric Traction per Passenger-km)",
    units: "kg CO2 per passenger-km",
    calculationMethod:
      "High-occupancy electric multiple unit (EMU) traction CO2 factor",
    geographicRelevance: "Mumbai, Chennai, Kolkata suburban networks",
    limitations:
      "Reflects CO2 only based on 2015 traction baseline; peak overcrowding alters true per-passenger load factor.",
    factorVersion: "IN-SUBURBAN-2015-v1",
  },
  bicycle_walk: {
    modeId: "bicycle_walk",
    label: "Walking or Bicycle",
    fuelType: "Human-powered (Zero tailpipe)",
    kgEmissionsPerVehicleKm: 0,
    kgEmissionsPerPassengerKm: 0,
    ghgMetric: "ZERO",
    defaultOccupancy: 1,
    supportsOccupancy: false,
    isPrivateMotorizedVehicle: false,
    source: "IPCC 2006 / Zero Direct Operational Tailpipe Emissions",
    sourceUrl: "https://www.ipcc-nggip.iges.or.jp/",
    publisher: "Intergovernmental Panel on Climate Change (IPCC)",
    publicationYear: 2006,
    pageOrTableRef: "Volume 2 (Energy), Chapter 3 (Mobile Combustion)",
    pollutantScope: "Zero Direct GHG Emissions",
    units: "kg CO2 / CO2e per passenger-km",
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
  originalEmissionsKg: number;
  originalEmissionsMetric: GhgMetric;
  alternativeEmissionsKg: number;
  alternativeEmissionsMetric: GhgMetric;
  emissionsAvoidedKg: number | null;
  isScopeIncompatible: boolean;
  emissionsAvoidedMetricLabel:
    "CO2" | "CO2e" | "Incompatible scopes (CO2 vs CO2e)";
  scopeWarning: string | null;
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
  if (factor.supportsOccupancy && factor.kgEmissionsPerVehicleKm !== null) {
    return factor.kgEmissionsPerVehicleKm / safeOcc;
  }
  return factor.kgEmissionsPerPassengerKm;
}

export function resolveDifferenceScope(
  origMetric: GhgMetric,
  altMetric: GhgMetric
): {
  label: "CO2" | "CO2e" | "Incompatible scopes (CO2 vs CO2e)";
  incompatible: boolean;
  warning: string | null;
} {
  if (origMetric === "ZERO" && altMetric === "ZERO") {
    return { label: "CO2", incompatible: false, warning: null };
  }
  if (origMetric === "ZERO") {
    return {
      label: altMetric === "CO2" ? "CO2" : "CO2e",
      incompatible: false,
      warning: null,
    };
  }
  if (altMetric === "ZERO") {
    return {
      label: origMetric === "CO2" ? "CO2" : "CO2e",
      incompatible: false,
      warning: null,
    };
  }
  if (origMetric === altMetric) {
    return { label: origMetric, incompatible: false, warning: null };
  }
  return {
    label: "Incompatible scopes (CO2 vs CO2e)",
    incompatible: true,
    warning: `Incompatible GHG Scopes: Baseline mode reports ${origMetric} while alternative mode reports ${altMetric}. Combined avoided emissions cannot be subtracted reliably across CO2 and CO2e scopes—inspect each footprint separately.`,
  };
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

  const originalEmissionsKg = Number((totalDistanceKm * origPerPkm).toFixed(2));
  const alternativeEmissionsKg = Number(
    (totalDistanceKm * altPerPkm).toFixed(2)
  );

  const scopeInfo = resolveDifferenceScope(
    originalFactor.ghgMetric,
    alternativeFactor.ghgMetric
  );
  const emissionsAvoidedKg = scopeInfo.incompatible
    ? null
    : Number((originalEmissionsKg - alternativeEmissionsKg).toFixed(2));

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
    "Community Distinction: These figures estimate greenhouse gas (CO2 / CO2e) emissions avoided and private vehicle trips removed. Individual commute changes alone do not produce a measurable drop in neighbourhood AQI readings, which reflect regional meteorology and aggregate emissions.";

  return {
    totalDistanceKm,
    originalEmissionsKg,
    originalEmissionsMetric: originalFactor.ghgMetric,
    alternativeEmissionsKg,
    alternativeEmissionsMetric: alternativeFactor.ghgMetric,
    emissionsAvoidedKg,
    isScopeIncompatible: scopeInfo.incompatible,
    emissionsAvoidedMetricLabel: scopeInfo.label,
    scopeWarning: scopeInfo.warning,
    vehicleTripsAvoided,
    originalFactor,
    alternativeFactor,
    personalExposureDistinction,
    communityImpactDistinction,
    methodologyNote: `Computed using ${originalFactor.factorVersion} (${originalFactor.publicationYear}; Scope: ${originalFactor.ghgMetric}; Publisher: ${originalFactor.publisher}) vs ${alternativeFactor.factorVersion} (${alternativeFactor.publicationYear}; Scope: ${alternativeFactor.ghgMetric}; Publisher: ${alternativeFactor.publisher}).`,
  };
}
