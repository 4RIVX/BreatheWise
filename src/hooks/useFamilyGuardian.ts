import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { HouseholdContext, StructuredGuidance } from "../domain/schemas";
import type { ActiveLocationState } from "../domain/airQualityTypes";
import type {
  AiProviderKind,
  AskQuestionResult,
} from "../components/AiFamilyGuardian";
import { readJsonResponse } from "../utils/safeFetchJson";

export function useFamilyGuardian(params: {
  activeLocation: ActiveLocationState;
  preferredStationName?: string;
  household: HouseholdContext;
  user: User | null;
  getIdToken: () => Promise<string | null>;
  completedRoutineTitles: string[];
}) {
  const {
    activeLocation,
    preferredStationName,
    household,
    user,
    getIdToken,
    completedRoutineTitles,
  } = params;

  const [guidance, setGuidance] = useState<StructuredGuidance | null>(null);
  const [guidanceProvider, setGuidanceProvider] =
    useState<AiProviderKind | null>(null);
  const [guidanceModel, setGuidanceModel] = useState<string | null>(null);
  const [guidanceFallbackReason, setGuidanceFallbackReason] = useState<
    string | null
  >(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);

  const guidanceAbortRef = useRef<AbortController | null>(null);
  const guidanceSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      guidanceAbortRef.current?.abort();
    };
  }, []);

  const handleRefreshGuidance = useCallback(async () => {
    guidanceAbortRef.current?.abort();
    const controller = new AbortController();
    guidanceAbortRef.current = controller;
    const seq = ++guidanceSeqRef.current;

    setGuidanceLoading(true);
    setGuidanceError(null);
    try {
      const token = user ? await getIdToken() : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/gemini/guidance", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          location: {
            city: activeLocation.city,
            state: activeLocation.state,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            preferredStationName,
          },
          household,
        }),
      });
      const data = await readJsonResponse<{
        guidance?: StructuredGuidance;
        provider?: AiProviderKind;
        model?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        error?: string;
      }>(res);

      if (seq !== guidanceSeqRef.current) return;

      if (!res.ok || !data.guidance) {
        throw new Error(
          data.error || "Unable to generate AI Family Guardian guidance."
        );
      }
      setGuidance(data.guidance);
      setGuidanceProvider(data.provider ?? "gemini");
      setGuidanceModel(data.model ?? null);
      setGuidanceFallbackReason(
        data.fallbackUsed
          ? (data.fallbackReason ?? "Fallback provider used.")
          : null
      );
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        seq !== guidanceSeqRef.current
      ) {
        return;
      }
      setGuidanceError(
        err instanceof Error
          ? err.message
          : "Failed to load AI Family Guardian guidance."
      );
    } finally {
      if (seq === guidanceSeqRef.current) {
        setGuidanceLoading(false);
      }
    }
  }, [activeLocation, preferredStationName, household, user, getIdToken]);

  const handleAskQuestion = useCallback(
    async (question: string): Promise<AskQuestionResult> => {
      const token = user ? await getIdToken() : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/gemini/ask", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          location: {
            city: activeLocation.city,
            state: activeLocation.state,
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
            preferredStationName,
          },
          household,
          completedRoutines: completedRoutineTitles,
        }),
      });
      const data = await readJsonResponse<{
        answer?: string;
        provider?: AiProviderKind;
        model?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        error?: string;
      }>(res);
      if (!res.ok || !data.answer) {
        throw new Error(
          data.error || "Unable to get an answer from AI Family Guardian."
        );
      }
      return {
        answer: data.answer,
        provider: data.provider,
        model: data.model,
        fallbackUsed: data.fallbackUsed,
        fallbackReason: data.fallbackReason,
      };
    },
    [
      completedRoutineTitles,
      activeLocation,
      preferredStationName,
      household,
      user,
      getIdToken,
    ]
  );

  return {
    guidance,
    guidanceProvider,
    guidanceModel,
    guidanceFallbackReason,
    guidanceLoading,
    guidanceError,
    handleRefreshGuidance,
    handleAskQuestion,
  };
}
