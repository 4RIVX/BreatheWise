import React, { useMemo, useState } from "react";
import { Search, ThumbsUp } from "lucide-react";
import type { FirestoreSmogReport } from "../firebase/firestoreService";
import type { SmogSourceCategory } from "../domain/schemas";
import type { TranslationBundle } from "../domain/i18n";

interface CommunitySmogWatchProps {
  reports: FirestoreSmogReport[];
  activeCity: string;
  isSignedIn: boolean;
  confirmedIds: Set<string>;
  onConfirmReport: (report: FirestoreSmogReport) => Promise<void>;
  onOpenReportModal: () => void;
  t: TranslationBundle;
}

const SEVERITY_FILTERS = ["All", "Severe", "Moderate", "Mild"] as const;
const CATEGORY_FILTERS: ("All" | SmogSourceCategory)[] = [
  "All",
  "Traffic emissions",
  "Industrial emissions",
  "Waste burning",
  "Construction dust",
  "Biomass burning",
  "Other",
];

function getSeverityTextClass(
  severity: FirestoreSmogReport["severity"]
): string {
  switch (severity) {
    case "Severe":
      return "text-rose-800 font-semibold";
    case "Moderate":
      return "text-amber-800 font-semibold";
    case "Mild":
      return "text-emerald-800 font-semibold";
  }
}

export const CommunitySmogWatch: React.FC<CommunitySmogWatchProps> = ({
  reports,
  activeCity,
  isSignedIn,
  confirmedIds,
  onConfirmReport,
  onOpenReportModal,
  t,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] =
    useState<(typeof SEVERITY_FILTERS)[number]>("All");
  const [categoryFilter, setCategoryFilter] = useState<
    "All" | SmogSourceCategory
  >("All");
  const [onlyActiveCity, setOnlyActiveCity] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((rep) => {
      if (
        onlyActiveCity &&
        rep.city.toLowerCase() !== activeCity.toLowerCase()
      ) {
        return false;
      }
      if (severityFilter !== "All" && rep.severity !== severityFilter) {
        return false;
      }
      if (categoryFilter !== "All" && rep.sourceCategory !== categoryFilter) {
        return false;
      }
      if (
        q &&
        !rep.approximateLocation.toLowerCase().includes(q) &&
        !rep.city.toLowerCase().includes(q) &&
        !rep.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    reports,
    onlyActiveCity,
    activeCity,
    severityFilter,
    categoryFilter,
    searchQuery,
  ]);

  const handleConfirm = async (rep: FirestoreSmogReport) => {
    setConfirmError(null);
    try {
      await onConfirmReport(rep);
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "Could not confirm sighting."
      );
    }
  };

  return (
    <section
      id="smog-watch"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.sections.smogWatchTitle}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t.disclaimers.unverifiedReports}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenReportModal}
          className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {t.actions.reportSmog}
        </button>
      </div>

      {confirmError && (
        <p role="alert" className="text-xs text-rose-700 font-medium">
          {confirmError}
        </p>
      )}

      <div className="py-2 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, area, or notes..."
              aria-label="Search community smog reports"
              className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 w-64"
            />
          </div>

          <div
            role="group"
            aria-label="Filter reports by severity"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {SEVERITY_FILTERS.map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  severityFilter === sev
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter reports by pollution category"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as "All" | SmogSourceCategory)
            }
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
          >
            {CATEGORY_FILTERS.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "All" ? "All Source Categories" : cat}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setOnlyActiveCity((prev) => !prev)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            onlyActiveCity
              ? "bg-teal-50 border-teal-300 text-teal-900"
              : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
        >
          {onlyActiveCity ? `Showing: ${activeCity}` : "All Cities"}
        </button>
      </div>

      {filteredReports.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            No community observations match your current filters.
          </p>
          <p className="text-xs text-slate-500">
            Citizen observations stored in Firestore appear here once submitted.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredReports.map((rep) => {
            const alreadyConfirmed = confirmedIds.has(rep.id);
            return (
              <article
                key={rep.id}
                className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {rep.approximateLocation}
                    </h3>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span
                      className={`text-xs ${getSeverityTextClass(rep.severity)}`}
                    >
                      {rep.severity} Severity
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs font-mono font-semibold text-amber-800">
                      {rep.moderationStatus} CITIZEN REPORT
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {rep.description}
                  </p>

                  {rep.photoDataUrl && (
                    <div className="pt-1">
                      <img
                        src={rep.photoDataUrl}
                        alt={`Citizen smog observation at ${rep.approximateLocation}`}
                        referrerPolicy="no-referrer"
                        className="max-h-40 rounded-lg border border-slate-200 object-cover"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      {rep.city}, {rep.state}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{rep.sourceCategory}</span>
                    <span aria-hidden="true">·</span>
                    <span>Anonymous Citizen Observer</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {rep.observedTimeLabel}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!isSignedIn || alreadyConfirmed}
                  onClick={() => handleConfirm(rep)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 disabled:opacity-60 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start cursor-pointer"
                >
                  <ThumbsUp className="w-3.5 h-3.5 text-teal-700" />
                  <span>
                    {alreadyConfirmed
                      ? "Confirmed"
                      : isSignedIn
                        ? "Confirm Sighting"
                        : "Sign in to Confirm"}
                  </span>
                  <span className="font-mono tabular-nums text-slate-900 font-semibold">
                    {rep.confirmationsCount}
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
