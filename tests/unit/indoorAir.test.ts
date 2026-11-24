import { describe, expect, it } from "vitest";
import {
  calculateIndoorAirMetrics,
  cfmToM3h,
  m3hToCfm,
} from "../../src/domain/indoorAir";

describe("Indoor Air Coach CADR & ACH calculations", () => {
  it("converts accurately between CFM and m3/h", () => {
    expect(cfmToM3h(100)).toBeCloseTo(169.9, 2);
    expect(m3hToCfm(340)).toBeCloseTo(200.12, 2);
  });

  it("computes room volume, required CADR, effective ACH, and shortfall", () => {
    const res = calculateIndoorAirMetrics({
      lengthM: 5,
      widthM: 4,
      heightM: 3,
      purifierCadr: 240,
      cadrUnit: "m3h",
      desiredAch: 5,
    });

    expect(res.roomFloorAreaM2).toBe(20);
    expect(res.roomVolumeM3).toBe(60);
    expect(res.requiredCadrM3h).toBe(300);
    expect(res.effectiveAch).toBe(4);
    expect(res.meetsDesiredAch).toBe(false);
    expect(res.cadrGapM3h).toBe(60);
    expect(res.disclaimer).toContain(
      "does not measure or predict actual indoor PM2.5"
    );
  });

  it("handles CFM input and identifies compliant purifier capacity", () => {
    const res = calculateIndoorAirMetrics({
      lengthM: 4,
      widthM: 4,
      heightM: 2.5,
      purifierCadr: 200,
      cadrUnit: "cfm",
      desiredAch: 5,
    });

    // 40 m3 * 5 ACH = 200 m3/h required; 200 CFM = 339.8 m3/h -> 8.5 ACH
    expect(res.roomVolumeM3).toBe(40);
    expect(res.cadrM3h).toBeCloseTo(339.8, 1);
    expect(res.meetsDesiredAch).toBe(true);
    expect(res.cadrGapM3h).toBe(0);
  });

  it("rejects non-positive room dimensions or desired ACH", () => {
    expect(() =>
      calculateIndoorAirMetrics({
        lengthM: 0,
        widthM: 4,
        heightM: 3,
        purifierCadr: 200,
        cadrUnit: "m3h",
        desiredAch: 4,
      })
    ).toThrowError();

    expect(() =>
      calculateIndoorAirMetrics({
        lengthM: 4,
        widthM: 4,
        heightM: 3,
        purifierCadr: -10,
        cadrUnit: "m3h",
        desiredAch: 4,
      })
    ).toThrowError();
  });
});
