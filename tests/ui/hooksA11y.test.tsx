// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INDIAN_CITY_PRESETS } from "../../src/domain/indianCities";
import { TRANSLATIONS } from "../../src/domain/i18n";
import { useHouseholdPreferences } from "../../src/hooks/useHouseholdPreferences";

describe("useHouseholdPreferences language synchronization", () => {
  it("sets the document language when the household language changes", () => {
    localStorage.clear();
    const { result } = renderHook(() =>
      useHouseholdPreferences({
        user: null,
        authReady: true,
        firebaseEnabled: false,
        activeLocation: { ...INDIAN_CITY_PRESETS[0], source: "preset" },
        onError: vi.fn(),
      })
    );

    expect(document.title).toBe(TRANSLATIONS.en.documentTitle);
    act(() => result.current.handleLanguageChange("ta"));
    expect(document.documentElement.lang).toBe("ta");
    expect(document.title).toBe(TRANSLATIONS.ta.documentTitle);
    act(() => result.current.handleLanguageChange("en"));
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe(TRANSLATIONS.en.documentTitle);
  });
});
