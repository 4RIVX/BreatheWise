import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearOpenMeteoCache,
  fetchOpenMeteoForecast,
} from "../../server/providers/openMeteoProvider.ts";

afterEach(() => {
  clearOpenMeteoCache();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function fetchReturning(aq: Response, weather: Response) {
  return vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("air-quality") ? aq : weather
  ) as unknown as typeof fetch;
}

const base = { latitude: 13.08, longitude: 80.27 };

describe("fetchOpenMeteoForecast edge branches", () => {
  it("returns unavailable on upstream HTTP error", async () => {
    const result = await fetchOpenMeteoForecast({
      ...base,
      fetchImpl: fetchReturning(json({}, 500), json({})),
    });
    expect(result.status).toBe("unavailable");
  });

  it("rejects a hourly series with a time gap", async () => {
    const aq = {
      latitude: 13,
      longitude: 80,
      current: { time: "2026-01-15T00:00" },
      hourly: {
        time: ["2026-01-15T00:00", "2026-01-15T02:00"],
        pm2_5: [10, 10],
      },
    };
    const result = await fetchOpenMeteoForecast({
      ...base,
      fetchImpl: fetchReturning(json(aq), json({})),
    });
    expect(result.status).toBe("unavailable");
  });

  it("rejects when current.time is not aligned to the hourly series", async () => {
    const aq = {
      latitude: 13,
      longitude: 80,
      current: { time: "2026-01-15T05:00" },
      hourly: {
        time: ["2026-01-15T00:00", "2026-01-15T01:00"],
        pm2_5: [10, 10],
      },
    };
    const result = await fetchOpenMeteoForecast({
      ...base,
      fetchImpl: fetchReturning(json(aq), json({})),
    });
    expect(result.status).toBe("unavailable");
  });

  it("stays available when the weather feed fails", async () => {
    const times = Array.from({ length: 25 }, (_, index) => {
      const time = new Date(Date.UTC(2026, 0, 15, index));
      return time.toISOString().slice(0, 16);
    });
    const values = times.map(() => 40);
    const aq = {
      latitude: 13,
      longitude: 80,
      current: {
        time: times[24],
        pm2_5: 40,
        pm10: 70,
        nitrogen_dioxide: 20,
        sulphur_dioxide: 8,
        ozone: 40,
        carbon_monoxide: 500,
      },
      hourly: {
        time: times,
        pm2_5: values,
        pm10: values.map(() => 70),
        nitrogen_dioxide: values.map(() => 20),
        sulphur_dioxide: values.map(() => 8),
        ozone: values,
        carbon_monoxide: values.map(() => 500),
      },
    };
    const result = await fetchOpenMeteoForecast({
      ...base,
      fetchImpl: fetchReturning(json(aq), json({}, 500)),
    });
    expect(result.status).toBe("available");
    expect(result.weather.temperatureC).toBeNull();
  });
});
