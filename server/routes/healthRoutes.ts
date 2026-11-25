import { Router, type Request, type Response } from "express";
import type { ServerConfig } from "../config.ts";
import { getCpcbCacheStats } from "../providers/cpcbProvider.ts";
import { getOpenMeteoCacheStats } from "../providers/openMeteoProvider.ts";
import type { GeminiClientLike } from "../services/geminiService.ts";

export function createHealthRouter(params: {
  config: ServerConfig;
  geminiClientOverride?: GeminiClientLike | null;
}): Router {
  const { config, geminiClientOverride } = params;
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    const geminiConfigured =
      geminiClientOverride !== undefined
        ? Boolean(geminiClientOverride)
        : Boolean(config.geminiApiKey);
    const groqConfigured = Boolean(config.groqApiKey);

    const primaryConfigured =
      config.aiProvider === "gemini" ? geminiConfigured : groqConfigured;
    const primaryModel =
      config.aiProvider === "gemini" ? config.geminiModel : config.groqModel;

    const fallbackConfigured =
      config.aiFallbackProvider === "gemini"
        ? geminiConfigured
        : config.aiFallbackProvider === "groq"
          ? groqConfigured
          : false;
    const fallbackModel =
      config.aiFallbackProvider === "gemini"
        ? config.geminiModel
        : config.aiFallbackProvider === "groq"
          ? config.groqModel
          : null;

    res.json({
      ok: true,
      service: "breathewise",
      environment: config.nodeEnv,
      capabilities: {
        activeProvider: config.aiProvider,
        primaryProvider: {
          provider: config.aiProvider,
          model: primaryModel,
          configured: primaryConfigured,
        },
        fallbackProvider: {
          provider: config.aiFallbackProvider,
          model: fallbackModel,
          configured: fallbackConfigured,
          enabled: Boolean(config.aiFallbackProvider && fallbackConfigured),
        },
        geminiConfigured,
        geminiModel: config.geminiModel,
        groqConfigured,
        groqModel: config.groqModel,
        aiFallbackEnabled: Boolean(
          config.aiFallbackProvider && fallbackConfigured
        ),
        cpcbApiConfigured: Boolean(config.dataGovInApiKey),
        openAqApiConfigured: Boolean(config.openAqApiKey),
        openMeteoEnabled: true,
        aiAuthRequired: config.requireAiAuth,
        deploymentTopology: config.deploymentTopology,
        rateLimitMode: config.rateLimitMode,
        distributedRateLimitConfigured: Boolean(
          config.rateLimitRedisRestUrl && config.rateLimitRedisRestToken
        ),
      },
      cache: {
        cpcb: getCpcbCacheStats(),
        openMeteo: getOpenMeteoCacheStats(),
      },
      timestampIso: new Date().toISOString(),
    });
  });

  return router;
}
