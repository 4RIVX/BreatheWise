// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAirQualityData } from "../../src/hooks/useAirQualityData";
import type {
  CpcbStationView,
  MeasuredBlock,
} from "../../src/domain/airQualityTypes";

const station: CpcbStationView = {
  stationName: "Guindy",
  city: "Chennai",
  state: "Tamil Nadu",
  latitude: 13.01,
  longitude: 80.22,
  lastUpdatedRaw: "2026-01-15 10:00",
  lastUpdatedIso: "2026-01-15T04:30:00.000Z",
  stale: false,
  ageMinutes: 0,
  pollutants: [],
  indianAqi: {
    calculable: true,
    aqi: 50,
    category: "Good",
    prominentPollutant: "PM2.5",
    reasonIfNotCalculable: null,
    subIndices: [],
  },
  sourceLabel: "CPCB / data.gov.in snapshot",
  isMeasured: true,
};

const measured: MeasuredBlock = {
  status: "available",
  message: "Station observations available.",
  resourceId: "resource-1",
  stations: [station],
  cached: false,
  fetchedAtIso: "2026-01-15T10:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installGeolocation(value: Geolocation) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value,
  });
}

const originalGeolocation = Object.getOwnPropertyDescriptor(
  navigator,
  "geolocation"
);

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      jsonResponse({ measured: null, modelled: null })
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalGeolocation) {
    Object.defineProperty(navigator, "geolocation", originalGeolocation);
  } else {
    Reflect.deleteProperty(navigator, "geolocation");
  }
});

describe("useAirQualityData", () => {
  it("loads station data and falls back to the first station for an invalid index", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ measured, modelled: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAirQualityData());

    await waitFor(() => expect(result.current.measured).toEqual(measured));
    expect(result.current.activeCpcbStation).toEqual(station);
    expect(result.current.airLoading).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/air-quality?");

    act(() => result.current.setSelectedCpcbIndex(99));
    expect(result.current.activeCpcbStation).toEqual(station);
  });

  it("keeps partial data and exposes provider errors from an unsuccessful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ measured, error: "Regional provider unavailable" }, 503)
      )
    );
    const { result } = renderHook(() => useAirQualityData());

    await waitFor(() =>
      expect(result.current.airError).toBe("Regional provider unavailable")
    );
    expect(result.current.measured).toEqual(measured);
    expect(result.current.airLoading).toBe(false);
  });

  it("uses the fallback error when an unsuccessful response has no detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({}, 503))
    );
    const { result } = renderHook(() => useAirQualityData());

    await waitFor(() =>
      expect(result.current.airError).toMatch(/temporarily unavailable/i)
    );
  });

  it("maps network and non-Error failures safely", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network offline"))
      .mockRejectedValueOnce("unknown failure");
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAirQualityData());

    await waitFor(() =>
      expect(result.current.airError).toBe("network offline")
    );
    await act(async () => {
      await result.current.refreshAirQuality();
    });
    expect(result.current.airError).toBe(
      "Unable to load air-quality providers."
    );
    expect(result.current.airLoading).toBe(false);
  });

  it("reports unsupported geolocation", () => {
    installGeolocation(undefined as unknown as Geolocation);
    const { result } = renderHook(() => useAirQualityData());

    act(() => result.current.requestBrowserLocation());

    expect(result.current.airError).toBe(
      "Browser geolocation is not supported in this environment."
    );
  });

  it("updates the active location with rounded coordinates", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ measured, modelled: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { latitude: 13.08268, longitude: 80.27072 },
      } as GeolocationPosition)
    );
    installGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const { result } = renderHook(() => useAirQualityData());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.requestBrowserLocation());

    expect(result.current.activeLocation).toMatchObject({
      city: "Current Location",
      latitude: 13.0827,
      longitude: 80.2707,
      source: "geolocation",
    });
    expect(result.current.geoPending).toBe(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toContain("latitude=13.0827");
  });

  it("reports location permission errors and clears pending state", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ measured: null, modelled: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) =>
        error({ message: "permission denied" } as GeolocationPositionError)
    );
    installGeolocation({ getCurrentPosition } as unknown as Geolocation);
    const { result } = renderHook(() => useAirQualityData());

    act(() => result.current.requestBrowserLocation());

    expect(result.current.geoPending).toBe(false);
    expect(result.current.airError).toContain("permission denied");
    expect(result.current.airError).toContain("Select a city manually");
  });
});
