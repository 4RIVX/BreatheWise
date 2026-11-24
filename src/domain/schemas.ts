import { z } from "zod";

export const HouseholdProfileIdSchema = z.enum([
  "children",
  "respiratory",
  "seniors",
  "commuter",
  "general",
]);

export const CommutePreferenceSchema = z.enum([
  "metro_rail",
  "bus",
  "carpool",
  "two_wheeler",
  "car",
  "walk_cycle",
  "remote",
]);

export const OutdoorScheduleSchema = z.enum([
  "early_morning",
  "midday",
  "evening",
  "flexible",
]);

export const HouseholdContextSchema = z.object({
  profileId: HouseholdProfileIdSchema,
  householdSize: z.number().int().min(1).max(20).default(3),
  commutePreference: CommutePreferenceSchema.default("metro_rail"),
  outdoorSchedule: OutdoorScheduleSchema.default("midday"),
  hasHepaPurifier: z.boolean().default(false),
  purifierCadrM3h: z.number().min(0).max(2500).default(0),
  language: z.enum(["en", "ta"]).default("en"),
});

export const AirQualityQuerySchema = z.object({
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const VerifiedAirContextSchema = z.object({
  locationLabel: z.string().trim().min(1).max(120),
  state: z.string().trim().max(80).optional(),
  measuredStationName: z.string().trim().max(120).nullable().optional(),
  measuredAqi: z.number().min(0).max(500).nullable().optional(),
  measuredAqiCategory: z.string().trim().max(40).nullable().optional(),
  measuredTimestamp: z.string().trim().max(80).nullable().optional(),
  measuredSourceAvailable: z.boolean().default(false),
  modelledPm25: z.number().min(0).max(2000).nullable().optional(),
  modelledPm10: z.number().min(0).max(3000).nullable().optional(),
  modelledNo2: z.number().min(0).max(2000).nullable().optional(),
  modelledSo2: z.number().min(0).max(3000).nullable().optional(),
  modelledOzone: z.number().min(0).max(2000).nullable().optional(),
  modelledCoUgm3: z.number().min(0).max(100000).nullable().optional(),
  modelledAqiEstimate: z.number().min(0).max(500).nullable().optional(),
  modelledTimestamp: z.string().trim().max(80).nullable().optional(),
  temperatureC: z.number().min(-50).max(60).nullable().optional(),
  humidityPct: z.number().min(0).max(100).nullable().optional(),
  windKmh: z.number().min(0).max(250).nullable().optional(),
  boundaryLayerHeightM: z.number().min(0).max(10000).nullable().optional(),
  bestForecastWindow: z.string().trim().max(120).nullable().optional(),
  dataLimitations: z.string().trim().max(400).optional(),
});

export const GuidanceRequestSchema = z.object({
  airContext: VerifiedAirContextSchema,
  household: HouseholdContextSchema,
});

export const GuidanceRationaleSchema = z.object({
  recommendation: z.string().min(3).max(240),
  whyItMatters: z.string().min(3).max(320),
});

export const StructuredGuidanceSchema = z.object({
  headline: z.string().min(5).max(180),
  currentAirQualityExplanation: z.string().min(10).max(600),
  householdRecommendations: z.array(z.string().min(4).max(280)).min(2).max(6),
  outdoorActivityTiming: z.string().min(5).max(320),
  activitiesToLimit: z.array(z.string().min(4).max(220)).min(1).max(5),
  indoorProtectionSteps: z.array(z.string().min(4).max(260)).min(2).max(6),
  maskGuidance: z.string().min(5).max(320),
  commutingRecommendations: z.string().min(5).max(320),
  next24HourActionPlan: z.array(z.string().min(4).max(240)).min(3).max(6),
  recommendationExplanations: z.array(GuidanceRationaleSchema).min(2).max(6),
  dataLimitationsAndUncertainty: z.string().min(10).max(500),
  medicalSafetyNote: z.string().min(10).max(320),
});

export const AskRequestSchema = z.object({
  question: z.string().trim().min(2).max(500),
  airContext: VerifiedAirContextSchema,
  household: HouseholdContextSchema,
  completedRoutines: z.array(z.string().max(120)).max(20).optional(),
});

export const SmogCategorySchema = z.enum([
  "Traffic emissions",
  "Industrial emissions",
  "Waste burning",
  "Construction dust",
  "Biomass burning",
  "Other",
]);

export const SmogSeveritySchema = z.enum(["Mild", "Moderate", "Severe"]);

export const SmogReportInputSchema = z.object({
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  approximateLocation: z.string().trim().min(2).max(120),
  sourceCategory: SmogCategorySchema,
  severity: SmogSeveritySchema,
  description: z.string().trim().min(5).max(400),
  observedTimeLabel: z.string().trim().min(2).max(60),
  photoDataUrl: z
    .string()
    .max(80000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
});

export type StructuredGuidance = z.infer<typeof StructuredGuidanceSchema>;
export type VerifiedAirContext = z.infer<typeof VerifiedAirContextSchema>;
export type HouseholdContext = z.infer<typeof HouseholdContextSchema>;
export type SmogSourceCategory = z.infer<typeof SmogCategorySchema>;
