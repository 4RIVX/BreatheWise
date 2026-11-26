import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-breathewise",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await environment.cleanup();
});

const authenticatedDb = (uid: string, emailVerified = true) =>
  environment
    .authenticatedContext(uid, { email_verified: emailVerified })
    .firestore();

describe("Firestore rules adversarial invariants", () => {
  it("denies unauthenticated smog report creation", async () => {
    await assertFails(
      setDoc(
        doc(
          environment.unauthenticatedContext().firestore(),
          "smogReports/report-1"
        ),
        { city: "Chennai" }
      )
    );
  });

  it("denies report creation by an unverified user", async () => {
    await assertFails(
      setDoc(doc(authenticatedDb("u1", false), "smogReports/report-1"), {
        city: "Chennai",
      })
    );
  });

  it("denies author UID injection into a public report", async () => {
    await assertFails(
      setDoc(doc(authenticatedDb("u1"), "smogReports/report-1"), {
        city: "Chennai",
        authorUid: "u1",
      })
    );
  });

  it("denies cross-user private profile reads", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/u2"), {
        uid: "u2",
        email: "u2@example.com",
      });
    });
    await assertFails(getDoc(doc(authenticatedDb("u1"), "users/u2")));
  });

  it("denies direct confirmation count inflation", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "smogReports/report-1"), {
        confirmationsCount: 1,
        moderationStatus: "UNVERIFIED",
      });
    });
    await assertFails(
      updateDoc(doc(authenticatedDb("u1"), "smogReports/report-1"), {
        confirmationsCount: 11,
      })
    );
  });

  it("allows an owner to read their own profile", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/u1"), {
        uid: "u1",
        email: "u1@example.com",
      });
    });
    await assertSucceeds(getDoc(doc(authenticatedDb("u1"), "users/u1")));
  });

  it("caps public smog report list queries at 50 records", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "smogReports/list-limit-report"), {
        moderationStatus: "UNVERIFIED",
      });
    });

    const reports = collection(
      environment.unauthenticatedContext().firestore(),
      "smogReports"
    );
    const visibleReports = where("moderationStatus", "in", [
      "UNVERIFIED",
      "REVIEWED",
    ]);

    await assertFails(getDocs(query(reports, visibleReports)));
    await assertSucceeds(getDocs(query(reports, visibleReports, limit(50))));
    await assertFails(getDocs(query(reports, visibleReports, limit(51))));
  });

  it("caps owner routine list queries at 50 records", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "users/list-limit-owner/routines/routine-1"),
        { uid: "list-limit-owner" }
      );
    });

    const routines = collection(
      authenticatedDb("list-limit-owner"),
      "users/list-limit-owner/routines"
    );
    const ownerRoutine = where("uid", "==", "list-limit-owner");

    await assertFails(getDocs(query(routines, ownerRoutine)));
    await assertSucceeds(getDocs(query(routines, ownerRoutine, limit(50))));
    await assertFails(getDocs(query(routines, ownerRoutine, limit(51))));
  });

  it("caps owner eco log list queries at 20 records", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "users/list-limit-owner/ecoLogs/log-1"),
        { uid: "list-limit-owner" }
      );
    });

    const ecoLogs = collection(
      authenticatedDb("list-limit-owner"),
      "users/list-limit-owner/ecoLogs"
    );
    const ownerLog = where("uid", "==", "list-limit-owner");

    await assertFails(getDocs(query(ecoLogs, ownerLog)));
    await assertSucceeds(getDocs(query(ecoLogs, ownerLog, limit(20))));
    await assertFails(getDocs(query(ecoLogs, ownerLog, limit(21))));
  });
});
