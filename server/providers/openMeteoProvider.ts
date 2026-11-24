import { z } from "zod";
import {
  calculateIndianAqi,
  computeRollingAverage,
  isDataStale,
  type IndianAqiResult,
  type PollutantConcentrationInput,
} from "../../src/domain/indianAqi.ts";
import { TtlCache } from "../utils/cache.ts";

const OPEN_METEO_AQ_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality";
const OPEN_METEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

const OpenMeteoAqSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  current: z
    .object({
      time: z.string(),
      pm2_5: z.number().nullable().optional(),
      pm10: z.number().nullable().optional(),
      nitrogen_dioxide: z.number().nullable().optional(),
      sulphur_dioxide: z.number().nullable().optional(),
      ozone: z.number().nullable().optional(),
      carbon_monoxide: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      pm2_5: z.array(z.number().nullable()).optional(),
      pm10: z.array(z.number().nullable()).optional(),
      nitrogen_dioxide: z.array(z.number().nullable()).optional(),
      sulphur_dioxide: z.array(z.number().nullable()).optional(),
      ozone: z.array(z.number().nullable()).optional(),
      carbon_monoxide: z.array(z.number().nullable()).optional(),
    })
    .optional(),
});

const OpenMeteoWeatherSchema = z.object({
  current: z
    .object({
      time: z.string(),
      temperature_2m: z.number().nullable().optional(),
      relative_humidity_2m: z.number().nullable().optional(),
      wind_speed_10m: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()),
      wind_speed_10m: z.array(z.number().nullable()).optional(),
      boundary_layer_height: z.array(z.number().nullable()).optional(),
    })
    .optional(),
});

export interface ModelledHourlyPoint {
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

export interface OpenMeteoForecastResult {
  status: "available" | "unavailable";
  message: string;
  sourceLabel: "Open-Meteo Modelled Regional Air-Quality Forecast";
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
  indianAqiFromRollingModel: IndianAqiResult;
  bestLowerPmWindow: string | null;
  hourlySeries: ModelledHourlyPoint[];
  cached: boolean;
  fetchedAtIso: string;
}

const openMeteoCache = new TtlCache<OpenMeteoForecastResult>(15 * 60 * 1000);

function findCurrentHourIndex(times: string[], currentTime?: string): number {
  if (!times.length) return -1;
  if (currentTime) {
    const prefix = currentTime.slice(0, 13);
    const idx = times.findIndex((t) => t.startsWith(prefix));
    if (idx !== -1) return idx;
  }
  return Math.min(times.length - 1, 24);
}

export async function fetchOpenMeteoForecast(params: {
  latitude: number;
  longitude: number;
  fetchImpl?: typeof fetch;
}): Promise<OpenMeteoForecastResult> {
  const { latitude, longitude, fetchImpl = fetch } = params;
  const fetchedAtIso = new Date().toISOString();
  const cacheKey = `${latitude.toFixed(2)}:${longitude.toFixed(2)}`;

  const cached = openMeteoCache.get(cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const aqUrl = new URL(OPEN_METEO_AQ_URL);
  aqUrl.searchParams.set("latitude", String(latitude));
  aqUrl.searchParams.set("longitude", String(longitude));
  aqUrl.searchParams.set(
    "current",
    "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide"
  );
  aqUrl.searchParams.set(
    "hourly",
    "pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide"
  );
  aqUrl.searchParams.set("past_days", "1");
  aqUrl.searchParams.set("forecast_days", "2");
  aqUrl.searchParams.set("timezone", "Asia/Kolkata");

  const weatherUrl = new URL(OPEN_METEO_WEATHER_URL);
  weatherUrl.searchParams.set("latitude", String(latitude));
  weatherUrl.searchParams.set("longitude", String(longitude));
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,wind_speed_10m"
  );
  weatherUrl.searchParams.set("hourly", "wind_speed_10m,boundary_layer_height");
  weatherUrl.searchParams.set("past_days", "1");
  weatherUrl.searchParams.set("forecast_days", "2");
  weatherUrl.searchParams.set("timezone", "Asia/Kolkata");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const [aqRes, weatherRes] = await Promise.all([
      fetchImpl(aqUrl.toString(), { signal: controller.signal }),
      fetchImpl(weatherUrl.toString(), { signal: controller.signal }),
    ]);
    clearTimeout(timer);

    if (!aqRes.ok) {
      throw new Error(`Open-Meteo Air Quality returned HTTP ${aqRes.status}`);
    }

    const aqParsed = OpenMeteoAqSchema.safeParse(await aqRes.json());
    if (!aqParsed.success) {
      throw new Error("Open-Meteo Air Quality payload failed validation.");
    }

    let weatherParsed: z.infer<typeof OpenMeteoWeatherSchema> | null = null;
    if (weatherRes.ok) {
      const wp = OpenMeteoWeatherSchema.safeParse(await weatherRes.json());
      if (wp.success) weatherParsed = wp.data;
    }

    const aq = aqParsed.data;
    const times = aq.hourly?.time ?? [];
    const curIdx = findCurrentHourIndex(times, aq.current?.time);

    // Slice up to current index for 24h/8h rolling averages (past observations/modelled history)
    const historySliceEnd = curIdx >= 0 ? curIdx + 1 : times.length;
    const pm25Roll = computeRollingAverage(
      (aq.hourly?.pm2_5 ?? []).slice(0, historySliceEnd),
      24
    );
    const pm10Roll = computeRollingAverage(
      (aq.hourly?.pm10 ?? []).slice(0, historySliceEnd),
      24
    );
    const no2Roll = computeRollingAverage(
      (aq.hourly?.nitrogen_dioxide ?? []).slice(0, historySliceEnd),
      24
    );
    const so2Roll = computeRollingAverage(
      (aq.hourly?.sulphur_dioxide ?? []).slice(0, historySliceEnd),
      24
    );
    const o3Roll = computeRollingAverage(
      (aq.hourly?.ozone ?? []).slice(0, historySliceEnd),
      8
    );
    const coRoll = computeRollingAverage(
      (aq.hourly?.carbon_monoxide ?? []).slice(0, historySliceEnd),
      8
    );

    const aqiInputs: PollutantConcentrationInput[] = [];
    if (pm25Roll.mean !== null) {
      aqiInputs.push({
        code: "PM2.5",
        concentration: pm25Roll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: pm25Roll.validCount,
      });
    }
    if (pm10Roll.mean !== null) {
      aqiInputs.push({
        code: "PM10",
        concentration: pm10Roll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: pm10Roll.validCount,
      });
    }
    if (no2Roll.mean !== null) {
      aqiInputs.push({
        code: "NO2",
        concentration: no2Roll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: no2Roll.validCount,
      });
    }
    if (so2Roll.mean !== null) {
      aqiInputs.push({
        code: "SO2",
        concentration: so2Roll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: so2Roll.validCount,
      });
    }
    if (o3Roll.mean !== null) {
      aqiInputs.push({
        code: "O3",
        concentration: o3Roll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 8,
        sampleHoursCount: o3Roll.validCount,
      });
    }
    if (coRoll.mean !== null) {
      aqiInputs.push({
        code: "CO",
        concentration: coRoll.mean,
        unit: "ug/m3",
        averagingPeriodHours: 8,
        sampleHoursCount: coRoll.validCount,
      });
    }

    const indianAqiFromRollingModel = calculateIndianAqi(aqiInputs);

    // Build next 24h forecast window series
    const startIdx = Math.max(0, curIdx >= 0 ? curIdx - 6 : 0);
    const endIdx = Math.min(times.length, startIdx + 24);
    const hourlySeries: ModelledHourlyPoint[] = [];

    for (let i = startIdx; i < endIdx; i += 1) {
      const t = times[i];
      hourlySeries.push({
        timeIso: t,
        hourLabel: t.slice(11, 16),
        pm25: aq.hourly?.pm2_5?.[i] ?? null,
        pm10: aq.hourly?.pm10?.[i] ?? null,
        no2: aq.hourly?.nitrogen_dioxide?.[i] ?? null,
        so2: aq.hourly?.sulphur_dioxide?.[i] ?? null,
        ozone: aq.hourly?.ozone?.[i] ?? null,
        coUgm3: aq.hourly?.carbon_monoxide?.[i] ?? null,
        windKmh: weatherParsed?.hourly?.wind_speed_10m?.[i] ?? null,
        boundaryLayerHeightM:
          weatherParsed?.hourly?.boundary_layer_height?.[i] ?? null,
      });
    }

    // Find best 2-hour lower-PM2.5 forecast window ahead
    const futurePoints = hourlySeries.filter(
      (p) =>
        typeof p.pm25 === "number" &&
        (!aq.current?.time || p.timeIso >= aq.current.time)
    );
    let bestLowerPmWindow: string | null = null;
    if (futurePoints.length >= 2) {
      let bestIdx = 0;
      let bestVal = Infinity;
      for (let i = 0; i < futurePoints.length - 1; i += 1) {
        const avg2h =
          ((futurePoints[i].pm25 ?? 999) + (futurePoints[i + 1].pm25 ?? 999)) /
          2;
        if (avg2h < bestVal) {
          bestVal = avg2h;
          bestIdx = i;
        }
      }
      bestLowerPmWindow = `${futurePoints[bestIdx].hourLabel}–${futurePoints[bestIdx + 1].hourLabel} IST`;
    }

    const currentTimeIso = aq.current?.time
      ? `${aq.current.time}:00+05:30`
      : null;
    const staleInfo = currentTimeIso
      ? isDataStale(currentTimeIso, new Date(), 180)
      : { stale: false, ageMinutes: null };

    const curBlh =
      curIdx >= 0
        ? (weatherParsed?.hourly?.boundary_layer_height?.[curIdx] ?? null)
        : null;

    const result: OpenMeteoForecastResult = {
      status: "available",
      message: "Open-Meteo regional air-quality model forecast retrieved.",
      sourceLabel: "Open-Meteo Modelled Regional Air-Quality Forecast",
      isMeasured: false,
      latitude: aq.latitude,
      longitude: aq.longitude,
      currentTimeIso,
      stale: staleInfo.stale,
      ageMinutes: staleInfo.ageMinutes,
      currentPollutants: {
        pm25: aq.current?.pm2_5 ?? null,
        pm10: aq.current?.pm10 ?? null,
        no2: aq.current?.nitrogen_dioxide ?? null,
        so2: aq.current?.sulphur_dioxide ?? null,
        ozone: aq.current?.ozone ?? null,
        coUgm3: aq.current?.carbon_monoxide ?? null,
      },
      weather: {
        temperatureC: weatherParsed?.current?.temperature_2m ?? null,
        humidityPct: weatherParsed?.current?.relative_humidity_2m ?? null,
        windKmh: weatherParsed?.current?.wind_speed_10m ?? null,
        boundaryLayerHeightM: curBlh,
      },
      indianAqiFromRollingModel,
      bestLowerPmWindow,
      hourlySeries,
      cached: false,
      fetchedAtIso,
    };

    openMeteoCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      status: "unavailable",
      message:
        err instanceof Error
          ? `Open-Meteo unavailable: ${err.message}`
          : "Open-Meteo forecast temporarily unavailable.",
      sourceLabel: "Open-Meteo Modelled Regional Air-Quality Forecast",
      isMeasured: false,
      latitude,
      longitude,
      currentTimeIso: null,
      stale: true,
      ageMinutes: null,
      currentPollutants: {
        pm25: null,
        pm10: null,
        no2: null,
        so2: null,
        ozone: null,
        coUgm3: null,
      },
      weather: {
        temperatureC: null,
        humidityPct: null,
        windKmh: null,
        boundaryLayerHeightM: null,
      },
      indianAqiFromRollingModel: calculateIndianAqi([]),
      bestLowerPmWindow: null,
      hourlySeries: [],
      cached: false,
      fetchedAtIso,
    };
  }
}

export function getOpenMeteoCacheStats() {
  return openMeteoCache.getStats();
}

export function clearOpenMeteoCache() {
  openMeteoCache.clear();
}
