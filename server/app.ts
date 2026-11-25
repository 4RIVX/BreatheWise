import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit, { type Store } from "express-rate-limit";
import { loadServerConfig, type ServerConfig } from "./config.ts";
import { verifyBearerToken } from "./firebaseAdmin.ts";
import { type GeminiClientLike } from "./services/geminiService.ts";
import {
  createRateLimitStore,
  DistributedRateLimitUnavailableError,
  MemoryRateLimitStore,
  RedisRestRateLimitStore,
} from "./utils/rateLimitStore.ts";
import { createHealthRouter } from "./routes/healthRoutes.ts";
import { createAirQualityRouter } from "./routes/airQualityRoutes.ts";
import { createAiRouter } from "./routes/aiRoutes.ts";
import { createUploadRouter } from "./routes/uploadRoutes.ts";

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

interface ExpressHttpError extends Error {
  status?: number;
  type?: string;
}

function hashIdentifier(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function buildRateLimitStore(
  limiterEnabled: boolean,
  deps: AppDependencies,
  config: ServerConfig,
  fetchImpl: typeof fetch,
  scope: "api" | "ai"
): Store {
  if (!limiterEnabled) {
    return new MemoryRateLimitStore({ prefix: `disabled-${scope}:` });
  }
  if (deps.rateLimitStore instanceof MemoryRateLimitStore) {
    return new MemoryRateLimitStore({
      sharedHits: deps.rateLimitStore.hits,
      prefix: `${scope}:`,
    });
  }
  if (deps.rateLimitStore instanceof RedisRestRateLimitStore) {
    return deps.rateLimitStore.withPrefix(`bw:dist:${scope}:`);
  }
  return (
    deps.rateLimitStore ??
    createRateLimitStore(config, fetchImpl, `bw:dist:${scope}:`)
  );
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
        if (!origin || config.allowedOrigins.includes(origin)) {
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
  const apiStore = buildRateLimitStore(
    limiterEnabled,
    deps,
    config,
    fetchImpl,
    "api"
  );
  const aiStore = buildRateLimitStore(
    limiterEnabled,
    deps,
    config,
    fetchImpl,
    "ai"
  );

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: deps.rateLimitMax ?? 40,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: apiStore,
    passOnStoreError: false,
    skip: () => !limiterEnabled,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req, _res) =>
      `api:${hashIdentifier(req.ip || req.socket.remoteAddress || "unknown")}`,
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
    passOnStoreError: false,
    skip: () => !limiterEnabled,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req, _res) => {
      const caller = req as RequestWithCaller;
      if (caller.verifiedUid) {
        return `ai:user:${hashIdentifier(caller.verifiedUid)}`;
      }
      return `ai:anon:${hashIdentifier(req.ip || req.socket.remoteAddress || "unknown")}`;
    },
    message: {
      error:
        "AI request rate limit reached. Please wait a minute before asking again.",
    },
  });

  app.use(
    "/api/health",
    createHealthRouter({
      config,
      geminiClientOverride: deps.geminiClient,
    })
  );

  app.use(
    "/api/air-quality",
    createAirQualityRouter({
      config,
      fetchImpl,
      apiLimiter,
    })
  );

  app.use(
    "/api/gemini",
    createAiRouter({
      config,
      fetchImpl,
      geminiClientOverride: deps.geminiClient,
      resolveAiCallerMiddleware,
      aiLimiter,
    })
  );

  app.use(
    "/api/uploads/smog-photo",
    createUploadRouter({
      verifyTokenFn,
      apiLimiter,
    })
  );

  // Safe JSON error handler (never leaks stack traces)
  app.use(
    (
      err: ExpressHttpError,
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      if (err instanceof DistributedRateLimitUnavailableError) {
        res.status(503).json({
          error: "Rate-limit enforcement temporarily unavailable.",
          code: "RATE_LIMIT_STORE_UNAVAILABLE",
        });
        return;
      }
      if (err.message.includes("CORS")) {
        res.status(403).json({ error: "Origin not permitted." });
        return;
      }
      if (
        err.type === "entity.too.large" ||
        err.message.includes("entity too large")
      ) {
        res.status(413).json({ error: "Request payload exceeds size limit." });
        return;
      }
      if (
        err instanceof SyntaxError ||
        err.type === "entity.parse.failed" ||
        err.status === 400
      ) {
        res.status(400).json({ error: "Malformed JSON request body." });
        return;
      }
      res.status(500).json({ error: "Internal server error." });
    }
  );

  return app;
}
