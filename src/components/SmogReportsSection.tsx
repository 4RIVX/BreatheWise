import React, { useMemo, useState } from "react";
import { ThumbsUp, Search } from "lucide-react";
import type {
  ReportSeverity,
  SmogReport,
  SmogSourceType,
  StationReading,
} from "../types/breathewise";

interface SmogReportsSectionProps {
  reports: SmogReport[];
  stations: StationReading[];
  selectedStationId: string;
  onConfirmReport: (reportId: string) => void;
  onOpenReportModal: () => void;
}

const SEVERITY_FILTERS: ("All" | ReportSeverity)[] = [
  "All",
  "Severe",
  "Moderate",
  "Mild",
];

const SOURCE_FILTERS: ("All" | SmogSourceType)[] = [
  "All",
  "Wood Smoke",
  "Traffic Haze",
  "Industrial Plume",
  "Inversion Fog",
  "Construction Dust",
];

function getSeverityTextClass(severity: ReportSeverity): string {
  switch (severity) {
    case "Severe":
      return "text-rose-700 font-semibold";
    case "Moderate":
      return "text-amber-700 font-semibold";
    case "Mild":
      return "text-emerald-700 font-semibold";
  }
}

export const SmogReportsSection: React.FC<SmogReportsSectionProps> = ({
  reports,
  stations,
  selectedStationId,
  onConfirmReport,
  onOpenReportModal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"All" | ReportSeverity>(
    "All"
  );
  const [sourceFilter, setSourceFilter] = useState<"All" | SmogSourceType>(
    "All"
  );
  const [scopeOnlySelected, setScopeOnlySelected] = useState(false);

  const stationMap = useMemo(() => {
    const map = new Map<string, string>();
    stations.forEach((s) => map.set(s.id, s.district));
    return map;
  }, [stations]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((rep) => {
      if (scopeOnlySelected && rep.districtId !== selectedStationId) {
        return false;
      }
      if (severityFilter !== "All" && rep.severity !== severityFilter) {
        return false;
      }
      if (sourceFilter !== "All" && rep.sourceType !== sourceFilter) {
        return false;
      }
      if (
        q &&
        !rep.neighborhood.toLowerCase().includes(q) &&
        !rep.notes.toLowerCase().includes(q) &&
        !rep.sourceType.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    reports,
    searchQuery,
    severityFilter,
    sourceFilter,
    scopeOnlySelected,
    selectedStationId,
  ]);

  return (
    <section
      id="reports"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Community Winter Smog Reports
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Hyperlocal resident observations verified by neighbors to flag micro-plumes and wood-smoke corridors.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenReportModal}
          className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Log Smog Sighting
        </button>
      </div>

      <div className="py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search neighborhood or source..."
              aria-label="Search smog reports"
              className="pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 w-64"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by severity"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {SEVERITY_FILTERS.map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(e.target.value as "All" | SmogSourceType)
            }
            aria-label="Filter by pollution source"
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
          >
            {SOURCE_FILTERS.map((src) => (
              <option key={src} value={src}>
                {src === "All" ? "All Sources" : src}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setScopeOnlySelected((prev) => !prev)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            scopeOnlySelected
              ? "bg-teal-50 border-teal-300 text-teal-900"
              : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
        >
          {scopeOnlySelected
            ? `Showing: ${stationMap.get(selectedStationId) || "Selected District"}`
            : "All Districts"}
        </button>
      </div>

      {filteredReports.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800">
            No smog reports match your current filters.
          </p>
          <p className="text-xs text-slate-500">
            Clear your search filters or log a new neighborhood observation.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSeverityFilter("All");
              setSourceFilter("All");
              setScopeOnlySelected(false);
            }}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filteredReports.map((rep) => (
            <article
              key={rep.id}
              className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {rep.neighborhood}
                  </h3>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span
                    className={`text-xs ${getSeverityTextClass(rep.severity)}`}
                  >
                    {rep.severity} Severity
                  </span>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {rep.notes}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{stationMap.get(rep.districtId) || rep.districtId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rep.sourceType}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rep.reporterLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {rep.reportedAt}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onConfirmReport(rep.id)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start cursor-pointer"
              >
                <ThumbsUp className="w-3.5 h-3.5 text-teal-700" />
                <span>Confirm Sighting</span>
                <span className="font-mono tabular-nums text-slate-900 font-semibold">
                  {rep.verifiedCount}
                </span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
