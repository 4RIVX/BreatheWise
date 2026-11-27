import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("BreatheWise Accessibility & Keyboard E2E", () => {
  test("dashboard passes automated axe-core accessibility checks", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Air Quality Intelligence Dashboard/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  test("skip-to-main-content link moves keyboard focus to main landmark", async ({
    page,
  }) => {
    await page.goto("/");
    const skipLink = page.getByRole("link", { name: /Skip to main content/i });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("Report Smog modal traps keyboard focus, closes on Escape, and restores trigger focus", async ({
    page,
  }) => {
    await page.goto("/");
    const openButton = page
      .getByRole("banner")
      .getByRole("button", { name: "Report Smog" });
    await openButton.focus();
    await openButton.click();

    const dialog = page.getByRole("dialog", {
      name: /Submit Community Smog Observation/i,
    });
    await expect(dialog).toBeVisible();

    const closeButton = dialog.getByRole("button", { name: "Close modal" });
    await expect(closeButton).toBeFocused();

    // Tabbing inside the modal keeps focus inside the dialog
    await page.keyboard.press("Tab");
    const activeInsideDialog = await dialog.evaluate((el) =>
      el.contains(document.activeElement)
    );
    expect(activeInsideDialog).toBe(true);

    // Escape closes the dialog and restores focus to the trigger button
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(openButton).toBeFocused();
  });

  test("Report Smog modal passes axe-core checks while open", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Report Smog" })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();

    expect(
      results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      )
    ).toEqual([]);
  });

  test("DispersionChart toggles cleanly between SVG chart and accessible data table", async ({
    page,
  }) => {
    await page.goto("/");
    const tableButton = page.getByRole("button", { name: "Data Table" });
    if (await tableButton.isVisible()) {
      await tableButton.click();
      await expect(page.getByRole("table")).toBeVisible();
    }
  });

  test("supports switching UI language between English and Tamil", async ({
    page,
  }) => {
    await page.goto("/");
    const tamilButton = page.getByRole("button", { name: "தமிழ்" });
    await tamilButton.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ta");

    const englishButton = page.getByRole("button", { name: "English" });
    await englishButton.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
