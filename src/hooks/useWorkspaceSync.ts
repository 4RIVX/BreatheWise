import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../domain/defaultRoutines";
import type { UiLanguage } from "../domain/i18n";
import type { HouseholdContext, SmogSourceCategory } from "../domain/schemas";
import type { ActiveLocationState } from "../domain/airQualityTypes";
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
} from "../firebase/firestoreService";

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

export function useWorkspaceSync(params: {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  activeLocation: ActiveLocationState;
}) {
  const { user, authReady, firebaseEnabled, activeLocation } = params;

  const [household, setHousehold] = useState<HouseholdContext>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_HOUSEHOLD_KEY);
      if (saved) return { ...DEFAULT_HOUSEHOLD, ...JSON.parse(saved) };
    } catch {
      // Ignore storage error
    }
    return DEFAULT_HOUSEHOLD;
  });

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
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const initialDefaultsRef = useRef({
    city: activeLocation.city,
    state: activeLocation.state,
    household,
  });

  useEffect(() => {
    initialDefaultsRef.current = {
      city: activeLocation.city,
      state: activeLocation.state,
      household,
    };
  }, [activeLocation.city, activeLocation.state, household]);

  // Synchronize HTML root language attribute for assistive technologies (EN <-> TA)
  useEffect(() => {
    document.documentElement.lang = household.language;
  }, [household.language]);

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
      (err) =>
        setSyncError(
          err.message || "Unable to load community smog reports right now."
        )
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

    ensureUserProfile(user, initialDefaultsRef.current)
      .then((profile) => {
        if (cancelled) return;
        setSyncError(null);
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
              try {
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
              } catch (seedErr) {
                if (!cancelled) {
                  setSyncError(
                    seedErr instanceof Error
                      ? seedErr.message
                      : "Could not initialize default routines."
                  );
                }
              }
            } else if (!cancelled) {
              setCloudRoutines(rows);
            }
          },
          (err) => {
            if (!cancelled) {
              setSyncError(err.message || "Unable to sync user routines.");
            }
          }
        );

        unsubEcoLogs = subscribeToEcoLogs(
          user.uid,
          (logs) => {
            if (!cancelled) setEcoLogs(logs);
          },
          (err) => {
            if (!cancelled) {
              setSyncError(err.message || "Unable to sync commute logs.");
            }
          }
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setSyncError(
            err instanceof Error
              ? err.message
              : "Could not load your synced Firestore profile."
          );
        }
      });

    return () => {
      cancelled = true;
      unsubRoutines();
      unsubEcoLogs();
    };
  }, [firebaseEnabled, authReady, user]);

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
          setSyncError(null);
        } catch (err) {
          setSyncError(
            err instanceof Error
              ? err.message
              : "Could not save household preferences to Firestore."
          );
        } finally {
          setSavingProfile(false);
        }
      }
    },
    [user, activeLocation]
  );

  const handleLanguageChange = useCallback(
    (lang: UiLanguage) => {
      void handleHouseholdChange({ ...household, language: lang });
    },
    [household, handleHouseholdChange]
  );

  const activeRoutines = user && cloudRoutines ? cloudRoutines : localRoutines;

  const handleToggleRoutine = useCallback(
    async (routine: FirestoreRoutineItem) => {
      const nextCompleted = !routine.completedToday;
      const nextWeekly = Math.max(
        0,
        routine.weeklyCompletions + (nextCompleted ? 1 : -1)
      );

      if (user) {
        try {
          await toggleUserRoutineCompletion(
            user.uid,
            routine.id,
            nextCompleted,
            nextWeekly
          );
          setSyncError(null);
        } catch (err) {
          setSyncError(
            err instanceof Error
              ? err.message
              : "Could not update routine completion."
          );
        }
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
    },
    [user]
  );

  const handleAddRoutine = useCallback(
    async (routine: Omit<FirestoreRoutineItem, "id" | "uid">) => {
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
    },
    [user]
  );

  const handleCreateSmogReport = useCallback(
    async (payload: {
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
    },
    [user]
  );

  const handleConfirmSmogReport = useCallback(
    async (report: FirestoreSmogReport) => {
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
    },
    [user]
  );

  const handleSaveTripLog = useCallback(
    async (log: {
      distanceKm: number;
      originalMode: string;
      alternativeMode: string;
      journeys: number;
      co2AvoidedKg: number;
      factorVersion: string;
    }) => {
      if (!user) return;
      await saveEcoTripLog(user.uid, log);
    },
    [user]
  );

  return {
    household,
    activeRoutines,
    ecoLogs,
    smogReports,
    confirmedReportIds,
    savingProfile,
    syncError,
    dismissSyncError: () => setSyncError(null),
    handleHouseholdChange,
    handleLanguageChange,
    handleToggleRoutine,
    handleAddRoutine,
    handleCreateSmogReport,
    handleConfirmSmogReport,
    handleSaveTripLog,
  };
}
