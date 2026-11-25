import { z } from "zod";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../domain/defaultRoutines";
import {
  HouseholdContextSchema,
  type HouseholdContext,
} from "../domain/schemas";
import type { FirestoreRoutineItem } from "../firebase/firestoreService";

export const LOCAL_ROUTINES_KEY = "breathewise_routines_v2";
export const LOCAL_HOUSEHOLD_KEY = "breathewise_household_v2";

export const DEFAULT_HOUSEHOLD: HouseholdContext = {
  profileId: "children",
  householdSize: 4,
  commutePreference: "metro_rail",
  outdoorSchedule: "midday",
  hasHepaPurifier: true,
  purifierCadrM3h: 300,
  language: "en",
};

const StoredRoutineSchema = z.object({
  id: z.string().min(1).max(120),
  uid: z.string().min(1).max(128),
  title: z.string().min(1).max(120),
  description: z.string().max(400),
  category: z.enum([
    "Mobility",
    "Heating",
    "Ventilation",
    "Community",
    "Energy",
    "Waste",
  ]),
  co2SavedKg: z.number().finite().min(0).max(1000),
  exposureNote: z.string().max(200),
  completedToday: z.boolean(),
  weeklyCompletions: z.number().int().min(0).max(500),
});

const StoredRoutineListSchema = z.array(StoredRoutineSchema).min(1).max(100);

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function loadStoredHousehold(): HouseholdContext {
  try {
    const saved = localStorage.getItem(LOCAL_HOUSEHOLD_KEY);
    if (!saved) return DEFAULT_HOUSEHOLD;

    const parsedJson: unknown = JSON.parse(saved);
    if (!isPlainRecord(parsedJson)) return DEFAULT_HOUSEHOLD;

    const merged = { ...DEFAULT_HOUSEHOLD, ...parsedJson };
    const validated = HouseholdContextSchema.safeParse(merged);
    return validated.success ? validated.data : DEFAULT_HOUSEHOLD;
  } catch {
    return DEFAULT_HOUSEHOLD;
  }
}

export function saveStoredHousehold(household: HouseholdContext): void {
  try {
    localStorage.setItem(LOCAL_HOUSEHOLD_KEY, JSON.stringify(household));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function loadStoredRoutines(): FirestoreRoutineItem[] {
  try {
    const saved = localStorage.getItem(LOCAL_ROUTINES_KEY);
    if (!saved) return DEFAULT_CLEAN_AIR_ROUTINES;

    const parsedJson: unknown = JSON.parse(saved);
    const validated = StoredRoutineListSchema.safeParse(parsedJson);
    return validated.success ? validated.data : DEFAULT_CLEAN_AIR_ROUTINES;
  } catch {
    return DEFAULT_CLEAN_AIR_ROUTINES;
  }
}

export function saveStoredRoutines(routines: FirestoreRoutineItem[]): void {
  try {
    localStorage.setItem(LOCAL_ROUTINES_KEY, JSON.stringify(routines));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}
