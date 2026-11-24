import type { FirestoreRoutineItem } from "../firebase/firestoreService";

export const DEFAULT_CLEAN_AIR_ROUTINES: FirestoreRoutineItem[] = [
  {
    id: "rt-metro",
    uid: "local",
    title: "Use Metro Rail or Public Bus for Daily Commute",
    description:
      "Shift solo private vehicle commute trips onto electrified rail or public bus corridors.",
    category: "Mobility",
    co2SavedKg: 2.1,
    exposureNote:
      "Reduces roadside exhaust contribution and avoids direct traffic tailpipe exposure in AC metro.",
    completedToday: false,
    weeklyCompletions: 0,
  },
  {
    id: "rt-carpool",
    uid: "local",
    title: "Carpool & Consolidate Errands",
    description:
      "Combine multiple short errands into a single warm-engine trip or share rides.",
    category: "Mobility",
    co2SavedKg: 1.4,
    exposureNote:
      "Avoids repeated cold-start catalytic converter inefficiencies.",
    completedToday: false,
    weeklyCompletions: 0,
  },
  {
    id: "rt-noidle",
    uid: "local",
    title: "Turn Off Engine at Signals & School Pickups",
    description:
      "Switch off vehicle ignition during stops exceeding 30 seconds.",
    category: "Community",
    co2SavedKg: 0.4,
    exposureNote:
      "Prevents concentrated NO2 and particulate accumulation near pedestrian waiting zones.",
    completedToday: false,
    weeklyCompletions: 0,
  },
  {
    id: "rt-exhaust",
    uid: "local",
    title: "Run Kitchen Exhaust During All Stove Cooking",
    description:
      "Ventilate cooking smoke and NO2 outdoors while keeping interior doors closed.",
    category: "Ventilation",
    co2SavedKg: 0.0,
    exposureNote:
      "Reduces indoor PM2.5 and ultrafine aerosol spikes during high-heat cooking.",
    completedToday: false,
    weeklyCompletions: 0,
  },
  {
    id: "rt-cleanfuel",
    uid: "local",
    title: "Use Clean Cooking & Heating Energy",
    description:
      "Choose LPG/induction cooking and electric heating instead of solid biomass or open fires.",
    category: "Energy",
    co2SavedKg: 1.8,
    exposureNote:
      "Avoids intense indoor smoke and black carbon generation inside living spaces.",
    completedToday: false,
    weeklyCompletions: 0,
  },
  {
    id: "rt-nowasteburn",
    uid: "local",
    title: "Compost & Segregate Dry Leaves Instead of Burning",
    description:
      "Dispose garden trimmings and household waste via municipal collection or composting.",
    category: "Waste",
    co2SavedKg: 1.2,
    exposureNote:
      "Prevents toxic smouldering smoke plumes in residential neighbourhoods.",
    completedToday: false,
    weeklyCompletions: 0,
  },
];
