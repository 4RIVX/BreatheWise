import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { ServerConfig } from "../config.ts";
import {
  createGeminiClient,
  type GeminiClientLike,
} from "../services/geminiService.ts";
import {
  AiOrchestrationError,
  runAskWithFallback,
  runGuidanceWithFallback,
} from "../services/aiOrchestrator.ts";
import { buildServerVerifiedAirContext } from "../services/verifiedAirContextBuilder.ts";
import {
  AskRequestSchema,
  AskResponseSchema,
  GuidanceRequestSchema,
  GuidanceResponseSchema,
} from "../../src/domain/schemas.ts";

function resolvePrimaryAiReadiness(
  config: ServerConfig,
  geminiClientOverride?: GeminiClientLike | null
): { primaryConfigured: boolean; client: GeminiClientLike | null } {
  const client =
    geminiClientOverride !== undefined
      ? geminiClientOverride
      : createGeminiClient(config.geminiApiKey);
  const primaryConfigured =
    config.aiProvider === "gemini"
      ? Boolean(client)
      : Boolean(config.groqApiKey);
  return { primaryConfigured, client };
}

function sendAiUnconfigured(res: Response, config: ServerConfig): void {
  res.status(503).json({
    error: `Primary AI provider (${config.aiProvider}) is not configured in Settings > Secrets.`,
    code:
      config.aiProvider === "gemini"
        ? "GEMINI_UNCONFIGURED"
        : "AI_UNCONFIGURED",
  });
}

function sendAiError(res: Response, err: unknown): void {
  if (err instanceof AiOrchestrationError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      primaryError: err.primaryError,
      secondaryError: err.secondaryError,
    });
    return;
  }
  res.status(502).json({ error: "Unable to reach AI providers right now." });
}

export function createAiRouter(params: {
  config: ServerConfig;
  fetchImpl: typeof fetch;
  geminiClientOverride?: GeminiClientLike | null;
  resolveAiCallerMiddleware: RequestHandler;
  aiLimiter: RequestHandler;
}): Router {
  const {
    config,
    fetchImpl,
    geminiClientOverride,
    resolveAiCallerMiddleware,
    aiLimiter,
  } = params;
  const router = Router();

  router.post(
    "/guidance",
    resolveAiCallerMiddleware,
    aiLimiter,
    async (req: Request, res: Response) => {
      const { primaryConfigured, client } = resolvePrimaryAiReadiness(
        config,
        geminiClientOverride
      );
      if (!primaryConfigured) {
        sendAiUnconfigured(res, config);
        return;
      }

      const parsed = GuidanceRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid guidance request payload.",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      try {
        const verified = await buildServerVerifiedAirContext({
          location: parsed.data.location,
          dataGovInApiKey: config.dataGovInApiKey,
          openAqApiKey: config.openAqApiKey,
          fetchImpl,
        });

        const result = await runGuidanceWithFallback({
          primaryProvider: config.aiProvider,
          fallbackProvider: config.aiFallbackProvider,
          geminiClient: client,
          geminiModel: config.geminiModel,
          groqApiKey: config.groqApiKey,
          groqModel: config.groqModel,
          airContext: verified.airContext,
          household: parsed.data.household,
          fetchImpl,
        });

        const responseBody = GuidanceResponseSchema.parse({
          guidance: result.guidance,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          dataProvenance: verified.dataProvenance,
          generatedAtIso: new Date().toISOString(),
        });

        res.json(responseBody);
      } catch (err) {
        sendAiError(res, err);
      }
    }
  );

  router.post(
    "/ask",
    resolveAiCallerMiddleware,
    aiLimiter,
    async (req: Request, res: Response) => {
      const { primaryConfigured, client } = resolvePrimaryAiReadiness(
        config,
        geminiClientOverride
      );
      if (!primaryConfigured) {
        sendAiUnconfigured(res, config);
        return;
      }

      const parsed = AskRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid question payload.",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      try {
        const verified = await buildServerVerifiedAirContext({
          location: parsed.data.location,
          dataGovInApiKey: config.dataGovInApiKey,
          openAqApiKey: config.openAqApiKey,
          fetchImpl,
        });

        const result = await runAskWithFallback({
          primaryProvider: config.aiProvider,
          fallbackProvider: config.aiFallbackProvider,
          geminiClient: client,
          geminiModel: config.geminiModel,
          groqApiKey: config.groqApiKey,
          groqModel: config.groqModel,
          question: parsed.data.question,
          airContext: verified.airContext,
          household: parsed.data.household,
          completedRoutines: parsed.data.completedRoutines,
          fetchImpl,
        });

        const responseBody = AskResponseSchema.parse({
          answer: result.answer,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          dataProvenance: verified.dataProvenance,
          generatedAtIso: new Date().toISOString(),
        });

        res.json(responseBody);
      } catch (err) {
        sendAiError(res, err);
      }
    }
  );

  return router;
}
