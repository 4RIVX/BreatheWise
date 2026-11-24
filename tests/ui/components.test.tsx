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

afterEach(() => {
  cleanup();
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
});
