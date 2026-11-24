import { describe, expect, it } from "vitest";
import {
  calculateEcoImpact,
  EMISSION_FACTORS_INDIA,
  resolveDifferenceScope,
} from "../../src/domain/ecoImpact";

describe("India Mobility Emission Factors & Eco Impact", () => {
  it("exposes documented source, year, units, CO2 scope, and limitations for every transport mode", () => {
    for (const factor of Object.values(EMISSION_FACTORS_INDIA)) {
      expect(factor.source.length).toBeGreaterThan(5);
      expect(factor.sourceUrl.startsWith("https://")).toBe(true);
      expect(factor.publisher.length).toBeGreaterThan(3);
      expect(factor.pageOrTableRef.length).toBeGreaterThan(3);
      expect(factor.pollutantScope.length).toBeGreaterThan(3);
      expect(factor.publicationYear).toBeGreaterThanOrEqual(2006);
      expect(factor.units.length).toBeGreaterThan(5);
      expect(factor.limitations.length).toBeGreaterThan(5);
      expect(factor.factorVersion.length).toBeGreaterThan(3);
      if (factor.modeId === "bicycle_walk") {
        expect(factor.ghgMetric).toBe("ZERO");
      } else {
        expect(factor.ghgMetric).toBe("CO2");
      }
    }
  });

  it("uses updated WRI India 2015 CO2 and CEA v22.0 (0.675 kg CO2/kWh) factors accurately and labels electricity assumptions as illustrative", () => {
    expect(EMISSION_FACTORS_INDIA.auto_cng.kgEmissionsPerPassengerKm).toBe(
      0.10768
    );
    expect(EMISSION_FACTORS_INDIA.suburban_rail.kgEmissionsPerPassengerKm).toBe(
      0.007976
    );
    expect(
      EMISSION_FACTORS_INDIA.city_bus_diesel.kgEmissionsPerPassengerKm
    ).toBe(0.015161);
    expect(EMISSION_FACTORS_INDIA.car_ev.kgEmissionsPerPassengerKm).toBe(0.108);
    expect(
      EMISSION_FACTORS_INDIA.city_bus_electric.kgEmissionsPerPassengerKm
    ).toBe(0.017);
    expect(EMISSION_FACTORS_INDIA.metro_rail.kgEmissionsPerPassengerKm).toBe(
      0.023
    );

    // Direct WRI / IPCC modes are NOT illustrative electricity derivations
    expect(EMISSION_FACTORS_INDIA.car_petrol.isIllustrativeEstimate).toBe(
      false
    );
    expect(EMISSION_FACTORS_INDIA.city_bus_diesel.isIllustrativeEstimate).toBe(
      false
    );
    expect(EMISSION_FACTORS_INDIA.suburban_rail.isIllustrativeEstimate).toBe(
      false
    );

    // Electricity-based modes explicitly separate verified CEA grid factor from illustrative vehicle draw/occupancy assumptions
    for (const evMode of [
      EMISSION_FACTORS_INDIA.car_ev,
      EMISSION_FACTORS_INDIA.city_bus_electric,
      EMISSION_FACTORS_INDIA.metro_rail,
    ]) {
      expect(evMode.isIllustrativeEstimate).toBe(true);
      expect(evMode.verifiedGridFactorNote).toContain("0.675 kg CO2/kWh");
      expect(evMode.assumptionNote).toContain("not established by CEA");
      expect(evMode.source).toContain("Illustrative Estimate");
    }
  });

  it("calculates consistent CO2 avoided when shifting from petrol car to metro rail (CEA v22.0)", () => {
    const res = calculateEcoImpact({
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "metro_rail",
      originalOccupancy: 1,
      journeys: 20,
    });

    expect(res.totalDistanceKm).toBe(200);
    expect(res.originalEmissionsKg).toBe(34.2);
    expect(res.originalEmissionsMetric).toBe("CO2");
    expect(res.alternativeEmissionsKg).toBe(4.6);
    expect(res.alternativeEmissionsMetric).toBe("CO2");
    expect(res.emissionsAvoidedKg).toBe(29.6);
    expect(res.isScopeIncompatible).toBe(false);
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2");
    expect(res.scopeWarning).toBeNull();
    expect(res.vehicleTripsAvoided).toBe(20);
    expect(res.communityImpactDistinction).toContain(
      "Individual commute changes alone"
    );
  });

  it("refuses to subtract incompatible CO2 and CO2e scopes and returns emissionsAvoidedKg: null", () => {
    const scopeCheck = resolveDifferenceScope("CO2", "CO2e");
    expect(scopeCheck.incompatible).toBe(true);
    expect(scopeCheck.label).toBe("Incompatible scopes (CO2 vs CO2e)");
    expect(scopeCheck.warning).toContain("cannot be subtracted");

    const origMetric = EMISSION_FACTORS_INDIA.metro_rail.ghgMetric;
    try {
      EMISSION_FACTORS_INDIA.metro_rail.ghgMetric = "CO2e";
      const mixed = calculateEcoImpact({
        distanceKm: 10,
        originalMode: "car_petrol",
        alternativeMode: "metro_rail",
        journeys: 10,
      });
      expect(mixed.isScopeIncompatible).toBe(true);
      expect(mixed.emissionsAvoidedKg).toBeNull();
      expect(mixed.originalEmissionsKg).toBe(17.1);
      expect(mixed.alternativeEmissionsKg).toBe(2.3);
      expect(mixed.scopeWarning).toContain("Incompatible GHG Scopes");
    } finally {
      EMISSION_FACTORS_INDIA.metro_rail.ghgMetric = origMetric;
    }
  });

  it("tracks city_bus_diesel as CO2-only (0.015161 kg CO2/p-km) with explicit scope metadata", () => {
    const busFactor = EMISSION_FACTORS_INDIA.city_bus_diesel;
    expect(busFactor.kgEmissionsPerPassengerKm).toBe(0.015161);
    expect(busFactor.ghgMetric).toBe("CO2");
    expect(busFactor.units).toContain("kg CO2");

    const res = calculateEcoImpact({
      distanceKm: 20,
      originalMode: "car_petrol",
      alternativeMode: "city_bus_diesel",
      journeys: 5,
    });
    expect(res.alternativeEmissionsMetric).toBe("CO2");
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2");
    expect(res.scopeWarning).toBeNull();
  });

  it("scales per-passenger CO2 and vehicle trips avoided when carpooling", () => {
    const res = calculateEcoImpact({
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "car_petrol",
      originalOccupancy: 1,
      alternativeOccupancy: 2,
      journeys: 10,
    });

    expect(res.originalEmissionsKg).toBe(17.1);
    expect(res.alternativeEmissionsKg).toBe(8.55);
    expect(res.emissionsAvoidedKg).toBe(8.55);
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2");
    expect(res.scopeWarning).toBeNull();
    expect(res.vehicleTripsAvoided).toBe(5);
  });

  it("distinguishes personal respiratory exposure for cycling", () => {
    const res = calculateEcoImpact({
      distanceKm: 5,
      originalMode: "two_wheeler_petrol",
      alternativeMode: "bicycle_walk",
      journeys: 4,
    });

    expect(res.alternativeEmissionsKg).toBe(0);
    expect(res.alternativeEmissionsMetric).toBe("ZERO");
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2");
    expect(res.personalExposureDistinction).toContain("N95/FFP2");
  });

  it("rejects invalid distance or journey counts", () => {
    expect(() =>
      calculateEcoImpact({
        distanceKm: 0,
        originalMode: "car_petrol",
        alternativeMode: "metro_rail",
        journeys: 1,
      })
    ).toThrowError();
  });
});
