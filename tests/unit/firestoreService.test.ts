import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  doc: vi.fn((...segments: unknown[]) => ({
    path: segments.filter((segment) => typeof segment === "string").join("/"),
  })),
  collection: vi.fn((...segments: unknown[]) => ({
    path: segments.filter((segment) => typeof segment === "string").join("/"),
  })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  updateDoc: vi.fn(async (..._args: unknown[]) => undefined),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((...args: unknown[]) => args),
  limit: vi.fn((count: number) => count),
}));

vi.mock("firebase/firestore", () => mocks);
vi.mock("../../src/firebase/config", () => ({ db: {}, auth: null }));

import {
  confirmSmogReportAtomic,
  createSmogReport,
  createUserRoutine,
  ensureUserProfile,
  mapPublicSmogReportDoc,
  saveEcoTripLog,
  saveUserPreferences,
  subscribeToEcoLogs,
  subscribeToSmogReports,
  subscribeToUserRoutines,
  toggleUserRoutineCompletion,
} from "../../src/firebase/firestoreService.ts";
import type { User } from "firebase/auth";

const user = {
  uid: "u1",
  email: "u1@example.com",
  displayName: "U One",
} as User;
const defaults = {
  city: "Chennai",
  state: "Tamil Nadu",
  household: {
    profileId: "general" as const,
    householdSize: 3,
    commutePreference: "metro_rail" as const,
    outdoorSchedule: "midday" as const,
    hasHepaPurifier: false,
    purifierCadrM3h: 0,
    language: "en" as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Firestore profiles and routines", () => {
  it("returns an existing profile without writing", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        uid: "u1",
        email: "u1@example.com",
        displayName: "U One",
        city: "Chennai",
        state: "Tamil Nadu",
        ...defaults.household,
      }),
    });

    const profile = await ensureUserProfile(user, defaults);

    expect(profile.uid).toBe("u1");
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it("creates a missing profile with bounded display fields", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    const longDefaults = {
      ...defaults,
      city: "C".repeat(100),
      state: "S".repeat(100),
    };

    const profile = await ensureUserProfile(
      { ...user, displayName: "D".repeat(100) } as User,
      longDefaults
    );

    expect(profile.city).toBe(longDefaults.city);
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    const payload = mocks.setDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.city).toHaveLength(80);
    expect(payload.state).toHaveLength(80);
    expect(payload.displayName).toHaveLength(80);
  });

  it("uses default household data when a stored profile is invalid", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ profileId: "not-a-profile", city: 5 }),
    });
    const profile = await ensureUserProfile(user, defaults);
    expect(profile.profileId).toBe("general");
    expect(profile.city).toBe("Chennai");
  });

  it("clamps and saves household preferences", async () => {
    await saveUserPreferences("u1", {
      ...defaults,
      household: {
        ...defaults.household,
        householdSize: 99,
        purifierCadrM3h: 9999,
      },
    });
    const payload = mocks.updateDoc.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(payload.householdSize).toBe(20);
    expect(payload.purifierCadrM3h).toBe(2500);
  });

  it("creates a bounded routine and toggles its completion", async () => {
    const id = await createUserRoutine("u1", {
      title: "  Metro errands  ",
      description: "Use metro weekly",
      category: "Mobility",
      co2SavedKg: 5000,
      exposureNote: "Less roadside exposure",
      completedToday: false,
      weeklyCompletions: 1000,
    });
    expect(id).toMatch(/^rt-/);
    const payload = mocks.setDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.title).toBe("Metro errands");
    expect(payload.co2SavedKg).toBe(1000);
    expect(payload.weeklyCompletions).toBe(500);

    await toggleUserRoutineCompletion("u1", id, true, 1);
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining(id) }),
      expect.objectContaining({ completedToday: true, weeklyCompletions: 1 })
    );
  });

  it("maps routine snapshots and forwards subscription errors", () => {
    mocks.onSnapshot.mockImplementation((_query, onNext, onError) => {
      onNext({
        docs: [
          {
            id: "routine-1",
            data: () => ({
              uid: "u1",
              title: "Metro",
              description: "Use metro",
              category: "Unknown",
              co2SavedKg: "bad",
              completedToday: true,
              weeklyCompletions: 1,
            }),
          },
        ],
      });
      onError(new Error("permission denied"));
      return () => undefined;
    });
    const onData = vi.fn();
    const onError = vi.fn();

    const unsubscribe = subscribeToUserRoutines("u1", onData, onError);

    expect(onData.mock.calls[0]?.[0][0]).toMatchObject({
      id: "routine-1",
      title: "Metro",
      category: "Community",
      co2SavedKg: 0,
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(unsubscribe).toBeTypeOf("function");
  });
});

describe("Firestore smog reports", () => {
  it("atomically creates a report, owner record, and initial confirmation", async () => {
    const set = vi.fn();
    const commit = vi.fn(async () => undefined);
    mocks.writeBatch.mockReturnValue({ set, commit });

    const reportId = await createSmogReport("u1", {
      city: " Chennai ",
      state: " Tamil Nadu ",
      approximateLocation: " Velachery ",
      sourceCategory: "Waste burning",
      severity: "Moderate",
      description: " Visible smoke ",
      observedTimeLabel: " Just now ",
    });

    expect(reportId).toMatch(/^rep-/);
    expect(set).toHaveBeenCalledTimes(3);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]?.[1]).toMatchObject({
      city: "Chennai",
      moderationStatus: "UNVERIFIED",
      confirmationsCount: 1,
    });
  });

  it("confirms atomically and increments the report count", async () => {
    const tx = {
      get: vi.fn(async (ref: { path: string }) =>
        ref.path.includes("confirmations")
          ? { exists: () => false, data: () => undefined }
          : { exists: () => true, data: () => ({ confirmationsCount: 2 }) }
      ),
      set: vi.fn(),
      update: vi.fn(),
    };
    mocks.runTransaction.mockImplementation(
      async (
        _db: unknown,
        callback: (transaction: typeof tx) => Promise<number>
      ) => callback(tx)
    );

    const nextCount = await confirmSmogReportAtomic("u1", "report-1");

    expect(nextCount).toBe(3);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("confirmations/u1"),
      }),
      expect.objectContaining({ uid: "u1", reportId: "report-1" })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "smogReports/report-1" }),
      expect.objectContaining({ confirmationsCount: 3 })
    );
  });

  it("rejects duplicate confirmations and missing reports", async () => {
    mocks.runTransaction.mockImplementation(
      async (
        _db: unknown,
        callback: (transaction: unknown) => Promise<number>
      ) =>
        callback({
          get: vi.fn(async () => ({ exists: () => true, data: () => ({}) })),
          set: vi.fn(),
          update: vi.fn(),
        })
    );
    await expect(confirmSmogReportAtomic("u1", "report-1")).rejects.toThrow(
      "DUPLICATE_CONFIRMATION"
    );

    mocks.runTransaction.mockImplementation(
      async (
        _db: unknown,
        callback: (transaction: unknown) => Promise<number>
      ) =>
        callback({
          get: vi.fn(async () => ({
            exists: () => false,
            data: () => undefined,
          })),
          set: vi.fn(),
          update: vi.fn(),
        })
    );
    await expect(confirmSmogReportAtomic("u1", "report-1")).rejects.toThrow(
      "REPORT_NOT_FOUND"
    );
  });

  it("maps public reports defensively and never exposes owner identifiers", () => {
    const report = mapPublicSmogReportDoc("report-1", {
      city: "Chennai",
      state: "Tamil Nadu",
      approximateLocation: "Velachery",
      sourceCategory: "INVALID",
      severity: "INVALID",
      description: "Visible smoke",
      observedTimeLabel: "Now",
      moderationStatus: "INVALID",
      confirmationsCount: "not-a-number",
      authorUid: "must-not-be-exposed",
      createdAt: { toDate: () => new Date("2026-01-15T00:00:00Z") },
    });
    expect(report.sourceCategory).toBe("Other");
    expect(report.severity).toBe("Moderate");
    expect(report.moderationStatus).toBe("UNVERIFIED");
    expect(report.confirmationsCount).toBe(0);
    expect(report.createdAtIso).toBe("2026-01-15T00:00:00.000Z");
    expect("authorUid" in report).toBe(false);
  });

  it("maps report snapshots and forwards subscription errors", () => {
    mocks.onSnapshot.mockImplementation((_query, onNext, onError) => {
      onNext({ docs: [{ id: "report-1", data: () => ({ city: "Chennai" }) }] });
      onError(new Error("permission denied"));
      return () => undefined;
    });
    const onData = vi.fn();
    const onError = vi.fn();
    subscribeToSmogReports(onData, onError);
    expect(onData.mock.calls[0]?.[0][0]).toMatchObject({
      id: "report-1",
      city: "Chennai",
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("Firestore eco logs", () => {
  it("saves a trip log with bounded values", async () => {
    await saveEcoTripLog("u1", {
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "metro_rail",
      journeys: 999,
      co2AvoidedKg: 2.9,
      factorVersion: "IN-GHG-ROAD-2015-v2",
    });
    const payload = mocks.setDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.uid).toBe("u1");
    expect(payload.journeys).toBe(365);
  });

  it("maps eco log snapshots and handles missing timestamps", () => {
    mocks.onSnapshot.mockImplementation((_query, onNext) => {
      onNext({
        docs: [
          {
            id: "eco-1",
            data: () => ({
              uid: "u1",
              distanceKm: 10,
              originalMode: "car_petrol",
              alternativeMode: "metro_rail",
              journeys: 2,
              co2AvoidedKg: 2.9,
              factorVersion: "v2",
              createdAt: { toDate: () => new Date("2026-01-15T00:00:00Z") },
            }),
          },
        ],
      });
      return () => undefined;
    });
    const onData = vi.fn();
    subscribeToEcoLogs("u1", onData, vi.fn());
    expect(onData.mock.calls[0]?.[0][0]).toMatchObject({
      id: "eco-1",
      distanceKm: 10,
      createdAtIso: "2026-01-15T00:00:00.000Z",
    });
  });
});
