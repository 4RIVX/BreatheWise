import { describe, expect, it } from "vitest";
import { buildDailyProtectionPlan } from "../../src/domain/protectionPlanner";
import type { HouseholdContext } from "../../src/domain/schemas";

const BASE_HOUSEHOLD: HouseholdContext = {
  profileId: "respiratory",
  householdSize: 3,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: true,
  purifierCadrM3h: 300,
  language: "en",
};

describe("Personalized Daily Protection Planner", () => {
  it("escalates to High risk tier and recommends N95/FFP2 masking above AQI 200", () => {
    const plan = buildDailyProtectionPlan({
      aqi: 265,
      category: "Poor",
      pm25: 110,
      windKmh: 4,
      bestWindowLabel: "13:00–15:00 IST",
      household: BASE_HOUSEHOLD,
    });

    expect(plan.riskTier).toBe("High");
    expect(plan.maskRecommended).toBe(true);
    expect(plan.maskNote).toContain("N95");
    expect(plan.steps).toHaveLength(5);
  });

  it("recommends masking at Elevated risk (Moderate AQI 101-200) for vulnerable households", () => {
    const plan = buildDailyProtectionPlan({
      aqi: 145,
      category: "Moderate",
      pm25: 72,
      windKmh: 9,
      bestWindowLabel: "14:00–16:00 IST",
      household: BASE_HOUSEHOLD,
    });

    expect(plan.riskTier).toBe("Elevated");
    expect(plan.maskRecommended).toBe(true);
  });

  it("keeps Low risk tier and avoids mandatory masking when AQI is Good", () => {
    const plan = buildDailyProtectionPlan({
      aqi: 38,
      category: "Good",
      pm25: 14,
      windKmh: 16,
      bestWindowLabel: "12:00–14:00 IST",
      household: { ...BASE_HOUSEHOLD, profileId: "general" },
    });

    expect(plan.riskTier).toBe("Low");
    expect(plan.maskRecommended).toBe(false);
    expect(plan.ventilationWindowNote).toContain("cross-ventilation");
  });

  it("treats unavailable data as Unknown risk tier with cautionary guidance instead of defaulting to Moderate", () => {
    const plan = buildDailyProtectionPlan({
      aqi: null,
      category: null,
      pm25: null,
      windKmh: null,
      bestWindowLabel: null,
      household: { ...BASE_HOUSEHOLD, profileId: "general" },
    });

    expect(plan.riskTier).toBe("Unknown");
    expect(plan.maskRecommended).toBe(true);
    expect(plan.maskNote).toContain("Air-quality data is currently unavailable");
    expect(plan.ventilationWindowNote).toContain("Air-quality data is currently unavailable");
  });
});
