import { describe, expect, it } from "vitest";
import { clearCpcbCache } from "../../server/providers/cpcbProvider";
import {
  clearOpenMeteoCache,
  fetchOpenMeteoForecast,
  OpenMeteoAqSchema,
  OpenMeteoWeatherSchema,
} from "../../server/providers/openMeteoProvider";
import {
  clearOpenAqCache,
  fetchOpenAqHourlyStations,
} from "../../server/providers/openAqProvider";
import { buildServerVerifiedAirContext } from "../../server/services/verifiedAirContextBuilder";

describe("Open-Meteo & OpenAQ Provider Integrity", () => {
  it("strictly rejects Open-Meteo payloads with corrupted, duplicate, or misaligned hourly series", () => {
    // 1. Duplicate timestamps
    const duplicateTimesPayload = {
      latitude: 28.6,
      longitude: 77.2,
      hourly: {
        time: ["2026-03-01T08:00", "2026-03-01T08:00"], // duplicate!
        pm2_5: [50, 52],
      },
    };
    const dupRes = OpenMeteoAqSchema.safeParse(duplicateTimesPayload);
    expect(dupRes.success).toBe(false);
    if (!dupRes.success) {
      expect(dupRes.error.issues[0].message).toContain(
        "Timestamps must be strictly increasing"
      );
    }

    // 2. Non-chronological timestamps (backwards in time)
    const backwardsTimesPayload = {
      latitude: 28.6,
      longitude: 77.2,
      hourly: {
        time: ["2026-03-01T10:00", "2026-03-01T09:00"], // reversed!
        pm2_5: [50, 52],
      },
    };
    const backRes = OpenMeteoAqSchema.safeParse(backwardsTimesPayload);
    expect(backRes.success).toBe(false);

    // 3. Misaligned array lengths
    const misalignedPayload = {
      latitude: 28.6,
      longitude: 77.2,
      hourly: {
        time: ["2026-03-01T08:00", "2026-03-01T09:00", "2026-03-01T10:00"],
        pm2_5: [50, 52], // length 2 vs time length 3!
      },
    };
    const misRes = OpenMeteoAqSchema.safeParse(misalignedPayload);
    expect(misRes.success).toBe(false);
    if (!misRes.success) {
      expect(misRes.error.issues[0].message).toContain(
        "Hourly array 'pm2_5' length (2) must match time length (3)"
      );
    }

    // 4. Weather hourly series validation
    const weatherInvalidPayload = {
      hourly: {
        time: ["2026-03-01T08:00", "2026-03-01T09:00"],
        wind_speed_10m: [12.5], // length mismatch
      },
    };
    expect(
      OpenMeteoWeatherSchema.safeParse(weatherInvalidPayload).success
    ).toBe(false);

    // 5. Rejects hourly gaps > 1 hour
    const gappedPayload = {
      latitude: 28.6,
      longitude: 77.2,
      hourly: {
        time: ["2026-03-01T08:00", "2026-03-01T10:00"], // 2h gap!
        pm2_5: [50, 52],
      },
    };
    const gapRes = OpenMeteoAqSchema.safeParse(gappedPayload);
    expect(gapRes.success).toBe(false);
    if (!gapRes.success) {
      expect(gapRes.error.issues[0].message).toContain(
        "Hourly timestamps must be exactly 1 hour apart"
      );
    }

    // 6. Valid contiguous payload parses cleanly
    const validPayload = {
      latitude: 28.6,
      longitude: 77.2,
      hourly: {
        time: ["2026-03-01T08:00", "2026-03-01T09:00"],
        pm2_5: [50, 52],
      },
    };
    expect(OpenMeteoAqSchema.safeParse(validPayload).success).toBe(true);
  });

  it("aligns Open-Meteo weather hourly fields by timestamp key rather than raw array index", async () => {
    clearOpenMeteoCache();
    const aqTimes = [
      "2026-03-01T08:00",
      "2026-03-01T09:00",
      "2026-03-01T10:00",
    ];
    // Weather starts at 09:00 (shifted index relative to AQ!)
    const weatherTimes = [
      "2026-03-01T09:00",
      "2026-03-01T10:00",
      "2026-03-01T11:00",
    ];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            latitude: 28.6,
            longitude: 77.2,
            current: { time: "2026-03-01T10:00", pm2_5: 55 },
            hourly: { time: aqTimes, pm2_5: [40, 45, 55] },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          current: { time: "2026-03-01T10:00", wind_speed_10m: 18 },
          hourly: {
            time: weatherTimes,
            wind_speed_10m: [12, 18, 22],
            boundary_layer_height: [400, 950, 1100],
          },
        }),
        { status: 200 }
      );
    };

    const res = await fetchOpenMeteoForecast({
      latitude: 28.6,
      longitude: 77.2,
      fetchImpl: mockFetch,
    });
    const row08 = res.hourlySeries.find(
      (r) => r.timeIso === "2026-03-01T08:00"
    );
    const row09 = res.hourlySeries.find(
      (r) => r.timeIso === "2026-03-01T09:00"
    );
    const row10 = res.hourlySeries.find(
      (r) => r.timeIso === "2026-03-01T10:00"
    );

    expect(row08?.windKmh).toBeNull();
    expect(row09?.windKmh).toBe(12);
    expect(row09?.boundaryLayerHeightM).toBe(400);
    expect(row10?.windKmh).toBe(18);
    expect(row10?.boundaryLayerHeightM).toBe(950);
  });

  it("computes verified >=16h Indian AQI from OpenAQ v3 hourly monitoring series and rejects unaligned or stale Open-Meteo", async () => {
    clearOpenAqCache();
    clearCpcbCache();
    clearOpenMeteoCache();

    // 1. Open-Meteo missing current.time must fail cleanly instead of indexing hour 24
    const unalignedOpenMeteoFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            latitude: 13.08,
            longitude: 80.27,
            hourly: {
              time: ["2026-03-01T08:00", "2026-03-01T09:00"],
              pm2_5: [40, 42],
            },
          }),
          { status: 200 }
        );
      }
      return new Response("down", { status: 503 });
    };

    const unalignedRes = await fetchOpenMeteoForecast({
      latitude: 13.08,
      longitude: 80.27,
      fetchImpl: unalignedOpenMeteoFetch,
    });
    expect(unalignedRes.status).toBe("unavailable");
    expect(unalignedRes.message).toContain("current.time is missing");

    // 2. Stale Open-Meteo forecast (from 2026-01-15) must be excluded from airContext
    clearOpenMeteoCache();
    const staleOpenMeteoFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            latitude: 13.08,
            longitude: 80.27,
            current: { time: "2026-01-15T10:00", pm2_5: 55 },
            hourly: {
              time: ["2026-01-15T09:00", "2026-01-15T10:00"],
              pm2_5: [50, 55],
            },
          }),
          { status: 200 }
        );
      }
      return new Response("down", { status: 503 });
    };

    const staleContext = await buildServerVerifiedAirContext({
      location: { city: "Chennai", latitude: 13.08, longitude: 80.27 },
      dataGovInApiKey: "",
      fetchImpl: staleOpenMeteoFetch,
    });
    expect(staleContext.dataProvenance.modelledAvailable).toBe(false);
    expect(staleContext.dataProvenance.modelledSource).toBeNull();
    expect(staleContext.airContext.modelledPm25).toBeNull();
    expect(staleContext.airContext.dataLimitations).toContain("stale");

    // 3. OpenAQ v3 hourly monitoring series with >= 16h produces genuine verified AQI with accurate OpenAQ provenance & attribution
    const now = new Date();
    const hourTimestamps = Array.from({ length: 20 }, (_, i) =>
      new Date(now.getTime() - (20 - i) * 3_600_000).toISOString()
    );
    const openAqFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.openaq.org/v3/locations")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 9001,
                name: "Alandur Bus Depot, Chennai",
                locality: "Chennai",
                country: { code: "IN" },
                provider: { id: 12, name: "CAIR / Tamil Nadu" },
                owner: { id: 45, name: "Tamil Nadu Pollution Control Board" },
                licenses: [
                  {
                    id: 1,
                    name: "CC BY 4.0",
                    attribution: { name: "TNPCB / OpenAQ Contributors" },
                  },
                ],
                coordinates: { latitude: 13.0, longitude: 80.2 },
                sensors: [
                  { id: 101, parameter: { name: "pm25", units: "µg/m³" } },
                  { id: 102, parameter: { name: "pm10", units: "µg/m³" } },
                  { id: 103, parameter: { name: "co", units: "mg/m³" } },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/101/hours")) {
        return new Response(
          JSON.stringify({
            results: hourTimestamps.map((ts) => ({
              value: 60,
              parameter: { name: "pm25", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/102/hours")) {
        return new Response(
          JSON.stringify({
            results: hourTimestamps.map((ts) => ({
              value: 95,
              parameter: { name: "pm10", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/103/hours")) {
        return new Response(
          JSON.stringify({
            results: hourTimestamps.map((ts) => ({
              value: 1.5,
              parameter: { name: "co", units: "mg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      return new Response("unavailable", { status: 503 });
    };

    const openAqRes = await fetchOpenAqHourlyStations({
      city: "Chennai",
      state: "Tamil Nadu",
      latitude: 13.0,
      longitude: 80.2,
      apiKey: "test-openaq-key",
      fetchImpl: openAqFetch,
      now,
    });

    expect(openAqRes.status).toBe("available");
    expect(openAqRes.stations).toHaveLength(1);
    expect(openAqRes.stations[0].feedOrigin).toBe("openaq_v3");
    expect(openAqRes.stations[0].sourceLabel).toBe(
      "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"
    );
    expect(openAqRes.stations[0].providerName).toBe("CAIR / Tamil Nadu");
    expect(openAqRes.stations[0].ownerName).toBe(
      "Tamil Nadu Pollution Control Board"
    );
    expect(openAqRes.stations[0].licenseAttribution).toBe(
      "TNPCB / OpenAQ Contributors"
    );
    expect(openAqRes.stations[0].indianAqi.calculable).toBe(true);
    expect(openAqRes.stations[0].indianAqi.aqi).toBe(100);
    expect(openAqRes.stations[0].indianAqi.validPollutantCount).toBe(3);

    clearOpenMeteoCache();
    const verifiedFromOpenAq = await buildServerVerifiedAirContext({
      location: {
        city: "Chennai",
        state: "Tamil Nadu",
        latitude: 13.0,
        longitude: 80.2,
      },
      dataGovInApiKey: "",
      openAqApiKey: "test-openaq-key",
      fetchImpl: openAqFetch,
    });
    expect(verifiedFromOpenAq.dataProvenance.measuredAvailable).toBe(true);
    expect(verifiedFromOpenAq.dataProvenance.measuredSource).toBe(
      "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"
    );
    expect(verifiedFromOpenAq.airContext.measuredSourceLabel).toBe(
      "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology"
    );
    expect(verifiedFromOpenAq.airContext.measuredProviderAttribution).toContain(
      "CAIR / Tamil Nadu"
    );
    expect(verifiedFromOpenAq.airContext.measuredAqi).toBe(100);
  });

  it("validates each OpenAQ sensor independently for freshness (<=180 min) and alignment (<=60 min) before AQI calculation", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const freshSeries = (offsetMinutes: number) =>
      Array.from({ length: 20 }, (_, i) =>
        new Date(
          now.getTime() - offsetMinutes * 60_000 - (19 - i) * 3_600_000
        ).toISOString()
      );
    // Stale series ends 8 hours before `now`, yet still has 16h within a 24h lookback from `now - 30m`
    const stale8hSeries = Array.from({ length: 20 }, (_, i) =>
      new Date(
        now.getTime() - 8 * 3_600_000 - (19 - i) * 3_600_000
      ).toISOString()
    );

    // Case A: PM2.5 (30m old), PM10 (8h old — stale), NO2 (60m old) -> only 2 fresh aligned sensors -> AQI not calculable
    clearOpenAqCache();
    const caseAFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.openaq.org/v3/locations")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 9101,
                name: "Mixed Freshness Station A",
                locality: "Pune",
                provider: { name: "OpenAQ Community" },
                coordinates: { latitude: 18.52, longitude: 73.85 },
                sensors: [
                  { id: 201, parameter: { name: "pm25", units: "µg/m³" } },
                  { id: 202, parameter: { name: "pm10", units: "µg/m³" } },
                  { id: 203, parameter: { name: "no2", units: "µg/m³" } },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/201/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(30).map((ts) => ({
              value: 55,
              parameter: { name: "pm25", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/202/hours")) {
        return new Response(
          JSON.stringify({
            results: stale8hSeries.map((ts) => ({
              value: 350, // High stale PM10 must NOT leak into AQI
              parameter: { name: "pm10", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/203/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(60).map((ts) => ({
              value: 35,
              parameter: { name: "no2", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      return new Response("unavailable", { status: 503 });
    };

    const resA = await fetchOpenAqHourlyStations({
      city: "Pune",
      state: "Maharashtra",
      latitude: 18.52,
      longitude: 73.85,
      apiKey: "test-key",
      fetchImpl: caseAFetch,
      now,
    });
    expect(resA.stations).toHaveLength(1);
    expect(resA.stations[0].stale).toBe(false);
    expect(resA.stations[0].indianAqi.calculable).toBe(false);
    expect(resA.stations[0].indianAqi.validPollutantCount).toBe(2);
    const pm10A = resA.stations[0].pollutants.find((p) => p.code === "PM10");
    expect(pm10A?.stale).toBe(true);
    expect(pm10A?.fresh).toBe(false);

    // Case B: PM2.5 (30m), PM10 (8h old — stale 400 ug/m3), NO2 (60m), SO2 (45m)
    // PM10 must be excluded; AQI computed strictly from PM2.5, NO2, SO2 only
    clearOpenAqCache();
    const caseBFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.openaq.org/v3/locations")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 9102,
                name: "Mixed Freshness Station B",
                locality: "Jaipur",
                provider: { name: "OpenAQ Upstream" },
                coordinates: { latitude: 26.91, longitude: 75.78 },
                sensors: [
                  { id: 301, parameter: { name: "pm25", units: "µg/m³" } },
                  { id: 302, parameter: { name: "pm10", units: "µg/m³" } },
                  { id: 303, parameter: { name: "no2", units: "µg/m³" } },
                  { id: 304, parameter: { name: "so2", units: "µg/m³" } },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/301/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(30).map((ts) => ({
              value: 60,
              parameter: { name: "pm25", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/302/hours")) {
        return new Response(
          JSON.stringify({
            results: stale8hSeries.map((ts) => ({
              value: 400, // Stale extreme PM10 must be ignored
              parameter: { name: "pm10", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/303/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(60).map((ts) => ({
              value: 40,
              parameter: { name: "no2", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/304/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(45).map((ts) => ({
              value: 20,
              parameter: { name: "so2", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      return new Response("unavailable", { status: 503 });
    };

    const resB = await fetchOpenAqHourlyStations({
      city: "Jaipur",
      state: "Rajasthan",
      latitude: 26.91,
      longitude: 75.78,
      apiKey: "test-key",
      fetchImpl: caseBFetch,
      now,
    });
    expect(resB.stations[0].indianAqi.calculable).toBe(true);
    expect(resB.stations[0].indianAqi.validPollutantCount).toBe(3);
    expect(
      resB.stations[0].indianAqi.subIndices.map((s) => s.code)
    ).not.toContain("PM10");
    expect(resB.stations[0].indianAqi.prominentPollutant).toBe("PM2.5");
    expect(resB.stations[0].indianAqi.aqi).toBe(100);

    // Case C: Cross-sensor misalignment >60 min (PM2.5 15m old, PM10 110m old, NO2 30m old)
    clearOpenAqCache();
    const caseCFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.openaq.org/v3/locations")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 9103,
                name: "Misaligned Station C",
                locality: "Surat",
                coordinates: { latitude: 21.17, longitude: 72.83 },
                sensors: [
                  { id: 401, parameter: { name: "pm25", units: "µg/m³" } },
                  { id: 402, parameter: { name: "pm10", units: "µg/m³" } },
                  { id: 403, parameter: { name: "no2", units: "µg/m³" } },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/401/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(15).map((ts) => ({
              value: 50,
              parameter: { name: "pm25", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/402/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(110).map((ts) => ({
              value: 95,
              parameter: { name: "pm10", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v3/sensors/403/hours")) {
        return new Response(
          JSON.stringify({
            results: freshSeries(30).map((ts) => ({
              value: 30,
              parameter: { name: "no2", units: "µg/m³" },
              period: { datetimeTo: { utc: ts } },
            })),
          }),
          { status: 200 }
        );
      }
      return new Response("unavailable", { status: 503 });
    };

    const resC = await fetchOpenAqHourlyStations({
      city: "Surat",
      state: "Gujarat",
      latitude: 21.17,
      longitude: 72.83,
      apiKey: "test-key",
      fetchImpl: caseCFetch,
      now,
    });
    expect(resC.stations[0].indianAqi.calculable).toBe(false);
    const pm10C = resC.stations[0].pollutants.find((p) => p.code === "PM10");
    expect(pm10C?.stale).toBe(false);
    expect(pm10C?.alignedWithStation).toBe(false);
    expect(pm10C?.fresh).toBe(false);
  });
});
