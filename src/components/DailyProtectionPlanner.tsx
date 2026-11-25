import React, { useMemo } from "react";
import { buildDailyProtectionPlan } from "../domain/protectionPlanner";
import type { IndianAqiCategory } from "../domain/indianAqi";
import {
  CommutePreferenceSchema,
  OutdoorScheduleSchema,
  type HouseholdContext,
} from "../domain/schemas";
import type { TranslationBundle } from "../domain/i18n";

interface DailyProtectionPlannerProps {
  household: HouseholdContext;
  onChangeHousehold: (next: HouseholdContext) => void;
  aqi: number | null;
  category: IndianAqiCategory | null;
  pm25: number | null;
  windKmh: number | null;
  bestWindowLabel: string | null;
  savingProfile: boolean;
  isSignedIn: boolean;
  t: TranslationBundle;
}

const PROFILE_OPTIONS: {
  id: HouseholdContext["profileId"];
  label: string;
  desc: string;
}[] = [
  {
    id: "children",
    label: "Family with children",
    desc: "School commute & outdoor play windows",
  },
  {
    id: "respiratory",
    label: "Respiratory-sensitive",
    desc: "Asthma / bronchitis exposure precautions",
  },
  {
    id: "seniors",
    label: "Older adults",
    desc: "Cardiopulmonary protection during peak haze",
  },
  {
    id: "commuter",
    label: "Daily commuters",
    desc: "Rush-hour corridor & transit protection",
  },
  {
    id: "general",
    label: "General household",
    desc: "Balanced outdoor & indoor air habits",
  },
];

export const DailyProtectionPlanner: React.FC<DailyProtectionPlannerProps> = ({
  household,
  onChangeHousehold,
  aqi,
  category,
  pm25,
  windKmh,
  bestWindowLabel,
  savingProfile,
  isSignedIn,
  t,
}) => {
  const plan = useMemo(
    () =>
      buildDailyProtectionPlan({
        aqi,
        category,
        pm25,
        windKmh,
        bestWindowLabel,
        household,
      }),
    [aqi, category, pm25, windKmh, bestWindowLabel, household]
  );

  return (
    <section
      id="planner"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="pb-5 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.sections.plannerTitle}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Personalize household sensitivity, schedule, and filtration setup
            without collecting medical records.
          </p>
        </div>

        <span className="text-xs text-slate-600">
          {savingProfile
            ? "Saving preferences..."
            : isSignedIn
              ? "Synced to your Firebase profile"
              : "Sign in with Google to save preferences"}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-slate-700 mb-2">
            Household Profile
          </p>
          <div
            role="group"
            aria-label="Select household profile"
            className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg w-fit"
          >
            {PROFILE_OPTIONS.map((opt) => {
              const isSelected = household.profileId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() =>
                    onChangeHousehold({ ...household, profileId: opt.id })
                  }
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-700 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            {PROFILE_OPTIONS.find((p) => p.id === household.profileId)?.desc}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div>
            <label
              htmlFor="household-size-input"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Household Size (People)
            </label>
            <input
              id="household-size-input"
              type="number"
              min={1}
              max={20}
              value={household.householdSize}
              onChange={(e) =>
                onChangeHousehold({
                  ...household,
                  householdSize: Math.max(
                    1,
                    Math.min(20, Number(e.target.value) || 1)
                  ),
                })
              }
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>

          <div>
            <label
              htmlFor="commute-pref-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Primary Commute Mode
            </label>
            <select
              id="commute-pref-select"
              value={household.commutePreference}
              onChange={(e) => {
                const parsed = CommutePreferenceSchema.safeParse(
                  e.target.value
                );
                if (parsed.success) {
                  onChangeHousehold({
                    ...household,
                    commutePreference: parsed.data,
                  });
                }
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            >
              <option value="metro_rail">Metro / Rail Transit</option>
              <option value="bus">City Bus</option>
              <option value="carpool">Carpool</option>
              <option value="two_wheeler">Two-Wheeler</option>
              <option value="car">Private Car</option>
              <option value="walk_cycle">Walk / Bicycle</option>
              <option value="remote">Work / Study from Home</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="outdoor-schedule-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Preferred Outdoor Window
            </label>
            <select
              id="outdoor-schedule-select"
              value={household.outdoorSchedule}
              onChange={(e) => {
                const parsed = OutdoorScheduleSchema.safeParse(e.target.value);
                if (parsed.success) {
                  onChangeHousehold({
                    ...household,
                    outdoorSchedule: parsed.data,
                  });
                }
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            >
              <option value="early_morning">Early Morning (06:00–09:00)</option>
              <option value="midday">Midday (11:00–16:00)</option>
              <option value="evening">Evening (17:00–20:00)</option>
              <option value="flexible">Flexible Schedule</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="hepa-availability-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Indoor HEPA Filtration
            </label>
            <select
              id="hepa-availability-select"
              value={household.hasHepaPurifier ? "yes" : "no"}
              onChange={(e) =>
                onChangeHousehold({
                  ...household,
                  hasHepaPurifier: e.target.value === "yes",
                })
              }
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            >
              <option value="yes">HEPA Purifier Available</option>
              <option value="no">No Air Purifier</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-xs font-medium text-slate-600">
              Current Household Risk Tier
            </p>
            <p className="text-2xl font-semibold text-slate-900">
              {plan.riskTier} Exposure Risk
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              {plan.maskNote}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="text-xs font-medium text-slate-600">
              Ventilation Guidance
            </p>
            <p className="text-xs text-slate-700 leading-relaxed">
              {plan.ventilationWindowNote}
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 divide-y divide-slate-100">
          {plan.steps.map((step, idx) => (
            <div key={step.id} className={idx === 0 ? "pb-3.5" : "py-3.5"}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  <span className="font-mono text-xs text-teal-800 mr-2">
                    0{idx + 1}.
                  </span>
                  {step.title}
                </p>
                <span className="text-xs font-mono tabular-nums text-slate-600">
                  {step.timeWindow} · {step.priority}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 pl-6 leading-relaxed">
                {step.rationale}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
