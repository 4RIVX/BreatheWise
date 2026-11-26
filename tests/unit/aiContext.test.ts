import { describe, expect, it } from "vitest";
import {
  sanitizeUserQuestion,
  sanitizeLocationLabel,
  sanitizeProviderError,
  extractJsonObject,
  buildIsolatedAskPrompts,
} from "../../server/services/aiContext.ts";
import type {
  HouseholdContext,
  VerifiedAirContext,
} from "../../src/domain/schemas.ts";

const air: VerifiedAirContext = {
  locationLabel: "Chennai",
  measuredSourceAvailable: false,
};
const hh: HouseholdContext = {
  profileId: "general",
  householdSize: 3,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: false,
  purifierCadrM3h: 0,
  language: "en",
};

describe("sanitizeUserQuestion", () => {
  it("strips control and zero-width/bidi characters", () => {
    expect(sanitizeUserQuestion("a\u0000b\u200bc\u202ed")).toBe("a b c d");
  });

  it("removes code fences and HTML/XML tags", () => {
    expect(sanitizeUserQuestion("```hi <b>there</b>```")).toBe("hi there");
  });

  it("neutralizes raw URLs", () => {
    expect(sanitizeUserQuestion("see https://evil.invalid/x now")).toBe(
      "see [untrusted-url-removed] now"
    );
  });

  it("defuses role-override prefixes", () => {
    expect(sanitizeUserQuestion("system: do x")).toBe("[user-text]: do x");
  });

  it("truncates to 500 chars", () => {
    expect(sanitizeUserQuestion("x".repeat(900)).length).toBe(500);
  });

  it("caps location labels at 80 chars", () => {
    expect(sanitizeLocationLabel("y".repeat(200)).length).toBe(80);
  });
});

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses fenced JSON", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts a brace-delimited object from prose", () => {
    expect(extractJsonObject('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });

  it("throws when no object exists", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("sanitizeProviderError", () => {
  it("redacts API keys and bearer tokens", () => {
    const out = sanitizeProviderError(
      new Error("key AIzaSyABCDEFGHIJ1234567890 and Bearer abc.def.ghi")
    );
    expect(out).not.toContain("AIzaSy");
    expect(out).toContain("[REDACTED]");
  });

  it("extracts structured provider error detail", () => {
    const out = sanitizeProviderError(
      new Error('{"error":{"message":"boom","code":500,"status":"INTERNAL"}}')
    );
    expect(out).toContain("HTTP 500 INTERNAL: boom");
  });

  it("caps error messages at 260 chars", () => {
    expect(
      sanitizeProviderError(new Error("z".repeat(500))).length
    ).toBeLessThanOrEqual(260);
  });
});

describe("buildIsolatedAskPrompts", () => {
  it("rejects an empty question", () => {
    expect(() =>
      buildIsolatedAskPrompts({
        question: "   ",
        airContext: air,
        household: hh,
      })
    ).toThrow();
  });

  it("wraps untrusted input in a nonce boundary", () => {
    const prompts = buildIsolatedAskPrompts({
      question: "Play outside?",
      airContext: air,
      household: hh,
    });
    expect(prompts.untrustedUserMessage).toContain(
      `[[UNTRUSTED_USER_INPUT_${prompts.boundaryNonce}]]`
    );
    expect(prompts.untrustedUserMessage).toContain("Play outside?");
  });
});
