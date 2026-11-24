import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { INITIAL_REPORTS, INITIAL_STATIONS } from "./src/data/seedData.ts";
import type {
  HouseholdProfileId,
  ReportSeverity,
  SmogReport,
  SmogSourceType,
} from "./src/types/breathewise.ts";

const PORT = 3000;
const HOST = "0.0.0.0";

const stations = INITIAL_STATIONS.map((s) => ({ ...s }));
const reports: SmogReport[] = INITIAL_REPORTS.map((r) => ({ ...r }));

const PROFILE_DESCRIPTIONS: Record<HouseholdProfileId, string> = {
  children:
    "Family with young children (focus on school commute, outdoor play thresholds, pediatric respiratory safety, and nursery air quality).",
  respiratory:
    "Household member with asthma or chronic respiratory sensitivity (strict PM2.5 exposure limits, medication readiness, N95/FFP2 seal guidance).",
  seniors:
    "Older adults with cardiopulmonary considerations (cold morning inversion avoidance, gentle indoor mobility, continuous air filtration).",
  commuter:
    "Daily urban commuter (corridor exposure mitigation, transit/cabin recirculation, mask timing during rush hour).",
  general:
    "General urban household (practical daily outdoor timing, home sealing/ventilation balance, and low-emission habits).",
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("API_KEY_INVALID") || raw.includes("400")) {
    return {
      status: 400,
      message:
        "Gemini API key appears invalid. Please verify GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (raw.includes("PERMISSION_DENIED") || raw.includes("403")) {
    return {
      status: 403,
      message:
        "Gemini API access denied. Please check your API key in Settings > Secrets.",
    };
  }
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429")) {
    return {
      status: 429,
      message:
        "Gemini API rate or quota limit reached. Please try again shortly or check your quota in Settings > Secrets.",
    };
  }
  return {
    status: 502,
    message: raw || "Unable to reach Gemini service right now.",
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "breathewise" });
  });

  app.get("/api/stations", (_req, res) => {
    res.json({ stations });
  });

  app.get("/api/reports", (req, res) => {
    const districtId =
      typeof req.query.districtId === "string" ? req.query.districtId : "";
    const filtered = districtId
      ? reports.filter((r) => r.districtId === districtId)
      : reports;
    res.json({ reports: filtered });
  });

  app.post("/api/reports", (req, res) => {
    const body = req.body as Partial<{
      neighborhood: string;
      districtId: string;
      sourceType: SmogSourceType;
      severity: ReportSeverity;
      notes: string;
      reporterLabel: string;
    }>;

    const neighborhood = body.neighborhood?.trim();
    const districtId = body.districtId?.trim();
    const notes = body.notes?.trim();

    if (!neighborhood || !districtId || !notes) {
      res.status(400).json({
        error: "Neighborhood, district, and observation notes are required.",
      });
      return;
    }

    const allowedSources: SmogSourceType[] = [
      "Wood Smoke",
      "Traffic Haze",
      "Industrial Plume",
      "Construction Dust",
      "Inversion Fog",
    ];
    const allowedSeverities: ReportSeverity[] = ["Mild", "Moderate", "Severe"];

    const sourceType: SmogSourceType = allowedSources.includes(
      body.sourceType as SmogSourceType
    )
      ? (body.sourceType as SmogSourceType)
      : "Inversion Fog";
    const severity: ReportSeverity = allowedSeverities.includes(
      body.severity as ReportSeverity
    )
      ? (body.severity as ReportSeverity)
      : "Moderate";

    const newReport: SmogReport = {
      id: `rep-${Date.now()}`,
      neighborhood: neighborhood.slice(0, 80),
      districtId,
      sourceType,
      severity,
      notes: notes.slice(0, 320),
      reportedAt: "Just now",
      reporterLabel: body.reporterLabel?.trim().slice(0, 40) || "Resident",
      verifiedCount: 1,
    };

    reports.unshift(newReport);
    res.status(201).json({ report: newReport });
  });

  app.post("/api/reports/:id/confirm", (req, res) => {
    const target = reports.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: "Report not found." });
      return;
    }
    target.verifiedCount += 1;
    res.json({ report: target });
  });

  app.post("/api/gemini/guidance", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini API key to generate personalized winter smog guidance.",
      });
      return;
    }

    const body = req.body as Partial<{
      stationId: string;
      profileId: HouseholdProfileId;
      roomSqM: number;
      hasHepa: boolean;
    }>;

    const station =
      stations.find((s) => s.id === body.stationId) ?? stations[0];
    const profileId: HouseholdProfileId =
      body.profileId && body.profileId in PROFILE_DESCRIPTIONS
        ? body.profileId
        : "children";

    const districtReports = reports
      .filter((r) => r.districtId === station.id)
      .slice(0, 3)
      .map((r) => `- ${r.neighborhood} (${r.sourceType}, ${r.severity}): ${r.notes}`)
      .join("\n");

    const prompt = [
      `District: ${station.district} (${station.corridor})`,
      `Current Air Quality: AQI ${station.aqi} (${station.statusLabel}), PM2.5 ${station.pm25} ug/m3, PM10 ${station.pm10} ug/m3, NO2 ${station.no2} ppb`,
      `Meteorology: ${station.tempC}C, Wind ${station.windKmh} km/h, Humidity ${station.humidityPct}%, Winter Thermal Inversion: ${station.inversionActive ? `Active (ceiling ${station.inversionCeilingM}m)` : "Cleared"}`,
      `Household Profile: ${PROFILE_DESCRIPTIONS[profileId]}`,
      `Home Context: Living zone ${body.roomSqM ?? 32} m2, HEPA purifier available: ${body.hasHepa === false ? "No" : "Yes"}`,
      `Recent Community Smog Reports:\n${districtReports || "No recent citizen reports in this corridor."}`,
      "",
      "Provide concise, evidence-based winter smog recommendations tailored strictly to this household profile and telemetry.",
    ].join("\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            "You are BreatheWise, a calm, authoritative environmental health and winter smog assistant. Keep recommendations practical, measurable, and specific to winter thermal inversions, PM2.5 infiltration, and low-emission daily choices. Never invent fake sensor readings.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description: "Short 8-12 word action summary for this household.",
              },
              exposureWindow: {
                type: Type.STRING,
                description:
                  "Best lower-pollution time window today based on wind/dispersion, e.g., '13:00–15:00 when boundary wind rises'.",
              },
              outdoorAdvice: {
                type: Type.STRING,
                description:
                  "2-sentence guidance on outdoor activity duration and exertion.",
              },
              indoorProtocol: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "3 concrete indoor air quality steps (ventilation timing, filtration, humidity/cooking exhaust).",
              },
              maskGuidance: {
                type: Type.STRING,
                description:
                  "Specific respirator recommendation (e.g., N95/FFP2 fit or not required at current AQI).",
              },
              commuteRecommendation: {
                type: Type.STRING,
                description:
                  "One low-emission commute or heating adjustment for today.",
              },
            },
            required: [
              "headline",
              "exposureWindow",
              "outdoorAdvice",
              "indoorProtocol",
              "maskGuidance",
              "commuteRecommendation",
            ],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      res.json({
        guidance: {
          ...parsed,
          generatedAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post("/api/gemini/ask", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          "GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini API key to chat with BreatheWise.",
      });
      return;
    }

    const body = req.body as Partial<{
      question: string;
      stationId: string;
      profileId: HouseholdProfileId;
      completedRoutines: string[];
    }>;

    const question = body.question?.trim();
    if (!question) {
      res.status(400).json({ error: "Please enter a question." });
      return;
    }

    const station =
      stations.find((s) => s.id === body.stationId) ?? stations[0];
    const profileId: HouseholdProfileId =
      body.profileId && body.profileId in PROFILE_DESCRIPTIONS
        ? body.profileId
        : "children";

    const contextPrompt = [
      `Active District: ${station.district} — AQI ${station.aqi} (${station.statusLabel}), PM2.5 ${station.pm25} ug/m3, PM10 ${station.pm10} ug/m3, NO2 ${station.no2} ppb, Temp ${station.tempC}C, Wind ${station.windKmh} km/h, Inversion ${station.inversionActive ? `Active at ${station.inversionCeilingM}m` : "Inactive"}.`,
      `Household Profile: ${PROFILE_DESCRIPTIONS[profileId]}`,
      `Completed Low-Emission Routines Today: ${body.completedRoutines?.length ? body.completedRoutines.join(", ") : "None logged yet"}`,
      "",
      `User Question: ${question}`,
    ].join("\n");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: contextPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            "You are BreatheWise, a clear, empathetic winter smog and indoor air quality advisor for families and communities. Give direct, actionable answers in 3-5 concise sentences or crisp bullet points. Ground advice in the provided district AQI/PM2.5 metrics and household profile. If symptoms are severe (wheezing, chest pain), remind the user to seek medical care.",
        },
      });

      res.json({
        answer:
          response.text?.trim() ||
          "Unable to generate a response for that question right now.",
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`BreatheWise server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start BreatheWise server:", err);
  process.exit(1);
});
