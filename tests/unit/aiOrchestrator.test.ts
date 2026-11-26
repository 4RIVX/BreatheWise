import { describe, expect, it, vi } from "vitest";
import {
  AiOrchestrationError,
  isAvailabilityFallbackEligible,
  runGuidanceWithFallback,
} from "../../server/services/aiOrchestrator.ts";
import type { GeminiClientLike } from "../../server/services/geminiService.ts";
import type {
  HouseholdContext,
  StructuredGuidance,
  VerifiedAirContext,
} from "../../src/domain/schemas.ts";

const airContext: VerifiedAirContext = {
  locationLabel: "Chennai, Tamil Nadu",
  measuredSourceAvailable: false,
};
const household: HouseholdContext = {
  profileId: "general",
  householdSize: 3,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: false,
  purifierCadrM3h: 0,
  language: "en",
};
const guidance: StructuredGuidance = {
  headline: "Moderate particulate this evening",
  currentAirQualityExplanation:
    "Modelled PM2.5 is elevated; station data is unavailable.",
  householdRecommendations: ["Keep play indoors.", "Run purifier in bedrooms."],
  outdoorActivityTiming: "Prefer midday errands.",
  activitiesToLimit: ["Dusk roadside jogging"],
  indoorProtectionSteps: ["Use kitchen exhaust.", "Seal windows."],
  maskGuidance: "N95 near traffic.",
  commutingRecommendations: "Enclosed metro rail.",
  next24HourActionPlan: [
    "Check before school.",
    "Flush if haze lifts.",
    "Avoid dusk exercise.",
  ],
  recommendationExplanations: [
    { recommendation: "Indoor play", whyItMatters: "Low wind traps PM2.5." },
    {
      recommendation: "Bedroom HEPA",
      whyItMatters: "Lowers overnight exposure.",
    },
  ],
  dataLimitationsAndUncertainty: "Regional model only.",
  medicalSafetyNote: "Informational only; seek care for breathlessness.",
};

function groqResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(guidance) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function geminiClient(text: string): GeminiClientLike {
  return { models: { generateContent: vi.fn(async () => ({ text })) } };
}

const common = {
  primaryProvider: "gemini" as const,
  fallbackProvider: "groq" as const,
  geminiModel: "gemini-4-hydrogen",
  groqApiKey: "gsk_test",
  groqModel: "llama-3.3-70b-versatile",
  airContext,
  household,
};

describe("isAvailabilityFallbackEligible", () => {
  it.each([
    "429",
    "503 UNAVAILABLE",
    "502 Bad Gateway",
    "ETIMEDOUT",
    "fetch failed",
  ])("allows availability fallback for %s", (message) => {
    expect(isAvailabilityFallbackEligible(message)).toBe(true);
  });

  it.each([
    "API_KEY_INVALID",
    "HTTP 400",
    "failed schema validation",
    "HTTP 404",
  ])("does not allow fallback for %s", (message) => {
    expect(isAvailabilityFallbackEligible(message)).toBe(false);
  });
});

describe("runGuidanceWithFallback", () => {
  it("returns the primary provider result when healthy", async () => {
    const result = await runGuidanceWithFallback({
      ...common,
      geminiClient: geminiClient(JSON.stringify(guidance)),
    });
    expect(result.provider).toBe("gemini");
    expect(result.fallbackUsed).toBe(false);
    expect(result.fallbackReason).toBeNull();
  });

  it("uses Groq for an availability failure and bounds fallback metadata", async () => {
    const client: GeminiClientLike = {
      models: {
        generateContent: vi
          .fn()
          .mockRejectedValue(new Error(`503 ${"x".repeat(400)} bearer token`)),
      },
    };
    const fetchImpl = vi.fn(async () => groqResponse());

    const result = await runGuidanceWithFallback({
      ...common,
      geminiClient: client,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.provider).toBe("groq");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason?.length).toBeLessThanOrEqual(300);
  });

  it("does not fall back for credential failures", async () => {
    const client: GeminiClientLike = {
      models: {
        generateContent: vi
          .fn()
          .mockRejectedValue(new Error("API_KEY_INVALID")),
      },
    };
    const fetchImpl = vi.fn();

    await expect(
      runGuidanceWithFallback({
        ...common,
        geminiClient: client,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(AiOrchestrationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a combined upstream failure when both providers fail", async () => {
    const client: GeminiClientLike = {
      models: {
        generateContent: vi
          .fn()
          .mockRejectedValue(new Error("503 UNAVAILABLE")),
      },
    };
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));

    await expect(
      runGuidanceWithFallback({
        ...common,
        geminiClient: client,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toMatchObject({ code: "AI_UPSTREAM_FAILURE" });
  });

  it("fails fast when the primary provider is not configured", async () => {
    await expect(
      runGuidanceWithFallback({ ...common, geminiClient: null, groqApiKey: "" })
    ).rejects.toMatchObject({ status: 503, code: "GEMINI_UNCONFIGURED" });
  });

  it("does not silently use a configured fallback when the primary is absent", async () => {
    await expect(
      runGuidanceWithFallback({ ...common, geminiClient: null })
    ).rejects.toMatchObject({ status: 503, code: "GEMINI_UNCONFIGURED" });
  });
});
