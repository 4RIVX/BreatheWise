import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  getApps: vi.fn(),
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  },
}));
vi.mock("firebase-admin/app", () => ({
  getApps: mocks.getApps,
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: mocks.verifyIdToken })),
}));

const originalProjectId = process.env.VITE_FIREBASE_PROJECT_ID;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existsSync.mockReturnValue(false);
  mocks.readFileSync.mockReturnValue("");
  mocks.getApps.mockReturnValue([]);
  mocks.getApp.mockReturnValue({ existing: true });
  mocks.initializeApp.mockReturnValue({ initialized: true });
  mocks.verifyIdToken.mockImplementation(async (token: string) => {
    if (token === "good") return { uid: "u1", email_verified: true };
    throw new Error("invalid token");
  });
  delete process.env.VITE_FIREBASE_PROJECT_ID;
});

afterEach(() => {
  vi.resetModules();
  if (originalProjectId === undefined) {
    delete process.env.VITE_FIREBASE_PROJECT_ID;
  } else {
    process.env.VITE_FIREBASE_PROJECT_ID = originalProjectId;
  }
});

describe("Firebase Admin bearer verification", () => {
  it("rejects missing, malformed, empty, and oversized authorization headers", async () => {
    const { verifyBearerToken } = await import("../../server/firebaseAdmin.ts");

    expect(await verifyBearerToken(undefined)).toBeNull();
    expect(await verifyBearerToken("Basic abc")).toBeNull();
    expect(await verifyBearerToken("Bearer ")).toBeNull();
    expect(await verifyBearerToken(`Bearer ${"x".repeat(8_193)}`)).toBeNull();
    expect(mocks.getApps).not.toHaveBeenCalled();
  });

  it("initializes from the applet project ID and verifies tokens", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ projectId: "  applet-project  " })
    );
    const { getFirebaseProjectId, verifyBearerToken } =
      await import("../../server/firebaseAdmin.ts");

    expect(getFirebaseProjectId()).toBe("applet-project");
    expect(await verifyBearerToken("Bearer good")).toMatchObject({ uid: "u1" });
    expect(await verifyBearerToken("Bearer bad")).toBeNull();
    expect(mocks.initializeApp).toHaveBeenCalledWith({
      projectId: "applet-project",
    });
  });

  it("falls back to the environment for malformed applet configuration", async () => {
    process.env.VITE_FIREBASE_PROJECT_ID = "env-project";
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue("not-json");
    const { verifyBearerToken } = await import("../../server/firebaseAdmin.ts");

    expect(await verifyBearerToken("Bearer good")).toMatchObject({ uid: "u1" });
    expect(mocks.initializeApp).toHaveBeenCalledWith({
      projectId: "env-project",
    });
  });

  it("rejects placeholder project IDs when no valid environment value exists", async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ projectId: "remixed-project-id" })
    );
    const { getFirebaseProjectId, verifyBearerToken } =
      await import("../../server/firebaseAdmin.ts");

    expect(getFirebaseProjectId()).toBeNull();
    expect(await verifyBearerToken("Bearer good")).toBeNull();
  });

  it("reuses an already initialized Firebase Admin app", async () => {
    process.env.VITE_FIREBASE_PROJECT_ID = "env-project";
    mocks.getApps.mockReturnValue([{ existing: true }]);
    const { verifyBearerToken } = await import("../../server/firebaseAdmin.ts");

    expect(await verifyBearerToken("Bearer good")).toMatchObject({ uid: "u1" });
    expect(mocks.getApp).toHaveBeenCalledOnce();
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });
});
