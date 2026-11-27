import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { name: "mock-app" },
  auth: { name: "mock-auth" },
  database: { name: "mock-database" },
  initializeApp: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  initializeApp: mocks.initializeApp,
}));

vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.doc,
  getDocFromServer: mocks.getDocFromServer,
  getFirestore: mocks.getFirestore,
}));

vi.mock("../../firebase-applet-config.json", () => ({
  default: {
    projectId: "",
    appId: "",
    apiKey: "",
    authDomain: "",
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  mocks.initializeApp.mockReset().mockReturnValue(mocks.app);
  mocks.getAuth.mockReset().mockReturnValue(mocks.auth);
  mocks.getFirestore.mockReset().mockReturnValue(mocks.database);
  mocks.doc.mockReset().mockReturnValue({ path: "test/connection" });
  mocks.getDocFromServer.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function setFirebaseEnvironment(databaseId?: string) {
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "test-project");
  vi.stubEnv("VITE_FIREBASE_API_KEY", "public-test-key");
  vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "test-project.firebaseapp.com");
  vi.stubEnv("VITE_FIREBASE_APP_ID", "test-app-id");
  if (databaseId) {
    vi.stubEnv("VITE_FIREBASE_DATABASE_ID", databaseId);
  }
}

describe("Firebase client configuration", () => {
  it("keeps the client uninitialized when the applet config is blank", async () => {
    const config = await import("../../src/firebase/config");

    expect(config.isFirebaseConfigured).toBe(false);
    expect(config.firebaseApp).toBeNull();
    expect(config.auth).toBeNull();
    expect(config.db).toBeNull();
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    await expect(config.testFirestoreConnection()).resolves.toEqual({
      connected: false,
      offline: false,
      error: "Firebase is not configured.",
    });
  });

  it("does not configure the reserved remixed project identifier", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "remixed-project-id");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "public-test-key");
    const config = await import("../../src/firebase/config");

    expect(config.isFirebaseConfigured).toBe(false);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });

  it("initializes the selected Firestore database and verifies connectivity", async () => {
    setFirebaseEnvironment("regional-database");
    const config = await import("../../src/firebase/config");

    expect(config.isFirebaseConfigured).toBe(true);
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        apiKey: "public-test-key",
        authDomain: "test-project.firebaseapp.com",
        appId: "test-app-id",
      })
    );
    expect(mocks.getFirestore).toHaveBeenCalledWith(
      mocks.app,
      "regional-database"
    );
    expect(mocks.getAuth).toHaveBeenCalledWith(mocks.app);
    await expect(config.testFirestoreConnection()).resolves.toEqual({
      connected: true,
      offline: false,
    });
    expect(mocks.doc).toHaveBeenCalledWith(
      mocks.database,
      "test",
      "connection"
    );
  });

  it("uses the default Firestore database and reports offline errors", async () => {
    setFirebaseEnvironment();
    mocks.getDocFromServer.mockRejectedValue(
      new Error("the client is offline")
    );
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await import("../../src/firebase/config");

    expect(mocks.getFirestore).toHaveBeenCalledWith(mocks.app);
    await expect(config.testFirestoreConnection()).resolves.toMatchObject({
      connected: false,
      offline: true,
      error: "the client is offline",
    });
    expect(logError).toHaveBeenCalledWith(
      "Please check your Firebase configuration."
    );
  });

  it("converts non-Error connection failures to strings", async () => {
    setFirebaseEnvironment();
    mocks.getDocFromServer.mockRejectedValue("network unavailable");
    const config = await import("../../src/firebase/config");

    await expect(config.testFirestoreConnection()).resolves.toEqual({
      connected: false,
      offline: false,
      error: "network unavailable",
    });
  });
});
