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
  riskTier: "Low" | "Moderate" | "Elevated" | "High";
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

  let riskTier: "Low" | "Moderate" | "Elevated" | "High";
  if (effectiveSeverity === null) {
    riskTier = "Moderate";
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
    (riskTier === "Elevated" &&
      (isVulnerable || household.profileId === "commuter"));

  const maskNote = maskRecommended
    ? "Wear a well-fitted N95 or FFP2 respirator outdoors along busy roads or during peak morning/evening haze."
    : riskTier === "Moderate" && isVulnerable
      ? "Keep an N95/FFP2 respirator handy for prolonged roadside commutes or sudden local smoke."
      : "Masking is generally not required outdoors at current estimated levels unless near active dust or smoke.";

  const ventilationWindowNote =
    riskTier === "High" || riskTier === "Elevated"
      ? bestWindowLabel
        ? `Keep windows closed during stagnant morning/night hours; ventilate briefly around ${bestWindowLabel} if outdoor haze visibly clears.`
        : "Limit window opening during calm mornings and evenings; rely on indoor exhaust fans during cooking."
      : windKmh !== null && windKmh >= 10
        ? "Boundary wind supports short cross-ventilation flushes to refresh indoor CO2."
        : "Open windows briefly during midday hours when outdoor particulate readings are lowest.";

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
      id: "midday-vent",
      timeWindow: bestWindowLabel ?? "12:30 – 15:30",
      title: bestWindowLabel
        ? `Ventilate briefly around ${bestWindowLabel} when forecast PM2.5 is lowest`
        : ventilationWindowNote,
      rationale:
        "Ventilating during the forecast minimum PM2.5 window refreshes indoor air while minimizing outdoor particulate ingress.",
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
