import { describe, expect, it } from "vitest";
import {
  calculateIndianAqi,
  calculatePollutantSubIndex,
  computeRollingAverage,
  getIndianAqiCategory,
  isDataStale,
  normalizePollutantConcentration,
} from "../../src/domain/indianAqi";

describe("Indian National AQI Methodology (CPCB)", () => {
  it("maps category thresholds accurately across all six official bands", () => {
    expect(getIndianAqiCategory(0)).toBe("Good");
    expect(getIndianAqiCategory(50)).toBe("Good");
    expect(getIndianAqiCategory(51)).toBe("Satisfactory");
    expect(getIndianAqiCategory(100)).toBe("Satisfactory");
    expect(getIndianAqiCategory(101)).toBe("Moderate");
    expect(getIndianAqiCategory(200)).toBe("Moderate");
    expect(getIndianAqiCategory(201)).toBe("Poor");
    expect(getIndianAqiCategory(300)).toBe("Poor");
    expect(getIndianAqiCategory(301)).toBe("Very Poor");
    expect(getIndianAqiCategory(400)).toBe("Very Poor");
    expect(getIndianAqiCategory(401)).toBe("Severe");
    expect(getIndianAqiCategory(500)).toBe("Severe");
  });

  it("computes pollutant sub-indices using official CPCB breakpoints", () => {
    expect(calculatePollutantSubIndex("PM2.5", 30)).toBe(50);
    expect(calculatePollutantSubIndex("PM2.5", 60)).toBe(100);
    expect(calculatePollutantSubIndex("PM2.5", 90)).toBe(200);
    expect(calculatePollutantSubIndex("PM2.5", 120)).toBe(300);
    expect(calculatePollutantSubIndex("PM2.5", 250)).toBe(400);
    expect(calculatePollutantSubIndex("PM2.5", 600)).toBe(500);

    expect(calculatePollutantSubIndex("PM10", 100)).toBe(100);
    expect(calculatePollutantSubIndex("NO2", 40)).toBe(50);
    expect(calculatePollutantSubIndex("SO2", 80)).toBe(100);
    expect(calculatePollutantSubIndex("CO", 2.0)).toBe(100);
    expect(calculatePollutantSubIndex("O3", 100)).toBe(100);
    expect(calculatePollutantSubIndex("NH3", 400)).toBe(100);
    expect(calculatePollutantSubIndex("PB", 1.0)).toBe(100);
  });

  it("normalizes units properly for CO (mg/m3) and gaseous pollutants (ug/m3)", () => {
    const coFromUg = normalizePollutantConcentration("CO", 2000, "ug/m3");
    expect(coFromUg.unit).toBe("mg/m3");
    expect(coFromUg.value).toBeCloseTo(2, 4);

    const coFromPpm = normalizePollutantConcentration("CO", 1, "ppm");
    expect(coFromPpm.unit).toBe("mg/m3");
    expect(coFromPpm.value).toBeCloseTo(28.0101 / 24.45, 3);

    const no2FromPpb = normalizePollutantConcentration("NO2", 40, "ppb");
    expect(no2FromPpb.unit).toBe("ug/m3");
    expect(no2FromPpb.value).toBeCloseTo((40 * 46.0055) / 24.45, 3);

    expect(() =>
      normalizePollutantConcentration("PM2.5", 20, "ppb")
    ).toThrowError();
  });

  it("refuses to calculate official AQI when fewer than 3 pollutants are available", () => {
    const result = calculateIndianAqi([
      {
        code: "PM2.5",
        concentration: 85,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
      {
        code: "PM10",
        concentration: 140,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
    ]);

    expect(result.calculable).toBe(false);
    expect(result.aqi).toBeNull();
    expect(result.subIndices).toHaveLength(2);
    expect(result.reasonIfNotCalculable).toContain(
      "at least 3 valid pollutants"
    );
  });

  it("refuses to calculate official AQI when neither PM2.5 nor PM10 is present", () => {
    const result = calculateIndianAqi([
      {
        code: "NO2",
        concentration: 45,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
      {
        code: "SO2",
        concentration: 20,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
      {
        code: "CO",
        concentration: 1.5,
        unit: "mg/m3",
        averagingPeriodHours: 8,
        sampleHoursCount: 8,
      },
    ]);

    expect(result.calculable).toBe(false);
    expect(result.hasParticulate).toBe(false);
    expect(result.reasonIfNotCalculable).toContain("PM2.5 or PM10");
  });

  it("rejects mismatched averaging periods and incomplete hourly windows", () => {
    const result = calculateIndianAqi([
      {
        code: "PM2.5",
        concentration: 70,
        unit: "ug/m3",
        averagingPeriodHours: 8, // wrong: requires 24h
      },
      {
        code: "PM10",
        concentration: 120,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 10, // wrong: < 16h minimum
      },
      {
        code: "NO2",
        concentration: 50,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 20,
      },
    ]);

    expect(result.calculable).toBe(false);
    expect(result.validPollutantCount).toBe(1);
    expect(result.reasonIfNotCalculable).toContain(
      "requires 24-hour averaging"
    );
    expect(result.reasonIfNotCalculable).toContain("minimum 16h required");
  });

  it("calculates official Indian AQI as max sub-index when criteria are met", () => {
    const result = calculateIndianAqi([
      {
        code: "PM2.5",
        concentration: 90,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
      {
        code: "PM10",
        concentration: 100,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 22,
      },
      {
        code: "NO2",
        concentration: 40,
        unit: "ug/m3",
        averagingPeriodHours: 24,
        sampleHoursCount: 24,
      },
      {
        code: "CO",
        concentration: 1000,
        unit: "ug/m3",
        averagingPeriodHours: 8,
        sampleHoursCount: 8,
      },
    ]);

    expect(result.calculable).toBe(true);
    expect(result.aqi).toBe(200);
    expect(result.category).toBe("Moderate");
    expect(result.prominentPollutant).toBe("PM2.5");
    expect(result.validPollutantCount).toBe(4);
  });

  it("computes rolling averages and detects stale measurements", () => {
    const avg = computeRollingAverage([10, 20, null, 30, 40], 4);
    expect(avg.validCount).toBe(3);
    expect(avg.mean).toBe(30);

    const now = new Date("2026-01-15T12:00:00Z");
    const fresh = isDataStale("2026-01-15T11:00:00Z", now, 180);
    expect(fresh.stale).toBe(false);
    expect(fresh.ageMinutes).toBe(60);

    const stale = isDataStale("2026-01-15T06:00:00Z", now, 180);
    expect(stale.stale).toBe(true);
    expect(stale.ageMinutes).toBe(360);
  });
});
