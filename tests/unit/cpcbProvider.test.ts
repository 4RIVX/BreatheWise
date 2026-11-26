import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCpcbCache,
  fetchCpcbStations,
} from "../../server/providers/cpcbProvider.ts";

afterEach(() => {
  clearCpcbCache();
  vi.restoreAllMocks();
});

describe("fetchCpcbStations pagination safeguards", () => {
  it("filters by city without sending the unsupported state filter", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("filters[city]")).toBe("Chennai");
      expect(url.searchParams.has("filters[state]")).toBe(false);
      return new Response(
        JSON.stringify({ status: "ok", total: 0, records: [] }),
        { status: 200 }
      );
    });

    const result = await fetchCpcbStations({
      city: "Chennai",
      state: "Tamil Nadu",
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.isPaginationComplete).toBe(true);
  });

  it("stops requesting pages when the overall 20-second budget expires", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fetchImpl = vi.fn(async () => {
      now.mockReturnValue(21_001);
      return new Response(
        JSON.stringify({
          status: "ok",
          total: 250,
          records: Array.from({ length: 100 }, (_, index) => ({
            station: `Station-${index}`,
            city: "Delhi",
            state: "Delhi",
            pollutant_id: "PM2.5",
            pollutant_avg: "45",
            pollutant_unit: "ug/m3",
            last_update: "26-11-2026 10:00:00",
          })),
        }),
        { status: 200 }
      );
    });

    const result = await fetchCpcbStations({
      city: "Delhi",
      state: "Delhi",
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result.isPaginationComplete).toBe(false);
  });
});
