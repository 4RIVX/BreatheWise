export type AiProviderKind = "gemini" | "groq";
export type DeploymentTopology = "single-instance" | "multi-instance";
export type RateLimitStoreMode = "distributed-redis" | "single-instance-memory";

export interface ServerConfig {
  port: number;
  host: string;
  aiProvider: AiProviderKind;
  aiFallbackProvider: AiProviderKind | null;
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  dataGovInApiKey: string;
  openAqApiKey: string;
  allowedOrigins: string[];
  rateLimitRedisRestUrl: string;
  rateLimitRedisRestToken: string;
  deploymentTopology: DeploymentTopology;
  requireDistributedRateLimit: boolean;
  rateLimitMode: RateLimitStoreMode;
  aiAnonymousRateLimitMax: number;
  aiAuthenticatedRateLimitMax: number;
  requireAiAuth: boolean;
  nodeEnv: string;
}

const DEFAULT_DEV_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function parseAiProvider(raw: string | undefined): AiProviderKind {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized || normalized === "gemini") return "gemini";
  if (normalized === "groq") return "groq";
  throw new Error(
    `Invalid AI_PROVIDER "${raw}". Supported values: "gemini", "groq".`
  );
}

function parseAiFallbackProvider(
  raw: string | undefined,
  primary: AiProviderKind
): AiProviderKind | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "off") {
    return null;
  }
  if (normalized !== "gemini" && normalized !== "groq") {
    throw new Error(
      `Invalid AI_FALLBACK_PROVIDER "${raw}". Supported values: "groq", "gemini", "none".`
    );
  }
  if (normalized === primary) {
    throw new Error(
      `AI_FALLBACK_PROVIDER ("${normalized}") cannot match primary AI_PROVIDER ("${primary}").`
    );
  }
  return normalized;
}

function parseDeploymentTopology(
  raw: string | undefined,
  requireDistributed: boolean
): DeploymentTopology {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!normalized) {
    return requireDistributed ? "multi-instance" : "single-instance";
  }
  if (normalized === "single-instance" || normalized === "multi-instance") {
    return normalized;
  }
  throw new Error(
    `Invalid DEPLOYMENT_TOPOLOGY "${raw}". Supported values: "single-instance", "multi-instance".`
  );
}

function validateRedisRestUrl(rawUrl: string, nodeEnv: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `Invalid RATE_LIMIT_REDIS_REST_URL: "${rawUrl}" is not a valid URL.`
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      "RATE_LIMIT_REDIS_REST_URL must use http: or https: protocol."
    );
  }
  const isLoopback =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1";
  if (nodeEnv === "production" && parsed.protocol !== "https:" && !isLoopback) {
    throw new Error("RATE_LIMIT_REDIS_REST_URL must use https: in production.");
  }
  return rawUrl.replace(/\/+$/, "");
}

function parseAllowedOrigins(
  rawAllowedOrigin: string | undefined,
  nodeEnv: string
): string[] {
  const configured = (rawAllowedOrigin ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of configured) {
    if (entry === "*" || entry.includes("*")) {
      throw new Error(
        `Wildcard origins ("${entry}") are prohibited in ALLOWED_ORIGIN.`
      );
    }
  }

  const normalized = configured.map((entry) => {
    try {
      const parsed = new URL(entry);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Unsupported origin protocol in "${entry}".`);
      }
      return parsed.origin;
    } catch {
      throw new Error(`Invalid origin URL in ALLOWED_ORIGIN: "${entry}".`);
    }
  });

  if (nodeEnv === "production") {
    if (normalized.length === 0) {
      return DEFAULT_DEV_ALLOWED_ORIGINS;
    }
    return Array.from(new Set(normalized));
  }

  return Array.from(new Set([...DEFAULT_DEV_ALLOWED_ORIGINS, ...normalized]));
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env
): ServerConfig {
  const nodeEnv = (env.NODE_ENV ?? "production").trim() || "production";
  const aiProvider = parseAiProvider(env.AI_PROVIDER);
  const aiFallbackProvider = parseAiFallbackProvider(
    env.AI_FALLBACK_PROVIDER,
    aiProvider
  );

  const anonLimit = Number(env.AI_ANON_RATE_LIMIT_MAX ?? 6);
  const authLimit = Number(env.AI_AUTH_RATE_LIMIT_MAX ?? 20);

  const rawRedisUrl = (env.RATE_LIMIT_REDIS_REST_URL ?? "").trim();
  const rateLimitRedisRestToken = (
    env.RATE_LIMIT_REDIS_REST_TOKEN ?? ""
  ).trim();

  if (Boolean(rawRedisUrl) !== Boolean(rateLimitRedisRestToken)) {
    throw new Error(
      "Partial Redis rate-limit configuration detected: both RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN must be set together."
    );
  }

  const rateLimitRedisRestUrl = rawRedisUrl
    ? validateRedisRestUrl(rawRedisUrl, nodeEnv)
    : "";

  const requireDistributedRateLimit =
    (env.REQUIRE_DISTRIBUTED_RATE_LIMIT ?? "").trim().toLowerCase() === "true";
  const deploymentTopology = parseDeploymentTopology(
    env.DEPLOYMENT_TOPOLOGY,
    requireDistributedRateLimit
  );

  const hasRedis = Boolean(rateLimitRedisRestUrl && rateLimitRedisRestToken);
  if (
    nodeEnv === "production" &&
    !hasRedis &&
    (deploymentTopology === "multi-instance" || requireDistributedRateLimit)
  ) {
    throw new Error(
      "Multi-instance production deployment requires RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN for distributed rate limiting."
    );
  }

  if (
    nodeEnv === "production" &&
    env.GEMINI_MODEL !== undefined &&
    !env.GEMINI_MODEL.trim()
  ) {
    throw new Error("GEMINI_MODEL cannot be blank in production.");
  }

  if (
    nodeEnv === "production" &&
    env.GROQ_MODEL !== undefined &&
    !env.GROQ_MODEL.trim()
  ) {
    throw new Error("GROQ_MODEL cannot be blank in production.");
  }

  return {
    port: (() => {
      const p = Number(env.PORT);
      return Number.isFinite(p) && p > 0 ? p : 3000;
    })(),
    host: env.HOST ?? "0.0.0.0",
    aiProvider,
    aiFallbackProvider,
    geminiApiKey: (env.GEMINI_API_KEY ?? "").trim(),
    geminiModel:
      (env.GEMINI_MODEL ?? "gemini-4-hydrogen").trim() || "gemini-4-hydrogen",
    groqApiKey: (env.GROQ_API_KEY ?? "").trim(),
    groqModel:
      (env.GROQ_MODEL ?? "llama-3.3-70b-versatile").trim() ||
      "llama-3.3-70b-versatile",
    dataGovInApiKey: (env.DATA_GOV_IN_API_KEY ?? "").trim(),
    openAqApiKey: (env.OPENAQ_API_KEY ?? "").trim(),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGIN, nodeEnv),
    rateLimitRedisRestUrl,
    rateLimitRedisRestToken,
    deploymentTopology,
    requireDistributedRateLimit,
    rateLimitMode: hasRedis ? "distributed-redis" : "single-instance-memory",
    aiAnonymousRateLimitMax:
      Number.isFinite(anonLimit) && anonLimit > 0 ? Math.floor(anonLimit) : 6,
    aiAuthenticatedRateLimitMax:
      Number.isFinite(authLimit) && authLimit > 0 ? Math.floor(authLimit) : 20,
    requireAiAuth: (env.REQUIRE_AI_AUTH ?? "").trim().toLowerCase() === "true",
    nodeEnv,
  };
}
