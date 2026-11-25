import React, { useMemo, useRef, useState } from "react";
import { Header, type SectionId } from "./components/Header";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar";
import { AirQualityDashboard } from "./components/AirQualityDashboard";
import { DispersionChart } from "./components/DispersionChart";
import { DailyProtectionPlanner } from "./components/DailyProtectionPlanner";
import { AiFamilyGuardian } from "./components/AiFamilyGuardian";
import { IndoorAirCoach } from "./components/IndoorAirCoach";
import { EcoMobilityTracker } from "./components/EcoMobilityTracker";
import { LowEmissionRoutines } from "./components/LowEmissionRoutines";
import { CommunitySmogWatch } from "./components/CommunitySmogWatch";
import { ReportSmogModal } from "./components/ReportSmogModal";
import { TRANSLATIONS } from "./domain/i18n";
import { useFirebase } from "./firebase/FirebaseProvider";
import { useAirQualityData } from "./hooks/useAirQualityData";
import { useFamilyGuardian } from "./hooks/useFamilyGuardian";
import { useWorkspaceSync } from "./hooks/useWorkspaceSync";

export function App() {
  const { user, authReady, firebaseEnabled, getIdToken, signInWithGoogle } =
    useFirebase();

  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const appShellRef = useRef<HTMLDivElement | null>(null);

  const {
    activeLocation,
    setActiveLocation,
    measured,
    modelled,
    selectedCpcbIndex,
    setSelectedCpcbIndex,
    activeCpcbStation,
    airLoading,
    airError,
    geoPending,
    refreshAirQuality,
    requestBrowserLocation,
  } = useAirQualityData();

  const {
    household,
    activeRoutines,
    ecoLogs,
    smogReports,
    confirmedReportIds,
    savingProfile,
    syncError,
    dismissSyncError,
    handleHouseholdChange,
    handleLanguageChange,
    handleToggleRoutine,
    handleAddRoutine,
    handleCreateSmogReport,
    handleConfirmSmogReport,
    handleSaveTripLog,
  } = useWorkspaceSync({
    user,
    authReady,
    firebaseEnabled,
    activeLocation,
  });

  const completedRoutineTitles = useMemo(
    () => activeRoutines.filter((r) => r.completedToday).map((r) => r.title),
    [activeRoutines]
  );

  const {
    guidance,
    guidanceProvider,
    guidanceModel,
    guidanceFallbackReason,
    guidanceLoading,
    guidanceError,
    handleRefreshGuidance,
    handleAskQuestion,
  } = useFamilyGuardian({
    activeLocation,
    preferredStationName: activeCpcbStation?.stationName,
    household,
    user,
    getIdToken,
    completedRoutineTitles,
  });

  const t = TRANSLATIONS[household.language];

  const handleNavigate = (section: SectionId) => {
    setActiveSection(section);
    const el = document.getElementById(section);
    if (el) {
      const prefersReduced =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const activeAqi =
    activeCpcbStation?.indianAqi.aqi ??
    modelled?.indianAqiFromRollingModel.aqi ??
    null;
  const activeCategory =
    activeCpcbStation?.indianAqi.category ??
    modelled?.indianAqiFromRollingModel.category ??
    null;
  const locationLabel = `${activeLocation.city}, ${activeLocation.state}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <div ref={appShellRef} className="min-h-screen flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:bg-teal-700 focus:text-white focus:rounded-lg focus:shadow-md focus:outline-none"
        >
          Skip to main content
        </a>

        <Header
          activeSection={activeSection}
          onNavigate={handleNavigate}
          onOpenReportModal={() => setReportModalOpen(true)}
          t={t}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-6 space-y-8 focus:outline-none"
        >
          <WorkspaceToolbar
            language={household.language}
            onChangeLanguage={handleLanguageChange}
            locationLabel={locationLabel}
            onRequestBrowserLocation={requestBrowserLocation}
            locationRequestPending={geoPending}
            onRefreshAirQuality={refreshAirQuality}
            airLoading={airLoading}
            t={t}
          />

          {syncError && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-xs text-amber-900"
            >
              <span>{syncError}</span>
              <button
                type="button"
                onClick={dismissSyncError}
                className="font-medium underline hover:text-amber-950 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Dismiss
              </button>
            </div>
          )}

          <AirQualityDashboard
            activeLocation={activeLocation}
            onSelectLocation={setActiveLocation}
            measured={measured}
            modelled={modelled}
            selectedCpcbIndex={selectedCpcbIndex}
            onSelectCpcbIndex={setSelectedCpcbIndex}
            loading={airLoading}
            error={airError}
            t={t}
          />

          <DispersionChart
            series={modelled?.hourlySeries ?? []}
            locationLabel={locationLabel}
          />

          <DailyProtectionPlanner
            household={household}
            onChangeHousehold={handleHouseholdChange}
            aqi={activeAqi}
            category={activeCategory}
            pm25={modelled?.currentPollutants.pm25 ?? null}
            windKmh={modelled?.weather.windKmh ?? null}
            bestWindowLabel={modelled?.bestLowerPmWindow ?? null}
            savingProfile={savingProfile}
            isSignedIn={Boolean(user)}
            t={t}
          />

          <AiFamilyGuardian
            locationLabel={locationLabel}
            household={household}
            guidance={guidance}
            guidanceProvider={guidanceProvider}
            guidanceModel={guidanceModel}
            guidanceFallbackReason={guidanceFallbackReason}
            guidanceLoading={guidanceLoading}
            guidanceError={guidanceError}
            onRefreshGuidance={handleRefreshGuidance}
            onAskQuestion={handleAskQuestion}
            t={t}
          />

          <IndoorAirCoach
            locationLabel={locationLabel}
            purifierCadrM3h={household.purifierCadrM3h}
            onChangePurifierCadrM3h={(val) =>
              handleHouseholdChange({ ...household, purifierCadrM3h: val })
            }
            t={t}
          />

          <EcoMobilityTracker
            isSignedIn={Boolean(user)}
            savedLogs={user ? ecoLogs : []}
            onSaveTripLog={handleSaveTripLog}
            t={t}
          />

          <LowEmissionRoutines
            routines={activeRoutines}
            onToggleRoutine={handleToggleRoutine}
            onAddRoutine={handleAddRoutine}
            isSignedIn={Boolean(user)}
            t={t}
          />

          <CommunitySmogWatch
            reports={smogReports}
            activeCity={activeLocation.city}
            isSignedIn={Boolean(user)}
            confirmedIds={confirmedReportIds}
            onConfirmReport={handleConfirmSmogReport}
            onOpenReportModal={() => setReportModalOpen(true)}
            t={t}
          />
        </main>

        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="max-w-[1280px] mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <span>
              {t.brand} · {t.tagline}
            </span>
            <span>
              CPCB Indian National AQI · Open-Meteo Regional Model · Community
              Smog Watch
            </span>
          </div>
        </footer>
      </div>

      {reportModalOpen && (
        <ReportSmogModal
          open={reportModalOpen}
          defaultCity={activeLocation.city}
          defaultState={activeLocation.state}
          isSignedIn={Boolean(user)}
          onSignIn={signInWithGoogle}
          getIdToken={getIdToken}
          backgroundRef={appShellRef}
          onClose={() => setReportModalOpen(false)}
          onSubmit={handleCreateSmogReport}
        />
      )}
    </div>
  );
}

export default App;
