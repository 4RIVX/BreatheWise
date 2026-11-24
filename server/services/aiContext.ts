import type {
  HouseholdContext,
  VerifiedAirContext,
} from "../../src/domain/schemas.ts";

export const PROFILE_LABELS: Record<HouseholdContext["profileId"], string> = {
  children: "Family with children (school commute, outdoor play thresholds)",
  respiratory:
    "Respiratory-sensitive household (asthma/COPD sensitivity, strict exposure reduction)",
  seniors: "Older adults (cardiopulmonary caution during peak haze)",
  commuter: "Daily urban commuter (transit/roadside corridor mitigation)",
  general: "General urban household (practical daily outdoor & indoor steps)",
};

export function sanitizeUserQuestion(raw: string): string {
  // Strip control characters and neutralize prompt-override framing markers
  const noControl = Array.from(raw)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 ? " " : ch;
    })
    .join("");
  return noControl.replace(/```/g, "").trim().slice(0, 500);
}

export function sanitizeProviderError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  let normalized = raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (parsed?.error?.message) {
        const prefix = [parsed.error.code, parsed.error.status]
          .filter(Boolean)
          .join(" ");
        normalized = prefix
          ? `HTTP ${prefix}: ${parsed.error.message}`
          : parsed.error.message;
      }
    } catch {
      // Keep raw string if not JSON
    }
  }
  return normalized
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/gsk_[0-9A-Za-z_-]{10,}/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+[0-9A-Za-z._-]+/gi, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

export function buildContextSummary(
  airContext: VerifiedAirContext,
  household: HouseholdContext
): string {
  const lines: string[] = [
    `LOCATION: ${airContext.locationLabel}${airContext.state ? `, ${airContext.state}` : ""}`,
    airContext.measuredSourceAvailable
      ? `OFFICIAL CPCB STATION (${airContext.measuredStationName ?? "Unnamed"}): AQI ${airContext.measuredAqi ?? "Unavailable"} (${airContext.measuredAqiCategory ?? "N/A"}), Timestamp: ${airContext.measuredTimestamp ?? "Unknown"}`
      : "OFFICIAL CPCB STATION: Unavailable (do NOT fabricate station measurements).",
    `MODELLED OPEN-METEO FORECAST (Simulated, NOT a monitoring station): Timestamp ${airContext.modelledTimestamp ?? "Unknown"}, PM2.5 ${airContext.modelledPm25 ?? "N/A"} ug/m3, PM10 ${airContext.modelledPm10 ?? "N/A"} ug/m3, NO2 ${airContext.modelledNo2 ?? "N/A"} ug/m3, SO2 ${airContext.modelledSo2 ?? "N/A"} ug/m3, Ozone ${airContext.modelledOzone ?? "N/A"} ug/m3, CO ${airContext.modelledCoUgm3 ?? "N/A"} ug/m3, Modelled 24h/8h Indian AQI Estimate ${airContext.modelledAqiEstimate ?? "Not calculable"}.`,
    `METEOROLOGY: Temp ${airContext.temperatureC ?? "N/A"} C, Humidity ${airContext.humidityPct ?? "N/A"}%, Wind ${airContext.windKmh ?? "N/A"} km/h, Boundary Layer Height ${airContext.boundaryLayerHeightM ?? "N/A"} m, Lower-PM2.5 Forecast Window: ${airContext.bestForecastWindow ?? "Not determined"}.`,
    `DATA LIMITATIONS: ${airContext.dataLimitations ?? "Modelled forecasts represent regional grid averages rather than street-level sensors."}`,
    `HOUSEHOLD PROFILE: ${PROFILE_LABELS[household.profileId]}; Household size: ${household.householdSize}; Commute: ${household.commutePreference}; Outdoor preference: ${household.outdoorSchedule}; HEPA purifier available: ${household.hasHepaPurifier ? `Yes (${household.purifierCadrM3h} m3/h)` : "No"}.`,
    `RESPONSE LANGUAGE: ${household.language === "ta" ? "Tamil (தமிழ்) with clear everyday phrasing" : "English"}.`,
  ];
  return lines.join("\n");
}

export function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Response did not contain a valid JSON object.");
  }
}
