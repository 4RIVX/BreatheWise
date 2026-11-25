import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  saveEcoTripLog,
  subscribeToEcoLogs,
  type FirestoreEcoTripLog,
} from "../firebase/firestoreService";

interface ScopedEcoLogsState {
  uid: string;
  items: FirestoreEcoTripLog[];
}

const EMPTY_ECO_LOGS: FirestoreEcoTripLog[] = [];

export function useEcoLogsSync(params: {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  onError: (message: string | null) => void;
}) {
  const { user, authReady, firebaseEnabled, onError } = params;

  const [ecoLogsState, setEcoLogsState] = useState<ScopedEcoLogsState | null>(
    null
  );

  useEffect(() => {
    if (!firebaseEnabled || !authReady || !user) {
      return;
    }

    let cancelled = false;
    const uid = user.uid;
    const unsub = subscribeToEcoLogs(
      uid,
      (logs) => {
        if (!cancelled) setEcoLogsState({ uid, items: logs });
      },
      (err) => {
        if (!cancelled) {
          onError(err.message || "Unable to sync commute logs.");
        }
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseEnabled, authReady, user, onError]);

  const ecoLogs =
    user && ecoLogsState?.uid === user.uid
      ? ecoLogsState.items
      : EMPTY_ECO_LOGS;

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
    ecoLogs,
    handleSaveTripLog,
  };
}
