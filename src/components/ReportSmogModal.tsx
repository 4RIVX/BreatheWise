import React, { useRef, useState } from "react";
import { X } from "lucide-react";
import { INDIAN_STATES } from "../domain/indianCities";
import { SmogCategorySchema, type SmogSourceCategory } from "../domain/schemas";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { readJsonResponse } from "../utils/safeFetchJson";

interface ReportSmogModalProps {
  open: boolean;
  defaultCity: string;
  defaultState: string;
  isSignedIn: boolean;
  onSignIn: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  backgroundRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onSubmit: (payload: {
    city: string;
    state: string;
    approximateLocation: string;
    sourceCategory: SmogSourceCategory;
    severity: "Mild" | "Moderate" | "Severe";
    description: string;
    observedTimeLabel: string;
    photoDataUrl?: string;
  }) => Promise<void>;
}

const CATEGORIES: SmogSourceCategory[] = [
  "Traffic emissions",
  "Industrial emissions",
  "Waste burning",
  "Construction dust",
  "Biomass burning",
  "Other",
];

const ALLOWED_CLIENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_RAW_CLIENT_FILE_BYTES = 10 * 1024 * 1024;

async function compressFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable."));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("Could not decode image."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Failed to read selected file."));
    reader.readAsDataURL(file);
  });
}

export const ReportSmogModal: React.FC<ReportSmogModalProps> = ({
  open,
  defaultCity,
  defaultState,
  isSignedIn,
  onSignIn,
  getIdToken,
  backgroundRef,
  onClose,
  onSubmit,
}) => {
  const [city, setCity] = useState(defaultCity);
  const [stateName, setStateName] = useState(defaultState);
  const [approximateLocation, setApproximateLocation] = useState("");
  const [sourceCategory, setSourceCategory] =
    useState<SmogSourceCategory>("Waste burning");
  const [severity, setSeverity] = useState<"Mild" | "Moderate" | "Severe">(
    "Moderate"
  );
  const [description, setDescription] = useState("");
  const [observedTimeLabel, setObservedTimeLabel] = useState("Just now");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    undefined
  );
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useDialogA11y({
    open,
    dialogRef,
    initialFocusRef: closeButtonRef,
    backgroundRef,
    onClose,
  });

  if (!open) return null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type && !ALLOWED_CLIENT_MIME_TYPES.has(file.type)) {
      setError("Only JPEG, PNG, and WebP photos are supported.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_RAW_CLIENT_FILE_BYTES) {
      setError("Please select an image file under 10 MB.");
      return;
    }

    setError(null);
    setPhotoStatus("Sanitizing image & stripping EXIF/GPS metadata...");
    try {
      const compactDataUrl = await compressFileToDataUrl(file);
      const token = await getIdToken();
      if (!token) {
        throw new Error("Sign in with Google first to upload a photo.");
      }
      const res = await fetch("/api/uploads/smog-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageDataUrl: compactDataUrl }),
      });
      const data = await readJsonResponse<{
        photoDataUrl?: string;
        error?: string;
      }>(res);
      if (!res.ok || !data.photoDataUrl) {
        throw new Error(data.error || "Photo failed server validation.");
      }
      setPhotoDataUrl(data.photoDataUrl);
      setPhotoStatus("Verified image ready (EXIF & GPS metadata removed).");
    } catch (err) {
      setPhotoDataUrl(undefined);
      setPhotoStatus(null);
      setError(
        err instanceof Error ? err.message : "Could not process selected image."
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      setError("Please sign in with Google before submitting a smog report.");
      return;
    }
    if (
      approximateLocation.trim().length < 2 ||
      description.trim().length < 5
    ) {
      setError(
        "Please provide an approximate location and at least 5 characters of observation notes."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        city: city.trim(),
        state: stateName.trim(),
        approximateLocation: approximateLocation.trim(),
        sourceCategory,
        severity,
        description: description.trim(),
        observedTimeLabel: observedTimeLabel.trim() || "Just now",
        photoDataUrl,
      });
      setApproximateLocation("");
      setDescription("");
      setPhotoDataUrl(undefined);
      setPhotoStatus(null);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit smog report."
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
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2
              id="report-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              Submit Community Smog Observation
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Reports are published anonymously as UNVERIFIED citizen
              observations.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {!isSignedIn ? (
          <div className="py-8 text-center space-y-4">
            <p className="text-sm text-slate-700">
              Sign in with Google to submit a verified community smog
              observation without exposing your email or identity publicly.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-4"
            aria-describedby={error ? "report-smog-error" : undefined}
          >
            {error && (
              <div
                id="report-smog-error"
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
              >
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="report-city"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  City
                </label>
                <input
                  id="report-city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="report-state"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  State
                </label>
                <select
                  id="report-state"
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="report-approx-location"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Approximate Location (Neighbourhood / Landmark)
              </label>
              <input
                id="report-approx-location"
                type="text"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "report-smog-error" : undefined}
                value={approximateLocation}
                onChange={(e) => setApproximateLocation(e.target.value)}
                placeholder="e.g., Near Velachery MRTS Flyover"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="report-source-cat"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Pollution Source
                </label>
                <select
                  id="report-source-cat"
                  value={sourceCategory}
                  onChange={(e) => {
                    const parsed = SmogCategorySchema.safeParse(e.target.value);
                    if (parsed.success) setSourceCategory(parsed.data);
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className="block text-xs font-medium text-slate-700 mb-1">
                  Severity
                </legend>
                <div
                  role="group"
                  aria-label="Smog severity"
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
                >
                  {(["Mild", "Moderate", "Severe"] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      aria-pressed={severity === sev}
                      onClick={() => setSeverity(sev)}
                      className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                        severity === sev
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div>
              <label
                htmlFor="report-description"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Observation Description
              </label>
              <textarea
                id="report-description"
                required
                rows={3}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "report-smog-error" : undefined}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe visible smoke, odour, or dust conditions..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="report-observed-time"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Observation Time
                </label>
                <input
                  id="report-observed-time"
                  type="text"
                  value={observedTimeLabel}
                  onChange={(e) => setObservedTimeLabel(e.target.value)}
                  placeholder="e.g., Today 07:30 IST"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
                />
              </div>

              <div>
                <label
                  htmlFor="report-photo-input"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Optional Photo (EXIF Stripped)
                </label>
                <input
                  id="report-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                />
              </div>
            </div>

            {photoStatus && (
              <p role="status" className="text-xs text-teal-800">
                {photoStatus}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
