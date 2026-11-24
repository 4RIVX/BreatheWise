import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Header, type SectionId } from "./components/Header";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import {
  AirQualityDashboard,
  type ActiveLocationState,
  type MeasuredBlock,
  type ModelledBlock,
} from "./components/AirQualityDashboard";
import { DispersionChart } from "./components/DispersionChart";
import { DailyProtectionPlanner } from "./components/DailyProtectionPlanner";
import {
  AiFamilyGuardian,
  type AiProviderKind,
  type AskQuestionResult,
} from "./components/AiFamilyGuardian";
import { IndoorAirCoach } from "./components/IndoorAirCoach";
import { EcoMobilityTracker } from "./components/EcoMobilityTracker";
import { LowEmissionRoutines } from "./components/LowEmissionRoutines";
import { CommunitySmogWatch } from "./components/CommunitySmogWatch";
import { ReportSmogModal } from "./components/ReportSmogModal";
import { TRANSLATIONS, type UiLanguage } from "./domain/i18n";
import { INDIAN_CITY_PRESETS } from "./domain/indianCities";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "./domain/defaultRoutines";
import type {
  HouseholdContext,
  SmogSourceCategory,
  StructuredGuidance,
} from "./domain/schemas";
import { useFirebase } from "./firebase/FirebaseProvider";
import {
  confirmSmogReportAtomic,
  createSmogReport,
  createUserRoutine,
  ensureUserProfile,
  saveEcoTripLog,
  saveUserPreferences,
  subscribeToEcoLogs,
  subscribeToSmogReports,
  subscribeToUserRoutines,
  toggleUserRoutineCompletion,
  type FirestoreEcoTripLog,
  type FirestoreRoutineItem,
  type FirestoreSmogReport,
} from "./firebase/firestoreService";

const LOCAL_ROUTINES_KEY = "breathewise_routines_v2";
const LOCAL_HOUSEHOLD_KEY = "breathewise_household_v2";

const DEFAULT_HOUSEHOLD: HouseholdContext = {
  profileId: "children",
  householdSize: 4,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: true,
  purifierCadrM3h: 300,
  language: "en",
};

export function App() {
  const { user, authReady, firebaseEnabled, getIdToken, signInWithGoogle } =
    useFirebase();

  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [activeLocation, setActiveLocation] = useState<ActiveLocationState>({
    city: INDIAN_CITY_PRESETS[0].city,
    state: INDIAN_CITY_PRESETS[0].state,
    latitude: INDIAN_CITY_PRESETS[0].latitude,
    longitude: INDIAN_CITY_PRESETS[0].longitude,
    source: "preset",
  });

  const [household, setHousehold] = useState<HouseholdContext>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_HOUSEHOLD_KEY);
      if (saved) return { ...DEFAULT_HOUSEHOLD, ...JSON.parse(saved) };
    } catch {
      // Ignore storage error
    }
    return DEFAULT_HOUSEHOLD;
  });

  const [measured, setMeasured] = useState<MeasuredBlock | null>(null);
  const [modelled, setModelled] = useState<ModelledBlock | null>(null);
  const [selectedCpcbIndex, setSelectedCpcbIndex] = useState(0);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);
  const [geoPending, setGeoPending] = useState(false);

  const [guidance, setGuidance] = useState<StructuredGuidance | null>(null);
  const [guidanceProvider, setGuidanceProvider] =
    useState<AiProviderKind | null>(null);
  const [guidanceModel, setGuidanceModel] = useState<string | null>(null);
  const [guidanceFallbackReason, setGuidanceFallbackReason] = useState<
    string | null
  >(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  const [localRoutines, setLocalRoutines] = useState<FirestoreRoutineItem[]>(
    () => {
      try {
        const saved = localStorage.getItem(LOCAL_ROUTINES_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as FirestoreRoutineItem[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // Ignore storage error
      }
      return DEFAULT_CLEAN_AIR_ROUTINES;
    }
  );
  const [cloudRoutines, setCloudRoutines] = useState<
    FirestoreRoutineItem[] | null
  >(null);
  const [ecoLogs, setEcoLogs] = useState<FirestoreEcoTripLog[]>([]);
  const [smogReports, setSmogReports] = useState<FirestoreSmogReport[]>([]);
  const [confirmedReportIds, setConfirmedReportIds] = useState<Set<string>>(
    () => new Set()
  );
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const t = TRANSLATIONS[household.language];

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_HOUSEHOLD_KEY, JSON.stringify(household));
    } catch {
      // Ignore storage errors
    }
  }, [household]);

  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(LOCAL_ROUTINES_KEY, JSON.stringify(localRoutines));
      } catch {
        // Ignore storage errors
      }
    }
  }, [localRoutines, user]);

  // Subscribe to Community Smog Watch (publicly readable without PII)
  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsub = subscribeToSmogReports(
      (items) => setSmogReports(items),
      () => {
        // Firestore error logged by handleFirestoreError
      }
    );
    return () => unsub();
  }, [firebaseEnabled]);

  // Sync user profile, routines, and eco logs when signed in
  useEffect(() => {
    if (!firebaseEnabled || !authReady || !user) {
      return;
    }

    let cancelled = false;
    let unsubRoutines = () => {};
    let unsubEcoLogs = () => {};

    ensureUserProfile(user, {
      city: activeLocation.city,
      state: activeLocation.state,
      household,
    })
      .then((profile) => {
        if (cancelled) return;
        setHousehold({
          profileId: profile.profileId,
          householdSize: profile.householdSize,
          commutePreference: profile.commutePreference,
          outdoorSchedule: profile.outdoorSchedule,
          hasHepaPurifier: profile.hasHepaPurifier,
          purifierCadrM3h: profile.purifierCadrM3h,
          language: profile.language,
        });

        unsubRoutines = subscribeToUserRoutines(
          user.uid,
          async (rows) => {
            if (rows.length === 0) {
              // Seed user's initial clean-air routines once
              for (const tmpl of DEFAULT_CLEAN_AIR_ROUTINES) {
                await createUserRoutine(user.uid, {
                  title: tmpl.title,
                  description: tmpl.description,
                  category: tmpl.category,
                  co2SavedKg: tmpl.co2SavedKg,
                  exposureNote: tmpl.exposureNote,
                  completedToday: false,
                  weeklyCompletions: 0,
                });
              }
            } else {
              setCloudRoutines(rows);
            }
          },
          () => {}
        );

        unsubEcoLogs = subscribeToEcoLogs(
          user.uid,
          (logs) => setEcoLogs(logs),
          () => {}
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsubRoutines();
      unsubEcoLogs();
    };
  }, [firebaseEnabled, authReady, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAirQuality = useCallback(async (loc: ActiveLocationState) => {
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
      const res = await fetch(`/api/air-quality?${qs.toString()}`);
      const data = (await res.json()) as {
        measured?: MeasuredBlock;
        modelled?: ModelledBlock;
        error?: string;
      };
      if (data.measured) setMeasured(data.measured);
      if (data.modelled) setModelled(data.modelled);
      if (!res.ok && data.error) {
        setAirError(data.error);
      }
    } catch (err) {
      setAirError(
        err instanceof Error
          ? err.message
          : "Unable to load air-quality providers."
      );
    } finally {
      setAirLoading(false);
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
    };
  }, [activeLocation, fetchAirQuality]);

  const activeCpcbStation = useMemo(() => {
    if (measured?.status !== "available" || measured.stations.length === 0) {
      return null;
    }
    return measured.stations[selectedCpcbIndex] ?? measured.stations[0];
  }, [measured, selectedCpcbIndex]);

  const handleRefreshGuidance = useCallback(async () => {
    setGuidanceLoading(true);
    setGuidanceError(null);
    try {
      const token = user ? await getIdToken() : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/gemini/guidance", {
        method: "POST",
        headers,
        body: JSON.stringify({
          location: {
            city: activeLocation.city,
            state: activeLocation.state,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            preferredStationName: activeCpcbStation?.stationName,
          },
          household,
        }),
      });
      const data = (await res.json()) as {
        guidance?: StructuredGuidance;
        provider?: AiProviderKind;
        model?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        error?: string;
      };
      if (!res.ok || !data.guidance) {
        throw new Error(
          data.error || "Unable to generate AI Family Guardian guidance."
        );
      }
      setGuidance(data.guidance);
      setGuidanceProvider(data.provider ?? "gemini");
      setGuidanceModel(data.model ?? null);
      setGuidanceFallbackReason(
        data.fallbackUsed
          ? (data.fallbackReason ?? "Fallback provider used.")
          : null
      );
    } catch (err) {
      setGuidanceError(
        err instanceof Error
          ? err.message
          : "Failed to load AI Family Guardian guidance."
      );
    } finally {
      setGuidanceLoading(false);
    }
  }, [activeLocation, activeCpcbStation, household, user, getIdToken]);

  const activeRoutines = user && cloudRoutines ? cloudRoutines : localRoutines;

  const handleAskQuestion = useCallback(
    async (question: string): Promise<AskQuestionResult> => {
      const completedTitles = activeRoutines
        .filter((r) => r.completedToday)
        .map((r) => r.title);

      const token = user ? await getIdToken() : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/gemini/ask", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          location: {
            city: activeLocation.city,
            state: activeLocation.state,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            preferredStationName: activeCpcbStation?.stationName,
          },
          household,
          completedRoutines: completedTitles,
        }),
      });
      const data = (await res.json()) as {
        answer?: string;
        provider?: AiProviderKind;
        model?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        error?: string;
      };
      if (!res.ok || !data.answer) {
        throw new Error(
          data.error || "Unable to get an answer from AI Family Guardian."
        );
      }
      return {
        answer: data.answer,
        provider: data.provider,
        model: data.model,
        fallbackUsed: data.fallbackUsed,
        fallbackReason: data.fallbackReason,
      };
    },
    [
      activeRoutines,
      activeLocation,
      activeCpcbStation,
      household,
      user,
      getIdToken,
    ]
  );

  const handleHouseholdChange = useCallback(
    async (next: HouseholdContext) => {
      setHousehold(next);
      if (user) {
        setSavingProfile(true);
        try {
          await saveUserPreferences(user.uid, {
            city: activeLocation.city,
            state: activeLocation.state,
            household: next,
          });
        } catch {
          // Logged by handleFirestoreError
        } finally {
          setSavingProfile(false);
        }
      }
    },
    [user, activeLocation]
  );

  const handleLanguageChange = useCallback(
    (lang: UiLanguage) => {
      handleHouseholdChange({ ...household, language: lang });
    },
    [household, handleHouseholdChange]
  );

  const handleRequestBrowserLocation = () => {
    if (!navigator.geolocation) {
      setAirError("Browser geolocation is not supported in this environment.");
      return;
    }
    setGeoPending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoPending(false);
        setActiveLocation({
          city: "Current Location",
          state: activeLocation.state,
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
          source: "geolocation",
        });
      },
      (err) => {
        setGeoPending(false);
        setAirError(
          `Location permission was not granted (${err.message}). Select a city manually instead.`
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const handleToggleRoutine = async (routine: FirestoreRoutineItem) => {
    const nextCompleted = !routine.completedToday;
    const nextWeekly = Math.max(
      0,
      routine.weeklyCompletions + (nextCompleted ? 1 : -1)
    );

    if (user) {
      await toggleUserRoutineCompletion(
        user.uid,
        routine.id,
        nextCompleted,
        nextWeekly
      );
    } else {
      setLocalRoutines((prev) =>
        prev.map((r) =>
          r.id === routine.id
            ? {
                ...r,
                completedToday: nextCompleted,
                weeklyCompletions: nextWeekly,
              }
            : r
        )
      );
    }
  };

  const handleAddRoutine = async (
    routine: Omit<FirestoreRoutineItem, "id" | "uid">
  ) => {
    if (user) {
      await createUserRoutine(user.uid, routine);
    } else {
      setLocalRoutines((prev) => [
        {
          ...routine,
          id: `rt-${Date.now()}`,
          uid: "local",
        },
        ...prev,
      ]);
    }
  };

  const handleCreateSmogReport = async (payload: {
    city: string;
    state: string;
    approximateLocation: string;
    sourceCategory: SmogSourceCategory;
    severity: "Mild" | "Moderate" | "Severe";
    description: string;
    observedTimeLabel: string;
    photoDataUrl?: string;
  }) => {
    if (!user) {
      throw new Error("Please sign in with Google to submit a smog report.");
    }
    await createSmogReport(user.uid, payload);
  };

  const handleConfirmSmogReport = async (report: FirestoreSmogReport) => {
    if (!user) {
      throw new Error("Sign in with Google to confirm community reports.");
    }
    try {
      await confirmSmogReportAtomic(user.uid, report.id);
      setConfirmedReportIds((prev) => new Set(prev).add(report.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DUPLICATE_CONFIRMATION") {
        setConfirmedReportIds((prev) => new Set(prev).add(report.id));
        throw new Error("You have already confirmed this sighting.", {
          cause: err,
        });
      }
      throw err;
    }
  };

  const handleSaveTripLog = async (log: {
    distanceKm: number;
    originalMode: string;
    alternativeMode: string;
    journeys: number;
    co2AvoidedKg: number;
    factorVersion: string;
  }) => {
    if (!user) return;
    await saveEcoTripLog(user.uid, log);
  };

  const handleNavigate = (section: SectionId) => {
    setActiveSection(section);
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const activeAqi =
    activeCpcbStation?.indianAqi.aqi ??
    modelled?.indianAqiFromRollingModel.aqi ??
    null;
  const activeCategory =
    activeCpcbStation?.indianAqi.category ??
    modelled?.indianAqiFromRollingModel.category ??
    null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Header
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenReportModal={() => setReportModalOpen(true)}
        t={t}
      />

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-6 space-y-8">
        <WorkspaceToolbar
          language={household.language}
          onChangeLanguage={handleLanguageChange}
          locationLabel={`${activeLocation.city}, ${activeLocation.state}`}
          onRequestBrowserLocation={handleRequestBrowserLocation}
          locationRequestPending={geoPending}
          onRefreshAirQuality={() => fetchAirQuality(activeLocation)}
          airLoading={airLoading}
          t={t}
        />

        <AirQualityDashboard
          activeLocation={activeLocation}
          onSelectLocation={setActiveLocation}
          measured={measured}
          modelled={modelled}
          selectedCpcbIndex={selectedCpcbIndex}
          onSelectCpcbIndex={setSelectedCpcbIndex}
          loading={airLoading}
          error={airError}
          t={t}
        />

        <DispersionChart
          series={modelled?.hourlySeries ?? []}
          locationLabel={`${activeLocation.city}, ${activeLocation.state}`}
        />

        <DailyProtectionPlanner
          household={household}
          onChangeHousehold={handleHouseholdChange}
          aqi={activeAqi}
          category={activeCategory}
          pm25={modelled?.currentPollutants.pm25 ?? null}
          windKmh={modelled?.weather.windKmh ?? null}
          bestWindowLabel={modelled?.bestLowerPmWindow ?? null}
          savingProfile={savingProfile}
          isSignedIn={Boolean(user)}
          t={t}
        />

        <AiFamilyGuardian
          locationLabel={`${activeLocation.city}, ${activeLocation.state}`}
          household={household}
          guidance={guidance}
          guidanceProvider={guidanceProvider}
          guidanceModel={guidanceModel}
          guidanceFallbackReason={guidanceFallbackReason}
          guidanceLoading={guidanceLoading}
          guidanceError={guidanceError}
          onRefreshGuidance={handleRefreshGuidance}
          onAskQuestion={handleAskQuestion}
          t={t}
        />

        <IndoorAirCoach
          locationLabel={`${activeLocation.city}, ${activeLocation.state}`}
          purifierCadrM3h={household.purifierCadrM3h}
          onChangePurifierCadrM3h={(val) =>
            handleHouseholdChange({ ...household, purifierCadrM3h: val })
          }
          t={t}
        />

        <EcoMobilityTracker
          isSignedIn={Boolean(user)}
          savedLogs={user ? ecoLogs : []}
          onSaveTripLog={handleSaveTripLog}
          t={t}
        />

        <LowEmissionRoutines
          routines={activeRoutines}
          onToggleRoutine={handleToggleRoutine}
          onAddRoutine={handleAddRoutine}
          isSignedIn={Boolean(user)}
          t={t}
        />

        <CommunitySmogWatch
          reports={smogReports}
          activeCity={activeLocation.city}
          isSignedIn={Boolean(user)}
          confirmedIds={confirmedReportIds}
          onConfirmReport={handleConfirmSmogReport}
          onOpenReportModal={() => setReportModalOpen(true)}
          t={t}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            {t.brand} · {t.tagline}
          </span>
          <span>
            CPCB Indian National AQI · Open-Meteo Regional Model · Community
            Smog Watch
          </span>
        </div>
      </footer>

      {reportModalOpen && (
        <ReportSmogModal
          open={reportModalOpen}
          defaultCity={activeLocation.city}
          defaultState={activeLocation.state}
          isSignedIn={Boolean(user)}
          onSignIn={signInWithGoogle}
          getIdToken={getIdToken}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleCreateSmogReport}
        />
      )}
    </div>
  );
}

export default App;
