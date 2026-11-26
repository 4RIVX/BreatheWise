// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({
  auth: null as { currentUser?: { getIdToken: () => Promise<string> } } | null,
  googleProvider: {},
  isFirebaseConfigured: false,
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  testFirestoreConnection: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
}));

vi.mock("../../src/firebase/config", () => ({
  get auth() {
    return mocks.auth;
  },
  get googleProvider() {
    return mocks.googleProvider;
  },
  get isFirebaseConfigured() {
    return mocks.isFirebaseConfigured;
  },
  testFirestoreConnection: mocks.testFirestoreConnection,
}));

import {
  FirebaseProvider,
  useFirebase,
} from "../../src/firebase/FirebaseProvider";

function FirebaseStateProbe() {
  const firebase = useFirebase();

  return (
    <div>
      <output data-testid="firebase-state">
        {JSON.stringify({
          authReady: firebase.authReady,
          enabled: firebase.firebaseEnabled,
          connected: firebase.firestoreConnected,
          user: firebase.user?.uid ?? null,
        })}
      </output>
      <button onClick={() => void firebase.signInWithGoogle()}>Sign in</button>
      <button onClick={() => void firebase.signOutUser()}>Sign out</button>
      <button
        onClick={() => {
          void firebase.getIdToken().then((token) => {
            document.body.dataset.token = token ?? "none";
          });
        }}
      >
        Get token
      </button>
      {firebase.authError && <p role="alert">{firebase.authError}</p>}
    </div>
  );
}

function renderProvider() {
  return render(
    <FirebaseProvider>
      <FirebaseStateProbe />
    </FirebaseProvider>
  );
}

beforeEach(() => {
  mocks.auth = null;
  mocks.isFirebaseConfigured = false;
  mocks.onAuthStateChanged.mockReset().mockReturnValue(vi.fn());
  mocks.signInWithPopup.mockReset();
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.testFirestoreConnection
    .mockReset()
    .mockResolvedValue({ connected: false, offline: false });
});

afterEach(() => {
  cleanup();
});

describe("FirebaseProvider", () => {
  it("renders with Firebase disabled and reports unavailable sign-in", async () => {
    renderProvider();

    expect(screen.getByTestId("firebase-state")).toHaveTextContent(
      JSON.stringify({
        authReady: true,
        enabled: false,
        connected: false,
        user: null,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Firebase Authentication is not configured."
    );
    expect(mocks.signInWithPopup).not.toHaveBeenCalled();
  });

  it("tracks an authenticated user and Firestore connection state", async () => {
    mocks.isFirebaseConfigured = true;
    mocks.auth = { currentUser: { getIdToken: async () => "test-token" } };
    mocks.testFirestoreConnection.mockResolvedValue({
      connected: true,
      offline: false,
    });
    const user = { uid: "user-1" };
    const unsubscribe = vi.fn();
    mocks.onAuthStateChanged.mockImplementation((_auth, onChange) => {
      onChange(user);
      return unsubscribe;
    });

    const { unmount } = renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("firebase-state")).toHaveTextContent(
        JSON.stringify({
          authReady: true,
          enabled: true,
          connected: true,
          user: "user-1",
        })
      )
    );
    expect(mocks.onAuthStateChanged).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("maps unauthorized-domain sign-in errors to actionable guidance", async () => {
    mocks.isFirebaseConfigured = true;
    mocks.auth = {};
    mocks.signInWithPopup.mockRejectedValue(
      new Error("auth/unauthorized-domain")
    );
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /localhost.*authorized domains/i
    );
  });

  it("does not show an error when the user closes the popup", async () => {
    mocks.isFirebaseConfigured = true;
    mocks.auth = {};
    mocks.signInWithPopup.mockRejectedValue(
      new Error("auth/popup-closed-by-user")
    );
    renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signs out and returns the current user's ID token", async () => {
    mocks.isFirebaseConfigured = true;
    mocks.auth = {
      currentUser: { getIdToken: vi.fn(async () => "signed-token") },
    };
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);

    fireEvent.click(screen.getByRole("button", { name: "Get token" }));
    await waitFor(() =>
      expect(document.body.dataset.token).toBe("signed-token")
    );
  });
});
