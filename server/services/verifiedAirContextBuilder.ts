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

  const matchedStation =
    cpcb.status === "available" && cpcb.stations.length > 0
      ? ((location.preferredStationName
          ? cpcb.stations.find(
              (s) =>
                s.stationName.toLowerCase() ===
                location.preferredStationName?.trim().toLowerCase()
            )
          : undefined) ?? cpcb.stations[0])
      : null;

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
