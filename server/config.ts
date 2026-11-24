export interface ServerConfig {
  port: number;
  host: string;
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  dataGovInApiKey: string;
  allowedOrigins: string[];
  nodeEnv: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function loadServerConfig(): ServerConfig {
  const extraOrigins = (process.env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "0.0.0.0",
    geminiApiKey: (process.env.GEMINI_API_KEY ?? "").trim(),
    geminiModel:
      (process.env.GEMINI_MODEL ?? "gemini-4-hydrogen").trim() ||
      "gemini-4-hydrogen",
    groqApiKey: (process.env.GROQ_API_KEY ?? "").trim(),
    groqModel:
      (process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile").trim() ||
      "llama-3.3-70b-versatile",
    dataGovInApiKey: (process.env.DATA_GOV_IN_API_KEY ?? "").trim(),
    allowedOrigins: Array.from(
      new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins])
    ),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
