import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Header, type SectionId } from "./components/Header";
import { DispersionChart } from "./components/DispersionChart";
import { GeminiGuidancePanel } from "./components/GeminiGuidancePanel";
import { SmogReportsSection } from "./components/SmogReportsSection";
import { IndoorAirPlanner } from "./components/IndoorAirPlanner";
import { LowEmissionRoutines } from "./components/LowEmissionRoutines";
import { ReportSmogModal } from "./components/ReportSmogModal";
import {
  HOUSEHOLD_PROFILES,
  INITIAL_REPORTS,
  INITIAL_ROUTINES,
  INITIAL_STATIONS,
} from "./data/seedData";
import type {
  AqiStatusLabel,
  HouseholdProfileId,
  LowEmissionRoutine,
  PersonalizedGuidance,
  ReportSeverity,
  SmogReport,
  SmogSourceType,
  StationReading,
} from "./types/breathewise";

const ROUTINES_STORAGE_KEY = "breathewise_routines_v1";

function getStatusTone(status: AqiStatusLabel): string {
  switch (status) {
    case "Good":
      return "text-emerald-700";
    case "Moderate":
      return "text-teal-700";
    case "Sensitive Groups":
      return "text-amber-700";
    case "Unhealthy":
      return "text-rose-700";
  }
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [stations, setStations] = useState<StationReading[]>(INITIAL_STATIONS);
  const [selectedStationId, setSelectedStationId] = useState<string>(
    INITIAL_STATIONS[0].id
  );
  const [profileId, setProfileId] = useState<HouseholdProfileId>("children");

  const [reports, setReports] = useState<SmogReport[]>(INITIAL_REPORTS);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [roomSqM, setRoomSqM] = useState<number>(32);
  const [hasHepa, setHasHepa] = useState<boolean>(true);

  const [routines, setRoutines] = useState<LowEmissionRoutine[]>(() => {
    try {
      const saved = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LowEmissionRoutine[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    return INITIAL_ROUTINES;
  });

  const [guidance, setGuidance] = useState<PersonalizedGuidance | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState<boolean>(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(routines));
    } catch {
      // Ignore storage errors
    }
  }, [routines]);

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      try {
        const [stRes, repRes] = await Promise.all([
          fetch("/api/stations"),
          fetch("/api/reports"),
        ]);
        if (stRes.ok) {
          const stData = (await stRes.json()) as { stations?: StationReading[] };
          if (active && stData.stations?.length) {
            setStations(stData.stations);
          }
        }
        if (repRes.ok) {
          const repData = (await repRes.json()) as { reports?: SmogReport[] };
          if (active && repData.reports?.length) {
            setReports(repData.reports);
          }
        }
      } catch {
        // Keep seeded state if server is warming up
      }
    }
    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  const currentStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? stations[0],
    [stations, selectedStationId]
  );

  const currentProfile = useMemo(
    () =>
      HOUSEHOLD_PROFILES.find((p) => p.id === profileId) ??
      HOUSEHOLD_PROFILES[0],
    [profileId]
  );

  const fetchGuidance = useCallback(async () => {
    setGuidanceLoading(true);
    setGuidanceError(null);
    try {
      const res = await fetch("/api/gemini/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: selectedStationId,
          profileId,
          roomSqM,
          hasHepa,
        }),
      });
      const data = (await res.json()) as {
        guidance?: PersonalizedGuidance;
        error?: string;
      };
      if (!res.ok || !data.guidance) {
        throw new Error(
          data.error || "Unable to generate personalized guidance right now."
        );
      }
      setGuidance(data.guidance);
    } catch (err) {
      setGuidanceError(
        err instanceof Error
          ? err.message
          : "Failed to load Gemini guidance."
      );
    } finally {
      setGuidanceLoading(false);
    }
  }, [selectedStationId, profileId, roomSqM, hasHepa]);

  useEffect(() => {
    fetchGuidance();
  }, [selectedStationId, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = (section: SectionId) => {
    setActiveSection(section);
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleCreateReport = async (payload: {
    neighborhood: string;
    districtId: string;
    sourceType: SmogSourceType;
    severity: ReportSeverity;
    notes: string;
    reporterLabel: string;
  }) => {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { report?: SmogReport; error?: string };
    if (!res.ok || !data.report) {
      throw new Error(data.error || "Could not submit smog report.");
    }
    setReports((prev) => [data.report!, ...prev]);
  };

  const handleConfirmReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/reports/${reportId}/confirm`, {
        method: "POST",
      });
      const data = (await res.json()) as { report?: SmogReport };
      if (res.ok && data.report) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? data.report! : r))
        );
      }
    } catch {
      // Optimistic fallback if transient network issue
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId ? { ...r, verifiedCount: r.verifiedCount + 1 } : r
        )
      );
    }
  };

  const handleToggleRoutine = (id: string) => {
    setRoutines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const handleAddRoutine = (
    routine: Omit<LowEmissionRoutine, "id" | "completed">
  ) => {
    const newItem: LowEmissionRoutine = {
      ...routine,
      id: `rt-${Date.now()}`,
      completed: true,
    };
    setRoutines((prev) => [newItem, ...prev]);
  };

  const completedRoutineTitles = useMemo(
    () => routines.filter((r) => r.completed).map((r) => r.title),
    [routines]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenReportModal={() => setReportModalOpen(true)}
      />

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 space-y-8">
        <section id="overview" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-medium text-teal-800 tracking-wide">
                Winter Smog & Air Pollution Assistant
              </p>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1"
                style={{ textWrap: "balance" }}
              >
                Report. Understand. Breathe Better.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
                Navigate winter thermal inversions and urban particulate spikes with personalized Gemini guidance, room-level filtration sizing, and low-emission household routines.
              </p>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <span className="text-xs font-medium text-slate-500">
                Active Monitoring Corridor
              </span>
              <div
                role="group"
                aria-label="Select monitoring district"
                className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
              >
                {stations.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStationId(st.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      st.id === currentStation.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {st.district}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Household Risk Profile
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {currentProfile.summary}
                </p>
              </div>
              <div
                role="group"
                aria-label="Select household profile"
                className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
              >
                {HOUSEHOLD_PROFILES.map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setProfileId(prof.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      prof.id === profileId
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {prof.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
              <div>
                <p className="text-xs text-slate-500">Air Quality Index</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {currentStation.aqi}
                </p>
                <p
                  className={`text-xs font-medium mt-1 ${getStatusTone(
                    currentStation.statusLabel
                  )}`}
                >
                  {currentStation.statusLabel} · {currentStation.updatedAt}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Fine Particulate (PM2.5)</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {currentStation.pm25.toFixed(1)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    µg/m³
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {(currentStation.pm25 / 15).toFixed(1)}x WHO 24h limit
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Coarse Dust (PM10)</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {currentStation.pm10.toFixed(1)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    µg/m³
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Road & winter grit suspension
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Nitrogen Dioxide (NO2)</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {currentStation.no2}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ppb
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Combustion & idling tracer
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-slate-500">Inversion & Boundary Wind</p>
                <p className="text-3xl font-mono font-bold tabular-nums text-slate-900 mt-1">
                  {currentStation.windKmh}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    km/h
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                  {currentStation.inversionActive
                    ? `Trap ceiling ${currentStation.inversionCeilingM} m · ${currentStation.tempC}°C`
                    : `Clear column · ${currentStation.tempC}°C`}
                </p>
              </div>
            </div>
          </div>

          <DispersionChart
            series={currentStation.hourlySeries}
            districtName={currentStation.district}
            inversionActive={currentStation.inversionActive}
          />

          <GeminiGuidancePanel
            station={currentStation}
            profileId={profileId}
            profileLabel={currentProfile.label}
            guidance={guidance}
            guidanceLoading={guidanceLoading}
            guidanceError={guidanceError}
            onRefreshGuidance={fetchGuidance}
            completedRoutines={completedRoutineTitles}
          />
        </section>

        <SmogReportsSection
          reports={reports}
          stations={stations}
          selectedStationId={selectedStationId}
          onConfirmReport={handleConfirmReport}
          onOpenReportModal={() => setReportModalOpen(true)}
        />

        <IndoorAirPlanner
          station={currentStation}
          roomSqM={roomSqM}
          onChangeRoomSqM={setRoomSqM}
          hasHepa={hasHepa}
          onToggleHepa={setHasHepa}
        />

        <LowEmissionRoutines
          routines={routines}
          onToggleRoutine={handleToggleRoutine}
          onAddRoutine={handleAddRoutine}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>BreatheWise · Report. Understand. Breathe Better.</span>
          <span>
            Winter Smog Guidance · Community Observations · Low-Emission Household Routines
          </span>
        </div>
      </footer>

      {reportModalOpen && (
        <ReportSmogModal
          open={reportModalOpen}
          stations={stations}
          defaultDistrictId={selectedStationId}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </div>
  );
}

export default App;
