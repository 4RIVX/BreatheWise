import type { AiProviderKind } from "../config.ts";
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

export type AiProviderName = AiProviderKind;

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

/**
 * Only permit automatic fallback for transient availability/upstream outages,
 * rate limits, timeouts, or network transport errors—never for bad inputs,
 * invalid credentials, schema errors, or misconfigured model IDs.
 */
export function isAvailabilityFallbackEligible(errorText: string): boolean {
  const lower = errorText.toLowerCase();
  if (
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("question cannot be empty") ||
    lower.includes("failed schema validation") ||
    lower.includes("malformed json") ||
    lower.includes("404 not_found") ||
    lower.includes("permission_denied") ||
    lower.includes("http 400") ||
    lower.includes("http 401") ||
    lower.includes("http 403") ||
    lower.includes("http 404")
  ) {
    return false;
  }

  return (
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("502") ||
    lower.includes("504") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborterror") ||
    lower.includes("aborted") ||
    lower.includes("econnreset") ||
    lower.includes("econnrefused") ||
    lower.includes("ehostunreach") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("network error")
  );
}

function classifyProviderFailureStatus(errorText: string): number {
  if (
    errorText.includes("API_KEY_INVALID") ||
    errorText.includes("API key not valid") ||
    errorText.includes("HTTP 400")
  ) {
    return 400;
  }
  if (errorText.includes("PERMISSION_DENIED") || errorText.includes("403")) {
    return 403;
  }
  if (errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("429")) {
    return 429;
  }
  if (errorText.includes("503") || errorText.includes("UNAVAILABLE")) {
    return 503;
  }
  return 502;
}

function getProviderModel(
  provider: AiProviderName,
  geminiModel: string,
  groqModel: string
): string {
  return provider === "gemini" ? geminiModel : groqModel;
}

function isProviderConfigured(
  provider: AiProviderName,
  geminiClient: GeminiClientLike | null,
  groqApiKey: string
): boolean {
  return provider === "gemini"
    ? Boolean(geminiClient)
    : Boolean(groqApiKey.trim());
}

function capitalizeProvider(provider: AiProviderName): string {
  return provider === "gemini" ? "Gemini" : "Groq";
}

interface CommonFallbackParams {
  primaryProvider?: AiProviderName;
  fallbackProvider?: AiProviderName | null;
  geminiClient: GeminiClientLike | null;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
}

async function executeWithAiFallback<TResult>(
  params: CommonFallbackParams,
  runSingle: (provider: AiProviderName) => Promise<TResult>
): Promise<{ result: TResult; metadata: AiExecutionMetadata }> {
  const {
    primaryProvider = "gemini",
    fallbackProvider = null,
    geminiClient,
    geminiModel,
    groqApiKey,
    groqModel,
  } = params;

  const primaryConfigured = isProviderConfigured(
    primaryProvider,
    geminiClient,
    groqApiKey
  );
  const fallbackConfigured =
    fallbackProvider !== null &&
    fallbackProvider !== primaryProvider &&
    isProviderConfigured(fallbackProvider, geminiClient, groqApiKey);

  if (!primaryConfigured && !fallbackConfigured) {
    throw new AiOrchestrationError({
      message: `Primary provider ${capitalizeProvider(primaryProvider)} is unconfigured and no valid fallback provider is enabled.`,
      status: 503,
      code:
        primaryProvider === "gemini"
          ? "GEMINI_UNCONFIGURED"
          : "AI_UNCONFIGURED",
    });
  }

  if (!primaryConfigured) {
    throw new AiOrchestrationError({
      message: `Primary provider ${capitalizeProvider(primaryProvider)} is not configured in Settings > Secrets.`,
      status: 503,
      code:
        primaryProvider === "gemini"
          ? "GEMINI_UNCONFIGURED"
          : "AI_UNCONFIGURED",
    });
  }

  const primaryModel = getProviderModel(
    primaryProvider,
    geminiModel,
    groqModel
  );

  try {
    const result = await runSingle(primaryProvider);
    return {
      result,
      metadata: {
        provider: primaryProvider,
        model: primaryModel,
        fallbackUsed: false,
        fallbackReason: null,
      },
    };
  } catch (err) {
    const primaryError = sanitizeProviderError(err);

    if (
      !fallbackConfigured ||
      !fallbackProvider ||
      !isAvailabilityFallbackEligible(primaryError)
    ) {
      throw new AiOrchestrationError({
        message: fallbackProvider
          ? `Primary ${capitalizeProvider(primaryProvider)} (${primaryModel}) failed: ${primaryError}`
          : `Primary ${capitalizeProvider(primaryProvider)} (${primaryModel}) failed and no fallback provider is enabled: ${primaryError}`,
        status: classifyProviderFailureStatus(primaryError),
        code: `${primaryProvider.toUpperCase()}_UPSTREAM_FAILURE`,
        primaryError,
      });
    }

    const secondaryModel = getProviderModel(
      fallbackProvider,
      geminiModel,
      groqModel
    );
    try {
      const result = await runSingle(fallbackProvider);
      return {
        result,
        metadata: {
          provider: fallbackProvider,
          model: secondaryModel,
          fallbackUsed: true,
          fallbackReason: `Primary ${capitalizeProvider(primaryProvider)} (${primaryModel}) unavailable: ${primaryError}`,
        },
      };
    } catch (secErr) {
      const secondaryError = sanitizeProviderError(secErr);
      throw new AiOrchestrationError({
        message: `Primary ${capitalizeProvider(primaryProvider)} (${primaryModel}) and fallback ${capitalizeProvider(fallbackProvider)} (${secondaryModel}) both failed. Primary: ${primaryError}. Fallback: ${secondaryError}`,
        status: classifyProviderFailureStatus(
          `${primaryError} ${secondaryError}`
        ),
        code: "AI_UPSTREAM_FAILURE",
        primaryError,
        secondaryError,
      });
    }
  }
}

export async function runGuidanceWithFallback(
  params: CommonFallbackParams & {
    airContext: VerifiedAirContext;
    household: HouseholdContext;
    fetchImpl?: typeof fetch;
  }
): Promise<AiGuidanceExecution> {
  const { result: guidance, metadata } = await executeWithAiFallback(
    params,
    async (provider) => {
      if (provider === "gemini") {
        if (!params.geminiClient) {
          throw new Error("GEMINI_API_KEY missing.");
        }
        return generateFamilyGuidance({
          client: params.geminiClient,
          model: params.geminiModel,
          airContext: params.airContext,
          household: params.household,
        });
      }
      return generateGroqFamilyGuidance({
        apiKey: params.groqApiKey,
        model: params.groqModel,
        airContext: params.airContext,
        household: params.household,
        fetchImpl: params.fetchImpl,
      });
    }
  );

  return { guidance, ...metadata };
}

export async function runAskWithFallback(
  params: CommonFallbackParams & {
    question: string;
    airContext: VerifiedAirContext;
    household: HouseholdContext;
    completedRoutines?: string[];
    fetchImpl?: typeof fetch;
  }
): Promise<AiAnswerExecution> {
  const { result: answer, metadata } = await executeWithAiFallback(
    params,
    async (provider) => {
      if (provider === "gemini") {
        if (!params.geminiClient) {
          throw new Error("GEMINI_API_KEY missing.");
        }
        return askFamilyGuardian({
          client: params.geminiClient,
          model: params.geminiModel,
          question: params.question,
          airContext: params.airContext,
          household: params.household,
          completedRoutines: params.completedRoutines,
        });
      }
      return askGroqFamilyGuardian({
        apiKey: params.groqApiKey,
        model: params.groqModel,
        question: params.question,
        airContext: params.airContext,
        household: params.household,
        completedRoutines: params.completedRoutines,
        fetchImpl: params.fetchImpl,
      });
    }
  );

  return { answer, ...metadata };
}
