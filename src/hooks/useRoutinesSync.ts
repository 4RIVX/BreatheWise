import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../domain/defaultRoutines";
import {
  createUserRoutine,
  subscribeToUserRoutines,
  toggleUserRoutineCompletion,
  type FirestoreRoutineItem,
} from "../firebase/firestoreService";
import { loadStoredRoutines, saveStoredRoutines } from "./workspaceStorage";

interface ScopedRoutinesState {
  uid: string;
  items: FirestoreRoutineItem[];
}

export function useRoutinesSync(params: {
  user: User | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  onError: (message: string | null) => void;
}) {
  const { user, authReady, firebaseEnabled, onError } = params;

  const [localRoutines, setLocalRoutines] =
    useState<FirestoreRoutineItem[]>(loadStoredRoutines);
  const [cloudRoutinesState, setCloudRoutinesState] =
    useState<ScopedRoutinesState | null>(null);

  const mountedRef = useRef(true);
  const seedingUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      saveStoredRoutines(localRoutines);
    }
  }, [localRoutines, user]);

  useEffect(() => {
    if (!firebaseEnabled || !authReady || !user) {
      return;
    }

    let cancelled = false;
    const uid = user.uid;

    const unsubRoutines = subscribeToUserRoutines(
      uid,
      async (rows) => {
        if (cancelled || !mountedRef.current) return;

        if (rows.length === 0) {
          if (seedingUidsRef.current.has(uid)) return;
          seedingUidsRef.current.add(uid);
          try {
            for (const tmpl of DEFAULT_CLEAN_AIR_ROUTINES) {
              if (cancelled || !mountedRef.current) break;
              await createUserRoutine(uid, {
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
            seedingUidsRef.current.delete(uid);
            if (!cancelled && mountedRef.current) {
              onError(
                seedErr instanceof Error
                  ? seedErr.message
                  : "Could not initialize default routines."
              );
            }
          }
        } else {
          setCloudRoutinesState({ uid, items: rows });
        }
      },
      (err) => {
        if (!cancelled && mountedRef.current) {
          onError(err.message || "Unable to sync user routines.");
        }
      }
    );

    return () => {
      cancelled = true;
      unsubRoutines();
    };
  }, [firebaseEnabled, authReady, user, onError]);

  const activeRoutines =
    user && cloudRoutinesState?.uid === user.uid
      ? cloudRoutinesState.items
      : localRoutines;

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
          if (mountedRef.current) {
            onError(null);
          }
        } catch (err) {
          if (mountedRef.current) {
            onError(
              err instanceof Error
                ? err.message
                : "Could not update routine completion."
            );
          }
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
    [user, onError]
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

  return {
    activeRoutines,
    handleToggleRoutine,
    handleAddRoutine,
  };
}
