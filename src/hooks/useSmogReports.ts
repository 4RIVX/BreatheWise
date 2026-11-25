import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { SmogSourceCategory } from "../domain/schemas";
import {
  confirmSmogReportAtomic,
  createSmogReport,
  subscribeToSmogReports,
  type FirestoreSmogReport,
} from "../firebase/firestoreService";

const EMPTY_CONFIRMED_IDS = new Set<string>();

interface ScopedConfirmedState {
  uid: string;
  ids: Set<string>;
}

export function useSmogReports(params: {
  user: User | null;
  firebaseEnabled: boolean;
  onError: (message: string | null) => void;
}) {
  const { user, firebaseEnabled, onError } = params;

  const [smogReports, setSmogReports] = useState<FirestoreSmogReport[]>([]);
  const [confirmedState, setConfirmedState] =
    useState<ScopedConfirmedState | null>(null);

  const confirmedReportIds =
    user && confirmedState?.uid === user.uid
      ? confirmedState.ids
      : EMPTY_CONFIRMED_IDS;

  // Subscribe to Community Smog Watch (publicly readable without PII)
  useEffect(() => {
    if (!firebaseEnabled) return;
    let cancelled = false;
    const unsub = subscribeToSmogReports(
      (items) => {
        if (!cancelled) setSmogReports(items);
      },
      (err) => {
        if (!cancelled) {
          onError(
            err.message || "Unable to load community smog reports right now."
          );
        }
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [firebaseEnabled, onError]);

  const markConfirmedForUid = useCallback((uid: string, reportId: string) => {
    setConfirmedState((prev) => {
      const nextIds = new Set(prev && prev.uid === uid ? prev.ids : undefined);
      nextIds.add(reportId);
      return { uid, ids: nextIds };
    });
  }, []);

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
      const uid = user.uid;
      try {
        await confirmSmogReportAtomic(uid, report.id);
        markConfirmedForUid(uid, report.id);
      } catch (err) {
        if (err instanceof Error && err.message === "DUPLICATE_CONFIRMATION") {
          markConfirmedForUid(uid, report.id);
          throw new Error("You have already confirmed this sighting.", {
            cause: err,
          });
        }
        throw err;
      }
    },
    [user, markConfirmedForUid]
  );

  return {
    smogReports,
    confirmedReportIds,
    handleCreateSmogReport,
    handleConfirmSmogReport,
  };
}
