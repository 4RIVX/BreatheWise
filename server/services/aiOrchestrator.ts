import type {
  HouseholdContext,
  StructuredGuidance,
  VerifiedAirContext,
} from "../../src/domain/schemas.ts";
import { sanitizeProviderError } from "./aiContext.ts";
import {
  askFamilyGuardian,
  generateFamilyGuidance,
  type GeminiClientLike,
} from "./geminiService.ts";
import {
  askGroqFamilyGuardian,
  generateGroqFamilyGuidance,
} from "./groqService.ts";

export type AiProviderName = "gemini" | "groq";

export interface AiExecutionMetadata {
  provider: AiProviderName;
  model: string;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export interface AiGuidanceExecution extends AiExecutionMetadata {
  guidance: StructuredGuidance;
}

export interface AiAnswerExecution extends AiExecutionMetadata {
  answer: string;
}

export class AiOrchestrationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly primaryError: string | null;
  readonly secondaryError: string | null;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    primaryError?: string | null;
    secondaryError?: string | null;
  }) {
    super(params.message);
    this.name = "AiOrchestrationError";
    this.status = params.status;
    this.code = params.code;
    this.primaryError = params.primaryError ?? null;
    this.secondaryError = params.secondaryError ?? null;
  }
}

function classifyProviderFailureStatus(errorText: string): number {
  if (
    errorText.includes("API_KEY_INVALID") ||
    errorText.includes("API key not valid")
  ) {
    return 400;
  }
  if (errorText.includes("PERMISSION_DENIED") || errorText.includes("403")) {
    return 403;
  }
  if (errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("429")) {
    return 429;
  }
  return 502;
}

export async function runGuidanceWithFallback(params: {
  geminiClient: GeminiClientLike | null;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  airContext: VerifiedAirContext;
  household: HouseholdContext;
  fetchImpl?: typeof fetch;
}): Promise<AiGuidanceExecution> {
  const {
    geminiClient,
    geminiModel,
    groqApiKey,
    groqModel,
    airContext,
    household,
    fetchImpl,
  } = params;

  const hasGroq = Boolean(groqApiKey.trim());
  if (!geminiClient && !hasGroq) {
    throw new AiOrchestrationError({
      message:
        "Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in Settings > Secrets. Add an AI API key to generate personalized AI guidance.",
      status: 503,
      code: "AI_UNCONFIGURED",
    });
  }

  let primaryError: string;

  if (geminiClient) {
    try {
      const guidance = await generateFamilyGuidance({
        client: geminiClient,
        model: geminiModel,
        airContext,
        household,
      });
      return {
        guidance,
        provider: "gemini",
        model: geminiModel,
        fallbackUsed: false,
        fallbackReason: null,
      };
    } catch (err) {
      primaryError = sanitizeProviderError(err);
    }
  } else {
    primaryError =
      "Primary provider Gemini is unconfigured (GEMINI_API_KEY missing).";
  }

  if (hasGroq) {
    try {
      const guidance = await generateGroqFamilyGuidance({
        apiKey: groqApiKey,
        model: groqModel,
        airContext,
        household,
        fetchImpl,
      });
      return {
        guidance,
        provider: "groq",
        model: groqModel,
        fallbackUsed: true,
        fallbackReason: `Primary Gemini (${geminiModel}) unavailable: ${primaryError}`,
      };
    } catch (err) {
      const secondaryError = sanitizeProviderError(err);
      throw new AiOrchestrationError({
        message: `Primary Gemini (${geminiModel}) and fallback Groq (${groqModel}) both failed. Gemini: ${primaryError}. Groq: ${secondaryError}`,
        status: classifyProviderFailureStatus(
          `${primaryError} ${secondaryError}`
        ),
        code: "AI_UPSTREAM_FAILURE",
        primaryError,
        secondaryError,
      });
    }
  }

  throw new AiOrchestrationError({
    message: `Primary Gemini (${geminiModel}) failed and no Groq fallback key is configured: ${primaryError}`,
    status: classifyProviderFailureStatus(primaryError),
    code: "GEMINI_UPSTREAM_FAILURE",
    primaryError,
  });
}

export async function runAskWithFallback(params: {
  geminiClient: GeminiClientLike | null;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  question: string;
  airContext: VerifiedAirContext;
  household: HouseholdContext;
  completedRoutines?: string[];
  fetchImpl?: typeof fetch;
}): Promise<AiAnswerExecution> {
  const {
    geminiClient,
    geminiModel,
    groqApiKey,
    groqModel,
    question,
    airContext,
    household,
    completedRoutines,
    fetchImpl,
  } = params;

  const hasGroq = Boolean(groqApiKey.trim());
  if (!geminiClient && !hasGroq) {
    throw new AiOrchestrationError({
      message:
        "Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in Settings > Secrets. Add an AI API key to chat with AI Family Guardian.",
      status: 503,
      code: "AI_UNCONFIGURED",
    });
  }

  let primaryError: string;

  if (geminiClient) {
    try {
      const answer = await askFamilyGuardian({
        client: geminiClient,
        model: geminiModel,
        question,
        airContext,
        household,
        completedRoutines,
      });
      return {
        answer,
        provider: "gemini",
        model: geminiModel,
        fallbackUsed: false,
        fallbackReason: null,
      };
    } catch (err) {
      primaryError = sanitizeProviderError(err);
    }
  } else {
    primaryError =
      "Primary provider Gemini is unconfigured (GEMINI_API_KEY missing).";
  }

  if (hasGroq) {
    try {
      const answer = await askGroqFamilyGuardian({
        apiKey: groqApiKey,
        model: groqModel,
        question,
        airContext,
        household,
        completedRoutines,
        fetchImpl,
      });
      return {
        answer,
        provider: "groq",
        model: groqModel,
        fallbackUsed: true,
        fallbackReason: `Primary Gemini (${geminiModel}) unavailable: ${primaryError}`,
      };
    } catch (err) {
      const secondaryError = sanitizeProviderError(err);
      throw new AiOrchestrationError({
        message: `Primary Gemini (${geminiModel}) and fallback Groq (${groqModel}) both failed. Gemini: ${primaryError}. Groq: ${secondaryError}`,
        status: classifyProviderFailureStatus(
          `${primaryError} ${secondaryError}`
        ),
        code: "AI_UPSTREAM_FAILURE",
        primaryError,
        secondaryError,
      });
    }
  }

  throw new AiOrchestrationError({
    message: `Primary Gemini (${geminiModel}) failed and no Groq fallback key is configured: ${primaryError}`,
    status: classifyProviderFailureStatus(primaryError),
    code: "GEMINI_UPSTREAM_FAILURE",
    primaryError,
  });
}
