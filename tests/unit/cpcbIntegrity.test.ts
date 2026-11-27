import { describe, expect, it } from "vitest";
import {
  clearCpcbCache,
  CpcbApiResponseSchema,
  fetchCpcbStations,
  normalizeCpcbRecords,
} from "../../server/providers/cpcbProvider";
import { clearOpenMeteoCache } from "../../server/providers/openMeteoProvider";
import { buildServerVerifiedAirContext } from "../../server/services/verifiedAirContextBuilder";

function formatCpcbIstTimestamp(minutesAgo: number): string {
  const istMs = Date.now() - minutesAgo * 60_000 + 5.5 * 3_600_000;
  const d = new Date(istMs);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
}

describe("CPCB Provider Integrity & Station Ranking", () => {
  it("rejects CPCB records missing sample_hours or having min/avg/max inconsistency", () => {
    const stations = normalizeCpcbRecords(
      [
        {
          station: "Test Station Corrupt",
          city: "Delhi",
          state: "Delhi",
          pollutant_id: "PM2.5",
          pollutant_avg: "80",
          pollutant_min: "120", // min > max (corrupted)
          pollutant_max: "60",
          pollutant_unit: "ug/m3",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Test Station Missing Hours",
          city: "Delhi",
          state: "Delhi",
          pollutant_id: "PM2.5",
          pollutant_avg: "80",
          pollutant_min: "40",
          pollutant_max: "120",
          pollutant_unit: "ug/m3",
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Test Station Valid Hours",
          city: "Delhi",
          state: "Delhi",
          pollutant_id: "PM2.5",
          pollutant_avg: "80",
          pollutant_min: "40",
          pollutant_max: "120",
          pollutant_unit: "ug/m3",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Test Station Valid Hours",
          city: "Delhi",
          state: "Delhi",
          pollutant_id: "PM10",
          pollutant_avg: "110",
          pollutant_min: "60",
          pollutant_max: "150",
          pollutant_unit: "ug/m3",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Test Station Valid Hours",
          city: "Delhi",
          state: "Delhi",
          pollutant_id: "NO2",
          pollutant_avg: "45",
          pollutant_min: "20",
          pollutant_max: "70",
          pollutant_unit: "ug/m3",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
      ],
      new Date("2026-01-20T07:00:00Z")
    );

    const corrupt = stations.find(
      (s) => s.stationName === "Test Station Corrupt"
    );
    const missingHours = stations.find(
      (s) => s.stationName === "Test Station Missing Hours"
    );
    const valid = stations.find(
      (s) => s.stationName === "Test Station Valid Hours"
    );

    expect(corrupt?.indianAqi.calculable).toBe(false);
    expect(missingHours?.indianAqi.calculable).toBe(false);
    expect(missingHours?.indianAqi.reasonIfNotCalculable).toContain(
      "lacks a valid 24-hour averaging window"
    );
    expect(valid?.indianAqi.calculable).toBe(true);
    expect(valid?.indianAqi.aqi).toBe(167);
  });

  it("ranks fresh verified stations by proximity and strictly rejects stale or unverified stations (even if preferred)", async () => {
    clearCpcbCache();
    clearOpenMeteoCache();
    const recentTs = formatCpcbIstTimestamp(30);
    const staleTs = formatCpcbIstTimestamp(600);

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.data.gov.in")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            total: 4,
            records: [
              {
                station: "Stale Preferred Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.971,
                longitude: 77.591,
                pollutant_id: "PM2.5",
                pollutant_avg: "50",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: staleTs,
              },
              {
                station: "Stale Preferred Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.971,
                longitude: 77.591,
                pollutant_id: "PM10",
                pollutant_avg: "80",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: staleTs,
              },
              {
                station: "Stale Preferred Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.971,
                longitude: 77.591,
                pollutant_id: "NO2",
                pollutant_avg: "30",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: staleTs,
              },
              {
                station: "Close Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.98,
                longitude: 77.6,
                pollutant_id: "PM2.5",
                pollutant_avg: "55",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: recentTs,
              },
              {
                station: "Close Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.98,
                longitude: 77.6,
                pollutant_id: "PM10",
                pollutant_avg: "90",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: recentTs,
              },
              {
                station: "Close Station",
                city: "Bengaluru",
                state: "Karnataka",
                latitude: 12.98,
                longitude: 77.6,
                pollutant_id: "NO2",
                pollutant_avg: "30",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: recentTs,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ status: "unavailable" }), {
        status: 503,
      });
    };

    const result = await buildServerVerifiedAirContext({
      location: {
        city: "Bengaluru",
        state: "Karnataka",
        latitude: 12.97,
        longitude: 77.59,
        preferredStationName: "Stale Preferred Station",
      },
      dataGovInApiKey: "test-key",
      fetchImpl: mockFetch,
    });

    expect(result.airContext.measuredSourceAvailable).toBe(true);
    expect(result.airContext.measuredStationName).toBe("Close Station");
    expect(result.airContext.measuredAqi).toBeGreaterThan(0);

    // When only stale stations exist, preferredStationName must still be rejected cleanly
    clearCpcbCache();
    clearOpenMeteoCache();
    const staleOnlyFetch: typeof fetch = async (input) => {
      if (String(input).includes("api.data.gov.in")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            total: 3,
            records: [
              {
                station: "Only Stale Station",
                city: "Bengaluru",
                state: "Karnataka",
                pollutant_id: "PM2.5",
                pollutant_avg: "55",
                sample_hours: 24,
                last_update: staleTs,
              },
              {
                station: "Only Stale Station",
                city: "Bengaluru",
                state: "Karnataka",
                pollutant_id: "PM10",
                pollutant_avg: "90",
                sample_hours: 24,
                last_update: staleTs,
              },
              {
                station: "Only Stale Station",
                city: "Bengaluru",
                state: "Karnataka",
                pollutant_id: "NO2",
                pollutant_avg: "30",
                sample_hours: 24,
                last_update: staleTs,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response("unavailable", { status: 503 });
    };

    const staleOnlyRes = await buildServerVerifiedAirContext({
      location: {
        city: "Bengaluru",
        state: "Karnataka",
        latitude: 12.97,
        longitude: 77.59,
        preferredStationName: "Only Stale Station",
      },
      dataGovInApiKey: "test-key",
      fetchImpl: staleOnlyFetch,
    });
    expect(staleOnlyRes.airContext.measuredSourceAvailable).toBe(false);
    expect(staleOnlyRes.airContext.measuredStationName).toBeNull();
    expect(staleOnlyRes.airContext.measuredAqi).toBeNull();
  });

  it("accurately tracks CPCB pagination completeness and marks incomplete datasets rejected", async () => {
    clearCpcbCache();
    clearOpenMeteoCache();

    // Schema test for data.gov.in total/count response structure
    const parsedSchema = CpcbApiResponseSchema.safeParse({
      status: "ok",
      total: "250",
      count: "100",
      records: [],
    });
    expect(parsedSchema.success).toBe(true);
    expect(parsedSchema.data?.total).toBe("250");

    // 1. Complete pagination across 2 pages
    let callCount = 0;
    const paginatedFetch: typeof fetch = async (input) => {
      callCount += 1;
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") || "0");
      if (offset === 0) {
        return new Response(
          JSON.stringify({
            status: "ok",
            total: 150,
            count: 100,
            records: Array.from({ length: 100 }, (_, i) => ({
              station: `Station-${i}`,
              city: "Hyderabad",
              state: "Telangana",
              pollutant_id: "PM2.5",
              pollutant_avg: "45",
              pollutant_min: "20",
              pollutant_max: "70",
              sample_hours: 24,
              last_update: "20-01-2026 10:00:00",
            })),
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          status: "ok",
          total: 150,
          count: 50,
          records: Array.from({ length: 50 }, (_, i) => ({
            station: `Station-${100 + i}`,
            city: "Hyderabad",
            state: "Telangana",
            pollutant_id: "PM2.5",
            pollutant_avg: "48",
            pollutant_min: "22",
            pollutant_max: "75",
            sample_hours: 24,
            last_update: "20-01-2026 10:00:00",
          })),
        }),
        { status: 200 }
      );
    };

    const res = await fetchCpcbStations({
      city: "Hyderabad",
      state: "Telangana",
      apiKey: "pagination-test-key",
      fetchImpl: paginatedFetch,
    });

    expect(callCount).toBe(2);
    expect(res.status).toBe("available");
    expect(res.totalRecordsReported).toBe(150);
    expect(res.isPaginationComplete).toBe(true);
    expect(res.stations.length).toBe(150);

    // 2. Partial pagination after HTTP 500 on page 2 flags incomplete & rejected by context builder
    clearCpcbCache();
    clearOpenMeteoCache();
    const freshTs = formatCpcbIstTimestamp(20);
    const partialFetch: typeof fetch = async (input) => {
      const urlString = String(input);
      if (!urlString.includes("api.data.gov.in")) {
        return new Response("unavailable", { status: 503 });
      }
      const url = new URL(urlString);
      const offset = Number(url.searchParams.get("offset") || "0");
      if (offset === 0) {
        return new Response(
          JSON.stringify({
            status: "ok",
            total: 250,
            count: 100,
            records: [
              {
                station: "Partial Station",
                city: "Hyderabad",
                state: "Telangana",
                pollutant_id: "PM2.5",
                pollutant_avg: "45",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: freshTs,
              },
              {
                station: "Partial Station",
                city: "Hyderabad",
                state: "Telangana",
                pollutant_id: "PM10",
                pollutant_avg: "90",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: freshTs,
              },
              {
                station: "Partial Station",
                city: "Hyderabad",
                state: "Telangana",
                pollutant_id: "NO2",
                pollutant_avg: "30",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: freshTs,
              },
              ...Array.from({ length: 97 }, (_, i) => ({
                station: `Other-${i}`,
                city: "Hyderabad",
                state: "Telangana",
                pollutant_id: "PM2.5",
                pollutant_avg: "40",
                pollutant_unit: "ug/m3",
                sample_hours: 24,
                last_update: freshTs,
              })),
            ],
          }),
          { status: 200 }
        );
      }
      return new Response("upstream failure", { status: 500 });
    };

    const partialCpcb = await fetchCpcbStations({
      city: "Hyderabad",
      state: "Telangana",
      apiKey: "pagination-test-key",
      fetchImpl: partialFetch,
    });
    expect(partialCpcb.isPaginationComplete).toBe(false);

    clearCpcbCache();
    const ctxRes = await buildServerVerifiedAirContext({
      location: {
        city: "Hyderabad",
        state: "Telangana",
        latitude: 17.38,
        longitude: 78.48,
      },
      dataGovInApiKey: "pagination-test-key",
      fetchImpl: partialFetch,
    });
    expect(ctxRes.airContext.measuredSourceAvailable).toBe(false);
    expect(ctxRes.airContext.dataLimitations).toContain("incomplete");

    // 3. Overlapping duplicates across pages are deduplicated accurately; missing unique records mark incomplete
    clearCpcbCache();
    const dupShortfallFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") || "0");
      if (offset === 0) {
        return new Response(
          JSON.stringify({
            status: "ok",
            total: 105,
            records: Array.from({ length: 100 }, (_, i) => ({
              station: `Station-${i}`,
              city: "Hyderabad",
              state: "Telangana",
              pollutant_id: "PM2.5",
              pollutant_avg: "45",
              pollutant_unit: "ug/m3",
              sample_hours: 24,
              last_update: freshTs,
            })),
          }),
          { status: 200 }
        );
      }
      // Page 2 repeats Station-0..4 instead of delivering 5 new unique stations -> 100 unique < 105 reported total
      return new Response(
        JSON.stringify({
          status: "ok",
          total: 105,
          records: Array.from({ length: 5 }, (_, i) => ({
            station: `Station-${i}`,
            city: "Hyderabad",
            state: "Telangana",
            pollutant_id: "PM2.5",
            pollutant_avg: "45",
            pollutant_unit: "ug/m3",
            sample_hours: 24,
            last_update: freshTs,
          })),
        }),
        { status: 200 }
      );
    };
    const dupShortfallRes = await fetchCpcbStations({
      city: "Hyderabad",
      state: "Telangana",
      apiKey: "pagination-test-key",
      fetchImpl: dupShortfallFetch,
    });
    expect(dupShortfallRes.stations.length).toBe(100);
    expect(dupShortfallRes.isPaginationComplete).toBe(false);

    // 4. Unknown total hitting maxOffset (2500) must report incomplete pagination
    clearCpcbCache();
    const maxOffsetFetch: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") || "0");
      return new Response(
        JSON.stringify({
          status: "ok",
          records: Array.from({ length: 100 }, (_, i) => ({
            station: `Station-${offset}-${i}`,
            city: "Delhi",
            state: "Delhi",
            pollutant_id: "PM2.5",
            pollutant_avg: "45",
            pollutant_unit: "ug/m3",
            sample_hours: 24,
            last_update: freshTs,
          })),
        }),
        { status: 200 }
      );
    };
    const maxOffsetRes = await fetchCpcbStations({
      city: "Delhi",
      state: "Delhi",
      apiKey: "pagination-test-key",
      fetchImpl: maxOffsetFetch,
    });
    expect(maxOffsetRes.totalRecordsReported).toBeNull();
    expect(maxOffsetRes.isPaginationComplete).toBe(false);
  });

  it("preserves CPCB pollutant_unit conversions (CO in ug/m3) and rejects missing/unrecognized units or mixed stale record timestamps", () => {
    const now = new Date("2026-01-20T07:00:00Z"); // 12:30 IST
    const stations = normalizeCpcbRecords(
      [
        {
          station: "Unit Check Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM2.5",
          pollutant_avg: "30",
          pollutant_unit: "µg/m³",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Unit Check Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM10",
          pollutant_avg: "50",
          pollutant_unit: "ug/m3",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Unit Check Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "CO",
          pollutant_avg: "2000",
          pollutant_unit: "ug/m3",
          sample_hours: 20,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Missing Unit Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM2.5",
          pollutant_avg: "45",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Missing Unit Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM10",
          pollutant_avg: "85",
          pollutant_unit: "unknown-unit",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Missing Unit Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "NO2",
          pollutant_avg: "35",
          pollutant_unit: "ug/m3",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Mixed Timestamp Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM2.5",
          pollutant_avg: "45",
          pollutant_unit: "ug/m3",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Mixed Timestamp Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "PM10",
          pollutant_avg: "80",
          pollutant_unit: "ug/m3",
          sample_hours: 24,
          last_update: "20-01-2026 12:00:00",
        },
        {
          station: "Mixed Timestamp Station",
          city: "Chennai",
          state: "Tamil Nadu",
          pollutant_id: "NO2",
          pollutant_avg: "35",
          pollutant_unit: "ug/m3",
          sample_hours: 24,
          last_update: "19-01-2026 12:00:00", // stale 24h older than PM2.5!
        },
      ],
      now
    );

    const unitStation = stations.find(
      (s) => s.stationName === "Unit Check Station"
    );
    expect(unitStation?.indianAqi.calculable).toBe(true);
    expect(unitStation?.indianAqi.aqi).toBe(100);
    expect(unitStation?.indianAqi.prominentPollutant).toBe("CO");

    const missingUnitStation = stations.find(
      (s) => s.stationName === "Missing Unit Station"
    );
    expect(missingUnitStation?.indianAqi.calculable).toBe(false);
    expect(missingUnitStation?.indianAqi.validPollutantCount).toBe(1);

    const mixedTsStation = stations.find(
      (s) => s.stationName === "Mixed Timestamp Station"
    );
    expect(mixedTsStation?.indianAqi.calculable).toBe(false);
    expect(mixedTsStation?.indianAqi.validPollutantCount).toBe(2);
  });
});
