// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { EcoMobilityTracker } from "../../src/components/EcoMobilityTracker";
import { TRANSLATIONS } from "../../src/domain/i18n";
import type { ComponentProps } from "react";

type SaveTripLog = ComponentProps<typeof EcoMobilityTracker>["onSaveTripLog"];

function renderTracker(isSignedIn: boolean, onSaveTripLog: SaveTripLog) {
  return render(
    <EcoMobilityTracker
      isSignedIn={isSignedIn}
      savedLogs={[]}
      onSaveTripLog={onSaveTripLog}
      t={TRANSLATIONS.en}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("EcoMobilityTracker interactions", () => {
  it("clamps numeric inputs and toggles occupancy support by transport mode", () => {
    renderTracker(
      false,
      vi.fn<SaveTripLog>(async () => {})
    );

    const distance = screen.getByLabelText("One-Way Distance (km)");
    const journeys = screen.getByLabelText("Number of Journeys");
    const originalMode = screen.getByLabelText("Original Transport Mode");
    const originalOccupants = screen.getByLabelText("Orig. Occupants");
    const alternativeOccupants = screen.getByLabelText("Alt. Occupants");

    fireEvent.change(distance, { target: { value: "" } });
    fireEvent.change(journeys, { target: { value: "500" } });
    expect(distance).toHaveValue(0.5);
    expect(journeys).toHaveValue(365);

    fireEvent.change(originalMode, { target: { value: "city_bus_diesel" } });
    expect(originalOccupants).toBeDisabled();
    expect(alternativeOccupants).toBeDisabled();

    fireEvent.change(originalMode, { target: { value: "car_petrol" } });
    expect(originalOccupants).toBeEnabled();
  });

  it("saves the signed-in commute comparison and announces success", async () => {
    const onSaveTripLog = vi.fn<SaveTripLog>(async () => {});
    renderTracker(true, onSaveTripLog);

    fireEvent.change(screen.getByLabelText("One-Way Distance (km)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Number of Journeys"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Commute Log" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Commute comparison saved to your Firestore log."
    );
    expect(onSaveTripLog).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 20,
        journeys: 2,
        originalMode: "Petrol Car",
        alternativeMode: "Metro Rail (India Grid · Illustrative)",
        factorVersion: expect.stringContaining("IN-GHG-ROAD-2015-v2"),
      })
    );
  });

  it("announces save failures and restores the action state", async () => {
    const onSaveTripLog = vi.fn<SaveTripLog>(async () => {
      throw new Error("Firestore offline");
    });
    renderTracker(true, onSaveTripLog);

    fireEvent.click(screen.getByRole("button", { name: "Save Commute Log" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Firestore offline"
    );
    expect(
      screen.getByRole("button", { name: "Save Commute Log" })
    ).toBeEnabled();
  });

  it("uses a safe error for non-Error failures and blocks signed-out saves", async () => {
    const onSaveTripLog = vi.fn<SaveTripLog>(async () => {
      throw "offline";
    });
    const { rerender } = render(
      <EcoMobilityTracker
        isSignedIn={false}
        savedLogs={[]}
        onSaveTripLog={onSaveTripLog}
        t={TRANSLATIONS.en}
      />
    );
    const signedOutButton = screen.getByRole("button", {
      name: "Sign in to Save Log",
    });
    expect(signedOutButton).toBeDisabled();
    fireEvent.click(signedOutButton);
    expect(onSaveTripLog).not.toHaveBeenCalled();

    rerender(
      <EcoMobilityTracker
        isSignedIn
        savedLogs={[]}
        onSaveTripLog={onSaveTripLog}
        t={TRANSLATIONS.en}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Commute Log" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save trip log."
    );
  });
});
