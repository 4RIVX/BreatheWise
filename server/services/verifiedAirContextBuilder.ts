import {
  VerifiedAirContextSchema,
  type AiLocationInput,
  type DataProvenance,
  type VerifiedAirContext,
} from "../../src/domain/schemas.ts";
import {
  fetchCpcbStations,
  type CpcbProviderResponse,
} from "../providers/cpcbProvider.ts";
import {
  fetchOpenMeteoForecast,
  type OpenMeteoForecastResult,
} from "../providers/openMeteoProvider.ts";

export interface ServerVerifiedAirResult {
  airContext: VerifiedAirContext;
  dataProvenance: DataProvenance;
}

export async function buildServerVerifiedAirContext(params: {
  location: AiLocationInput;
  dataGovInApiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<ServerVerifiedAirResult> {
  const { location, dataGovInApiKey, fetchImpl = fetch } = params;

  const [cpcb, openMeteo]: [CpcbProviderResponse, OpenMeteoForecastResult] =
    await Promise.all([
      fetchCpcbStations({
        city: location.city,
        state: location.state,
        apiKey: dataGovInApiKey,
        fetchImpl,
      }),
      fetchOpenMeteoForecast({
        latitude: location.latitude,
        longitude: location.longitude,
        fetchImpl,
      }),
    ]);

  function calculateDistanceKm(
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

  const paginationIncomplete =
    cpcb.status === "available" && cpcb.isPaginationComplete === false;

  const matchedStation = (() => {
    if (
      cpcb.status !== "available" ||
      cpcb.stations.length === 0 ||
      paginationIncomplete
    ) {
      return null;
    }

    // Strict scientific & freshness gate: ONLY non-stale stations with calculable CPCB AQI
    const eligibleStations = cpcb.stations.filter(
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
      // 1. Proximity distance
      if (
        typeof a.latitude === "number" &&
        typeof a.longitude === "number" &&
        typeof b.latitude === "number" &&
        typeof b.longitude === "number" &&
        typeof location.latitude === "number" &&
        typeof location.longitude === "number"
      ) {
        const distA = calculateDistanceKm(
          location.latitude,
          location.longitude,
          a.latitude,
          a.longitude
        );
        const distB = calculateDistanceKm(
          location.latitude,
          location.longitude,
          b.latitude,
          b.longitude
        );
        if (Math.abs(distA - distB) > 0.5) {
          return distA - distB;
        }
      }
      // 2. Age in minutes (freshest first)
      const ageA = a.ageMinutes ?? Infinity;
      const ageB = b.ageMinutes ?? Infinity;
      if (ageA !== ageB) return ageA - ageB;

      // 3. Pollutant coverage count
      return b.pollutants.length - a.pollutants.length;
    });

    return ranked[0] ?? null;
  })();

  const measuredAvailable = Boolean(matchedStation);
  const modelledAvailable = openMeteo.status === "available";

  const locationLabel = location.state?.trim()
    ? `${location.city.trim()}, ${location.state.trim()}`
    : location.city.trim();

  const dataLimitations = (() => {
    if (measuredAvailable) {
      return "CPCB readings reflect fresh stationary monitors meeting CPCB averaging criteria; Open-Meteo values represent modelled regional grid averages.";
    }
    if (paginationIncomplete) {
      return "CPCB station pagination was incomplete; rejected truncated station list and relied strictly on Open-Meteo regional atmospheric forecast.";
    }
    if (cpcb.status === "available" && cpcb.stations.length > 0) {
      const anyFresh = cpcb.stations.some((s) => !s.stale);
      if (!anyFresh) {
        return "All nearby CPCB monitoring stations are stale (>3 hours old); assessment relies strictly on Open-Meteo regional atmospheric forecast.";
      }
      return "CPCB station feed lacked minimum hourly observation counts (16h/24h or 6h/8h) for official Indian AQI calculation; assessment relies strictly on Open-Meteo regional forecast.";
    }
    return "Official CPCB station telemetry unavailable; assessment relies strictly on Open-Meteo regional atmospheric forecast.";
  })();

  const airContext = VerifiedAirContextSchema.parse({
    locationLabel,
    state: location.state?.trim() || undefined,
    measuredStationName: matchedStation?.stationName ?? null,
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

  const dataProvenance: DataProvenance = {
    measuredAvailable,
    measuredSource: measuredAvailable ? "CPCB / data.gov.in" : null,
    measuredStationCount:
      cpcb.status === "available" && !paginationIncomplete
        ? cpcb.stations.length
        : 0,
    measuredCached: cpcb.cached,
    modelledAvailable,
    modelledSource: modelledAvailable ? "Open-Meteo Regional Forecast" : null,
    modelledCached: openMeteo.cached,
  };

  return { airContext, dataProvenance };
}
