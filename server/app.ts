import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
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
import { verifyAndSanitizeImage } from "./utils/imageSanitizer.ts";
import {
  AirQualityQuerySchema,
  AskRequestSchema,
  GuidanceRequestSchema,
} from "../src/domain/schemas.ts";
import { z } from "zod";

export interface AppDependencies {
  config?: ServerConfig;
  fetchImpl?: typeof fetch;
  geminiClient?: GeminiClientLike | null;
  verifyTokenFn?: (
    authHeader?: string
  ) => Promise<{ uid: string; email_verified?: boolean } | null>;
  enableRateLimit?: boolean;
  rateLimitMax?: number;
}

const UploadPhotoSchema = z.object({
  imageDataUrl: z.string().min(20).max(3_200_000),
});

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
        // Allow same-origin / server-to-server requests (no Origin header)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // Allow AI Studio / Cloud Run preview origins (*.run.app)
        if (/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(origin)) {
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
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.rateLimitMax ?? 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => !limiterEnabled,
    message: {
      error:
        "Too many requests from this client. Please wait a minute and try again.",
    },
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.rateLimitMax ?? 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => !limiterEnabled,
    message: {
      error:
        "AI request rate limit reached. Please wait a minute before asking again.",
    },
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "breathewise",
      environment: config.nodeEnv,
      capabilities: {
        geminiConfigured: Boolean(config.geminiApiKey),
        geminiModel: config.geminiModel,
        groqConfigured: Boolean(config.groqApiKey),
        groqModel: config.groqModel,
        aiFallbackEnabled: Boolean(config.geminiApiKey && config.groqApiKey),
        cpcbApiConfigured: Boolean(config.dataGovInApiKey),
        openMeteoEnabled: true,
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
    aiLimiter,
    async (req: Request, res: Response) => {
      const client =
        deps.geminiClient !== undefined
          ? deps.geminiClient
          : createGeminiClient(config.geminiApiKey);

      if (!client && !config.groqApiKey) {
        res.status(503).json({
          error:
            "Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in Settings > Secrets. Add an AI key to generate personalized AI guidance.",
          code: "GEMINI_UNCONFIGURED",
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
        const result = await runGuidanceWithFallback({
          geminiClient: client,
          geminiModel: config.geminiModel,
          groqApiKey: config.groqApiKey,
          groqModel: config.groqModel,
          airContext: parsed.data.airContext,
          household: parsed.data.household,
          fetchImpl,
        });

        res.json({
          guidance: result.guidance,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          generatedAtIso: new Date().toISOString(),
        });
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
    aiLimiter,
    async (req: Request, res: Response) => {
      const client =
        deps.geminiClient !== undefined
          ? deps.geminiClient
          : createGeminiClient(config.geminiApiKey);

      if (!client && !config.groqApiKey) {
        res.status(503).json({
          error:
            "Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in Settings > Secrets. Add an AI key to chat with AI Family Guardian.",
          code: "GEMINI_UNCONFIGURED",
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
        const result = await runAskWithFallback({
          geminiClient: client,
          geminiModel: config.geminiModel,
          groqApiKey: config.groqApiKey,
          groqModel: config.groqModel,
          question: parsed.data.question,
          airContext: parsed.data.airContext,
          household: parsed.data.household,
          completedRoutines: parsed.data.completedRoutines,
          fetchImpl,
        });

        res.json({
          answer: result.answer,
          provider: result.provider,
          model: result.model,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
          generatedAtIso: new Date().toISOString(),
        });
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

  // Protected route: verifies Firebase ID token, validates binary magic bytes, strips EXIF/GPS metadata
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
      if (decoded.email_verified === false) {
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
        const sanitized = verifyAndSanitizeImage(parsed.data.imageDataUrl);
        res.json({
          photoDataUrl: sanitized.dataUrl,
          format: sanitized.format,
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
