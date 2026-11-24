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

  const matchedStation = (() => {
    if (cpcb.status !== "available" || cpcb.stations.length === 0) return null;

    const candidateStations = cpcb.stations.filter(
      (s) => s.indianAqi.calculable || s.pollutants.length > 0
    );

    if (candidateStations.length === 0) return null;

    if (location.preferredStationName) {
      const preferred = candidateStations.find(
        (s) =>
          s.stationName.toLowerCase() ===
          location.preferredStationName?.trim().toLowerCase()
      );
      if (preferred) return preferred;
    }

    const ranked = [...candidateStations].sort((a, b) => {
      // 1. Calculable AQI priority
      if (a.indianAqi.calculable !== b.indianAqi.calculable) {
        return a.indianAqi.calculable ? -1 : 1;
      }
      // 2. Freshness priority (non-stale first)
      if (a.stale !== b.stale) {
        return a.stale ? 1 : -1;
      }
      // 3. Proximity distance
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
      // 4. Age in minutes
      const ageA = a.ageMinutes ?? Infinity;
      const ageB = b.ageMinutes ?? Infinity;
      if (ageA !== ageB) return ageA - ageB;

      // 5. Pollutant coverage count
      return b.pollutants.length - a.pollutants.length;
    });

    return ranked[0] ?? null;
  })();

  const measuredAvailable = Boolean(matchedStation);
  const modelledAvailable = openMeteo.status === "available";

  const locationLabel = location.state?.trim()
    ? `${location.city.trim()}, ${location.state.trim()}`
    : location.city.trim();

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
    dataLimitations: !measuredAvailable
      ? "Official CPCB station telemetry unavailable; assessment relies strictly on Open-Meteo regional atmospheric forecast."
      : "CPCB readings reflect stationary monitors; Open-Meteo values represent modelled regional grid averages.",
  });

  const dataProvenance: DataProvenance = {
    measuredAvailable,
    measuredSource: measuredAvailable ? "CPCB / data.gov.in" : null,
    measuredStationCount:
      cpcb.status === "available" ? cpcb.stations.length : 0,
    measuredCached: cpcb.cached,
    modelledAvailable,
    modelledSource: modelledAvailable ? "Open-Meteo Regional Forecast" : null,
    modelledCached: openMeteo.cached,
  };

  return { airContext, dataProvenance };
}
