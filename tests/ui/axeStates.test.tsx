// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { TRANSLATIONS } from "../../src/domain/i18n";
import { INDIAN_CITY_PRESETS } from "../../src/domain/indianCities";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../../src/domain/defaultRoutines";
import { DispersionChart } from "../../src/components/DispersionChart";
import { EcoMobilityTracker } from "../../src/components/EcoMobilityTracker";
import { LowEmissionRoutines } from "../../src/components/LowEmissionRoutines";
import { CommunitySmogWatch } from "../../src/components/CommunitySmogWatch";
import { ReportSmogModal } from "../../src/components/ReportSmogModal";
import { AiFamilyGuardian } from "../../src/components/AiFamilyGuardian";
import { AirQualityDashboard } from "../../src/components/AirQualityDashboard";

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

afterEach(() => cleanup());

async function expectWcagClean(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
  expect(results.violations).toEqual([]);
}

const location = { ...INDIAN_CITY_PRESETS[0], source: "preset" as const };
const series = [
  {
    timeIso: "2026-01-15T10:00",
    hourLabel: "10:00",
    pm25: 54.2,
    pm10: 96.1,
    no2: 31.4,
    so2: 12.1,
    ozone: 48,
    coUgm3: 700,
    windKmh: 11.4,
    boundaryLayerHeightM: 640,
  },
];

describe("axe coverage for previously unscanned states", () => {
  it("scans DispersionChart", async () => {
    const { container } = render(
      <DispersionChart series={series} locationLabel="Chennai, Tamil Nadu" />
    );
    await expectWcagClean(container);
  });

  it("scans EcoMobilityTracker and LowEmissionRoutines", async () => {
    const { container } = render(
      <>
        <EcoMobilityTracker
          isSignedIn={false}
          savedLogs={[]}
          onSaveTripLog={vi.fn()}
          t={TRANSLATIONS.en}
        />
        <LowEmissionRoutines
          routines={DEFAULT_CLEAN_AIR_ROUTINES}
          onToggleRoutine={vi.fn()}
          onAddRoutine={vi.fn()}
          isSignedIn={false}
          t={TRANSLATIONS.en}
        />
      </>
    );
    await expectWcagClean(container);
  });

  it("scans CommunitySmogWatch in Tamil", async () => {
    const { container } = render(
      <CommunitySmogWatch
        reports={[
          {
            id: "rep-1",
            city: "Chennai",
            state: "Tamil Nadu",
            approximateLocation: "Velachery",
            sourceCategory: "Waste burning",
            severity: "Moderate",
            description: "Visible smoke",
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
    await expectWcagClean(container);
  });

  it("scans the signed-in ReportSmogModal", async () => {
    const { container } = render(
      <ReportSmogModal
        open
        defaultCity="Chennai"
        defaultState="Tamil Nadu"
        isSignedIn
        onSignIn={vi.fn(async () => {})}
        getIdToken={vi.fn(async () => "tok")}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => {})}
      />
    );
    await expectWcagClean(container);
  });

  it("associates report validation errors with the form fields", () => {
    const { container } = render(
      <ReportSmogModal
        open
        defaultCity="Chennai"
        defaultState="Tamil Nadu"
        isSignedIn
        onSignIn={vi.fn(async () => {})}
        getIdToken={vi.fn(async () => "tok")}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => {})}
      />
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Report form was not rendered.");
    fireEvent.submit(form);

    const error = screen.getByRole("alert");
    const locationField = screen.getByLabelText(
      "Approximate Location (Neighbourhood / Landmark)"
    );
    const descriptionField = screen.getByLabelText("Observation Description");
    expect(form).toHaveAttribute("aria-describedby", error.id);
    expect(locationField).toHaveAttribute("aria-invalid", "true");
    expect(locationField).toHaveAttribute("aria-describedby", error.id);
    expect(descriptionField).toHaveAttribute("aria-invalid", "true");
    expect(descriptionField).toHaveAttribute("aria-describedby", error.id);
  });

  it("scans AiFamilyGuardian error state", async () => {
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
        guidance={null}
        guidanceProvider={null}
        guidanceModel={null}
        guidanceFallbackReason={null}
        guidanceLoading={false}
        guidanceError="Unable to generate guidance."
        onRefreshGuidance={vi.fn()}
        onAskQuestion={vi.fn(async () => ({ answer: "x" }))}
        t={TRANSLATIONS.en}
      />
    );
    await expectWcagClean(container);
  });

  it("scans AirQualityDashboard error state", async () => {
    const { container } = render(
      <AirQualityDashboard
        activeLocation={location}
        onSelectLocation={vi.fn()}
        measured={null}
        modelled={null}
        selectedCpcbIndex={0}
        onSelectCpcbIndex={vi.fn()}
        loading={false}
        error="Both providers are temporarily unavailable."
        t={TRANSLATIONS.en}
      />
    );
    await expectWcagClean(container);
  });
});
