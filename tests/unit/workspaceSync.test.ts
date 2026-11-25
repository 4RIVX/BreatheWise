// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../../src/domain/defaultRoutines";
import type { ActiveLocationState } from "../../src/domain/airQualityTypes";
import {
  DEFAULT_HOUSEHOLD,
  loadStoredHousehold,
  loadStoredRoutines,
  LOCAL_HOUSEHOLD_KEY,
  LOCAL_ROUTINES_KEY,
} from "../../src/hooks/workspaceStorage";
import { useWorkspaceSync } from "../../src/hooks/useWorkspaceSync";

const mockFirestore = vi.hoisted(() => ({
  ensureUserProfile: vi.fn(),
  saveUserPreferences: vi.fn(),
  subscribeToUserRoutines: vi.fn(),
  createUserRoutine: vi.fn(),
  toggleUserRoutineCompletion: vi.fn(),
  subscribeToSmogReports: vi.fn(),
  createSmogReport: vi.fn(),
  confirmSmogReportAtomic: vi.fn(),
  subscribeToEcoLogs: vi.fn(),
  saveEcoTripLog: vi.fn(),
}));

vi.mock("../../src/firebase/firestoreService", () => mockFirestore);

const CHENNAI_LOCATION: ActiveLocationState = {
  city: "Chennai",
  state: "Tamil Nadu",
  latitude: 13.0827,
  longitude: 80.2707,
  source: "preset",
};

function makeUser(uid: string): User {
  return { uid, email: `${uid}@example.com`, emailVerified: true } as User;
}

describe("Workspace Sync Hooks & Local Storage Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
    vi.clearAllMocks();
    mockFirestore.subscribeToSmogReports.mockImplementation(() => () => {});
    mockFirestore.subscribeToUserRoutines.mockImplementation(() => () => {});
    mockFirestore.subscribeToEcoLogs.mockImplementation(() => () => {});
    mockFirestore.ensureUserProfile.mockResolvedValue({
      uid: "u1",
      email: "u1@example.com",
      displayName: "Member",
      city: "Chennai",
      state: "Tamil Nadu",
      ...DEFAULT_HOUSEHOLD,
    });
    mockFirestore.saveUserPreferences.mockResolvedValue(undefined);
    mockFirestore.createUserRoutine.mockResolvedValue("rt-new");
    mockFirestore.toggleUserRoutineCompletion.mockResolvedValue(undefined);
    mockFirestore.confirmSmogReportAtomic.mockResolvedValue(2);
    mockFirestore.saveEcoTripLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("validates localStorage household and routines safely and falls back on malformed JSON or invalid schema", () => {
    localStorage.setItem(LOCAL_HOUSEHOLD_KEY, "{broken-json");
    expect(loadStoredHousehold()).toEqual(DEFAULT_HOUSEHOLD);

    localStorage.setItem(
      LOCAL_HOUSEHOLD_KEY,
      JSON.stringify({
        profileId: "unknown_profile",
        householdSize: -99,
        language: "fr",
      })
    );
    expect(loadStoredHousehold()).toEqual(DEFAULT_HOUSEHOLD);

    localStorage.setItem(
      LOCAL_HOUSEHOLD_KEY,
      JSON.stringify({ profileId: "seniors", language: "ta" })
    );
    expect(loadStoredHousehold()).toEqual({
      ...DEFAULT_HOUSEHOLD,
      profileId: "seniors",
      language: "ta",
    });

    localStorage.setItem(LOCAL_ROUTINES_KEY, "[]");
    expect(loadStoredRoutines()).toEqual(DEFAULT_CLEAN_AIR_ROUTINES);

    localStorage.setItem(
      LOCAL_ROUTINES_KEY,
      JSON.stringify([{ bad: "shape" }])
    );
    expect(loadStoredRoutines()).toEqual(DEFAULT_CLEAN_AIR_ROUTINES);
  });

  it("persists local household, language (<html lang>), and routine toggles offline, and propagates Firestore errors cleanly", async () => {
    const { result } = renderHook(() =>
      useWorkspaceSync({
        user: null,
        authReady: true,
        firebaseEnabled: false,
        activeLocation: CHENNAI_LOCATION,
      })
    );

    act(() => {
      result.current.handleLanguageChange("ta");
    });

    expect(document.documentElement.lang).toBe("ta");
    expect(loadStoredHousehold().language).toBe("ta");

    const firstRoutine = result.current.activeRoutines[0];
    act(() => {
      void result.current.handleToggleRoutine(firstRoutine);
    });

    expect(result.current.activeRoutines[0].completedToday).toBe(
      !firstRoutine.completedToday
    );
    expect(loadStoredRoutines()[0].completedToday).toBe(
      !firstRoutine.completedToday
    );
  });

  it("seeds default cloud routines once per UID, avoids double-seeding across snapshots, and clears user cloud state on sign-out", async () => {
    let routinesCallback:
      ((rows: typeof DEFAULT_CLEAN_AIR_ROUTINES) => void) | null = null;
    let ecoLogsCallback:
      | ((
          logs: Array<{
            id: string;
            uid: string;
            distanceKm: number;
            originalMode: string;
            alternativeMode: string;
            journeys: number;
            co2AvoidedKg: number;
            factorVersion: string;
            createdAtIso: string;
          }>
        ) => void)
      | null = null;

    mockFirestore.subscribeToUserRoutines.mockImplementation((_uid, onData) => {
      routinesCallback = onData;
      return () => {};
    });
    mockFirestore.subscribeToEcoLogs.mockImplementation((_uid, onData) => {
      ecoLogsCallback = onData;
      return () => {};
    });

    const user1 = makeUser("user-1");
    const initialProps: { user: User | null } = { user: user1 };
    const { result, rerender } = renderHook(
      (props: { user: User | null }) =>
        useWorkspaceSync({
          user: props.user,
          authReady: true,
          firebaseEnabled: true,
          activeLocation: CHENNAI_LOCATION,
        }),
      { initialProps }
    );

    await waitFor(() => {
      expect(mockFirestore.subscribeToUserRoutines).toHaveBeenCalledTimes(1);
    });

    // Simulate two rapid empty-collection snapshots; default seeding must execute only once
    await act(async () => {
      routinesCallback?.([]);
      routinesCallback?.([]);
    });

    expect(mockFirestore.createUserRoutine).toHaveBeenCalledTimes(
      DEFAULT_CLEAN_AIR_ROUTINES.length
    );

    // Emit cloud routine + eco log + confirm report
    act(() => {
      routinesCallback?.([
        {
          ...DEFAULT_CLEAN_AIR_ROUTINES[0],
          id: "cloud-rt-1",
          uid: "user-1",
          title: "Cloud Routine Only",
        },
      ]);
      ecoLogsCallback?.([
        {
          id: "eco-1",
          uid: "user-1",
          distanceKm: 10,
          originalMode: "Car",
          alternativeMode: "Metro",
          journeys: 5,
          co2AvoidedKg: 4.2,
          factorVersion: "v1",
          createdAtIso: "2026-01-01T00:00:00Z",
        },
      ]);
    });

    expect(result.current.activeRoutines[0].id).toBe("cloud-rt-1");
    expect(result.current.ecoLogs).toHaveLength(1);

    await act(async () => {
      await result.current.handleConfirmSmogReport({
        id: "rep-1",
        city: "Chennai",
        state: "Tamil Nadu",
        approximateLocation: "Adyar",
        sourceCategory: "Traffic emissions",
        severity: "Moderate",
        description: "Heavy exhaust",
        observedTimeLabel: "Just now",
        moderationStatus: "UNVERIFIED",
        confirmationsCount: 1,
        createdAtIso: "2026-01-01T00:00:00Z",
      });
    });
    expect(result.current.confirmedReportIds.has("rep-1")).toBe(true);

    // Sign out: cloud routines, eco logs, and confirmed badges must clear immediately
    rerender({ user: null });
    expect(result.current.activeRoutines[0].id).not.toBe("cloud-rt-1");
    expect(result.current.ecoLogs).toEqual([]);
    expect(result.current.confirmedReportIds.size).toBe(0);
  });

  it("handles duplicate confirmation error, profile save failures, and unmount cancellation safely", async () => {
    mockFirestore.confirmSmogReportAtomic.mockRejectedValueOnce(
      new Error("DUPLICATE_CONFIRMATION")
    );
    mockFirestore.saveUserPreferences.mockRejectedValueOnce(
      new Error("Firestore write quota exceeded")
    );

    let resolveProfile: ((v: unknown) => void) | undefined;
    mockFirestore.ensureUserProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        })
    );

    const user1 = makeUser("user-2");
    const { result, unmount } = renderHook(() =>
      useWorkspaceSync({
        user: user1,
        authReady: true,
        firebaseEnabled: true,
        activeLocation: CHENNAI_LOCATION,
      })
    );

    await act(async () => {
      await expect(
        result.current.handleConfirmSmogReport({
          id: "rep-dup",
          city: "Delhi",
          state: "Delhi",
          approximateLocation: "ITO",
          sourceCategory: "Waste burning",
          severity: "Severe",
          description: "Smoke plume",
          observedTimeLabel: "Today",
          moderationStatus: "UNVERIFIED",
          confirmationsCount: 4,
          createdAtIso: "2026-01-01T00:00:00Z",
        })
      ).rejects.toThrow(/already confirmed/i);
    });
    expect(result.current.confirmedReportIds.has("rep-dup")).toBe(true);

    await act(async () => {
      await result.current.handleHouseholdChange({
        ...DEFAULT_HOUSEHOLD,
        profileId: "respiratory",
      });
    });
    expect(result.current.syncError).toMatch(/quota exceeded/i);

    act(() => {
      result.current.dismissSyncError();
    });
    expect(result.current.syncError).toBeNull();

    unmount();
    // Resolving pending ensureUserProfile after unmount must not throw React state warnings
    resolveProfile?.({
      uid: "user-2",
      email: "user-2@example.com",
      displayName: "Member",
      city: "Chennai",
      state: "Tamil Nadu",
      ...DEFAULT_HOUSEHOLD,
    });
  });
});
