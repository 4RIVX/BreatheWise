import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { ServerConfig } from "../config.ts";
import {
  fetchCpcbStations,
  type CpcbProviderResponse,
} from "../providers/cpcbProvider.ts";
import {
  fetchOpenAqHourlyStations,
  type OpenAqProviderResponse,
} from "../providers/openAqProvider.ts";
import {
  fetchOpenMeteoForecast,
  type OpenMeteoForecastResult,
} from "../providers/openMeteoProvider.ts";
import { AirQualityQuerySchema } from "../../src/domain/schemas.ts";

export function createAirQualityRouter(params: {
  config: ServerConfig;
  fetchImpl: typeof fetch;
  apiLimiter: RequestHandler;
}): Router {
  const { config, fetchImpl, apiLimiter } = params;
  const router = Router();

  router.get("/", apiLimiter, async (req: Request, res: Response) => {
    const parsed = AirQualityQuerySchema.safeParse({
      city: req.query.city,
      state: req.query.state,
      latitude: req.query.latitude,
      longitude: req.query.longitude,
    });

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid location parameters.",
        details: parsed.error.issues.map((i) => i.message),
      });
      return;
    }

    const { city, state, latitude, longitude } = parsed.data;

    const [cpcb, openAq, openMeteo]: [
      CpcbProviderResponse,
      OpenAqProviderResponse,
      OpenMeteoForecastResult,
    ] = await Promise.all([
      fetchCpcbStations({
        city,
        state,
        apiKey: config.dataGovInApiKey,
        fetchImpl,
      }),
      fetchOpenAqHourlyStations({
        city,
        state,
        latitude,
        longitude,
        apiKey: config.openAqApiKey,
        fetchImpl,
      }),
      fetchOpenMeteoForecast({
        latitude,
        longitude,
        fetchImpl,
      }),
    ]);

    const measured: CpcbProviderResponse =
      openAq.status === "available" && openAq.stations.length > 0
        ? {
            status: "available",
            message:
              cpcb.status === "available"
                ? `${openAq.stations.length} OpenAQ v3 hourly station(s) + ${cpcb.stations.length} CPCB station(s) loaded for ${city}.`
                : openAq.message,
            resourceId:
              cpcb.status === "available" ? cpcb.resourceId : "openaq-v3",
            stations: [
              ...openAq.stations,
              ...(cpcb.status === "available" ? cpcb.stations : []),
            ],
            cached:
              openAq.cached && (cpcb.status !== "available" || cpcb.cached),
            fetchedAtIso: openAq.fetchedAtIso,
            totalRecordsReported: cpcb.totalRecordsReported,
            isPaginationComplete:
              cpcb.status === "available" ? cpcb.isPaginationComplete : true,
          }
        : cpcb;

    const bothUnavailable =
      measured.status === "unavailable" && openMeteo.status === "unavailable";

    res.status(bothUnavailable ? 503 : 200).json({
      location: { city, state: state ?? null, latitude, longitude },
      measured,
      modelled: openMeteo,
      retrievedAtIso: new Date().toISOString(),
    });
  });

  return router;
}
