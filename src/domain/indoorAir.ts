export type CadrUnit = "m3h" | "cfm";

export interface IndoorAirInput {
  lengthM: number;
  widthM: number;
  heightM: number;
  purifierCadr: number;
  cadrUnit: CadrUnit;
  desiredAch: number;
}

export interface IndoorAirCalculation {
  roomFloorAreaM2: number;
  roomVolumeM3: number;
  cadrM3h: number;
  cadrCfm: number;
  requiredCadrM3h: number;
  requiredCadrCfm: number;
  effectiveAch: number;
  meetsDesiredAch: boolean;
  cadrGapM3h: number;
  formulas: {
    volume: string;
    requiredCadr: string;
    effectiveAch: string;
    unitConversion: string;
  };
  disclaimer: string;
}

// Standard volumetric flow conversion: 1 CFM = 1.6990108 m3/h
export const CFM_TO_M3H = 1.6990108;
export const M3H_TO_CFM = 1 / CFM_TO_M3H;

export function cfmToM3h(cfm: number): number {
  if (!Number.isFinite(cfm) || cfm < 0) {
    throw new Error("CADR in CFM must be a non-negative finite number.");
  }
  return Number((cfm * CFM_TO_M3H).toFixed(2));
}

export function m3hToCfm(m3h: number): number {
  if (!Number.isFinite(m3h) || m3h < 0) {
    throw new Error("CADR in m3/h must be a non-negative finite number.");
  }
  return Number((m3h * M3H_TO_CFM).toFixed(2));
}

export function calculateIndoorAirMetrics(
  input: IndoorAirInput
): IndoorAirCalculation {
  const { lengthM, widthM, heightM, purifierCadr, cadrUnit, desiredAch } =
    input;

  if (
    !Number.isFinite(lengthM) ||
    lengthM <= 0 ||
    !Number.isFinite(widthM) ||
    widthM <= 0 ||
    !Number.isFinite(heightM) ||
    heightM <= 0
  ) {
    throw new Error("Room length, width, and ceiling height must be positive.");
  }

  if (!Number.isFinite(purifierCadr) || purifierCadr < 0) {
    throw new Error("Purifier CADR must be zero or positive.");
  }

  if (!Number.isFinite(desiredAch) || desiredAch <= 0) {
    throw new Error("Desired ACH must be positive.");
  }

  const roomFloorAreaM2 = Number((lengthM * widthM).toFixed(2));
  const roomVolumeM3 = Number((lengthM * widthM * heightM).toFixed(2));

  const cadrM3h =
    cadrUnit === "cfm"
      ? cfmToM3h(purifierCadr)
      : Number(purifierCadr.toFixed(2));
  const cadrCfm =
    cadrUnit === "cfm"
      ? Number(purifierCadr.toFixed(2))
      : m3hToCfm(purifierCadr);

  const requiredCadrM3h = Number((roomVolumeM3 * desiredAch).toFixed(2));
  const requiredCadrCfm = m3hToCfm(requiredCadrM3h);
  const effectiveAch = Number((cadrM3h / roomVolumeM3).toFixed(2));
  const meetsDesiredAch = effectiveAch >= desiredAch;
  const cadrGapM3h = Number(Math.max(0, requiredCadrM3h - cadrM3h).toFixed(2));

  return {
    roomFloorAreaM2,
    roomVolumeM3,
    cadrM3h,
    cadrCfm,
    requiredCadrM3h,
    requiredCadrCfm,
    effectiveAch,
    meetsDesiredAch,
    cadrGapM3h,
    formulas: {
      volume: `${lengthM} m × ${widthM} m × ${heightM} m = ${roomVolumeM3} m³`,
      requiredCadr: `${roomVolumeM3} m³ × ${desiredAch} ACH = ${requiredCadrM3h} m³/h (${requiredCadrCfm} CFM)`,
      effectiveAch: `${cadrM3h} m³/h ÷ ${roomVolumeM3} m³ = ${effectiveAch} ACH`,
      unitConversion: "1 CFM = 1.699 m³/h (1 m³/h ≈ 0.5886 CFM)",
    },
    disclaimer:
      "This calculator computes theoretical Clean Air Delivery Rate (CADR) and Air Changes per Hour (ACH) under well-mixed room assumptions. It does not measure or predict actual indoor PM2.5 concentrations, which depend on infiltration, indoor sources, and room sealing.",
  };
}
