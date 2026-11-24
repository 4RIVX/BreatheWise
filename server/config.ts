export type AiProviderKind = "gemini" | "groq";

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
  allowedOrigins: string[];
  rateLimitRedisRestUrl: string;
  rateLimitRedisRestToken: string;
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
      throw new Error(
        "ALLOWED_ORIGIN must explicitly specify at least one authorized application origin in production."
      );
    }
    return Array.from(new Set(normalized));
  }

  return Array.from(new Set([...DEFAULT_DEV_ALLOWED_ORIGINS, ...normalized]));
}

export function loadServerConfig(
  env: Record<string, string | undefined> = process.env
): ServerConfig {
  const nodeEnv = (env.NODE_ENV ?? "development").trim() || "development";
  const aiProvider = parseAiProvider(env.AI_PROVIDER);
  const aiFallbackProvider = parseAiFallbackProvider(
    env.AI_FALLBACK_PROVIDER,
    aiProvider
  );

  const anonLimit = Number(env.AI_ANON_RATE_LIMIT_MAX ?? 6);
  const authLimit = Number(env.AI_AUTH_RATE_LIMIT_MAX ?? 20);

  return {
    port: Number(env.PORT ?? 3000),
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
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGIN, nodeEnv),
    rateLimitRedisRestUrl: (env.RATE_LIMIT_REDIS_REST_URL ?? "").trim(),
    rateLimitRedisRestToken: (env.RATE_LIMIT_REDIS_REST_TOKEN ?? "").trim(),
    aiAnonymousRateLimitMax:
      Number.isFinite(anonLimit) && anonLimit > 0 ? Math.floor(anonLimit) : 6,
    aiAuthenticatedRateLimitMax:
      Number.isFinite(authLimit) && authLimit > 0 ? Math.floor(authLimit) : 20,
    requireAiAuth: (env.REQUIRE_AI_AUTH ?? "").trim().toLowerCase() === "true",
    nodeEnv,
  };
}
