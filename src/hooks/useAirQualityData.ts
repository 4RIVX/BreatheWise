import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDIAN_CITY_PRESETS } from "../domain/indianCities";
import type {
  ActiveLocationState,
  MeasuredBlock,
  ModelledBlock,
} from "../domain/airQualityTypes";
import { readJsonResponse } from "../utils/safeFetchJson";

export function useAirQualityData() {
  const [activeLocation, setActiveLocation] = useState<ActiveLocationState>({
    city: INDIAN_CITY_PRESETS[0].city,
    state: INDIAN_CITY_PRESETS[0].state,
    latitude: INDIAN_CITY_PRESETS[0].latitude,
    longitude: INDIAN_CITY_PRESETS[0].longitude,
    source: "preset",
  });

  const [measured, setMeasured] = useState<MeasuredBlock | null>(null);
  const [modelled, setModelled] = useState<ModelledBlock | null>(null);
  const [selectedCpcbIndex, setSelectedCpcbIndex] = useState(0);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);
  const [geoPending, setGeoPending] = useState(false);

  const activeAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchAirQuality = useCallback(async (loc: ActiveLocationState) => {
    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setAirLoading(true);
    setAirError(null);
    setSelectedCpcbIndex(0);

    try {
      const qs = new URLSearchParams({
        city: loc.city,
        state: loc.state,
        latitude: String(loc.latitude),
        longitude: String(loc.longitude),
      });
      const res = await fetch(`/api/air-quality?${qs.toString()}`, {
        signal: controller.signal,
      });
      const data = await readJsonResponse<{
        measured?: MeasuredBlock;
        modelled?: ModelledBlock;
        error?: string;
      }>(res);

      if (seq !== requestSeqRef.current) return;

      if (data.measured) setMeasured(data.measured);
      if (data.modelled) setModelled(data.modelled);
      if (!res.ok) {
        setAirError(
          data.error ||
            "Both ground station and regional forecast providers are temporarily unavailable."
        );
      }
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        seq !== requestSeqRef.current
      ) {
        return;
      }
      setAirError(
        err instanceof Error
          ? err.message
          : "Unable to load air-quality providers."
      );
    } finally {
      if (seq === requestSeqRef.current) {
        setAirLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void fetchAirQuality(activeLocation);
      }
    });
    return () => {
      cancelled = true;
      activeAbortRef.current?.abort();
    };
  }, [activeLocation, fetchAirQuality]);

  const activeCpcbStation = useMemo(() => {
    if (measured?.status !== "available" || measured.stations.length === 0) {
      return null;
    }
    return measured.stations[selectedCpcbIndex] ?? measured.stations[0];
  }, [measured, selectedCpcbIndex]);

  const requestBrowserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setAirError("Browser geolocation is not supported in this environment.");
      return;
    }
    setGeoPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPending(false);
        setActiveLocation((prev) => ({
          city: "Current Location",
          state: prev.state,
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
          source: "geolocation",
        }));
      },
      (err) => {
        setGeoPending(false);
        setAirError(
          `Location permission was not granted (${err.message}). Select a city manually instead.`
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  return {
    activeLocation,
    setActiveLocation,
    measured,
    modelled,
    selectedCpcbIndex,
    setSelectedCpcbIndex,
    activeCpcbStation,
    airLoading,
    airError,
    geoPending,
    refreshAirQuality: () => fetchAirQuality(activeLocation),
    requestBrowserLocation,
  };
}
