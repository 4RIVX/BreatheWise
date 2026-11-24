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

  it("calculates CO2e avoided and trips displaced when shifting from petrol car to metro rail", () => {
    const res = calculateEcoImpact({
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "metro_rail",
      originalOccupancy: 1,
      journeys: 20,
    });

    expect(res.totalDistanceKm).toBe(200);
    expect(res.originalCo2eKg).toBe(34.2);
    expect(res.alternativeCo2eKg).toBe(4.8);
    expect(res.co2eAvoidedKg).toBe(29.4);
    expect(res.vehicleTripsAvoided).toBe(20);
    expect(res.communityImpactDistinction).toContain(
      "Individual commute changes alone"
    );
  });

  it("scales per-passenger CO2e and vehicle trips avoided when carpooling", () => {
    const res = calculateEcoImpact({
      distanceKm: 10,
      originalMode: "car_petrol",
      alternativeMode: "car_petrol",
      originalOccupancy: 1,
      alternativeOccupancy: 2,
      journeys: 10,
    });

    expect(res.originalCo2eKg).toBe(17.1);
    expect(res.alternativeCo2eKg).toBe(8.55);
    expect(res.co2eAvoidedKg).toBe(8.55);
    expect(res.vehicleTripsAvoided).toBe(5);
  });

  it("distinguishes personal respiratory exposure for cycling", () => {
    const res = calculateEcoImpact({
      distanceKm: 5,
      originalMode: "two_wheeler_petrol",
      alternativeMode: "bicycle_walk",
      journeys: 4,
    });

    expect(res.alternativeCo2eKg).toBe(0);
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
