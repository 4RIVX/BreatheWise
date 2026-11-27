import React from "react";
import { LogIn, LogOut, MapPin, RefreshCw } from "lucide-react";
import type { UiLanguage, TranslationBundle } from "../domain/i18n";
import { useFirebase } from "../firebase/FirebaseProvider";

interface WorkspaceToolbarProps {
  language: UiLanguage;
  onChangeLanguage: (lang: UiLanguage) => void;
  locationLabel: string;
  onRequestBrowserLocation: () => void;
  locationRequestPending: boolean;
  onRefreshAirQuality: () => void;
  airLoading: boolean;
  t: TranslationBundle;
}

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  language,
  onChangeLanguage,
  locationLabel,
  onRequestBrowserLocation,
  locationRequestPending,
  onRefreshAirQuality,
  airLoading,
  t,
}) => {
  const { user, firebaseEnabled, authError, signInWithGoogle, signOutUser } =
    useFirebase();

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-slate-600">
          Active location:{" "}
          <strong className="text-slate-900">{locationLabel}</strong>
        </span>

        <button
          type="button"
          onClick={onRequestBrowserLocation}
          disabled={locationRequestPending}
          className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <MapPin className="w-3.5 h-3.5 text-teal-700" />
          {locationRequestPending ? "Locating..." : t.actions.useMyLocation}
        </button>

        <button
          type="button"
          onClick={onRefreshAirQuality}
          disabled={airLoading}
          className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${airLoading ? "animate-spin" : ""}`}
          />
          {t.actions.refreshData}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Language selection"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          <button
            type="button"
            onClick={() => onChangeLanguage("en")}
            className={`min-h-11 min-w-11 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              language === "en"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => onChangeLanguage("ta")}
            className={`min-h-11 min-w-11 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              language === "ta"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            தமிழ்
          </button>
        </div>

        {firebaseEnabled && (
          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">
                  Signed in as{" "}
                  <strong className="text-slate-900">
                    {user.displayName || user.email}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={signOutUser}
                  className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t.actions.signOut}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="inline-flex min-h-11 items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t.actions.signInGoogle}
              </button>
            )}
          </div>
        )}
      </div>

      {authError && (
        <p role="alert" className="w-full text-xs text-rose-700">
          {authError}
        </p>
      )}
    </div>
  );
};
