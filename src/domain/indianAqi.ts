export type IndianAqiCategory =
  "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

export type PollutantCode =
  "PM2.5" | "PM10" | "NO2" | "SO2" | "CO" | "O3" | "NH3" | "PB";

export interface PollutantBreakpoint {
  bpLow: number;
  bpHigh: number;
  iLow: number;
  iHigh: number;
}

export interface PollutantConcentrationInput {
  code: PollutantCode;
  concentration: number;
  unit: "ug/m3" | "mg/m3" | "ppb" | "ppm";
  averagingPeriodHours: 8 | 24;
  sampleHoursCount?: number;
  isAveragedPeriodValid?: boolean;
}

export interface PollutantSubIndex {
  code: PollutantCode;
  concentrationNormalized: number;
  normalizedUnit: "ug/m3" | "mg/m3";
  subIndex: number;
  category: IndianAqiCategory;
  averagingPeriodHours: 8 | 24;
}

export interface IndianAqiResult {
  calculable: boolean;
  aqi: number | null;
  category: IndianAqiCategory | null;
  prominentPollutant: PollutantCode | null;
  subIndices: PollutantSubIndex[];
  validPollutantCount: number;
  hasParticulate: boolean;
  reasonIfNotCalculable: string | null;
  methodology: "CPCB Indian National AQI (2014)";
}

const MOLECULAR_WEIGHT: Partial<Record<PollutantCode, number>> = {
  NO2: 46.0055,
  SO2: 64.066,
  O3: 47.9982,
  CO: 28.0101,
  NH3: 17.031,
};

// Official CPCB National AQI breakpoints (India)
const BREAKPOINTS: Record<PollutantCode, PollutantBreakpoint[]> = {
  "PM2.5": [
    { bpLow: 0, bpHigh: 30, iLow: 0, iHigh: 50 },
    { bpLow: 30, bpHigh: 60, iLow: 51, iHigh: 100 },
    { bpLow: 60, bpHigh: 90, iLow: 101, iHigh: 200 },
    { bpLow: 90, bpHigh: 120, iLow: 201, iHigh: 300 },
    { bpLow: 120, bpHigh: 250, iLow: 301, iHigh: 400 },
    { bpLow: 250, bpHigh: 500, iLow: 401, iHigh: 500 },
  ],
  PM10: [
    { bpLow: 0, bpHigh: 50, iLow: 0, iHigh: 50 },
    { bpLow: 50, bpHigh: 100, iLow: 51, iHigh: 100 },
    { bpLow: 100, bpHigh: 250, iLow: 101, iHigh: 200 },
    { bpLow: 250, bpHigh: 350, iLow: 201, iHigh: 300 },
    { bpLow: 350, bpHigh: 430, iLow: 301, iHigh: 400 },
    { bpLow: 430, bpHigh: 600, iLow: 401, iHigh: 500 },
  ],
  NO2: [
    { bpLow: 0, bpHigh: 40, iLow: 0, iHigh: 50 },
    { bpLow: 40, bpHigh: 80, iLow: 51, iHigh: 100 },
    { bpLow: 80, bpHigh: 180, iLow: 101, iHigh: 200 },
    { bpLow: 180, bpHigh: 280, iLow: 201, iHigh: 300 },
    { bpLow: 280, bpHigh: 400, iLow: 301, iHigh: 400 },
    { bpLow: 400, bpHigh: 600, iLow: 401, iHigh: 500 },
  ],
  SO2: [
    { bpLow: 0, bpHigh: 40, iLow: 0, iHigh: 50 },
    { bpLow: 40, bpHigh: 80, iLow: 51, iHigh: 100 },
    { bpLow: 80, bpHigh: 380, iLow: 101, iHigh: 200 },
    { bpLow: 380, bpHigh: 800, iLow: 201, iHigh: 300 },
    { bpLow: 800, bpHigh: 1600, iLow: 301, iHigh: 400 },
    { bpLow: 1600, bpHigh: 2100, iLow: 401, iHigh: 500 },
  ],
  CO: [
    { bpLow: 0, bpHigh: 1.0, iLow: 0, iHigh: 50 },
    { bpLow: 1.0, bpHigh: 2.0, iLow: 51, iHigh: 100 },
    { bpLow: 2.0, bpHigh: 10.0, iLow: 101, iHigh: 200 },
    { bpLow: 10.0, bpHigh: 17.0, iLow: 201, iHigh: 300 },
    { bpLow: 17.0, bpHigh: 34.0, iLow: 301, iHigh: 400 },
    { bpLow: 34.0, bpHigh: 50.0, iLow: 401, iHigh: 500 },
  ],
  O3: [
    { bpLow: 0, bpHigh: 50, iLow: 0, iHigh: 50 },
    { bpLow: 50, bpHigh: 100, iLow: 51, iHigh: 100 },
    { bpLow: 100, bpHigh: 168, iLow: 101, iHigh: 200 },
    { bpLow: 168, bpHigh: 208, iLow: 201, iHigh: 300 },
    { bpLow: 208, bpHigh: 748, iLow: 301, iHigh: 400 },
    { bpLow: 748, bpHigh: 1000, iLow: 401, iHigh: 500 },
  ],
  NH3: [
    { bpLow: 0, bpHigh: 200, iLow: 0, iHigh: 50 },
    { bpLow: 200, bpHigh: 400, iLow: 51, iHigh: 100 },
    { bpLow: 400, bpHigh: 800, iLow: 101, iHigh: 200 },
    { bpLow: 800, bpHigh: 1200, iLow: 201, iHigh: 300 },
    { bpLow: 1200, bpHigh: 1800, iLow: 301, iHigh: 400 },
    { bpLow: 1800, bpHigh: 2400, iLow: 401, iHigh: 500 },
  ],
  PB: [
    { bpLow: 0, bpHigh: 0.5, iLow: 0, iHigh: 50 },
    { bpLow: 0.5, bpHigh: 1.0, iLow: 51, iHigh: 100 },
    { bpLow: 1.0, bpHigh: 2.0, iLow: 101, iHigh: 200 },
    { bpLow: 2.0, bpHigh: 3.0, iLow: 201, iHigh: 300 },
    { bpLow: 3.0, bpHigh: 3.5, iLow: 301, iHigh: 400 },
    { bpLow: 3.5, bpHigh: 5.0, iLow: 401, iHigh: 500 },
  ],
};

export function getExpectedAveragingPeriod(code: PollutantCode): 8 | 24 {
  return code === "CO" || code === "O3" ? 8 : 24;
}

export function getRequiredMinimumHours(periodHours: 8 | 24): number {
  // CPCB minimum 75% data completeness criteria (16h of 24h, 6h of 8h)
  return periodHours === 24 ? 16 : 6;
}

export function getIndianAqiCategory(aqi: number): IndianAqiCategory {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

export function normalizePollutantConcentration(
  code: PollutantCode,
  concentration: number,
  unit: "ug/m3" | "mg/m3" | "ppb" | "ppm"
): { value: number; unit: "ug/m3" | "mg/m3" } {
  if (!Number.isFinite(concentration) || concentration < 0) {
    throw new Error(`Invalid concentration for ${code}: ${concentration}`);
  }

  // CO must be normalized to mg/m3 for CPCB sub-index breakpoints
  if (code === "CO") {
    if (unit === "mg/m3") return { value: concentration, unit: "mg/m3" };
    if (unit === "ug/m3") return { value: concentration / 1000, unit: "mg/m3" };
    if (unit === "ppm") {
      const mw = MOLECULAR_WEIGHT.CO ?? 28.0101;
      return { value: (concentration * mw) / 24.45, unit: "mg/m3" };
    }
    if (unit === "ppb") {
      const mw = MOLECULAR_WEIGHT.CO ?? 28.0101;
      return { value: ((concentration / 1000) * mw) / 24.45, unit: "mg/m3" };
    }
  }

  // All other pollutants use ug/m3
  if (unit === "ug/m3") return { value: concentration, unit: "ug/m3" };
  if (unit === "mg/m3") return { value: concentration * 1000, unit: "ug/m3" };
  const mw = MOLECULAR_WEIGHT[code];
  if (!mw) {
    throw new Error(`Cannot convert ${unit} to ug/m3 for particulate ${code}`);
  }
  if (unit === "ppb") {
    return { value: (concentration * mw) / 24.45, unit: "ug/m3" };
  }
  // ppm -> ug/m3
  return { value: (concentration * 1000 * mw) / 24.45, unit: "ug/m3" };
}

export function calculatePollutantSubIndex(
  code: PollutantCode,
  normalizedConcentration: number
): number {
  if (
    !Number.isFinite(normalizedConcentration) ||
    normalizedConcentration < 0
  ) {
    throw new Error(`Invalid concentration for ${code}`);
  }
  const ranges = BREAKPOINTS[code];
  for (const r of ranges) {
    if (normalizedConcentration <= r.bpHigh) {
      const ratio =
        (r.iHigh - r.iLow) / Math.max(Number.EPSILON, r.bpHigh - r.bpLow);
      const raw = ratio * (normalizedConcentration - r.bpLow) + r.iLow;
      return Math.min(500, Math.max(0, Math.round(raw)));
    }
  }
  return 500;
}

export function calculateIndianAqi(
  inputs: PollutantConcentrationInput[]
): IndianAqiResult {
  const subIndices: PollutantSubIndex[] = [];
  const rejectedReasons: string[] = [];

  for (const item of inputs) {
    if (!Number.isFinite(item.concentration) || item.concentration < 0) {
      continue;
    }

    const expectedPeriod = getExpectedAveragingPeriod(item.code);
    if (item.averagingPeriodHours !== expectedPeriod) {
      rejectedReasons.push(
        `${item.code} requires ${expectedPeriod}-hour averaging (received ${item.averagingPeriodHours}-hour).`
      );
      continue;
    }

    if (item.isAveragedPeriodValid === false) {
      rejectedReasons.push(
        `${item.code} lacks a valid ${expectedPeriod}-hour averaging window.`
      );
      continue;
    }

    if (typeof item.sampleHoursCount === "number") {
      const minHours = getRequiredMinimumHours(expectedPeriod);
      if (item.sampleHoursCount < minHours) {
        rejectedReasons.push(
          `${item.code} has ${item.sampleHoursCount}h of data (minimum ${minHours}h required for ${expectedPeriod}h window).`
        );
        continue;
      }
    }

    const normalized = normalizePollutantConcentration(
      item.code,
      item.concentration,
      item.unit
    );
    const subIndex = calculatePollutantSubIndex(item.code, normalized.value);

    subIndices.push({
      code: item.code,
      concentrationNormalized: Number(normalized.value.toFixed(2)),
      normalizedUnit: normalized.unit,
      subIndex,
      category: getIndianAqiCategory(subIndex),
      averagingPeriodHours: expectedPeriod,
    });
  }

  const hasParticulate = subIndices.some(
    (s) => s.code === "PM2.5" || s.code === "PM10"
  );
  const validPollutantCount = subIndices.length;

  if (validPollutantCount < 3 || !hasParticulate) {
    const reasons: string[] = [];
    if (validPollutantCount < 3) {
      reasons.push(
        `Indian National AQI requires at least 3 valid pollutants (only ${validPollutantCount} available).`
      );
    }
    if (!hasParticulate) {
      reasons.push(
        "At least one particulate pollutant (PM2.5 or PM10) is mandatory."
      );
    }
    if (rejectedReasons.length > 0) {
      reasons.push(rejectedReasons.join(" "));
    }

    return {
      calculable: false,
      aqi: null,
      category: null,
      prominentPollutant: null,
      subIndices,
      validPollutantCount,
      hasParticulate,
      reasonIfNotCalculable: reasons.join(" "),
      methodology: "CPCB Indian National AQI (2014)",
    };
  }

  let maxSub = subIndices[0];
  for (const sub of subIndices) {
    if (sub.subIndex > maxSub.subIndex) {
      maxSub = sub;
    }
  }

  return {
    calculable: true,
    aqi: maxSub.subIndex,
    category: getIndianAqiCategory(maxSub.subIndex),
    prominentPollutant: maxSub.code,
    subIndices,
    validPollutantCount,
    hasParticulate,
    reasonIfNotCalculable: null,
    methodology: "CPCB Indian National AQI (2014)",
  };
}

export function computeRollingAverage(
  values: (number | null | undefined)[],
  windowSize: number
): { mean: number | null; validCount: number } {
  const slice = values.slice(-windowSize);
  const valid = slice.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0
  );
  if (valid.length === 0) return { mean: null, validCount: 0 };
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    mean: Number((sum / valid.length).toFixed(2)),
    validCount: valid.length,
  };
}

export function isDataStale(
  timestampIsoOrDate: string | Date,
  now: Date = new Date(),
  maxAgeMinutes: number = 180
): { stale: boolean; ageMinutes: number | null } {
  const parsed =
    timestampIsoOrDate instanceof Date
      ? timestampIsoOrDate
      : new Date(timestampIsoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return { stale: true, ageMinutes: null };
  }
  const diffMs = now.getTime() - parsed.getTime();
  const ageMinutes = Math.max(0, Math.round(diffMs / 60000));
  return {
    stale: ageMinutes > maxAgeMinutes,
    ageMinutes,
  };
}
