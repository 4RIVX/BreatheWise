// @vitest-environment jsdom
import React, { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useDialogA11y } from "../../src/hooks/useDialogA11y";

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Firebase Configuration & Connection Diagnostics", () => {
  it("initializes Firebase with default database when firestoreDatabaseId is omitted", async () => {
    const initializeApp = vi.fn(() => ({ name: "[DEFAULT]" }));
    const getFirestore = vi.fn(() => ({ type: "firestore" }));
    const getAuth = vi.fn(() => ({ currentUser: null }));
    const getDocFromServer = vi.fn(async () => ({ exists: () => false }));
    const doc = vi.fn((_db: unknown, col: string, id: string) => ({
      path: `${col}/${id}`,
    }));
    const GoogleAuthProvider = vi.fn(function MockGoogleProvider(this: {
      setCustomParameters: ReturnType<typeof vi.fn>;
    }) {
      this.setCustomParameters = vi.fn();
    });

    vi.doMock("../../firebase-applet-config.json", () => ({
      default: {
        projectId: "breathewise-test-proj",
        appId: "1:123:web:abc",
        apiKey: "test-api-key",
        authDomain: "breathewise-test-proj.firebaseapp.com",
      },
    }));
    vi.doMock("firebase/app", () => ({ initializeApp }));
    vi.doMock("firebase/auth", () => ({ getAuth, GoogleAuthProvider }));
    vi.doMock("firebase/firestore", () => ({
      doc,
      getDocFromServer,
      getFirestore,
    }));

    const mod = await import("../../src/firebase/config");
    expect(mod.isFirebaseConfigured).toBe(true);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledWith({ name: "[DEFAULT]" });

    const status = await mod.testFirestoreConnection();
    expect(status).toEqual({ connected: true, offline: false });
  });

  it("initializes named Firestore database when firestoreDatabaseId is provided", async () => {
    const initializeApp = vi.fn(() => ({ name: "[DEFAULT]" }));
    const getFirestore = vi.fn(() => ({ type: "firestore" }));
    const getAuth = vi.fn(() => ({ currentUser: null }));
    const getDocFromServer = vi.fn(async () => {
      throw new Error("Failed to get document because the client is offline.");
    });
    const doc = vi.fn((_db: unknown, col: string, id: string) => ({
      path: `${col}/${id}`,
    }));
    const GoogleAuthProvider = vi.fn(function MockGoogleProvider(this: {
      setCustomParameters: ReturnType<typeof vi.fn>;
    }) {
      this.setCustomParameters = vi.fn();
    });

    vi.doMock("../../firebase-applet-config.json", () => ({
      default: {
        projectId: "breathewise-test-proj",
        appId: "1:123:web:abc",
        apiKey: "test-api-key",
        authDomain: "breathewise-test-proj.firebaseapp.com",
        firestoreDatabaseId: "custom-db-id",
      },
    }));
    vi.doMock("firebase/app", () => ({ initializeApp }));
    vi.doMock("firebase/auth", () => ({ getAuth, GoogleAuthProvider }));
    vi.doMock("firebase/firestore", () => ({
      doc,
      getDocFromServer,
      getFirestore,
    }));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const mod = await import("../../src/firebase/config");
      expect(getFirestore).toHaveBeenCalledWith(
        { name: "[DEFAULT]" },
        "custom-db-id"
      );

      const status = await mod.testFirestoreConnection();
      expect(status.connected).toBe(false);
      expect(status.offline).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(
        "Please check your Firebase configuration."
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("disables Firebase when applet config uses remixed placeholder and env vars are empty", async () => {
    const initializeApp = vi.fn();
    const getFirestore = vi.fn();
    const getAuth = vi.fn();
    const GoogleAuthProvider = vi.fn(function MockGoogleProvider(this: {
      setCustomParameters: ReturnType<typeof vi.fn>;
    }) {
      this.setCustomParameters = vi.fn();
    });

    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.doMock("../../firebase-applet-config.json", () => ({
      default: {
        projectId: "remixed-project-id",
        appId: "",
        apiKey: "",
        authDomain: "",
      },
    }));
    vi.doMock("firebase/app", () => ({ initializeApp }));
    vi.doMock("firebase/auth", () => ({ getAuth, GoogleAuthProvider }));
    vi.doMock("firebase/firestore", () => ({
      doc: vi.fn(),
      getDocFromServer: vi.fn(),
      getFirestore,
    }));

    const mod = await import("../../src/firebase/config");
    expect(mod.isFirebaseConfigured).toBe(false);
    expect(initializeApp).not.toHaveBeenCalled();

    const status = await mod.testFirestoreConnection();
    expect(status).toEqual({
      connected: false,
      offline: false,
      error: "Firebase is not configured.",
    });
  });
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useDialogA11y({
    open,
    dialogRef,
    initialFocusRef: closeRef,
    onClose: () => setOpen(false),
  });

  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      { type: "button", onClick: () => setOpen(true) },
      "Open Dialog"
    ),
    open
      ? React.createElement(
          "div",
          {
            ref: dialogRef,
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Test Dialog",
            tabIndex: -1,
          },
          React.createElement(
            "button",
            { type: "button", ref: closeRef, onClick: () => setOpen(false) },
            "Close Dialog"
          ),
          React.createElement("button", { type: "button" }, "Second Action")
        )
      : null
  );
}

describe("useDialogA11y Focus Trap & Escape Handling", () => {
  it("moves focus into dialog, traps Tab navigation, closes on Escape, and restores trigger focus", () => {
    render(React.createElement(DialogHarness));

    const trigger = screen.getByRole("button", { name: "Open Dialog" });
    trigger.focus();
    fireEvent.click(trigger);

    const closeBtn = screen.getByRole("button", { name: "Close Dialog" });
    const secondBtn = screen.getByRole("button", { name: "Second Action" });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first focusable element wraps to last
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(secondBtn);

    // Tab from last focusable element wraps to first
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Escape closes dialog and restores focus to trigger button
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
