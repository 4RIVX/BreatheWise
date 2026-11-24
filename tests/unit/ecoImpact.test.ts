import { describe, expect, it } from "vitest";
import {
  calculateEcoImpact,
  EMISSION_FACTORS_INDIA,
} from "../../src/domain/ecoImpact";

describe("India Mobility Emission Factors & Eco Impact", () => {
  it("exposes documented source, year, units, and limitations for every transport mode", () => {
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
    }
  });

  it("calculates mixed-scope CO2 / CO2e avoided and warns when shifting from petrol car to metro rail", () => {
    const res = calculateEcoImpact({
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "metro_rail",
      originalOccupancy: 1,
      journeys: 20,
    });

    expect(res.totalDistanceKm).toBe(200);
    expect(res.originalEmissionsKg).toBe(34.2);
    expect(res.originalEmissionsMetric).toBe("CO2e");
    expect(res.alternativeEmissionsKg).toBe(4.8);
    expect(res.alternativeEmissionsMetric).toBe("CO2");
    expect(res.emissionsAvoidedKg).toBe(29.4);
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2 / CO2e (mixed scope)");
    expect(res.scopeWarning).toContain("cross-scope comparison");
    expect(res.vehicleTripsAvoided).toBe(20);
    expect(res.communityImpactDistinction).toContain(
      "Individual commute changes alone"
    );
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
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2 / CO2e (mixed scope)");
    expect(res.scopeWarning).not.toBeNull();
  });

  it("scales per-passenger CO2e and vehicle trips avoided when carpooling without mixed-scope warning", () => {
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
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2e");
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
    expect(res.emissionsAvoidedMetricLabel).toBe("CO2e");
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
