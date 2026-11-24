import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { type Store } from "express-rate-limit";
import { z } from "zod";
import { loadServerConfig, type ServerConfig } from "./config.ts";
import { verifyBearerToken } from "./firebaseAdmin.ts";
import {
  fetchCpcbStations,
  getCpcbCacheStats,
  type CpcbProviderResponse,
} from "./providers/cpcbProvider.ts";
import {
  fetchOpenMeteoForecast,
  getOpenMeteoCacheStats,
  type OpenMeteoForecastResult,
} from "./providers/openMeteoProvider.ts";
import {
  createGeminiClient,
  type GeminiClientLike,
} from "./services/geminiService.ts";
import {
  AiOrchestrationError,
  runAskWithFallback,
  runGuidanceWithFallback,
} from "./services/aiOrchestrator.ts";
import { buildServerVerifiedAirContext } from "./services/verifiedAirContextBuilder.ts";
import { verifyAndSanitizeImage } from "./utils/imageSanitizer.ts";
import { createRateLimitStore, MemoryRateLimitStore } from "./utils/rateLimitStore.ts";
import {
  AirQualityQuerySchema,
  AskRequestSchema,
  AskResponseSchema,
  GuidanceRequestSchema,
  GuidanceResponseSchema,
} from "../src/domain/schemas.ts";

export interface AppDependencies {
  config?: ServerConfig;
  fetchImpl?: typeof fetch;
  geminiClient?: GeminiClientLike | null;
  verifyTokenFn?: (
    authHeader?: string
  ) => Promise<{ uid: string; email_verified?: boolean } | null>;
  enableRateLimit?: boolean;
  rateLimitMax?: number;
  rateLimitStore?: Store;
}

interface RequestWithCaller extends Request {
  verifiedUid?: string | null;
}

const UploadPhotoSchema = z.object({
  imageDataUrl: z.string().min(20).max(3_200_000),
});

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function createApp(deps: AppDependencies = {}) {
  const config = deps.config ?? loadServerConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const verifyTokenFn = deps.verifyTokenFn ?? verifyBearerToken;

  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin / server-to-server requests without an Origin header
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not permitted by CORS policy"));
      },
      credentials: false,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use("/api/uploads/smog-photo", express.json({ limit: "3mb" }));
  app.use(express.json({ limit: "256kb" }));

  const limiterEnabled = deps.enableRateLimit !== false;
  const apiStore =
    deps.rateLimitStore instanceof MemoryRateLimitStore
      ? new MemoryRateLimitStore({
          sharedHits: deps.rateLimitStore.hits,
          prefix: "api:",
        })
      : (deps.rateLimitStore ?? createRateLimitStore(config, fetchImpl));
  const aiStore =
    deps.rateLimitStore instanceof MemoryRateLimitStore
      ? new MemoryRateLimitStore({
          sharedHits: deps.rateLimitStore.hits,
          prefix: "ai:",
        })
      : (deps.rateLimitStore ?? createRateLimitStore(config, fetchImpl));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.rateLimitMax ?? 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: apiStore,
    skip: () => !limiterEnabled,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req, _res) =>
      `api:${hashIdentifier(req.socket.remoteAddress || req.ip || "unknown")}`,
    message: {
      error:
        "Too many requests from this client. Please wait a minute and try again.",
    },
  });

  const resolveAiCallerMiddleware = async (
    req: RequestWithCaller,
    res: Response,
    next: NextFunction
  ) => {
    const decoded = await verifyTokenFn(req.headers.authorization);
    req.verifiedUid =
      decoded && decoded.email_verified === true ? decoded.uid : null;

    if (config.requireAiAuth && !req.verifiedUid) {
      res.status(401).json({
        error:
          "Verified Firebase authentication is required to access AI endpoints.",
      });
      return;
    }
    next();
  };

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: (req) => {
      if (deps.rateLimitMax !== undefined) {
        return deps.rateLimitMax;
      }
      const caller = req as RequestWithCaller;
      return caller.verifiedUid
        ? config.aiAuthenticatedRateLimitMax
        : config.aiAnonymousRateLimitMax;
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: aiStore,
    skip: () => !limiterEnabled,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req, _res) => {
      const caller = req as RequestWithCaller;
      if (caller.verifiedUid) {
        return `ai:user:${hashIdentifier(caller.verifiedUid)}`;
      }
      return `ai:anon:${hashIdentifier(req.socket.remoteAddress || req.ip || "unknown")}`;
    },
    message: {
      error:
        "AI request rate limit reached. Please wait a minute before asking again.",
    },
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    const geminiConfigured =
      deps.geminiClient !== undefined
        ? Boolean(deps.geminiClient)
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
        openMeteoEnabled: true,
        aiAuthRequired: config.requireAiAuth,
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

  app.get(
    "/api/air-quality",
    apiLimiter,
    async (req: Request, res: Response) => {
      const parsed = AirQualityQuerySchema.safeParse({
        city: req.query.city,
        state: req.query.state,
        latitude: req.query.latitude,
        longitude: req.query.longitude,
      });

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid location parameters.",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const { city, state, latitude, longitude } = parsed.data;

      const [cpcb, openMeteo]: [CpcbProviderResponse, OpenMeteoForecastResult] =
        await Promise.all([
          fetchCpcbStations({
            city,
            state,
            apiKey: config.dataGovInApiKey,
            fetchImpl,
          }),
          fetchOpenMeteoForecast({
            latitude,
            longitude,
            fetchImpl,
          }),
        ]);

      const bothUnavailable =
        cpcb.status === "unavailable" && openMeteo.status === "unavailable";

      res.status(bothUnavailable ? 503 : 200).json({
        location: { city, state: state ?? null, latitude, longitude },
        measured: cpcb,
        modelled: openMeteo,
        retrievedAtIso: new Date().toISOString(),
      });
    }
  );

  app.post(
    "/api/gemini/guidance",
    resolveAiCallerMiddleware,
    aiLimiter,
    async (req: Request, res: Response) => {
      const client =
        deps.geminiClient !== undefined
          ? deps.geminiClient
          : createGeminiClient(config.geminiApiKey);

      const primaryConfigured =
        config.aiProvider === "gemini"
          ? Boolean(client)
          : Boolean(config.groqApiKey);

      if (!primaryConfigured) {
        res.status(503).json({
          error: `Primary AI provider (${config.aiProvider}) is not configured in Settings > Secrets.`,
          code:
            config.aiProvider === "gemini"
              ? "GEMINI_UNCONFIGURED"
              : "AI_UNCONFIGURED",
        });
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
        if (err instanceof AiOrchestrationError) {
          res.status(err.status).json({
            error: err.message,
            code: err.code,
            primaryError: err.primaryError,
            secondaryError: err.secondaryError,
          });
          return;
        }
        res
          .status(502)
          .json({ error: "Unable to reach AI providers right now." });
      }
    }
  );

  app.post(
    "/api/gemini/ask",
    resolveAiCallerMiddleware,
    aiLimiter,
    async (req: Request, res: Response) => {
      const client =
        deps.geminiClient !== undefined
          ? deps.geminiClient
          : createGeminiClient(config.geminiApiKey);

      const primaryConfigured =
        config.aiProvider === "gemini"
          ? Boolean(client)
          : Boolean(config.groqApiKey);

      if (!primaryConfigured) {
        res.status(503).json({
          error: `Primary AI provider (${config.aiProvider}) is not configured in Settings > Secrets.`,
          code:
            config.aiProvider === "gemini"
              ? "GEMINI_UNCONFIGURED"
              : "AI_UNCONFIGURED",
        });
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
        if (err instanceof AiOrchestrationError) {
          res.status(err.status).json({
            error: err.message,
            code: err.code,
            primaryError: err.primaryError,
            secondaryError: err.secondaryError,
          });
          return;
        }
        res
          .status(502)
          .json({ error: "Unable to reach AI providers right now." });
      }
    }
  );

  // Protected route: verifies Firebase ID token, binary-decodes via sharp, strips EXIF/GPS & re-encodes to WebP
  app.post(
    "/api/uploads/smog-photo",
    apiLimiter,
    async (req: Request, res: Response) => {
      const decoded = await verifyTokenFn(req.headers.authorization);
      if (!decoded) {
        res.status(401).json({
          error:
            "Authentication required. Please sign in with Google to attach a photo.",
        });
        return;
      }
      if (decoded.email_verified !== true) {
        res.status(403).json({
          error:
            "A verified email account is required to upload observation photos.",
        });
        return;
      }

      const parsed = UploadPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid photo upload payload.",
        });
        return;
      }

      try {
        const sanitized = await verifyAndSanitizeImage(
          parsed.data.imageDataUrl
        );
        res.json({
          photoDataUrl: sanitized.dataUrl,
          format: sanitized.format,
          mimeType: sanitized.mimeType,
          width: sanitized.width,
          height: sanitized.height,
          sanitizedBytes: sanitized.sanitizedBytes,
          metadataStripped: sanitized.metadataStripped,
        });
      } catch (err) {
        res.status(400).json({
          error:
            err instanceof Error
              ? err.message
              : "Photo failed binary safety validation.",
        });
      }
    }
  );

  // Safe JSON error handler (never leaks stack traces)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err.message.includes("CORS")) {
      res.status(403).json({ error: "Origin not permitted." });
      return;
    }
    if (err.message.includes("entity too large")) {
      res.status(413).json({ error: "Request payload exceeds size limit." });
      return;
    }
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}
