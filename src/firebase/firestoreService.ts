import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import { handleFirestoreError, OperationType } from "./errorHandling";
import {
  HouseholdContextSchema,
  SmogCategorySchema,
  SmogSeveritySchema,
  type HouseholdContext,
  type SmogSourceCategory,
} from "../domain/schemas";

export interface UserProfileRecord extends HouseholdContext {
  uid: string;
  email: string;
  displayName: string;
  city: string;
  state: string;
}

export interface FirestoreRoutineItem {
  id: string;
  uid: string;
  title: string;
  description: string;
  category:
    "Mobility" | "Heating" | "Ventilation" | "Community" | "Energy" | "Waste";
  co2SavedKg: number;
  exposureNote: string;
  completedToday: boolean;
  weeklyCompletions: number;
}

/**
 * Public community smog report model.
 * Deliberately excludes authorUid, email, and any private reporter identifiers.
 */
export interface FirestoreSmogReport {
  id: string;
  city: string;
  state: string;
  approximateLocation: string;
  sourceCategory: SmogSourceCategory;
  severity: "Mild" | "Moderate" | "Severe";
  description: string;
  observedTimeLabel: string;
  moderationStatus: "UNVERIFIED" | "REVIEWED" | "FLAGGED";
  confirmationsCount: number;
  photoDataUrl?: string;
  createdAtIso: string;
}

export interface FirestoreEcoTripLog {
  id: string;
  uid: string;
  distanceKm: number;
  originalMode: string;
  alternativeMode: string;
  journeys: number;
  co2AvoidedKg: number;
  factorVersion: string;
  createdAtIso: string;
}

function timestampToIso(val: unknown): string {
  if (val && typeof val === "object" && "toDate" in val) {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function routineCategory(value: unknown): FirestoreRoutineItem["category"] {
  const categories: FirestoreRoutineItem["category"][] = [
    "Mobility",
    "Heating",
    "Ventilation",
    "Community",
    "Energy",
    "Waste",
  ];
  return categories.includes(value as FirestoreRoutineItem["category"])
    ? (value as FirestoreRoutineItem["category"])
    : "Community";
}

export async function ensureUserProfile(
  user: User,
  defaults: {
    city: string;
    state: string;
    household: HouseholdContext;
  }
): Promise<UserProfileRecord> {
  if (!db) throw new Error("Firestore is not initialized.");
  const path = `users/${user.uid}`;
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const household = HouseholdContextSchema.safeParse(data);
      if (
        !household.success ||
        typeof data.city !== "string" ||
        typeof data.state !== "string"
      ) {
        return {
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? "BreatheWise Member",
          city: defaults.city,
          state: defaults.state,
          ...defaults.household,
        };
      }
      return {
        uid: typeof data.uid === "string" ? data.uid : user.uid,
        email: typeof data.email === "string" ? data.email : (user.email ?? ""),
        displayName:
          typeof data.displayName === "string"
            ? data.displayName
            : (user.displayName ?? "BreatheWise Member"),
        city: data.city,
        state: data.state,
        ...household.data,
      };
    }

    const displayName = (user.displayName || "BreatheWise Member").slice(0, 80);
    const email = (user.email || "").slice(0, 200);
    const payload = {
      uid: user.uid,
      email,
      displayName,
      profileId: defaults.household.profileId,
      householdSize: defaults.household.householdSize,
      city: defaults.city.slice(0, 80),
      state: defaults.state.slice(0, 80),
      commutePreference: defaults.household.commutePreference,
      outdoorSchedule: defaults.household.outdoorSchedule,
      hasHepaPurifier: defaults.household.hasHepaPurifier,
      purifierCadrM3h: defaults.household.purifierCadrM3h,
      language: defaults.household.language,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload);
    return {
      uid: user.uid,
      email,
      displayName,
      city: defaults.city,
      state: defaults.state,
      ...defaults.household,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveUserPreferences(
  uid: string,
  updates: {
    city: string;
    state: string;
    household: HouseholdContext;
  }
): Promise<void> {
  if (!db) return;
  const path = `users/${uid}`;
  const ref = doc(db, "users", uid);
  try {
    await updateDoc(ref, {
      city: updates.city.slice(0, 80),
      state: updates.state.slice(0, 80),
      profileId: updates.household.profileId,
      householdSize: Math.max(
        1,
        Math.min(20, Math.round(updates.household.householdSize))
      ),
      commutePreference: updates.household.commutePreference,
      outdoorSchedule: updates.household.outdoorSchedule,
      hasHepaPurifier: updates.household.hasHepaPurifier,
      purifierCadrM3h: Math.max(
        0,
        Math.min(2500, updates.household.purifierCadrM3h)
      ),
      language: updates.household.language,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeToUserRoutines(
  uid: string,
  onData: (items: FirestoreRoutineItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};
  const path = `users/${uid}/routines`;
  const q = query(
    collection(db, "users", uid, "routines"),
    where("uid", "==", uid),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const rows: FirestoreRoutineItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: String(data.uid),
          title: String(data.title),
          description: String(data.description),
          category: routineCategory(data.category),
          co2SavedKg: finiteNumber(data.co2SavedKg),
          exposureNote: String(data.exposureNote),
          completedToday: Boolean(data.completedToday),
          weeklyCompletions: finiteNumber(data.weeklyCompletions),
        };
      });
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createUserRoutine(
  uid: string,
  routine: Omit<FirestoreRoutineItem, "id" | "uid">
): Promise<string> {
  if (!db) throw new Error("Firestore is not initialized.");
  const routineId = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/routines/${routineId}`;
  try {
    await setDoc(doc(db, "users", uid, "routines", routineId), {
      uid,
      title: routine.title.trim().slice(0, 100),
      description: routine.description.trim().slice(0, 300),
      category: routine.category,
      co2SavedKg: Math.max(0, Math.min(1000, routine.co2SavedKg)),
      exposureNote: routine.exposureNote.trim().slice(0, 160),
      completedToday: routine.completedToday,
      weeklyCompletions: Math.max(
        0,
        Math.min(500, Math.round(routine.weeklyCompletions))
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return routineId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function toggleUserRoutineCompletion(
  uid: string,
  routineId: string,
  nextCompleted: boolean,
  nextWeeklyCompletions: number
): Promise<void> {
  if (!db) return;
  const path = `users/${uid}/routines/${routineId}`;
  try {
    await updateDoc(doc(db, "users", uid, "routines", routineId), {
      completedToday: nextCompleted,
      weeklyCompletions: Math.max(
        0,
        Math.min(500, Math.round(nextWeeklyCompletions))
      ),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function mapPublicSmogReportDoc(
  id: string,
  data: Record<string, unknown>
): FirestoreSmogReport {
  return {
    id,
    city: String(data.city),
    state: String(data.state),
    approximateLocation: String(data.approximateLocation),
    sourceCategory: SmogCategorySchema.safeParse(data.sourceCategory).success
      ? (data.sourceCategory as SmogSourceCategory)
      : "Other",
    severity: SmogSeveritySchema.safeParse(data.severity).success
      ? (data.severity as FirestoreSmogReport["severity"])
      : "Moderate",
    description: String(data.description),
    observedTimeLabel: String(data.observedTimeLabel),
    moderationStatus:
      data.moderationStatus === "REVIEWED" ||
      data.moderationStatus === "FLAGGED"
        ? data.moderationStatus
        : "UNVERIFIED",
    confirmationsCount: Math.max(0, finiteNumber(data.confirmationsCount)),
    photoDataUrl:
      typeof data.photoDataUrl === "string" ? data.photoDataUrl : undefined,
    createdAtIso: timestampToIso(data.createdAt),
  };
}

export function subscribeToSmogReports(
  onData: (reports: FirestoreSmogReport[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};
  const path = "smogReports";
  const q = query(
    collection(db, "smogReports"),
    where("moderationStatus", "in", ["UNVERIFIED", "REVIEWED"]),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreSmogReport[] = snapshot.docs.map((d) =>
        mapPublicSmogReportDoc(d.id, d.data())
      );
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function createSmogReport(
  uid: string,
  input: {
    city: string;
    state: string;
    approximateLocation: string;
    sourceCategory: SmogSourceCategory;
    severity: "Mild" | "Moderate" | "Severe";
    description: string;
    observedTimeLabel: string;
    photoDataUrl?: string;
  }
): Promise<string> {
  if (!db) throw new Error("Firestore is not initialized.");
  const reportId = `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `smogReports/${reportId}`;

  const publicPayload: Record<string, unknown> = {
    city: input.city.trim().slice(0, 80),
    state: input.state.trim().slice(0, 80),
    approximateLocation: input.approximateLocation.trim().slice(0, 120),
    sourceCategory: input.sourceCategory,
    severity: input.severity,
    description: input.description.trim().slice(0, 400),
    observedTimeLabel: input.observedTimeLabel.trim().slice(0, 60),
    moderationStatus: "UNVERIFIED",
    confirmationsCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.photoDataUrl && input.photoDataUrl.length <= 80000) {
    publicPayload.photoDataUrl = input.photoDataUrl;
  }

  try {
    // Atomically create:
    // 1. Public smog report (without authorUid / PII)
    // 2. Private ownership document (/smogReports/{reportId}/private/owner)
    // 3. Author's initial confirmation record matching confirmationsCount === 1
    const batch = writeBatch(db);
    batch.set(doc(db, "smogReports", reportId), publicPayload);
    batch.set(doc(db, "smogReports", reportId, "private", "owner"), {
      authorUid: uid,
      reportId,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "smogReports", reportId, "confirmations", uid), {
      uid,
      reportId,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return reportId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export interface ConfirmationTransactionAdapter {
  get: (ref: unknown) => Promise<{
    exists: () => boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  set: (ref: unknown, data: Record<string, unknown>) => void;
  update: (ref: unknown, data: Record<string, unknown>) => void;
}

export async function applyAtomicConfirmationTx(params: {
  tx: ConfirmationTransactionAdapter;
  confRef: unknown;
  reportRef: unknown;
  uid: string;
  reportId: string;
  timestampValue: unknown;
}): Promise<number> {
  const { tx, confRef, reportRef, uid, reportId, timestampValue } = params;
  const [confSnap, reportSnap] = await Promise.all([
    tx.get(confRef),
    tx.get(reportRef),
  ]);

  if (confSnap.exists()) {
    throw new Error("DUPLICATE_CONFIRMATION");
  }
  if (!reportSnap.exists()) {
    throw new Error("REPORT_NOT_FOUND");
  }

  const currentCount = Number(reportSnap.data()?.confirmationsCount ?? 0);
  const nextCount = currentCount + 1;

  tx.set(confRef, {
    uid,
    reportId,
    createdAt: timestampValue,
  });
  tx.update(reportRef, {
    confirmationsCount: nextCount,
    updatedAt: timestampValue,
  });

  return nextCount;
}

export async function confirmSmogReportAtomic(
  uid: string,
  reportId: string
): Promise<number> {
  if (!db) throw new Error("Firestore is not initialized.");
  const confRef = doc(db, "smogReports", reportId, "confirmations", uid);
  const reportRef = doc(db, "smogReports", reportId);
  const path = `smogReports/${reportId}/confirmations/${uid}`;

  try {
    return await runTransaction(db, async (tx) =>
      applyAtomicConfirmationTx({
        tx: tx as unknown as ConfirmationTransactionAdapter,
        confRef,
        reportRef,
        uid,
        reportId,
        timestampValue: serverTimestamp(),
      })
    );
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === "DUPLICATE_CONFIRMATION" ||
        err.message === "REPORT_NOT_FOUND")
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveEcoTripLog(
  uid: string,
  entry: {
    distanceKm: number;
    originalMode: string;
    alternativeMode: string;
    journeys: number;
    co2AvoidedKg: number;
    factorVersion: string;
  }
): Promise<void> {
  if (!db) throw new Error("Firestore is not initialized.");
  const logId = `eco-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `users/${uid}/ecoLogs/${logId}`;
  try {
    await setDoc(doc(db, "users", uid, "ecoLogs", logId), {
      uid,
      distanceKm: entry.distanceKm,
      originalMode: entry.originalMode.slice(0, 60),
      alternativeMode: entry.alternativeMode.slice(0, 60),
      journeys: Math.max(1, Math.min(365, Math.round(entry.journeys))),
      co2AvoidedKg: entry.co2AvoidedKg,
      factorVersion: entry.factorVersion.slice(0, 60),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeToEcoLogs(
  uid: string,
  onData: (logs: FirestoreEcoTripLog[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db) return () => {};
  const path = `users/${uid}/ecoLogs`;
  const q = query(
    collection(db, "users", uid, "ecoLogs"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreEcoTripLog[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: String(data.uid),
          distanceKm: Number(data.distanceKm),
          originalMode: String(data.originalMode),
          alternativeMode: String(data.alternativeMode),
          journeys: Number(data.journeys),
          co2AvoidedKg: Number(data.co2AvoidedKg),
          factorVersion: String(data.factorVersion),
          createdAtIso: timestampToIso(data.createdAt),
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}
