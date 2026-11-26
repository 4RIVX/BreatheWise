import { describe, expect, it, vi } from "vitest";
import {
  askFamilyGuardian,
  createGeminiClient,
  generateFamilyGuidance,
  type GeminiClientLike,
} from "../../server/services/geminiService.ts";
import type {
  HouseholdContext,
  StructuredGuidance,
  VerifiedAirContext,
} from "../../src/domain/schemas.ts";

const airContext: VerifiedAirContext = {
  locationLabel: "Delhi, Delhi",
  measuredSourceAvailable: false,
};
const household: HouseholdContext = {
  profileId: "children",
  householdSize: 4,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: true,
  purifierCadrM3h: 300,
  language: "en",
};
const guidance: StructuredGuidance = {
  headline: "Evening particulate buildup",
  currentAirQualityExplanation:
    "Modelled PM2.5 is elevated; station data is unavailable.",
  householdRecommendations: ["Keep play indoors.", "Run HEPA in bedrooms."],
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

function returningClient(text: string): GeminiClientLike {
  return { models: { generateContent: vi.fn(async () => ({ text })) } };
}

const common = { model: "gemini-4-hydrogen", airContext, household };

describe("geminiService", () => {
  it("returns null for a blank key and constructs a client for a configured key", () => {
    expect(createGeminiClient("  ")).toBeNull();
    expect(createGeminiClient("  AIza-test  ")).not.toBeNull();
  });

  it("returns schema-validated guidance", async () => {
    const result = await generateFamilyGuidance({
      ...common,
      client: returningClient(JSON.stringify(guidance)),
    });
    expect(result.headline).toBe(guidance.headline);
  });

  it("returns a validated answer", async () => {
    const answer = await askFamilyGuardian({
      ...common,
      client: returningClient("Prefer indoor activities after dusk."),
      question: "Can the children play outside?",
      completedRoutines: ["Use metro rail"],
    });
    expect(answer).toContain("indoor");
  });

  it("rejects empty, malformed, and schema-invalid guidance", async () => {
    await expect(
      generateFamilyGuidance({ ...common, client: returningClient("  ") })
    ).rejects.toThrow(/empty/i);
    await expect(
      generateFamilyGuidance({ ...common, client: returningClient("{bad") })
    ).rejects.toThrow(/malformed JSON/i);
    await expect(
      generateFamilyGuidance({
        ...common,
        client: returningClient(JSON.stringify({ ...guidance, headline: "x" })),
      })
    ).rejects.toThrow(/schema validation/i);
  });

  it("retries once for a transient service error", async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 UNAVAILABLE"))
      .mockResolvedValueOnce({ text: JSON.stringify(guidance) });

    const result = await generateFamilyGuidance({
      ...common,
      client: { models: { generateContent } },
    });

    expect(result.headline).toBe(guidance.headline);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new Error("400 INVALID_ARGUMENT"));

    await expect(
      generateFamilyGuidance({
        ...common,
        client: { models: { generateContent } },
      })
    ).rejects.toThrow(/400/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid Q&A output", async () => {
    await expect(
      askFamilyGuardian({
        ...common,
        client: returningClient("x"),
        question: "What should I do?",
      })
    ).rejects.toThrow(/answer contract/i);
  });
});
