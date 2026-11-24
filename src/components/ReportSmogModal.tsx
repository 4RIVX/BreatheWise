import React, { useState } from "react";
import { X } from "lucide-react";
import type {
  ReportSeverity,
  SmogSourceType,
  StationReading,
} from "../types/breathewise";

interface ReportSmogModalProps {
  open: boolean;
  stations: StationReading[];
  defaultDistrictId: string;
  onClose: () => void;
  onSubmit: (payload: {
    neighborhood: string;
    districtId: string;
    sourceType: SmogSourceType;
    severity: ReportSeverity;
    notes: string;
    reporterLabel: string;
  }) => Promise<void>;
}

export const ReportSmogModal: React.FC<ReportSmogModalProps> = ({
  open,
  stations,
  defaultDistrictId,
  onClose,
  onSubmit,
}) => {
  const [neighborhood, setNeighborhood] = useState("");
  const [districtId, setDistrictId] = useState(defaultDistrictId);
  const [sourceType, setSourceType] =
    useState<SmogSourceType>("Inversion Fog");
  const [severity, setSeverity] = useState<ReportSeverity>("Moderate");
  const [notes, setNotes] = useState("");
  const [reporterLabel, setReporterLabel] = useState("Local Resident");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!neighborhood.trim() || !notes.trim()) {
      setError("Please provide both a neighborhood location and observation details.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        neighborhood: neighborhood.trim(),
        districtId,
        sourceType,
        severity,
        notes: notes.trim(),
        reporterLabel: reporterLabel.trim() || "Local Resident",
      });
      setNeighborhood("");
      setNotes("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit report."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2
              id="report-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              Report Local Winter Smog
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Share smoke, haze, or idling hotspots to warn nearby households.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                District
              </label>
              <select
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.district}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Neighborhood / Street
              </label>
              <input
                type="text"
                required
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="e.g., Elm St & 8th Ave"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Suspected Source
              </label>
              <select
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as SmogSourceType)
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              >
                <option value="Inversion Fog">Inversion Fog</option>
                <option value="Wood Smoke">Wood Smoke</option>
                <option value="Traffic Haze">Traffic Haze</option>
                <option value="Industrial Plume">Industrial Plume</option>
                <option value="Construction Dust">Construction Dust</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Observed Severity
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(["Mild", "Moderate", "Severe"] as const).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      severity === sev
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Observation Notes
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe visibility, odor, or timing..."
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reporter Role (Optional)
            </label>
            <input
              type="text"
              value={reporterLabel}
              onChange={(e) => setReporterLabel(e.target.value)}
              placeholder="e.g., Parent, Cyclist, Teacher"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
