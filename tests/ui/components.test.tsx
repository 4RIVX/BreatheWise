// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { TRANSLATIONS } from "../../src/domain/i18n";
import { INDIAN_CITY_PRESETS } from "../../src/domain/indianCities";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../../src/domain/defaultRoutines";
import { AirQualityDashboard } from "../../src/components/AirQualityDashboard";
import { DispersionChart } from "../../src/components/DispersionChart";
import { IndoorAirCoach } from "../../src/components/IndoorAirCoach";
import { EcoMobilityTracker } from "../../src/components/EcoMobilityTracker";
import { LowEmissionRoutines } from "../../src/components/LowEmissionRoutines";
import { CommunitySmogWatch } from "../../src/components/CommunitySmogWatch";
import { AiFamilyGuardian } from "../../src/components/AiFamilyGuardian";

import { Header } from "../../src/components/Header";
import { WorkspaceToolbar } from "../../src/components/WorkspaceToolbar";
import { DailyProtectionPlanner } from "../../src/components/DailyProtectionPlanner";
import { ReportSmogModal } from "../../src/components/ReportSmogModal";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";

vi.mock("../../src/firebase/FirebaseProvider", () => ({
  useFirebase: () => ({
    user: null,
    authReady: true,
    firebaseEnabled: false,
    authError: null,
    signInWithGoogle: vi.fn(),
    signOutUser: vi.fn(),
    getIdToken: vi.fn(async () => null),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SAMPLE_SERIES = [
  {
    timeIso: "2026-01-15T10:00",
    hourLabel: "10:00",
    pm25: 54.2,
    pm10: 96.1,
    no2: 31.4,
    so2: 12.1,
    ozone: 48.0,
    coUgm3: 700,
    windKmh: 11.4,
    boundaryLayerHeightM: 640,
  },
  {
    timeIso: "2026-01-15T11:00",
    hourLabel: "11:00",
    pm25: 44.8,
    pm10: 82.0,
    no2: 26.0,
    so2: 10.5,
    ozone: 56.0,
    coUgm3: 650,
    windKmh: 14.2,
    boundaryLayerHeightM: 880,
  },
];

describe("BreatheWise UI Components & Accessibility", () => {
  it("renders separated CPCB measured unavailable state and Open-Meteo modelled forecast", async () => {
    const onSelectLocation = vi.fn();
    const { container } = render(
      <AirQualityDashboard
        activeLocation={{
          city: INDIAN_CITY_PRESETS[0].city,
          state: INDIAN_CITY_PRESETS[0].state,
          latitude: INDIAN_CITY_PRESETS[0].latitude,
          longitude: INDIAN_CITY_PRESETS[0].longitude,
          source: "preset",
        }}
        onSelectLocation={onSelectLocation}
        measured={{
          status: "unavailable",
          reason: "MISSING_API_KEY",
          message: "DATA_GOV_IN_API_KEY is not configured.",
          resourceId: "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69",
          stations: [],
          cached: false,
          fetchedAtIso: "2026-01-15T11:00:00Z",
        }}
        modelled={{
          status: "available",
          message: "OK",
          sourceLabel: "Open-Meteo Modelled Regional Air-Quality Forecast",
          isMeasured: false,
          latitude: 13.08,
          longitude: 80.27,
          currentTimeIso: "2026-01-15T11:00:00+05:30",
          stale: false,
          ageMinutes: 5,
          currentPollutants: {
            pm25: 44.8,
            pm10: 82.0,
            no2: 26.0,
            so2: 10.5,
            ozone: 56.0,
            coUgm3: 650,
          },
          weather: {
            temperatureC: 29,
            humidityPct: 62,
            windKmh: 14.2,
            boundaryLayerHeightM: 880,
          },
          indianAqiFromRollingModel: {
            calculable: true,
            aqi: 84,
            category: "Satisfactory",
            prominentPollutant: "PM10",
            reasonIfNotCalculable: null,
            subIndices: [
              {
                code: "PM2.5",
                concentrationNormalized: 45,
                normalizedUnit: "ug/m3",
                subIndex: 75,
                category: "Satisfactory",
                averagingPeriodHours: 24,
              },
              {
                code: "PM10",
                concentrationNormalized: 84,
                normalizedUnit: "ug/m3",
                subIndex: 84,
                category: "Satisfactory",
                averagingPeriodHours: 24,
              },
              {
                code: "NO2",
                concentrationNormalized: 26,
                normalizedUnit: "ug/m3",
                subIndex: 33,
                category: "Good",
                averagingPeriodHours: 24,
              },
            ],
          },
          bestLowerPmWindow: "10:00–11:00 IST",
          hourlySeries: SAMPLE_SERIES,
          cached: false,
          fetchedAtIso: "2026-01-15T11:00:00Z",
        }}
        selectedCpcbIndex={0}
        onSelectCpcbIndex={vi.fn()}
        loading={false}
        error={null}
        t={TRANSLATIONS.en}
      />
    );

    expect(
      screen.getByText(/Official CPCB Station Data Unavailable/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Modelled Rolling Indian AQI/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText("84").length).toBeGreaterThan(0);

    const delhiButton = screen.getByRole("button", { name: "Delhi" });
    fireEvent.click(delhiButton);
    expect(onSelectLocation).toHaveBeenCalledWith(
      expect.objectContaining({ city: "Delhi" })
    );

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  it("labels OpenAQ v3 hourly stations distinctly from official CPCB feeds with upstream provider and owner attribution", () => {
    render(
      <AirQualityDashboard
        activeLocation={{
          city: "Chennai",
          state: "Tamil Nadu",
          latitude: 13.08,
          longitude: 80.27,
          source: "preset",
        }}
        onSelectLocation={vi.fn()}
        measured={{
          status: "available",
          message: "OK",
          resourceId: "openaq-v3",
          stations: [
            {
              stationName: "Alandur Depot",
              city: "Chennai",
              state: "Tamil Nadu",
              latitude: 13.0,
              longitude: 80.2,
              lastUpdatedRaw: "2026-06-01T11:30:00Z",
              lastUpdatedIso: "2026-06-01T11:30:00Z",
              stale: false,
              ageMinutes: 30,
              pollutants: [
                {
                  code: "PM2.5",
                  rawId: "pm25",
                  avg: 60,
                  min: 40,
                  max: 80,
                  unit: "ug/m3",
                  fresh: true,
                  stale: false,
                },
                {
                  code: "PM10",
                  rawId: "pm10",
                  avg: 300,
                  min: 200,
                  max: 400,
                  unit: "ug/m3",
                  fresh: false,
                  stale: true,
                },
              ],
              indianAqi: {
                calculable: true,
                aqi: 100,
                category: "Satisfactory",
                prominentPollutant: "PM2.5",
                reasonIfNotCalculable: null,
                subIndices: [],
              },
              sourceLabel:
                "OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology",
              feedOrigin: "openaq_v3",
              providerName: "CAIR / OpenAQ Provider",
              ownerName: "Tamil Nadu Pollution Control Board",
              licenseAttribution: "CC BY 4.0",
              isMeasured: true,
            },
          ],
          cached: false,
          fetchedAtIso: "2026-06-01T12:00:00Z",
        }}
        modelled={null}
        selectedCpcbIndex={0}
        onSelectCpcbIndex={vi.fn()}
        loading={false}
        error={null}
        t={TRANSLATIONS.en}
      />
    );

    expect(
      screen.getByRole("heading", {
        name: /OpenAQ Hourly Monitoring Measurements — AQI Calculated Using CPCB Methodology/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/CAIR \/ OpenAQ Provider/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Tamil Nadu Pollution Control Board/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Stale \(>3h\) — excluded/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/CPCB\) via data\.gov\.in/i)
    ).not.toBeInTheDocument();
  });

  it("toggles DispersionChart between SVG Chart and accessible Data Table", () => {
    render(
      <DispersionChart
        series={SAMPLE_SERIES}
        locationLabel="Chennai, Tamil Nadu"
      />
    );

    expect(screen.getByRole("img")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Data Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("54.2")).toBeInTheDocument();
  });

  it("updates IndoorAirCoach CADR/ACH metrics and shows transparent disclaimer", async () => {
    const onChangeCadr = vi.fn();
    const { container } = render(
      <IndoorAirCoach
        locationLabel="Chennai, Tamil Nadu"
        purifierCadrM3h={300}
        onChangePurifierCadrM3h={onChangeCadr}
        t={TRANSLATIONS.en}
      />
    );

    expect(screen.getAllByText(/5\.17/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "CADR in CFM" }));
    expect(screen.getByLabelText(/Purifier CADR \(CFM\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not measure or predict actual indoor PM2.5/i)
    ).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text).toContain("sorbent medium, bed mass, and remaining capacity");
    expect(text).toContain("do NOT reliably remove carbon monoxide (CO)");
    expect(text).toContain("certified CO alarms");
    expect(text).toContain(
      "purifier performance, room air leakage, unit placement, filter condition, and room air mixing"
    );
    expect(text).toContain("illustrative purifier-sizing benchmarks");
    expect(text).not.toContain("CDC/NIOSH");
    expect(text).not.toContain("ASHRAE 62.2");
    expect(text).not.toContain("midday convective mixing");

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  it("renders EcoMobilityTracker emission factors and LowEmissionRoutines interactions", () => {
    const onToggle = vi.fn();
    const onAdd = vi.fn();

    render(
      <>
        <EcoMobilityTracker
          isSignedIn={false}
          savedLogs={[]}
          onSaveTripLog={vi.fn()}
          t={TRANSLATIONS.en}
        />
        <LowEmissionRoutines
          routines={DEFAULT_CLEAN_AIR_ROUTINES}
          onToggleRoutine={onToggle}
          onAddRoutine={onAdd}
          isSignedIn={false}
          t={TRANSLATIONS.en}
        />
      </>
    );

    expect(screen.getByText(/India GHG Program/i)).toBeInTheDocument();
    expect(screen.getByText(/Table 4\.2/i)).toBeInTheDocument();
    expect(screen.getByText(/Illustrative Estimate$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Illustrative Assumption \(not established by CEA\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /cea\.nic\.in\/cdm-co2-baseline-view/i,
      })
    ).toHaveAttribute("href", "https://cea.nic.in/cdm-co2-baseline-view/");
    const firstRoutineBtn = screen.getByRole("button", {
      name: new RegExp(DEFAULT_CLEAN_AIR_ROUTINES[0].title, "i"),
    });
    fireEvent.click(firstRoutineBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /Add Custom Routine/i })
    );
    fireEvent.change(screen.getByLabelText(/Routine Title/i), {
      target: { value: "Use metro for weekly errands" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Routine/i }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Use metro for weekly errands" })
    );
  });

  it("renders CommunitySmogWatch with UNVERIFIED citizen labelling and Tamil translation support", () => {
    render(
      <CommunitySmogWatch
        reports={[
          {
            id: "rep-1",
            city: "Chennai",
            state: "Tamil Nadu",
            approximateLocation: "Near Velachery MRTS",
            sourceCategory: "Waste burning",
            severity: "Moderate",
            description:
              "Visible evening smoke from roadside dry leaf burning.",
            observedTimeLabel: "Today 19:15 IST",
            moderationStatus: "UNVERIFIED",
            confirmationsCount: 3,
            createdAtIso: "2026-01-15T13:45:00Z",
          },
        ]}
        activeCity="Chennai"
        isSignedIn={false}
        confirmedIds={new Set()}
        onConfirmReport={vi.fn()}
        onOpenReportModal={vi.fn()}
        t={TRANSLATIONS.ta}
      />
    );

    expect(
      screen.getByText(TRANSLATIONS.ta.sections.smogWatchTitle)
    ).toBeInTheDocument();
    expect(screen.getByText(/UNVERIFIED CITIZEN REPORT/i)).toBeInTheDocument();
    expect(screen.getByText(/Anonymous Citizen Observer/i)).toBeInTheDocument();
  });

  it("renders AiFamilyGuardian with explicit Groq fallback attribution and passes accessibility checks", async () => {
    const { container } = render(
      <AiFamilyGuardian
        locationLabel="Delhi, Delhi"
        household={{
          profileId: "children",
          householdSize: 4,
          commutePreference: "metro_rail",
          outdoorSchedule: "midday",
          hasHepaPurifier: true,
          purifierCadrM3h: 300,
          language: "en",
        }}
        guidance={{
          headline: "Evening particulate buildup in Delhi",
          currentAirQualityExplanation:
            "Modelled PM2.5 is 59 ug/m3 while official CPCB readings are unavailable.",
          householdRecommendations: [
            "Keep children's vigorous play indoors tonight.",
            "Run HEPA purifier continuously in bedrooms.",
          ],
          outdoorActivityTiming: "Prefer short midday errands over dusk walks.",
          activitiesToLimit: ["Roadside jogging during evening peak"],
          indoorProtectionSteps: [
            "Run kitchen exhaust during cooking.",
            "Seal window gaps overnight.",
          ],
          maskGuidance: "Use N95 masks near heavy traffic corridors.",
          commutingRecommendations: "Use enclosed metro rail.",
          next24HourActionPlan: [
            "Check readings before school.",
            "Flush indoor air briefly if haze lifts.",
            "Avoid open-air exercise after 18:00.",
          ],
          recommendationExplanations: [
            {
              recommendation: "Indoor evening play",
              whyItMatters: "Low wind traps PM2.5 close to street level.",
            },
            {
              recommendation: "Bedroom HEPA purifier",
              whyItMatters: "Lowers overnight fine particulate exposure.",
            },
          ],
          dataLimitationsAndUncertainty:
            "Based on Open-Meteo regional model while CPCB telemetry was unreachable.",
          medicalSafetyNote:
            "Informational only. Seek urgent medical care for breathlessness.",
        }}
        guidanceProvider="groq"
        guidanceModel="llama-3.3-70b-versatile"
        guidanceFallbackReason="Primary Gemini (gemini-3.8-flash) unavailable: model not found"
        guidanceLoading={false}
        guidanceError={null}
        onRefreshGuidance={vi.fn()}
        onAskQuestion={vi.fn(async () => ({
          answer: "Prefer indoor activities after dusk.",
          provider: "groq" as const,
          model: "llama-3.3-70b-versatile",
          fallbackUsed: true,
        }))}
        t={TRANSLATIONS.en}
      />
    );

    expect(
      screen.getByText(/Automatic Secondary Fallback Active/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Evening particulate buildup in Delhi/i)
    ).toBeInTheDocument();

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  it("renders Header, WorkspaceToolbar, and DailyProtectionPlanner with semantic ARIA states and passes axe checks", async () => {
    const onNavigate = vi.fn();
    const onChangeLanguage = vi.fn();
    const onChangeHousehold = vi.fn();

    const { container } = render(
      <>
        <Header
          activeSection="guardian"
          onNavigate={onNavigate}
          onOpenReportModal={vi.fn()}
          t={TRANSLATIONS.en}
        />
        <WorkspaceToolbar
          language="en"
          onChangeLanguage={onChangeLanguage}
          locationLabel="Chennai, Tamil Nadu"
          onRequestBrowserLocation={vi.fn()}
          locationRequestPending={false}
          onRefreshAirQuality={vi.fn()}
          airLoading={false}
          t={TRANSLATIONS.en}
        />
        <DailyProtectionPlanner
          household={{
            profileId: "children",
            householdSize: 4,
            commutePreference: "metro_rail",
            outdoorSchedule: "midday",
            hasHepaPurifier: true,
            purifierCadrM3h: 300,
            language: "en",
          }}
          onChangeHousehold={onChangeHousehold}
          aqi={110}
          category="Moderate"
          pm25={52}
          windKmh={12}
          bestWindowLabel="13:00-15:00 IST"
          savingProfile={false}
          isSignedIn={false}
          t={TRANSLATIONS.en}
        />
      </>
    );

    const guardianNavButtons = screen.getAllByRole("button", {
      name: TRANSLATIONS.en.nav.guardian,
    });
    expect(guardianNavButtons[0]).toHaveAttribute("aria-current", "location");

    const enBtn = screen.getByRole("button", { name: "English" });
    const taBtn = screen.getByRole("button", { name: "தமிழ்" });
    expect(enBtn).toHaveAttribute("aria-pressed", "true");
    expect(taBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(taBtn);
    expect(onChangeLanguage).toHaveBeenCalledWith("ta");

    const seniorsBtn = screen.getByRole("button", { name: "Older adults" });
    expect(seniorsBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(seniorsBtn);
    expect(onChangeHousehold).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "seniors" })
    );

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  it("supports Escape dismissal, initial focus, aria-pressed severity, and client file validation in ReportSmogModal", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <ReportSmogModal
        open={true}
        defaultCity="Chennai"
        defaultState="Tamil Nadu"
        isSignedIn={true}
        onSignIn={vi.fn()}
        getIdToken={vi.fn(async () => "fake-token")}
        onClose={onClose}
        onSubmit={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const closeBtn = screen.getByRole("button", { name: /Close modal/i });
    expect(document.activeElement).toBe(closeBtn);

    const severeBtn = screen.getByRole("button", { name: "Severe" });
    expect(severeBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(severeBtn);
    expect(severeBtn).toHaveAttribute("aria-pressed", "true");

    const fileInput = screen.getByLabelText(/Optional Photo/i);
    const badFile = new File(["<svg></svg>"], "bad.svg", {
      type: "image/svg+xml",
    });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Only JPEG, PNG, and WebP photos are supported/i
    );

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows accessible coordinate validation alerts in AirQualityDashboard and routine title errors in LowEmissionRoutines", () => {
    const onSelectLocation = vi.fn();
    const onAddRoutine = vi.fn();

    render(
      <>
        <AirQualityDashboard
          activeLocation={{
            city: INDIAN_CITY_PRESETS[0].city,
            state: INDIAN_CITY_PRESETS[0].state,
            latitude: INDIAN_CITY_PRESETS[0].latitude,
            longitude: INDIAN_CITY_PRESETS[0].longitude,
            source: "preset",
          }}
          onSelectLocation={onSelectLocation}
          measured={null}
          modelled={null}
          selectedCpcbIndex={0}
          onSelectCpcbIndex={vi.fn()}
          loading={false}
          error={null}
          t={TRANSLATIONS.en}
        />
        <LowEmissionRoutines
          routines={DEFAULT_CLEAN_AIR_ROUTINES}
          onToggleRoutine={vi.fn()}
          onAddRoutine={onAddRoutine}
          isSignedIn={false}
          t={TRANSLATIONS.en}
        />
      </>
    );

    const coordToggle = screen.getByRole("button", {
      name: /Enter Lat\/Lon/i,
    });
    expect(coordToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(coordToggle);
    expect(coordToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.change(screen.getByLabelText("Latitude"), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load Coordinates" }));
    expect(onSelectLocation).not.toHaveBeenCalled();

    const addRoutineToggle = screen.getByRole("button", {
      name: /Add Custom Routine/i,
    });
    expect(addRoutineToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(addRoutineToggle);
    expect(addRoutineToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.change(screen.getByLabelText(/Routine Title/i), {
      target: { value: "ab" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Routine/i }));
    expect(onAddRoutine).not.toHaveBeenCalled();

    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((a) =>
        /latitude between -90 and 90/i.test(a.textContent ?? "")
      )
    ).toBe(true);
    expect(
      alerts.some((a) => /at least 3 characters/i.test(a.textContent ?? ""))
    ).toBe(true);
  });

  it("traps Tab and Shift+Tab focus inside ReportSmogModal and announces CommunitySmogWatch confirmations", async () => {
    const onConfirmReport = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <ReportSmogModal
          open={true}
          defaultCity="Chennai"
          defaultState="Tamil Nadu"
          isSignedIn={false}
          onSignIn={vi.fn()}
          getIdToken={vi.fn(async () => null)}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
        <CommunitySmogWatch
          reports={[
            {
              id: "rep-confirm-1",
              city: "Chennai",
              state: "Tamil Nadu",
              approximateLocation: "Guindy Industrial Estate",
              sourceCategory: "Industrial emissions",
              severity: "Moderate",
              description: "Visible stack plume",
              observedTimeLabel: "Today 09:00 IST",
              moderationStatus: "UNVERIFIED",
              confirmationsCount: 2,
              createdAtIso: "2026-01-15T03:30:00Z",
            },
          ]}
          activeCity="Chennai"
          isSignedIn={true}
          confirmedIds={new Set()}
          onConfirmReport={onConfirmReport}
          onOpenReportModal={vi.fn()}
          t={TRANSLATIONS.en}
        />
      </>
    );

    const closeBtn = screen.getByRole("button", { name: /Close modal/i });
    const signInBtn = screen.getByRole("button", {
      name: /Sign in with Google/i,
    });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from first focusable wraps to last focusable inside modal
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(signInBtn);

    // Tab from last focusable wraps back to first focusable inside modal
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Confirm button exposes unique per-report accessible name & announces status
    const confirmBtn = screen.getByRole("button", {
      name: /Confirm sighting at Guindy Industrial Estate/i,
    });
    fireEvent.click(confirmBtn);
    await vi.waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        /Confirmed smog observation at Guindy Industrial Estate/i
      );
    });
  });

  it("marks background app shell inert and aria-hidden while ReportSmogModal is open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/air-quality")) {
          return new Response(
            JSON.stringify({
              measured: null,
              modelled: null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ error: "Not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    const { default: App } = await import("../../src/App");
    const { container } = render(<App />);

    const openModalButtons = screen.getAllByRole("button", {
      name: TRANSLATIONS.en.actions.reportSmog,
    });
    openModalButtons[0].focus();
    fireEvent.click(openModalButtons[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const inertWrapper = container.querySelector("[inert]");
    expect(inertWrapper).not.toBeNull();
    expect(inertWrapper).toHaveAttribute("aria-hidden", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector("[inert]")).toBeNull();
    expect(document.activeElement).toBe(openModalButtons[0]);
  });

  it("renders accessible ErrorBoundary fallback alert when a child throws", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    function Bomb(): React.ReactNode {
      throw new Error("Simulated child crash");
    }
    try {
      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );
      const alertEl = screen.getByRole("alert");
      expect(alertEl).toHaveTextContent(/Something went wrong/i);
      expect(
        screen.getByRole("button", { name: /Reload BreatheWise/i })
      ).toBeInTheDocument();
    } finally {
      consoleErr.mockRestore();
    }
  });
});
