import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { UiLanguage } from "../domain/i18n";
import type { HouseholdContext } from "../domain/schemas";
import type { ActiveLocationState } from "../domain/airQualityTypes";
import {
  ensureUserProfile,
  saveUserPreferences,
} from "../firebase/firestoreService";
import { loadStoredHousehold, saveStoredHousehold } from "./workspaceStorage";

export function useHouseholdPreferences(params: {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  activeLocation: ActiveLocationState;
  onError: (message: string | null) => void;
}) {
  const { user, authReady, firebaseEnabled, activeLocation, onError } = params;

  const [household, setHousehold] =
    useState<HouseholdContext>(loadStoredHousehold);
  const [savingProfile, setSavingProfile] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    saveStoredHousehold(household);
  }, [household]);

  useEffect(() => {
    if (!firebaseEnabled || !authReady || !user) {
      return;
    }

    let cancelled = false;

    ensureUserProfile(user, initialDefaultsRef.current)
      .then((profile) => {
        if (cancelled || !mountedRef.current) return;
        onError(null);
        setHousehold({
          profileId: profile.profileId,
          householdSize: profile.householdSize,
          commutePreference: profile.commutePreference,
          outdoorSchedule: profile.outdoorSchedule,
          hasHepaPurifier: profile.hasHepaPurifier,
          purifierCadrM3h: profile.purifierCadrM3h,
          language: profile.language,
        });
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          onError(
            err instanceof Error
              ? err.message
              : "Could not load your synced Firestore profile."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseEnabled, authReady, user, onError]);

  const handleHouseholdChange = useCallback(
    async (next: HouseholdContext) => {
      setHousehold(next);
      if (!user) return;

      setSavingProfile(true);
      try {
        await saveUserPreferences(user.uid, {
          city: activeLocation.city,
          state: activeLocation.state,
          household: next,
        });
        if (mountedRef.current) {
          onError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          onError(
            err instanceof Error
              ? err.message
              : "Could not save household preferences to Firestore."
          );
        }
      } finally {
        if (mountedRef.current) {
          setSavingProfile(false);
        }
      }
    },
    [user, activeLocation.city, activeLocation.state, onError]
  );

  const handleLanguageChange = useCallback(
    (lang: UiLanguage) => {
      void handleHouseholdChange({ ...household, language: lang });
    },
    [household, handleHouseholdChange]
  );

  return {
    household,
    savingProfile,
    handleHouseholdChange,
    handleLanguageChange,
  };
}
