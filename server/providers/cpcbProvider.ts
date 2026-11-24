import { z } from "zod";
import {
  calculateIndianAqi,
  getExpectedAveragingPeriod,
  getRequiredMinimumHours,
  isDataStale,
  type IndianAqiResult,
  type PollutantCode,
  type PollutantConcentrationInput,
} from "../../src/domain/indianAqi.ts";
import { TtlCache } from "../utils/cache.ts";

// Official data.gov.in resource ID for CPCB "Real-time Air Quality Index from various locations"
export const CPCB_RESOURCE_ID = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69";
const CPCB_BASE_URL = `https://api.data.gov.in/resource/${CPCB_RESOURCE_ID}`;

const CpcbRecordSchema = z.object({
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  station: z.string().optional(),
  last_update: z.string().optional(),
  latitude: z.union([z.string(), z.number()]).optional(),
  longitude: z.union([z.string(), z.number()]).optional(),
  pollutant_id: z.string().optional(),
  pollutant_min: z.union([z.string(), z.number()]).nullable().optional(),
  pollutant_max: z.union([z.string(), z.number()]).nullable().optional(),
  pollutant_avg: z.union([z.string(), z.number()]).nullable().optional(),
  pollutant_unit: z.string().optional(),
  sample_hours: z.union([z.string(), z.number()]).nullable().optional(),
  valid_hours: z.union([z.string(), z.number()]).nullable().optional(),
  observation_hours: z.union([z.string(), z.number()]).nullable().optional(),
});

export const CpcbApiResponseSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  total: z.union([z.string(), z.number()]).optional(),
  count: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
  records: z.array(CpcbRecordSchema).default([]),
});

export interface CpcbPollutantReading {
  code: PollutantCode;
  rawId: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  sampleHoursCount: number | null;
  unit: string;
}

export interface CpcbStationMeasurement {
  stationName: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  lastUpdatedRaw: string | null;
  lastUpdatedIso: string | null;
  stale: boolean;
  ageMinutes: number | null;
  pollutants: CpcbPollutantReading[];
  indianAqi: IndianAqiResult;
  sourceLabel: "CPCB / data.gov.in Official Monitoring Station";
  isMeasured: true;
}

export interface CpcbProviderResponse {
  status: "available" | "unavailable";
  reason?: "MISSING_API_KEY" | "UPSTREAM_ERROR" | "NO_STATION_DATA";
  message: string;
  resourceId: string;
  stations: CpcbStationMeasurement[];
  cached: boolean;
  fetchedAtIso: string;
  totalRecordsReported?: number | null;
  isPaginationComplete?: boolean;
}

const cpcbCache = new TtlCache<CpcbProviderResponse>(15 * 60 * 1000); // 15 min cache

function mapCpcbPollutantId(rawId: string): PollutantCode | null {
  const upper = rawId.trim().toUpperCase();
  if (upper === "PM2.5" || upper === "PM25") return "PM2.5";
  if (upper === "PM10") return "PM10";
  if (upper === "NO2") return "NO2";
  if (upper === "SO2") return "SO2";
  if (upper === "CO") return "CO";
  if (upper === "OZONE" || upper === "O3") return "O3";
  if (upper === "NH3") return "NH3";
  if (upper === "PB" || upper === "LEAD") return "PB";
  return null;
}

function parseNumericField(
  val: string | number | null | undefined
): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const trimmed = val.trim();
  if (!trimmed || trimmed.toUpperCase() === "NA" || trimmed === "-")
    return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * CPCB last_update format is typically "DD-MM-YYYY HH:MM:SS" in IST (+05:30).
 */
export function parseCpcbTimestamp(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+05:30`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  return null;
}

export function normalizeCpcbRecords(
  records: z.infer<typeof CpcbRecordSchema>[],
  now: Date = new Date()
): CpcbStationMeasurement[] {
  const stationMap = new Map<
    string,
    {
      stationName: string;
      city: string;
      state: string;
      latitude: number | null;
      longitude: number | null;
      lastUpdatedRaw: string | null;
      lastUpdatedIso: string | null;
      pollutants: CpcbPollutantReading[];
    }
  >();

  for (const rec of records) {
    const stationName = (rec.station ?? "").trim();
    const city = (rec.city ?? "").trim();
    const state = (rec.state ?? "").trim();
    const rawPollutant = (rec.pollutant_id ?? "").trim();
    if (!stationName || !rawPollutant) continue;

    const code = mapCpcbPollutantId(rawPollutant);
    if (!code) continue;

    const key = `${state}::${city}::${stationName}`;
    let entry = stationMap.get(key);
    if (!entry) {
      const iso = parseCpcbTimestamp(rec.last_update);
      entry = {
        stationName,
        city,
        state,
        latitude: parseNumericField(rec.latitude),
        longitude: parseNumericField(rec.longitude),
        lastUpdatedRaw: rec.last_update?.trim() ?? null,
        lastUpdatedIso: iso,
        pollutants: [],
      };
      stationMap.set(key, entry);
    }

    const avg = parseNumericField(rec.pollutant_avg);
    const min = parseNumericField(rec.pollutant_min);
    const max = parseNumericField(rec.pollutant_max);
    const sampleHoursCount = parseNumericField(
      rec.sample_hours ?? rec.valid_hours ?? rec.observation_hours
    );
    const unit =
      rec.pollutant_unit?.trim() || (code === "CO" ? "mg/m3" : "ug/m3");

    entry.pollutants.push({
      code,
      rawId: rawPollutant,
      avg,
      min,
      max,
      sampleHoursCount,
      unit,
    });
  }

  const stations: CpcbStationMeasurement[] = [];
  for (const entry of stationMap.values()) {
    const aqiInputs: PollutantConcentrationInput[] = [];
    const staleInfo = entry.lastUpdatedIso
      ? isDataStale(entry.lastUpdatedIso, now, 180)
      : { stale: true, ageMinutes: null };

    for (const p of entry.pollutants) {
      if (p.avg === null || p.avg < 0) continue;
      const normalizedUnit = p.code === "CO" ? "mg/m3" : "ug/m3";
      const expectedPeriod = getExpectedAveragingPeriod(p.code);
      const minRequiredHours = getRequiredMinimumHours(expectedPeriod);
      const hasPhysicallyPlausibleValue =
        Number.isFinite(p.avg) &&
        p.avg >= 0 &&
        (p.code === "CO" ? p.avg <= 100 : p.avg <= 2000);
      const hasConsistentMinMax =
        p.min !== null && p.max !== null
          ? p.min <= p.avg && p.avg <= p.max
          : true;
      const hasValidTimestamp = Boolean(entry.lastUpdatedIso);
      const hasVerifiedObservationCount =
        p.sampleHoursCount !== null &&
        Number.isFinite(p.sampleHoursCount) &&
        p.sampleHoursCount >= minRequiredHours;

      const isPeriodValid =
        hasPhysicallyPlausibleValue &&
        hasConsistentMinMax &&
        hasValidTimestamp &&
        hasVerifiedObservationCount;

      aqiInputs.push({
        code: p.code,
        concentration: p.avg,
        unit: normalizedUnit,
        averagingPeriodHours: expectedPeriod,
        sampleHoursCount: p.sampleHoursCount ?? undefined,
        isAveragedPeriodValid: isPeriodValid,
      });
    }

    stations.push({
      stationName: entry.stationName,
      city: entry.city,
      state: entry.state,
      latitude: entry.latitude,
      longitude: entry.longitude,
      lastUpdatedRaw: entry.lastUpdatedRaw,
      lastUpdatedIso: entry.lastUpdatedIso,
      stale: staleInfo.stale,
      ageMinutes: staleInfo.ageMinutes,
      pollutants: entry.pollutants,
      indianAqi: calculateIndianAqi(aqiInputs),
      sourceLabel: "CPCB / data.gov.in Official Monitoring Station",
      isMeasured: true,
    });
  }

  return stations;
}

export async function fetchCpcbStations(params: {
  city: string;
  state?: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<CpcbProviderResponse> {
  const { city, state, apiKey, fetchImpl = fetch } = params;
  const fetchedAtIso = new Date().toISOString();

  if (!apiKey) {
    return {
      status: "unavailable",
      reason: "MISSING_API_KEY",
      message:
        "DATA_GOV_IN_API_KEY is not configured. Configure a data.gov.in API key in Settings > Secrets to retrieve live CPCB monitoring-station measurements.",
      resourceId: CPCB_RESOURCE_ID,
      stations: [],
      cached: false,
      fetchedAtIso,
    };
  }

  const cacheKey = `${city.toLowerCase()}::${(state ?? "").toLowerCase()}`;
  const cached = cpcbCache.get(cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  try {
    const allRecords: z.infer<typeof CpcbRecordSchema>[] = [];
    let offset = 0;
    const limit = 100;
    const maxOffset = 2500;
    let hasMore = true;
    let paginationFailed = false;
    let totalRecordsReported: number | null = null;

    while (hasMore && offset < maxOffset) {
      const url = new URL(CPCB_BASE_URL);
      url.searchParams.set("api-key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("filters[city]", city);
      if (state) {
        url.searchParams.set("filters[state]", state);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetchImpl(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (!res.ok) {
        paginationFailed = true;
        break;
      }

      const rawJson = await res.json();
      const parsed = CpcbApiResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        paginationFailed = true;
        break;
      }

      if (parsed.data.total !== undefined && parsed.data.total !== null) {
        const num = Number(parsed.data.total);
        if (Number.isFinite(num)) totalRecordsReported = num;
      }

      if (parsed.data.records.length === 0) {
        hasMore = false;
        break;
      }

      allRecords.push(...parsed.data.records);
      if (parsed.data.records.length < limit) {
        hasMore = false;
      } else if (
        totalRecordsReported !== null &&
        allRecords.length >= totalRecordsReported
      ) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    const isPaginationComplete =
      !paginationFailed &&
      !hasMore &&
      (totalRecordsReported !== null
        ? allRecords.length >= totalRecordsReported
        : true);

    const stations = normalizeCpcbRecords(allRecords);
    if (stations.length === 0) {
      const noDataResult: CpcbProviderResponse = {
        status: "unavailable",
        reason: paginationFailed ? "UPSTREAM_ERROR" : "NO_STATION_DATA",
        message: paginationFailed
          ? `CPCB monitoring-station query failed cleanly without returning partial records for ${city}.`
          : `No active CPCB monitoring-station records were returned for ${city}.`,
        resourceId: CPCB_RESOURCE_ID,
        stations: [],
        cached: false,
        fetchedAtIso,
        totalRecordsReported,
        isPaginationComplete,
      };
      cpcbCache.set(cacheKey, noDataResult, 5 * 60 * 1000);
      return noDataResult;
    }

    const successResult: CpcbProviderResponse = {
      status: "available",
      message: `${stations.length} CPCB station(s) loaded for ${city}.`,
      resourceId: CPCB_RESOURCE_ID,
      stations,
      cached: false,
      fetchedAtIso,
      totalRecordsReported,
      isPaginationComplete,
    };
    cpcbCache.set(cacheKey, successResult);
    return successResult;
  } catch (err) {
    const causeCode =
      err instanceof Error &&
      err.cause &&
      typeof err.cause === "object" &&
      "code" in err.cause
        ? String((err.cause as { code?: unknown }).code ?? "")
        : "";
    const detail = err instanceof Error ? err.message : "Network error";
    return {
      status: "unavailable",
      reason: "UPSTREAM_ERROR",
      message: causeCode
        ? `CPCB fetch failed: ${detail} (${causeCode})`
        : `CPCB fetch failed: ${detail}`,
      resourceId: CPCB_RESOURCE_ID,
      stations: [],
      cached: false,
      fetchedAtIso,
    };
  }
}

export function getCpcbCacheStats() {
  return cpcbCache.getStats();
}

export function clearCpcbCache() {
  cpcbCache.clear();
}
