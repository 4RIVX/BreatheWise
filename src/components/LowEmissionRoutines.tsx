import React, { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import type {
  LowEmissionRoutine,
  RoutineCategory,
} from "../types/breathewise";

interface LowEmissionRoutinesProps {
  routines: LowEmissionRoutine[];
  onToggleRoutine: (id: string) => void;
  onAddRoutine: (routine: Omit<LowEmissionRoutine, "id" | "completed">) => void;
}

const CATEGORIES: ("All" | RoutineCategory)[] = [
  "All",
  "Mobility",
  "Heating",
  "Ventilation",
  "Community",
];

export const LowEmissionRoutines: React.FC<LowEmissionRoutinesProps> = ({
  routines,
  onToggleRoutine,
  onAddRoutine,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<
    "All" | RoutineCategory
  >("All");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<RoutineCategory>("Mobility");
  const [newDesc, setNewDesc] = useState("");

  const filteredRoutines = useMemo(() => {
    if (categoryFilter === "All") return routines;
    return routines.filter((r) => r.category === categoryFilter);
  }, [routines, categoryFilter]);

  const totals = useMemo(() => {
    return routines.reduce(
      (acc, r) => {
        if (r.completed) {
          acc.pm25 += r.pm25AvoidedGrams;
          acc.co2 += r.co2SavedKg;
          acc.cleanHours += r.cleanAirHours;
          acc.count += 1;
        }
        return acc;
      },
      { pm25: 0, co2: 0, cleanHours: 0, count: 0 }
    );
  }, [routines]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddRoutine({
      title: newTitle.trim(),
      description:
        newDesc.trim() ||
        "Custom household low-emission habit logged for winter smog reduction.",
      category: newCategory,
      pm25AvoidedGrams: 1.4,
      co2SavedKg: 1.8,
      cleanAirHours: 1.5,
    });
    setNewTitle("");
    setNewDesc("");
    setShowAddForm(false);
  };

  return (
    <section
      id="routines"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Low-Emission Routines & Environmental Impact
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Daily winter household actions that cut fine particulate emissions and increase clean-air exposure hours.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {showAddForm ? "Close Form" : "Add Custom Habit"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Direct PM2.5 Avoided Today
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-teal-800 mt-1">
            {totals.pm25.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-500">g</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Monthly pace: {(totals.pm25 * 30).toFixed(0)} g fine soot prevented
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">
            Household CO2e Reduced
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
            {totals.co2.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-500">kg</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {totals.count} of {routines.length} routines completed today
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">
            Clean-Air Exposure Gained
          </p>
          <p className="text-2xl font-mono font-semibold tabular-nums text-emerald-700 mt-1">
            {totals.cleanHours.toFixed(1)}{" "}
            <span className="text-xs font-normal text-slate-500">hrs/day</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Low-particulate indoor & corridor breathing time
          </p>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreate}
          className="py-5 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Habit Title
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g., Walk school pickup route"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as RoutineCategory)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            >
              <option value="Mobility">Mobility</option>
              <option value="Heating">Heating</option>
              <option value="Ventilation">Ventilation</option>
              <option value="Community">Community</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Details
            </label>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short description of impact"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              Save Habit
            </button>
          </div>
        </form>
      )}

      <div className="py-4 flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit mt-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              categoryFilter === cat
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
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
              onClick={() => onToggleRoutine(routine.id)}
              className="flex items-start gap-3.5 text-left cursor-pointer group flex-1 min-w-0"
            >
              <span
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  routine.completed
                    ? "bg-teal-700 border-teal-700 text-white"
                    : "bg-white border-slate-300 group-hover:border-teal-700"
                }`}
              >
                {routine.completed && <Check className="w-3.5 h-3.5" />}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    routine.completed ? "text-slate-900" : "text-slate-800"
                  }`}
                >
                  {routine.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {routine.description}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-600 shrink-0 pl-8 sm:pl-0">
              <span>{routine.category}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>-{routine.pm25AvoidedGrams.toFixed(1)} g PM2.5</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span>-{routine.co2SavedKg.toFixed(1)} kg CO2e</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
