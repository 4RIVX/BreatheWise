import { describe, expect, it, vi } from "vitest";
import {
  askGroqFamilyGuardian,
  generateGroqFamilyGuidance,
} from "../../server/services/groqService.ts";
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
    "Modelled PM2.5 is elevated while station data is unavailable.",
  householdRecommendations: [
    "Keep vigorous play indoors.",
    "Run the purifier in bedrooms.",
  ],
  outdoorActivityTiming: "Prefer short midday errands.",
  activitiesToLimit: ["Roadside jogging at dusk"],
  indoorProtectionSteps: ["Use kitchen exhaust.", "Seal window gaps."],
  maskGuidance: "Use N95 near heavy traffic.",
  commutingRecommendations: "Prefer enclosed metro rail.",
  next24HourActionPlan: [
    "Check readings before school.",
    "Flush air if haze lifts.",
    "Avoid dusk exercise.",
  ],
  recommendationExplanations: [
    {
      recommendation: "Indoor play",
      whyItMatters: "Low wind traps PM2.5 near streets.",
    },
    {
      recommendation: "Bedroom HEPA",
      whyItMatters: "Lowers overnight exposure.",
    },
  ],
  dataLimitationsAndUncertainty:
    "Regional model only; station telemetry is unavailable.",
  medicalSafetyNote: "Informational only; seek urgent care for breathlessness.",
};

function response(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const common = {
  apiKey: "gsk_test",
  model: "llama-3.3-70b-versatile",
  airContext,
  household,
};

describe("groqService", () => {
  it("returns schema-validated guidance", async () => {
    const fetchImpl = vi.fn(async () => response(JSON.stringify(guidance)));
    const result = await generateGroqFamilyGuidance({
      ...common,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.headline).toBe(guidance.headline);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a validated answer", async () => {
    const answer = await askGroqFamilyGuardian({
      ...common,
      question: "Can my children play outside?",
      completedRoutines: ["Use metro rail"],
      fetchImpl: vi.fn(async () =>
        response("Prefer indoor activities after dusk.")
      ) as unknown as typeof fetch,
    });
    expect(answer).toContain("indoor");
  });

  it("rejects a missing API key", async () => {
    await expect(
      generateGroqFamilyGuidance({ ...common, apiKey: " " })
    ).rejects.toThrow(/not configured/i);
  });

  it("retries without JSON mode after an HTTP 400", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "JSON mode unsupported" } }),
          {
            status: 400,
          }
        )
      )
      .mockResolvedValueOnce(response(JSON.stringify(guidance)));

    const result = await generateGroqFamilyGuidance({
      ...common,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.headline).toBe(guidance.headline);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)
    ).toHaveProperty("response_format");
    expect(
      JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)
    ).not.toHaveProperty("response_format");
  });

  it("surfaces upstream error details and tolerates a malformed error body", async () => {
    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(
          async () =>
            new Response(
              JSON.stringify({ error: { message: "rate limited" } }),
              {
                status: 429,
              }
            )
        ) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/Groq API error.*rate limited/);

    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(
          async () => new Response("invalid", { status: 503 })
        ) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("rejects empty and structurally invalid upstream responses", async () => {
    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(async () => response("  ")) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/empty/i);

    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(
          async () =>
            new Response(JSON.stringify({ unexpected: true }), { status: 200 })
        ) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/structure validation/i);
  });

  it("rejects malformed JSON and schema-invalid guidance", async () => {
    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(async () =>
          response("{not-json")
        ) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/malformed JSON/i);

    await expect(
      generateGroqFamilyGuidance({
        ...common,
        fetchImpl: vi.fn(async () =>
          response(JSON.stringify({ ...guidance, headline: "x" }))
        ) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/schema validation/i);
  });

  it("rejects answers that violate the Q&A contract", async () => {
    await expect(
      askGroqFamilyGuardian({
        ...common,
        question: "What should I do?",
        fetchImpl: vi.fn(async () => response("x")) as unknown as typeof fetch,
      })
    ).rejects.toThrow(/answer contract/i);
  });
});
