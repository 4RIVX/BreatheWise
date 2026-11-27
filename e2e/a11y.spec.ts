import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectWcagClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false);
}

async function expectMinimumTouchTarget(button: Locator) {
  const bounds = await button.boundingBox();
  const label =
    (await button.getAttribute("aria-label")) ?? (await button.innerText());
  const minHeight = await button.evaluate(
    (element) => getComputedStyle(element).minHeight
  );
  expect(
    bounds?.height,
    `Touch target "${label}" has CSS min-height ${minHeight}`
  ).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").waitFor();
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`WCAG 2.2 AA and no overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    await expectWcagClean(page);
    await expectNoHorizontalOverflow(page);
  });
}

test("Tamil language updates the document language and remains accessible", async ({
  page,
}) => {
  await page
    .getByRole("group", { name: "Language selection" })
    .getByRole("button", { name: "தமிழ்" })
    .click();

  await expect(page.locator("html")).toHaveAttribute("lang", "ta");
  await expectWcagClean(page);
});

test("the open report dialog is keyboard accessible", async ({ page }) => {
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Report Smog" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Submit Community Smog Observation",
  });

  await expect(dialog).toBeVisible();
  await expectWcagClean(page);
});

test("header, toolbar, and modal actions meet 44px touch targets", async ({
  page,
}) => {
  const header = page.getByRole("banner");
  for (const button of await header.getByRole("button").all()) {
    await expectMinimumTouchTarget(button);
  }

  const toolbarButtons = [
    page.getByRole("button", { name: "Use my location" }),
    page.getByRole("button", { name: "Refresh Readings" }),
    ...(await page
      .getByRole("group", { name: "Language selection" })
      .getByRole("button")
      .all()),
  ];
  for (const button of toolbarButtons) {
    await expectMinimumTouchTarget(button);
  }

  await header.getByRole("button", { name: "Report Smog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectMinimumTouchTarget(
    dialog.getByRole("button", { name: "Close modal" })
  );
  await expectMinimumTouchTarget(
    dialog.getByRole("button", { name: "Sign in with Google" })
  );
});

test("skip link is first in keyboard order and Escape restores modal focus", async ({
  page,
}) => {
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();

  const reportButton = page
    .getByRole("banner")
    .getByRole("button", { name: "Report Smog" });
  await reportButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(reportButton).toBeFocused();
});
