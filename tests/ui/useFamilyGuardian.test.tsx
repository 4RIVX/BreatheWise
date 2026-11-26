// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDIAN_CITY_PRESETS } from "../../src/domain/indianCities";
import type {
  HouseholdContext,
  StructuredGuidance,
} from "../../src/domain/schemas";
import type { User } from "firebase/auth";
import { useFamilyGuardian } from "../../src/hooks/useFamilyGuardian";

const activeLocation = {
  ...INDIAN_CITY_PRESETS[0],
  source: "preset" as const,
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
  householdRecommendations: ["Keep vigorous play indoors."],
  outdoorActivityTiming: "Prefer short midday errands.",
  activitiesToLimit: ["Roadside jogging at dusk"],
  indoorProtectionSteps: ["Use kitchen exhaust."],
  maskGuidance: "Use N95 near heavy traffic.",
  commutingRecommendations: "Prefer enclosed metro rail.",
  next24HourActionPlan: ["Check readings before school."],
  recommendationExplanations: [
    { recommendation: "Indoor play", whyItMatters: "Reduces exposure." },
  ],
  dataLimitationsAndUncertainty: "Regional model only.",
  medicalSafetyNote: "Informational only; seek care for breathlessness.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeHook(
  user: User | null = null,
  getIdToken = vi.fn(async () => "test-token")
) {
  return renderHook(() =>
    useFamilyGuardian({
      activeLocation,
      preferredStationName: "Guindy",
      household,
      user,
      getIdToken,
      completedRoutineTitles: ["Use metro"],
    })
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useFamilyGuardian", () => {
  it("loads guidance and records fallback provider metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        guidance,
        provider: "groq",
        model: "llama-test",
        fallbackUsed: true,
        fallbackReason: "Gemini unavailable",
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(result.current.guidance).toEqual(guidance);
    expect(result.current.guidanceProvider).toBe("groq");
    expect(result.current.guidanceModel).toBe("llama-test");
    expect(result.current.guidanceFallbackReason).toBe("Gemini unavailable");
    expect(result.current.guidanceLoading).toBe(false);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    ).toMatchObject({
      location: { city: activeLocation.city, preferredStationName: "Guindy" },
      household,
    });
  });

  it("sends an ID token for authenticated guidance requests", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ guidance })
    );
    vi.stubGlobal("fetch", fetchMock);
    const getIdToken = vi.fn(async () => "secure-token");
    const user = { uid: "u1" } as User;
    const { result } = makeHook(user, getIdToken);

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(getIdToken).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer secure-token",
    });
  });

  it("uses default provider metadata when the response omits it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => jsonResponse({ guidance }))
    );
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(result.current.guidanceProvider).toBe("gemini");
    expect(result.current.guidanceModel).toBeNull();
    expect(result.current.guidanceFallbackReason).toBeNull();
  });

  it("maps an unsuccessful guidance response to an error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ error: "Provider unavailable" }, 503)
      )
    );
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(result.current.guidance).toBeNull();
    expect(result.current.guidanceError).toBe("Provider unavailable");
    expect(result.current.guidanceLoading).toBe(false);
  });

  it("handles non-Error failures with a safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Promise.reject("offline"))
    );
    const { result } = makeHook();

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(result.current.guidanceError).toBe(
      "Failed to load AI Family Guardian guidance."
    );
    expect(result.current.guidanceLoading).toBe(false);
  });

  it("aborts an older refresh and ignores its stale response", async () => {
    let resolveOlder!: (response: Response) => void;
    const olderResponse = new Promise<Response>((resolve) => {
      resolveOlder = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => olderResponse)
      .mockImplementationOnce(async () =>
        jsonResponse({ guidance: { ...guidance, headline: "Latest guidance" } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = makeHook();

    let olderRefresh!: Promise<void>;
    act(() => {
      olderRefresh = result.current.handleRefreshGuidance();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const olderSignal = fetchMock.mock.calls[0][1]?.signal;

    await act(async () => {
      await result.current.handleRefreshGuidance();
    });

    expect(olderSignal?.aborted).toBe(true);
    await act(async () => {
      resolveOlder(jsonResponse({ guidance }));
      await olderRefresh;
    });
    expect(result.current.guidance?.headline).toBe("Latest guidance");
  });

  it("asks a question with context and returns provider metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        answer: "Prefer indoor activities after dusk.",
        provider: "groq",
        model: "llama-test",
        fallbackUsed: true,
        fallbackReason: "Primary unavailable",
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = makeHook();

    await expect(
      result.current.handleAskQuestion("Can children play outside?")
    ).resolves.toEqual({
      answer: "Prefer indoor activities after dusk.",
      provider: "groq",
      model: "llama-test",
      fallbackUsed: true,
      fallbackReason: "Primary unavailable",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gemini/ask",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"completedRoutines":["Use metro"]'),
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("maps question endpoint errors to a rejected promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ error: "Question endpoint unavailable" }, 503)
      )
    );
    const { result } = makeHook();

    await expect(
      result.current.handleAskQuestion("Can children play outside?")
    ).rejects.toThrow("Question endpoint unavailable");
  });
});
