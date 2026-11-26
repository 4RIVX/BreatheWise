import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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
});
