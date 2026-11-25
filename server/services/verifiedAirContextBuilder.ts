import {
  VerifiedAirContextSchema,
  type AiLocationInput,
  type DataProvenance,
  type VerifiedAirContext,
} from "../../src/domain/schemas.ts";
import {
  fetchCpcbStations,
  type CpcbProviderResponse,
  type CpcbStationMeasurement,
} from "../providers/cpcbProvider.ts";
import {
  fetchOpenAqHourlyStations,
  type OpenAqProviderResponse,
} from "../providers/openAqProvider.ts";
import {
  fetchOpenMeteoForecast,
  type OpenMeteoForecastResult,
} from "../providers/openMeteoProvider.ts";

import { haversineKm } from "../utils/geo.ts";
import { sanitizeLocationLabel } from "./aiContext.ts";

export interface ServerVerifiedAirResult {
  airContext: VerifiedAirContext;
  dataProvenance: DataProvenance;
}

function selectBestEligibleStation(
  stations: CpcbStationMeasurement[],
  location: AiLocationInput
): CpcbStationMeasurement | null {
  const eligibleStations = stations.filter(
    (s) => !s.stale && s.indianAqi.calculable && s.indianAqi.aqi !== null
  );
  if (eligibleStations.length === 0) return null;

  if (location.preferredStationName) {
    const preferred = eligibleStations.find(
      (s) =>
        s.stationName.toLowerCase() ===
        location.preferredStationName?.trim().toLowerCase()
    );
    if (preferred) return preferred;
  }

  const ranked = [...eligibleStations].sort((a, b) => {
    // 1. Prefer verified multi-hour time-series stations (OpenAQ hourly) over snapshot-only feeds
    const aHourly = a.feedOrigin === "openaq_v3" ? 0 : 1;
    const bHourly = b.feedOrigin === "openaq_v3" ? 0 : 1;
    if (aHourly !== bHourly) return aHourly - bHourly;

    // 2. Proximity distance
    if (
      typeof a.latitude === "number" &&
      typeof a.longitude === "number" &&
      typeof b.latitude === "number" &&
      typeof b.longitude === "number" &&
      typeof location.latitude === "number" &&
      typeof location.longitude === "number"
    ) {
      const distA = haversineKm(
        location.latitude,
        location.longitude,
        a.latitude,
        a.longitude
      );
      const distB = haversineKm(
        location.latitude,
        location.longitude,
        b.latitude,
        b.longitude
      );
      if (Math.abs(distA - distB) > 0.5) {
        return distA - distB;
      }
    }

    // 3. Age in minutes (freshest first)
    const ageA = a.ageMinutes ?? Infinity;
    const ageB = b.ageMinutes ?? Infinity;
    if (ageA !== ageB) return ageA - ageB;

    // 4. Pollutant coverage count
    return b.pollutants.length - a.pollutants.length;
  });

  return ranked[0] ?? null;
}

export async function buildServerVerifiedAirContext(params: {
  location: AiLocationInput;
  dataGovInApiKey: string;
  openAqApiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<ServerVerifiedAirResult> {
  const {
    location,
    dataGovInApiKey,
    openAqApiKey = "",
    fetchImpl = fetch,
  } = params;

  const [cpcb, openAq, openMeteo]: [
    CpcbProviderResponse,
    OpenAqProviderResponse,
    OpenMeteoForecastResult,
  ] = await Promise.all([
    fetchCpcbStations({
      city: location.city,
      state: location.state,
      apiKey: dataGovInApiKey,
      fetchImpl,
    }),
    fetchOpenAqHourlyStations({
      city: location.city,
      state: location.state,
      latitude: location.latitude,
      longitude: location.longitude,
      apiKey: openAqApiKey,
      fetchImpl,
    }),
    fetchOpenMeteoForecast({
      latitude: location.latitude,
      longitude: location.longitude,
      fetchImpl,
    }),
  ]);

  const paginationIncomplete =
    cpcb.status === "available" && cpcb.isPaginationComplete === false;

  const validCpcbStations =
    cpcb.status === "available" && !paginationIncomplete ? cpcb.stations : [];
  const validOpenAqStations =
    openAq.status === "available" ? openAq.stations : [];

  const matchedStation = selectBestEligibleStation(
    [...validOpenAqStations, ...validCpcbStations],
    location
  );

  const measuredAvailable = Boolean(matchedStation);
  const openMeteoStale = openMeteo.status === "available" && openMeteo.stale;
  const modelledAvailable =
    openMeteo.status === "available" && !openMeteo.stale;

  const safeCity = sanitizeLocationLabel(location.city) || "Selected City";
  const safeState = location.state ? sanitizeLocationLabel(location.state) : "";
  const locationLabel = safeState ? `${safeCity}, ${safeState}` : safeCity;

  const dataLimitations = (() => {
    const parts: string[] = [];
    if (measuredAvailable && matchedStation) {
      parts.push(
        matchedStation.feedOrigin === "openaq_v3"
          ? "Measured station AQI is computed from verified >=16h OpenAQ v3 hourly measurements (per-sensor fresh & aligned) using CPCB methodology."
          : "CPCB readings reflect fresh stationary monitors meeting CPCB >=16h averaging criteria."
      );
    } else if (paginationIncomplete) {
      parts.push(
        "CPCB station pagination was incomplete; truncated station list was rejected."
      );
    } else if (validOpenAqStations.length > 0 || validCpcbStations.length > 0) {
      const allStations = [...validOpenAqStations, ...validCpcbStations];
      const anyFresh = allStations.some((s) => !s.stale);
      if (!anyFresh) {
        parts.push(
          "All nearby ground monitoring stations are stale (>3 hours old or invalid timestamp)."
        );
      } else {
        parts.push(
          "Ground station feed lacked CPCB's minimum 16-hour valid observation window per criteria pollutant for official Indian AQI calculation."
        );
      }
    } else {
      parts.push("Official ground station telemetry unavailable.");
    }

    if (modelledAvailable) {
      parts.push(
        "Open-Meteo values represent fresh modelled regional grid estimates."
      );
    } else if (openMeteoStale) {
      parts.push(
        "Open-Meteo regional model forecast was rejected because its timestamp is stale (>3 hours old or misaligned)."
      );
    } else {
      parts.push("Open-Meteo regional forecast is currently unavailable.");
    }

    return parts.join(" ");
  })();

  const providerAttributionParts = matchedStation
    ? [
        matchedStation.providerName
          ? `Provider: ${matchedStation.providerName}`
          : null,
        matchedStation.ownerName &&
        matchedStation.ownerName !== matchedStation.providerName
          ? `Owner: ${matchedStation.ownerName}`
          : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  const airContext = VerifiedAirContextSchema.parse({
    locationLabel,
    state: safeState || undefined,
    measuredStationName: matchedStation?.stationName ?? null,
    measuredSourceLabel: matchedStation?.sourceLabel ?? null,
    measuredProviderAttribution:
      providerAttributionParts.length > 0
        ? providerAttributionParts.join("; ")
        : null,
    measuredAqi: matchedStation?.indianAqi.aqi ?? null,
    measuredAqiCategory: matchedStation?.indianAqi.category ?? null,
    measuredTimestamp:
      matchedStation?.lastUpdatedIso ?? matchedStation?.lastUpdatedRaw ?? null,
    measuredSourceAvailable: measuredAvailable,
    modelledPm25: modelledAvailable ? openMeteo.currentPollutants.pm25 : null,
    modelledPm10: modelledAvailable ? openMeteo.currentPollutants.pm10 : null,
    modelledNo2: modelledAvailable ? openMeteo.currentPollutants.no2 : null,
    modelledSo2: modelledAvailable ? openMeteo.currentPollutants.so2 : null,
    modelledOzone: modelledAvailable ? openMeteo.currentPollutants.ozone : null,
    modelledCoUgm3: modelledAvailable
      ? openMeteo.currentPollutants.coUgm3
      : null,
    modelledAqiEstimate: modelledAvailable
      ? openMeteo.indianAqiFromRollingModel.aqi
      : null,
    modelledTimestamp: modelledAvailable ? openMeteo.currentTimeIso : null,
    temperatureC: modelledAvailable ? openMeteo.weather.temperatureC : null,
    humidityPct: modelledAvailable ? openMeteo.weather.humidityPct : null,
    windKmh: modelledAvailable ? openMeteo.weather.windKmh : null,
    boundaryLayerHeightM: modelledAvailable
      ? openMeteo.weather.boundaryLayerHeightM
      : null,
    bestForecastWindow: modelledAvailable ? openMeteo.bestLowerPmWindow : null,
    dataLimitations,
  });

  const measuredSource =
    matchedStation?.feedOrigin === "openaq_v3"
      ? ("OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology" as const)
      : matchedStation
        ? ("CPCB / data.gov.in" as const)
        : null;

  const measuredCached =
    matchedStation?.feedOrigin === "openaq_v3" ? openAq.cached : cpcb.cached;

  const dataProvenance: DataProvenance = {
    measuredAvailable,
    measuredSource,
    measuredStationCount: validOpenAqStations.length + validCpcbStations.length,
    measuredCached,
    modelledAvailable,
    modelledSource: modelledAvailable ? "Open-Meteo Regional Forecast" : null,
    modelledCached: openMeteo.cached,
  };

  return { airContext, dataProvenance };
}
