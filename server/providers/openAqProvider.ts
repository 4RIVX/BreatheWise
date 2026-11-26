import { z } from "zod";
import {
  calculateIndianAqi,
  computeMax8HourRollingAverageOver24Hours,
  computeTimeBoundedRollingAverage,
  getExpectedAveragingPeriod,
  isDataStale,
  type IndianAqiResult,
  type PollutantCode,
  type PollutantConcentrationInput,
  type TimedHourlySample,
} from "../../src/domain/indianAqi.ts";
import { TtlCache } from "../utils/cache.ts";
import {
  parseCpcbUnit,
  type CpcbPollutantReading,
  type CpcbStationMeasurement,
  type NormalizedPollutantUnit,
} from "./cpcbProvider.ts";

const OPENAQ_BASE_URL = "https://api.openaq.org/v3";

const OpenAqDatetimeSchema = z
  .object({
    utc: z.string().optional(),
    local: z.string().optional(),
  })
  .nullable()
  .optional();

const OpenAqSensorSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  parameter: z.object({
    id: z.number().optional(),
    name: z.string(),
    units: z.string().optional(),
    displayName: z.string().optional(),
  }),
});

const OpenAqLocationSchema = z.object({
  id: z.number(),
  name: z.string().nullable().optional(),
  locality: z.string().nullable().optional(),
  country: z
    .object({
      code: z.string().optional(),
      name: z.string().optional(),
    })
    .nullable()
    .optional(),
  provider: z
    .object({
      id: z.number().optional(),
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  owner: z
    .object({
      id: z.number().optional(),
      name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  licenses: z
    .array(
      z.object({
        id: z.number().optional(),
        name: z.string().nullable().optional(),
        attribution: z
          .object({
            name: z.string().nullable().optional(),
            url: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      })
    )
    .optional(),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable()
    .optional(),
  datetimeLast: OpenAqDatetimeSchema,
  sensors: z.array(OpenAqSensorSchema).default([]),
});

export const OpenAqLocationsResponseSchema = z.object({
  results: z.array(OpenAqLocationSchema).default([]),
});

const OpenAqHourItemSchema = z.object({
  value: z.number().nullable(),
  parameter: z
    .object({
      name: z.string().optional(),
      units: z.string().optional(),
    })
    .optional(),
  period: z
    .object({
      datetimeFrom: OpenAqDatetimeSchema,
      datetimeTo: OpenAqDatetimeSchema,
    })
    .optional(),
});

export const OpenAqHoursResponseSchema = z.object({
  results: z.array(OpenAqHourItemSchema).default([]),
});

export interface OpenAqProviderResponse {
  status: "available" | "unavailable";
  reason?: "MISSING_API_KEY" | "UPSTREAM_ERROR" | "NO_STATION_DATA";
  message: string;
  stations: CpcbStationMeasurement[];
  cached: boolean;
  fetchedAtIso: string;
}

const openAqCache = new TtlCache<OpenAqProviderResponse>(15 * 60 * 1000);

function mapOpenAqParameter(name: string): PollutantCode | null {
  const lower = name.trim().toLowerCase();
  if (lower === "pm25" || lower === "pm2.5") return "PM2.5";
  if (lower === "pm10") return "PM10";
  if (lower === "no2") return "NO2";
  if (lower === "so2") return "SO2";
  if (lower === "co") return "CO";
  if (lower === "o3") return "O3";
  if (lower === "nh3") return "NH3";
  if (lower === "pb") return "PB";
  return null;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchOpenAqHourlyStations(params: {
  city: string;
  state?: string;
  latitude: number;
  longitude: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<OpenAqProviderResponse> {
  const {
    city,
    state,
    latitude,
    longitude,
    apiKey,
    fetchImpl = fetch,
    now = new Date(),
  } = params;
  const fetchedAtIso = now.toISOString();

  if (!apiKey) {
    return {
      status: "unavailable",
      reason: "MISSING_API_KEY",
      message:
        "OPENAQ_API_KEY is not configured. Configure an OpenAQ v3 API key in Settings > Secrets for verified hourly station AQI calculations.",
      stations: [],
      cached: false,
      fetchedAtIso,
    };
  }

  const cacheKey = `${latitude.toFixed(2)}:${longitude.toFixed(2)}:${city.toLowerCase()}`;
  const cached = openAqCache.get(cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  try {
    const locUrl = new URL(`${OPENAQ_BASE_URL}/locations`);
    locUrl.searchParams.set(
      "coordinates",
      `${latitude.toFixed(4)},${longitude.toFixed(4)}`
    );
    locUrl.searchParams.set("radius", "25000");
    locUrl.searchParams.set("iso", "IN");
    locUrl.searchParams.set("limit", "15");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const locRes = await fetchImpl(locUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    });
    clearTimeout(timer);

    if (!locRes.ok) {
      return {
        status: "unavailable",
        reason: "UPSTREAM_ERROR",
        message: `OpenAQ v3 locations request returned HTTP ${locRes.status}.`,
        stations: [],
        cached: false,
        fetchedAtIso,
      };
    }

    const locParsed = OpenAqLocationsResponseSchema.safeParse(
      await locRes.json()
    );
    if (!locParsed.success) {
      return {
        status: "unavailable",
        reason: "UPSTREAM_ERROR",
        message: "OpenAQ v3 locations payload failed validation.",
        stations: [],
        cached: false,
        fetchedAtIso,
      };
    }

    const candidateLocations = locParsed.data.results
      .map((loc) => {
        const criteriaSensors = loc.sensors.filter(
          (s) => mapOpenAqParameter(s.parameter.name) !== null
        );
        const hasParticulate = criteriaSensors.some((s) => {
          const code = mapOpenAqParameter(s.parameter.name);
          return code === "PM2.5" || code === "PM10";
        });
        const distKm =
          loc.coordinates !== null && loc.coordinates !== undefined
            ? haversineKm(
                latitude,
                longitude,
                loc.coordinates.latitude,
                loc.coordinates.longitude
              )
            : Infinity;
        return {
          loc,
          criteriaSensors,
          hasParticulate,
          distKm,
        };
      })
      .filter((item) => item.criteriaSensors.length >= 3 && item.hasParticulate)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 3);

    if (candidateLocations.length === 0) {
      const emptyRes: OpenAqProviderResponse = {
        status: "unavailable",
        reason: "NO_STATION_DATA",
        message: `No nearby OpenAQ v3 hourly Indian monitoring stations with >= 3 criteria sensors found near ${city}.`,
        stations: [],
        cached: false,
        fetchedAtIso,
      };
      openAqCache.set(cacheKey, emptyRes, 5 * 60 * 1000);
      return emptyRes;
    }

    const fromIso = new Date(now.getTime() - 28 * 3_600_000).toISOString();
    const toIso = new Date(now.getTime() + 5 * 60_000).toISOString();

    const stations: CpcbStationMeasurement[] = [];

    for (const candidate of candidateLocations) {
      const sensorResults = await Promise.all(
        candidate.criteriaSensors.map(async (sensor) => {
          const code = mapOpenAqParameter(sensor.parameter.name);
          if (!code) return null;

          const hoursUrl = new URL(
            `${OPENAQ_BASE_URL}/sensors/${sensor.id}/hours`
          );
          hoursUrl.searchParams.set("datetime_from", fromIso);
          hoursUrl.searchParams.set("datetime_to", toIso);
          hoursUrl.searchParams.set("limit", "48");

          const hCtrl = new AbortController();
          const hTimer = setTimeout(() => hCtrl.abort(), 7000);
          try {
            const hRes = await fetchImpl(hoursUrl.toString(), {
              signal: hCtrl.signal,
              headers: {
                Accept: "application/json",
                "X-API-Key": apiKey,
              },
            });
            clearTimeout(hTimer);
            if (!hRes.ok) return null;
            const parsed = OpenAqHoursResponseSchema.safeParse(
              await hRes.json()
            );
            if (!parsed.success) return null;

            const samples: TimedHourlySample[] = [];
            let rawUnit = sensor.parameter.units?.trim() || "";
            let latestHourIso: string | null = null;
            let latestMs = -Infinity;

            for (const row of parsed.data.results) {
              const rowUnit = row.parameter?.units?.trim();
              if (!rawUnit && rowUnit) rawUnit = rowUnit;
              if (
                typeof row.value !== "number" ||
                !Number.isFinite(row.value) ||
                row.value < 0
              ) {
                continue;
              }
              const ts =
                row.period?.datetimeTo?.utc ??
                row.period?.datetimeFrom?.utc ??
                null;
              if (!ts) continue;
              const tsCheck = isDataStale(ts, now, 28 * 60, 5);
              if (tsCheck.isFuture) continue;
              const ms = new Date(ts).getTime();
              if (Number.isNaN(ms)) continue;
              const normalizedIso = new Date(ms).toISOString();
              samples.push({ timeIso: normalizedIso, value: row.value });
              if (ms > latestMs) {
                latestMs = ms;
                latestHourIso = normalizedIso;
              }
            }

            const parsedUnit: NormalizedPollutantUnit | null =
              parseCpcbUnit(rawUnit);

            return {
              code,
              rawId: sensor.parameter.name,
              rawUnit: rawUnit || "unspecified",
              parsedUnit,
              samples,
              latestHourIso,
              latestMs,
            };
          } catch {
            clearTimeout(hTimer);
            return null;
          }
        })
      );

      const validSensors = sensorResults.filter(
        (s): s is NonNullable<typeof s> =>
          s !== null && s.samples.length > 0 && s.latestHourIso !== null
      );
      if (validSensors.length === 0) continue;

      // Determine station reference timestamp strictly from individually fresh, non-future sensors
      let stationFreshMs = -Infinity;
      let stationFreshIso: string | null = null;
      let fallbackLatestMs = -Infinity;
      let fallbackLatestIso: string | null = null;
      for (const s of validSensors) {
        if (!s.latestHourIso) continue;
        const check = isDataStale(s.latestHourIso, now, 180, 5);
        if (!check.isFuture && s.latestMs > fallbackLatestMs) {
          fallbackLatestMs = s.latestMs;
          fallbackLatestIso = s.latestHourIso;
        }
        if (!check.stale && s.latestMs > stationFreshMs) {
          stationFreshMs = s.latestMs;
          stationFreshIso = s.latestHourIso;
        }
      }
      const stationLatestIso = stationFreshIso ?? fallbackLatestIso;
      if (!stationLatestIso) continue;

      const staleInfo = isDataStale(stationLatestIso, now, 180, 5);
      const aqiInputs: PollutantConcentrationInput[] = [];
      const pollutants: CpcbPollutantReading[] = [];

      for (const s of validSensors) {
        const expectedPeriod = getExpectedAveragingPeriod(s.code);
        const sensorFreshCheck = s.latestHourIso
          ? isDataStale(s.latestHourIso, now, 180, 5)
          : { stale: true, ageMinutes: null, isFuture: false };
        const alignedWithStation =
          stationFreshMs > -Infinity &&
          Number.isFinite(s.latestMs) &&
          Math.abs(stationFreshMs - s.latestMs) <= 60 * 60_000;
        const sensorEligible = !sensorFreshCheck.stale && alignedWithStation;

        const rollAnchorIso = sensorEligible
          ? stationLatestIso
          : (s.latestHourIso ?? stationLatestIso);
        const roll =
          expectedPeriod === 8
            ? computeMax8HourRollingAverageOver24Hours(s.samples, rollAnchorIso)
            : computeTimeBoundedRollingAverage(s.samples, rollAnchorIso, 24);

        const numericVals = s.samples
          .map((x) => x.value)
          .filter((v): v is number => typeof v === "number");
        const minVal = numericVals.length > 0 ? Math.min(...numericVals) : null;
        const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : null;

        pollutants.push({
          code: s.code,
          rawId: s.rawId,
          avg: roll.mean,
          min: minVal,
          max: maxVal,
          sampleHoursCount: roll.validCount,
          unit: s.rawUnit,
          parsedUnit: s.parsedUnit,
          lastUpdatedRaw: s.latestHourIso,
          lastUpdatedIso: s.latestHourIso,
          fresh: sensorEligible,
          stale: sensorFreshCheck.stale,
          ageMinutes: sensorFreshCheck.ageMinutes,
          alignedWithStation,
        });

        if (roll.mean !== null && s.parsedUnit) {
          aqiInputs.push({
            code: s.code,
            concentration: roll.mean,
            unit: s.parsedUnit,
            averagingPeriodHours: expectedPeriod,
            sampleHoursCount: roll.validCount,
            // Reject sensor unless IT IS independently fresh (<=180 min), aligned (<=60 min), AND has >=16h
            isAveragedPeriodValid: sensorEligible && roll.validCount >= 16,
          });
        }
      }

      const providerName = candidate.loc.provider?.name?.trim() || null;
      const ownerName = candidate.loc.owner?.name?.trim() || null;
      const licenseNames = (candidate.loc.licenses ?? [])
        .map((l) => l.attribution?.name?.trim() || l.name?.trim())
        .filter((x): x is string => Boolean(x));
      const licenseAttribution =
        licenseNames.length > 0 ? licenseNames.join("; ") : null;

      const indianAqi: IndianAqiResult = calculateIndianAqi(aqiInputs);
      stations.push({
        stationName:
          candidate.loc.name?.trim() || `OpenAQ Station ${candidate.loc.id}`,
        city: candidate.loc.locality?.trim() || city,
        state: state ?? "",
        latitude: candidate.loc.coordinates?.latitude ?? null,
        longitude: candidate.loc.coordinates?.longitude ?? null,
        lastUpdatedRaw: stationLatestIso,
        lastUpdatedIso: stationLatestIso,
        stale: staleInfo.stale || stationFreshIso === null,
        ageMinutes: staleInfo.ageMinutes,
        pollutants,
        indianAqi,
        sourceLabel:
          "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology",
        feedOrigin: "openaq_v3",
        providerName,
        ownerName,
        licenseAttribution,
        isMeasured: true,
      });
    }

    if (stations.length === 0) {
      const noStations: OpenAqProviderResponse = {
        status: "unavailable",
        reason: "NO_STATION_DATA",
        message: `OpenAQ v3 stations near ${city} returned no valid hourly series.`,
        stations: [],
        cached: false,
        fetchedAtIso,
      };
      openAqCache.set(cacheKey, noStations, 5 * 60 * 1000);
      return noStations;
    }

    const okResult: OpenAqProviderResponse = {
      status: "available",
      message: `${stations.length} OpenAQ v3 hourly monitoring station(s) loaded near ${city}.`,
      stations,
      cached: false,
      fetchedAtIso,
    };
    openAqCache.set(cacheKey, okResult);
    return okResult;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Network error";
    return {
      status: "unavailable",
      reason: "UPSTREAM_ERROR",
      message: `OpenAQ v3 fetch failed: ${detail}`,
      stations: [],
      cached: false,
      fetchedAtIso,
    };
  }
}

export function clearOpenAqCache() {
  openAqCache.clear();
}
