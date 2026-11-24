import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyAtomicConfirmationTx,
  mapPublicSmogReportDoc,
  type ConfirmationTransactionAdapter,
} from "../../src/firebase/firestoreService";
import {
  handleFirestoreError,
  OperationType,
  sanitizeFirestorePath,
  sanitizeOperationalText,
} from "../../src/firebase/errorHandling";

vi.mock("../../src/firebase/config", () => ({
  auth: {
    currentUser: {
      uid: "secret-uid-98765",
      email: "arivumathi.private@example.com",
      emailVerified: true,
      isAnonymous: false,
      tenantId: "tenant-secret-01",
      providerData: [
        {
          providerId: "google.com",
          email: "arivumathi.private@example.com",
        },
      ],
    },
  },
  db: null,
}));

describe("Mission F1: Firestore Privacy, Atomic Confirmations, Rules Regressions & Log Privacy", () => {
  it("strips authorUid and private metadata from public smog report projections", () => {
    const publicReport = mapPublicSmogReportDoc("rep-101", {
      authorUid: "leak-check-uid-999",
      email: "should-not-leak@example.com",
      city: "Chennai",
      state: "Tamil Nadu",
      approximateLocation: "Adyar Signal",
      sourceCategory: "Traffic emissions",
      severity: "Moderate",
      description: "Heavy diesel bus smoke near intersection.",
      observedTimeLabel: "08:30 IST",
      moderationStatus: "UNVERIFIED",
      confirmationsCount: 2,
    });

    expect("authorUid" in publicReport).toBe(false);
    expect("email" in publicReport).toBe(false);
    expect(JSON.stringify(publicReport)).not.toContain("leak-check-uid-999");
    expect(JSON.stringify(publicReport)).not.toContain(
      "should-not-leak@example.com"
    );
    expect(publicReport.confirmationsCount).toBe(2);
  });

  it("executes atomic confirmation transactions without lost increments and blocks duplicates", async () => {
    const store = new Map<string, Record<string, unknown>>([
      ["smogReports/rep-1", { confirmationsCount: 1 }],
      [
        "smogReports/rep-1/confirmations/author-uid",
        { uid: "author-uid", reportId: "rep-1" },
      ],
    ]);

    const runMockTransaction = async (uid: string) => {
      const tx: ConfirmationTransactionAdapter = {
        get: async (ref) => {
          const key = String(ref);
          const rec = store.get(key);
          return {
            exists: () => Boolean(rec),
            data: () => rec,
          };
        },
        set: (ref, data) => {
          store.set(String(ref), data);
        },
        update: (ref, data) => {
          const key = String(ref);
          const prev = store.get(key) ?? {};
          store.set(key, { ...prev, ...data });
        },
      };

      return applyAtomicConfirmationTx({
        tx,
        confRef: `smogReports/rep-1/confirmations/${uid}`,
        reportRef: "smogReports/rep-1",
        uid,
        reportId: "rep-1",
        timestampValue: "SERVER_TS",
      });
    };

    const countAfterU2 = await runMockTransaction("user-2");
    const countAfterU3 = await runMockTransaction("user-3");
    expect(countAfterU2).toBe(2);
    expect(countAfterU3).toBe(3);
    expect(store.get("smogReports/rep-1")?.confirmationsCount).toBe(3);

    // Author who created report already has initial confirmation record
    await expect(runMockTransaction("author-uid")).rejects.toThrow(
      "DUPLICATE_CONFIRMATION"
    );
    // Second confirmation by user-2 also blocked
    await expect(runMockTransaction("user-2")).rejects.toThrow(
      "DUPLICATE_CONFIRMATION"
    );
  });

  it("enforces privacy isolation and atomic confirmation invariants in firestore.rules", () => {
    const rules = fs.readFileSync(
      path.resolve(process.cwd(), "firestore.rules"),
      "utf-8"
    );

    // Default deny catch-all
    expect(rules).toContain("match /{document=**}");
    expect(rules).toContain("allow read, write: if false;");

    // Public smogReports blueprint MUST NOT contain authorUid
    const smogReportFn = rules.slice(
      rules.indexOf("function isValidSmogReport(data)"),
      rules.indexOf("function isValidSmogReportOwner")
    );
    expect(smogReportFn).not.toContain("authorUid");

    // Ownership isolated to /private/{docId} with docId == 'owner' and list disabled
    expect(rules).toContain("match /private/{docId}");
    expect(rules).toContain("docId == 'owner'");
    expect(rules).toContain("allow list: if false;");
    expect(rules).toContain(
      "existsAfter(/databases/$(database)/documents/smogReports/$(reportId)/private/owner)"
    );
    expect(rules).toContain(
      "existsAfter(/databases/$(database)/documents/smogReports/$(reportId)/confirmations/$(request.auth.uid))"
    );
  });

  it("never logs user email, UID, or tenant metadata in handleFirestoreError", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        handleFirestoreError(
          {
            code: "permission-denied",
            message:
              "Access denied for arivumathi.private@example.com with Bearer secretToken.123",
          },
          OperationType.UPDATE,
          "users/secret-uid-98765/routines/rt-1"
        )
      ).toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedPayload = JSON.stringify(errorSpy.mock.calls[0]);
      expect(loggedPayload).not.toContain("arivumathi.private@example.com");
      expect(loggedPayload).not.toContain("secret-uid-98765");
      expect(loggedPayload).not.toContain("tenant-secret-01");
      expect(loggedPayload).not.toContain("secretToken.123");
      expect(loggedPayload).toContain("[REDACTED_UID]");
      expect(loggedPayload).toContain("permission-denied");

      expect(
        sanitizeOperationalText("Contact user@domain.org")
      ).toContain("[REDACTED_EMAIL]");
      expect(
        sanitizeFirestorePath("users/abc123uid/ecoLogs/log1")
      ).toBe("users/[REDACTED_UID]/ecoLogs/log1");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
