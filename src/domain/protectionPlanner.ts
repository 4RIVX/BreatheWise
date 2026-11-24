import type { IndianAqiCategory } from "./indianAqi.ts";
import type { HouseholdContext } from "./schemas.ts";

export interface DailyProtectionStep {
  id: string;
  timeWindow: string;
  title: string;
  rationale: string;
  priority: "Essential" | "Recommended" | "Optional";
}

export interface HouseholdRecommendationPlan {
  riskTier: "Unknown" | "Low" | "Moderate" | "Elevated" | "High";
  maskRecommended: boolean;
  maskNote: string;
  ventilationWindowNote: string;
  steps: DailyProtectionStep[];
}

export function buildDailyProtectionPlan(params: {
  aqi: number | null;
  category: IndianAqiCategory | null;
  pm25: number | null;
  windKmh: number | null;
  bestWindowLabel: string | null;
  household: HouseholdContext;
}): HouseholdRecommendationPlan {
  const { aqi, category, pm25, windKmh, bestWindowLabel, household } = params;

  const effectiveSeverity =
    aqi !== null
      ? aqi
      : pm25 !== null
        ? pm25 <= 30
          ? 45
          : pm25 <= 60
            ? 85
            : pm25 <= 90
              ? 150
              : pm25 <= 120
                ? 240
                : 340
        : null;

  let riskTier: "Unknown" | "Low" | "Moderate" | "Elevated" | "High";
  if (effectiveSeverity === null) {
    riskTier = "Unknown";
  } else if (effectiveSeverity <= 50) {
    riskTier = "Low";
  } else if (effectiveSeverity <= 100) {
    riskTier = "Moderate";
  } else if (effectiveSeverity <= 200) {
    riskTier = "Elevated";
  } else {
    riskTier = "High";
  }

  const isVulnerable =
    household.profileId === "children" ||
    household.profileId === "respiratory" ||
    household.profileId === "seniors";

  const maskRecommended =
    riskTier === "High" ||
    riskTier === "Unknown" ||
    (riskTier === "Elevated" &&
      (isVulnerable || household.profileId === "commuter"));

  const maskNote =
    riskTier === "Unknown"
      ? "Air-quality data is currently unavailable. Exercise caution: keep a well-fitted N95/FFP2 respirator handy if travelling along congested roads or if visible haze or odor is detected."
      : maskRecommended
        ? "Wear a well-fitted N95 or FFP2 respirator outdoors along busy roads or during peak morning/evening haze."
        : riskTier === "Moderate" && isVulnerable
          ? "Keep an N95/FFP2 respirator handy for prolonged roadside commutes or sudden local smoke."
          : "Masking is generally not required outdoors at current estimated levels unless near active dust or smoke.";

  const ventilationWindowNote =
    riskTier === "Unknown"
      ? "Air-quality data is currently unavailable. Inspect outdoor atmospheric visibility and check for local smoke before opening windows, and prioritize mechanical kitchen exhaust during cooking."
      : riskTier === "High" || riskTier === "Elevated"
        ? bestWindowLabel
          ? `Keep windows closed during stagnant morning/night hours; ventilate briefly around ${bestWindowLabel} if outdoor haze visibly clears.`
          : "Limit window opening during calm mornings and evenings; rely on indoor exhaust fans during cooking."
        : windKmh !== null && windKmh >= 10
          ? "Boundary wind supports short cross-ventilation flushes to refresh indoor CO2."
          : "Open windows only when current verified air-quality and local visibility readings show clean outdoor air.";

  const steps: DailyProtectionStep[] = [
    {
      id: "morning-check",
      timeWindow: "06:30 – 09:30",
      title:
        riskTier === "High" || riskTier === "Elevated"
          ? "Shift strenuous outdoor activity indoors"
          : "Check local station & forecast before departure",
      rationale:
        category !== null
          ? `Current Indian AQI category is ${category}; early morning boundary-layer stability often concentrates ground-level traffic and combustion smoke.`
          : "Early morning thermal stability frequently traps traffic and biomass smoke near street level.",
      priority:
        riskTier === "High" || riskTier === "Elevated"
          ? "Essential"
          : "Recommended",
    },
    {
      id: "commute-step",
      timeWindow: "08:30 – 10:30",
      title:
        household.commutePreference === "car" ||
        household.commutePreference === "carpool"
          ? "Switch vehicle climate control to cabin recirculation on arterial corridors"
          : household.commutePreference === "metro_rail"
            ? "Use enclosed metro rail and avoid idling roadside queues"
            : "Prefer lower-traffic side streets away from heavy diesel corridors",
      rationale:
        "Roadside concentrations of NO2 and ultrafine particles peak within 30 m of congested intersections.",
      priority: maskRecommended ? "Essential" : "Recommended",
    },
    {
      id: "ventilation-window",
      timeWindow: bestWindowLabel
        ? `${bestWindowLabel} (Forecast Low PM2.5)`
        : "Verify Local Air",
      title: bestWindowLabel
        ? `Consider brief cross-ventilation around ${bestWindowLabel} if local O3/NO2 and visible haze are also low`
        : ventilationWindowNote,
      rationale: bestWindowLabel
        ? "This window marks Open-Meteo's modelled regional minimum for PM2.5 rather than guaranteed clean air—afternoon ozone (O3) or roadside NO2 can still peak independently, and model forecasts carry local grid uncertainty."
        : "Rely on verified ground station readings and visual smoke checks before opening exterior windows.",
      priority: "Recommended",
    },
    {
      id: "cooking-exhaust",
      timeWindow: "Meal Preparation",
      title: household.hasHepaPurifier
        ? "Run kitchen exhaust hood and keep HEPA purifier in active living room"
        : "Run kitchen exhaust fan and crack an adjacent window during high-heat cooking",
      rationale:
        "Frying, tadka/tempering, and unvented combustion generate intense indoor PM2.5 and NO2 spikes regardless of outdoor air.",
      priority: "Essential",
    },
    {
      id: "evening-seal",
      timeWindow: "18:30 – 22:30",
      title: isVulnerable
        ? "Close exterior doors/windows and avoid outdoor exertion for sensitive family members"
        : "Monitor evening haze and avoid burning household waste or incense",
      rationale:
        "Evening cooling slows dispersion while residential cooking and evening traffic add local particulates.",
      priority: isVulnerable ? "Essential" : "Recommended",
    },
  ];

  return {
    riskTier,
    maskRecommended,
    maskNote,
    ventilationWindowNote,
    steps,
  };
}
