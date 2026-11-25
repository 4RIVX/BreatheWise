import React, { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { FirestoreRoutineItem } from "../firebase/firestoreService";
import type { TranslationBundle } from "../domain/i18n";

export type RoutineCategory = FirestoreRoutineItem["category"];

interface LowEmissionRoutinesProps {
  routines: FirestoreRoutineItem[];
  onToggleRoutine: (routine: FirestoreRoutineItem) => void;
  onAddRoutine: (
    routine: Omit<FirestoreRoutineItem, "id" | "uid">
  ) => Promise<void> | void;
  isSignedIn: boolean;
  t: TranslationBundle;
}

const CATEGORIES: ("All" | RoutineCategory)[] = [
  "All",
  "Mobility",
  "Heating",
  "Ventilation",
  "Energy",
  "Waste",
  "Community",
];

function isRoutineCategory(value: string): value is RoutineCategory {
  return (
    value === "Mobility" ||
    value === "Heating" ||
    value === "Ventilation" ||
    value === "Energy" ||
    value === "Waste" ||
    value === "Community"
  );
}

export const LowEmissionRoutines: React.FC<LowEmissionRoutinesProps> = ({
  routines,
  onToggleRoutine,
  onAddRoutine,
  isSignedIn,
  t,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<"All" | RoutineCategory>(
    "All"
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<RoutineCategory>("Mobility");
  const [newDesc, setNewDesc] = useState("");
  const [newExposureNote, setNewExposureNote] = useState(
    "Reduces local combustion or roadside exposure"
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredRoutines = useMemo(() => {
    if (categoryFilter === "All") return routines;
    return routines.filter((r) => r.category === categoryFilter);
  }, [routines, categoryFilter]);

  const totals = useMemo(() => {
    return routines.reduce(
      (acc, r) => {
        if (r.completedToday) {
          acc.co2Today += r.co2SavedKg;
          acc.completedToday += 1;
        }
        acc.weeklyCompletions += r.weeklyCompletions;
        acc.weeklyCo2 += r.co2SavedKg * r.weeklyCompletions;
        return acc;
      },
      { co2Today: 0, completedToday: 0, weeklyCompletions: 0, weeklyCo2: 0 }
    );
  }, [routines]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (newTitle.trim().length < 3) {
      setFormError("Please enter a routine title with at least 3 characters.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onAddRoutine({
        title: newTitle.trim(),
        description:
          newDesc.trim() ||
          "Custom household low-emission habit tracked daily.",
        category: newCategory,
        co2SavedKg: 0.0, // Numerical emissions calculated strictly via Eco-Mobility Tracker with distance & emission factors
        exposureNote: newExposureNote.trim() || "Low-emission household habit",
        completedToday: true,
        weeklyCompletions: 1,
      });
      setNewTitle("");
      setNewDesc("");
      setShowAddForm(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save custom routine."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="routines"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.sections.routinesTitle}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Track daily clean-air routines and weekly habit consistency{" "}
            {isSignedIn
              ? "(synced to Firestore)"
              : "(local preview until sign-in)"}
            .
          </p>
        </div>

        <button
          type="button"
          aria-expanded={showAddForm}
          aria-controls="add-routine-form"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <Plus aria-hidden="true" className="w-3.5 h-3.5" />
          {showAddForm ? "Close Form" : "Add Custom Routine"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-600">
            Daily Routine Progress
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
            {totals.completedToday} / {routines.length}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            Habits completed today
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600">
            Today&apos;s Estimated CO2 Avoided
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-teal-800 mt-1">
            {totals.co2Today.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-600">kg</span>
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            Requires mobility trip log calculation (routines start at 0.0)
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600">
            Weekly Logged Completions
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-emerald-800 mt-1">
            {totals.weeklyCompletions}{" "}
            <span className="text-xs font-normal text-slate-600">actions</span>
          </p>
          <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
            ~{totals.weeklyCo2.toFixed(1)} kg CO2 cumulative
          </p>
        </div>
      </div>

      {showAddForm && (
        <form
          id="add-routine-form"
          noValidate
          onSubmit={handleCreate}
          className="py-5 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          {formError && (
            <p
              role="alert"
              className="md:col-span-12 text-xs text-rose-700 font-medium"
            >
              {formError}
            </p>
          )}
          <div className="md:col-span-3">
            <label
              htmlFor="new-routine-title"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Routine Title
            </label>
            <input
              id="new-routine-title"
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., Carpool to school"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="new-routine-category"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Category
            </label>
            <select
              id="new-routine-category"
              value={newCategory}
              onChange={(e) => {
                if (isRoutineCategory(e.target.value)) {
                  setNewCategory(e.target.value);
                }
              }}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            >
              <option value="Mobility">Mobility</option>
              <option value="Heating">Heating</option>
              <option value="Ventilation">Ventilation</option>
              <option value="Energy">Energy</option>
              <option value="Waste">Waste</option>
              <option value="Community">Community</option>
            </select>
          </div>
          <div className="md:col-span-5">
            <label
              htmlFor="new-routine-desc"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Description
            </label>
            <input
              id="new-routine-desc"
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What this habit changes"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {submitting ? "Saving..." : "Save Routine"}
            </button>
          </div>
          <div className="md:col-span-12">
            <label
              htmlFor="new-routine-exposure"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Exposure / Clean-Air Rationale
            </label>
            <input
              id="new-routine-exposure"
              type="text"
              value={newExposureNote}
              onChange={(e) => setNewExposureNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
            />
          </div>
        </form>
      )}

      <div
        role="group"
        aria-label="Filter routines by category"
        className="py-4 flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit mt-4"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
              categoryFilter === cat
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-700 hover:text-slate-900"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="divide-y divide-slate-100 mt-2">
        {filteredRoutines.map((routine) => (
          <div
            key={routine.id}
            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <button
              type="button"
              aria-pressed={routine.completedToday}
              onClick={() => onToggleRoutine(routine)}
              className="flex items-start gap-3.5 text-left cursor-pointer group flex-1 min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  routine.completedToday
                    ? "bg-teal-700 border-teal-700 text-white"
                    : "bg-white border-slate-300 group-hover:border-teal-700"
                }`}
              >
                {routine.completedToday && (
                  <Check aria-hidden="true" className="w-3.5 h-3.5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {routine.title}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {routine.description}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {routine.exposureNote}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 shrink-0 pl-8 sm:pl-0">
              <span>{routine.category}</span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span>{routine.weeklyCompletions}×/wk</span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span>
                {routine.co2SavedKg > 0
                  ? `~${routine.co2SavedKg.toFixed(1)} kg CO2`
                  : "Habit Log"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
