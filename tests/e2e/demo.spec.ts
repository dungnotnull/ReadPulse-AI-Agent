import { expect, test } from "@playwright/test";

test("demo page renders and blocks submit until file chosen", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /score a recording/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /score reading/i })).toBeDisabled();
});

test("report page renders for a seeded slug", async ({ page }) => {
  await page.goto("/report/readpulse-seed");
  await expect(page.getByText(/reading report/i)).toBeVisible();
  await expect(page.getByTestId("wcpm")).toBeVisible();
});
