import test from "node:test";
import assert from "node:assert/strict";
import { calculateIndianAqi } from "./indianAqi";
import { calculateIndoorAirMetrics } from "./indoorAir";
import { calculateEcoImpact } from "./ecoImpact";

test("pure domain calculations: Indian AQI, Indoor ACH, and Eco Impact", () => {
  const aqi = calculateIndianAqi([
    {
      code: "PM2.5",
      concentration: 60,
      unit: "ug/m3",
      averagingPeriodHours: 24,
      sampleHoursCount: 24,
    },
    {
      code: "PM10",
      concentration: 100,
      unit: "ug/m3",
      averagingPeriodHours: 24,
      sampleHoursCount: 24,
    },
    {
      code: "NO2",
      concentration: 40,
      unit: "ug/m3",
      averagingPeriodHours: 24,
      sampleHoursCount: 24,
    },
  ]);
  assert.equal(aqi.calculable, true);
  assert.equal(aqi.aqi, 100);
  assert.equal(aqi.category, "Satisfactory");

  const indoor = calculateIndoorAirMetrics({
    lengthM: 5,
    widthM: 4,
    heightM: 3,
    purifierCadr: 300,
    cadrUnit: "m3h",
    desiredAch: 5,
  });
  assert.equal(indoor.roomVolumeM3, 60);
  assert.equal(indoor.effectiveAch, 5);
  assert.equal(indoor.meetsDesiredAch, true);

  const eco = calculateEcoImpact({
    distanceKm: 10,
    originalMode: "car_petrol",
    alternativeMode: "metro_rail",
    journeys: 10,
  });
  assert.equal(eco.co2eAvoidedKg, 14.7);
  assert.equal(eco.vehicleTripsAvoided, 10);
});
