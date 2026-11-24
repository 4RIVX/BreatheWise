import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyAtomicConfirmationTx,
  mapPublicSmogReportDoc,
  type ConfirmationTransactionAdapter,
} from "../../src/firebase/firestoreService";
import {
  handleFirestoreError,
  OperationType,
  sanitizeFirestorePath,
  sanitizeOperationalText,
} from "../../src/firebase/errorHandling";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../../src/domain/defaultRoutines";
import {
  clearCpcbCache,
  CpcbApiResponseSchema,
  fetchCpcbStations,
  normalizeCpcbRecords,
} from "../../server/providers/cpcbProvider";
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

vi.mock("../../src/firebase/config", () => ({
  auth: {
    currentUser: {
      uid: "secret-uid-98765",
      email: "arivumathi.private@example.com",
      emailVerified: true,
      isAnonymous: false,
      tenantId: "tenant-secret-01",
      providerData: [
        {
          providerId: "google.com",
          email: "arivumathi.private@example.com",
        },
      ],
    },
  },
  db: null,
}));

describe("Mission F1: Firestore Privacy, Atomic Confirmations, Rules Regressions & Log Privacy", () => {
  it("strips authorUid and private metadata from public smog report projections", () => {
    const publicReport = mapPublicSmogReportDoc("rep-101", {
      authorUid: "leak-check-uid-999",
      email: "should-not-leak@example.com",
      city: "Chennai",
      state: "Tamil Nadu",
      approximateLocation: "Adyar Signal",
      sourceCategory: "Traffic emissions",
      severity: "Moderate",
      description: "Heavy diesel bus smoke near intersection.",
      observedTimeLabel: "08:30 IST",
      moderationStatus: "UNVERIFIED",
      confirmationsCount: 2,
    });

    expect("authorUid" in publicReport).toBe(false);
    expect("email" in publicReport).toBe(false);
    expect(JSON.stringify(publicReport)).not.toContain("leak-check-uid-999");
    expect(JSON.stringify(publicReport)).not.toContain(
      "should-not-leak@example.com"
    );
    expect(publicReport.confirmationsCount).toBe(2);
  });

  it("executes atomic confirmation transactions without lost increments and blocks duplicates", async () => {
    const store = new Map<string, Record<string, unknown>>([
      ["smogReports/rep-1", { confirmationsCount: 1 }],
      [
        "smogReports/rep-1/confirmations/author-uid",
        { uid: "author-uid", reportId: "rep-1" },
      ],
    ]);

    const runMockTransaction = async (uid: string) => {
      const tx: ConfirmationTransactionAdapter = {
        get: async (ref) => {
          const key = String(ref);
          const rec = store.get(key);
          return {
            exists: () => Boolean(rec),
            data: () => rec,
          };
        },
        set: (ref, data) => {
          store.set(String(ref), data);
        },
        update: (ref, data) => {
          const key = String(ref);
          const prev = store.get(key) ?? {};
          store.set(key, { ...prev, ...data });
        },
      };

      return applyAtomicConfirmationTx({
        tx,
        confRef: `smogReports/rep-1/confirmations/${uid}`,
        reportRef: "smogReports/rep-1",
        uid,
        reportId: "rep-1",
        timestampValue: "SERVER_TS",
      });
    };

    const countAfterU2 = await runMockTransaction("user-2");
    const countAfterU3 = await runMockTransaction("user-3");
    expect(countAfterU2).toBe(2);
    expect(countAfterU3).toBe(3);
    expect(store.get("smogReports/rep-1")?.confirmationsCount).toBe(3);

    // Author who created report already has initial confirmation record
    await expect(runMockTransaction("author-uid")).rejects.toThrow(
      "DUPLICATE_CONFIRMATION"
    );
    // Second confirmation by user-2 also blocked
    await expect(runMockTransaction("user-2")).rejects.toThrow(
      "DUPLICATE_CONFIRMATION"
    );
  });

  it("enforces privacy isolation and atomic confirmation invariants in firestore.rules", () => {
    const rules = fs.readFileSync(
      path.resolve(process.cwd(), "firestore.rules"),
      "utf-8"
    );

    // Default deny catch-all
    expect(rules).toContain("match /{document=**}");
    expect(rules).toContain("allow read, write: if false;");

    // Public smogReports blueprint MUST NOT contain authorUid
    const smogReportFn = rules.slice(
      rules.indexOf("function isValidSmogReport(data)"),
      rules.indexOf("function isValidSmogReportOwner")
    );
    expect(smogReportFn).not.toContain("authorUid");

    // Ownership isolated to /private/{docId} with docId == 'owner' and list disabled
    expect(rules).toContain("match /private/{docId}");
    expect(rules).toContain("docId == 'owner'");
    expect(rules).toContain("allow list: if false;");
    expect(rules).toContain(
      "existsAfter(/databases/$(database)/documents/smogReports/$(reportId)/private/owner)"
    );
    expect(rules).toContain(
      "existsAfter(/databases/$(database)/documents/smogReports/$(reportId)/confirmations/$(request.auth.uid))"
    );
  });

  it("never logs user email, UID, or tenant metadata in handleFirestoreError", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        handleFirestoreError(
          {
            code: "permission-denied",
            message:
              "Access denied for arivumathi.private@example.com with Bearer secretToken.123",
          },
          OperationType.UPDATE,
          "users/secret-uid-98765/routines/rt-1"
        )
      ).toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = JSON.stringify(errorSpy.mock.calls[0]);
      expect(loggedPayload).not.toContain("arivumathi.private@example.com");
      expect(loggedPayload).not.toContain("secret-uid-98765");
      expect(loggedPayload).not.toContain("tenant-secret-01");
      expect(loggedPayload).not.toContain("secretToken.123");
      expect(loggedPayload).toContain("[REDACTED_UID]");
      expect(loggedPayload).toContain("permission-denied");

      expect(
        sanitizeOperationalText("Contact user@domain.org")
      ).toContain("[REDACTED_EMAIL]");
      expect(
        sanitizeFirestorePath("users/abc123uid/ecoLogs/log1")
      ).toBe("users/[REDACTED_UID]/ecoLogs/log1");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("verifies sharp dependency >=0.35.5 is declared in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    expect(pkg.dependencies.sharp).toBeDefined();
    expect(pkg.dependencies.sharp).toMatch(/^\^?0\.3[5-9]/);
  });

  it("ensures default clean-air routines do not contain arbitrary uncalculated CO2 savings", () => {
    for (const routine of DEFAULT_CLEAN_AIR_ROUTINES) {
      expect(routine.co2SavedKg).toBe(0.0);
    }
  });

  it("rejects CPCB records missing sample_hours or having min/avg/max inconsistency", () => {
    const stations = normalizeCpcbRecords([
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
    ], new Date("2026-01-20T07:00:00Z"));

    const corrupt = stations.find((s) => s.stationName === "Test Station Corrupt");
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
    expect(OpenMeteoWeatherSchema.safeParse(weatherInvalidPayload).success).toBe(false);

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
    const row08 = res.hourlySeries.find((r) => r.timeIso === "2026-03-01T08:00");
    const row09 = res.hourlySeries.find((r) => r.timeIso === "2026-03-01T09:00");
    const row10 = res.hourlySeries.find((r) => r.timeIso === "2026-03-01T10:00");

    expect(row08?.windKmh).toBeNull();
    expect(row09?.windKmh).toBe(12);
    expect(row09?.boundaryLayerHeightM).toBe(400);
    expect(row10?.windKmh).toBe(18);
    expect(row10?.boundaryLayerHeightM).toBe(950);
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
      location: { city: "Hyderabad", state: "Telangana", latitude: 17.38, longitude: 78.48 },
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

  it("enforces lockfile parity for sharp >=0.35.5 and typescript ^5.9.3 and keeps .gitignore present", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    const bunLock = fs.readFileSync(
      path.resolve(process.cwd(), "bun.lock"),
      "utf-8"
    );
    expect(fs.existsSync(path.resolve(process.cwd(), ".gitignore"))).toBe(true);
    expect(pkg.dependencies.sharp).toBe("^0.35.5");
    expect(pkg.dependencies.typescript).toBe("^5.9.3");
    expect(bunLock).toContain('"sharp": "^0.35.5"');
    expect(bunLock).toContain('"typescript": "^5.9.3"');
    expect(bunLock).toContain('"sharp@0.35.');
    expect(bunLock).toContain('"typescript@5.9.3"');
  });
});
