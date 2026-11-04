import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";

test("a confirmed save survives a failed summary refresh and cannot be submitted twice", async ({
  page,
}) => {
  const fixture = demoData("2026-10-28");
  const activity = fixture.activities.find((a) =>
    fixture.workouts.some((w) => w.linkedActivityId === a.id),
  )!;
  let reads = 0,
    writes = 0;
  await page.route("**/api/data", (route) => {
    reads++;
    return reads === 2
      ? route.fulfill({
          status: 503,
          json: { error: "Temporary summary failure" },
        })
      : route.fulfill({ json: fixture });
  });
  await page.route("**/api/activities/*", (route) =>
    route.fulfill({ json: activity }),
  );
  await page.route("**/api/training", (route) => {
    writes++;
    const command = route.request().postDataJSON();
    fixture.feedback = [
      { ...command.feedback, id: command.id, revision: "saved" },
    ];
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/activities/${activity.id}`);
  await page.getByRole("button", { name: "Open workout journal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Journal", exact: true }).click();
  await dialog.getByLabel("Session RPE").selectOption("6");
  await dialog
    .getByRole("button", { name: "Save journal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Your changes were saved.", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  expect(reads).toBe(2);
  await page.getByRole("button", { name: "Open workout journal" }).click();
  await dialog.getByRole("tab", { name: "Journal", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Save journal", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Refresh saved data" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh saved data" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open workout journal" }),
  ).toBeEnabled();
  await expect(
    page.locator(".detail-list > div").filter({ hasText: "Personal RPE" }),
  ).toContainText("6 / 10");
  expect(writes).toBe(1);
  expect(reads).toBe(3);
});

test("quota errors pause requests instead of repeatedly calling the server", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/data", (route) => {
    reads++;
    return route.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      json: { error: "Google Sheets is rate limiting requests." },
    });
  });
  await page.goto("/dashboard");
  await expect(page.locator(".error-state[role=alert]")).toContainText(
    "rate limiting",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".error-state[role=alert]")).toContainText(
    "Please wait",
  );
  expect(reads).toBe(1);
});
