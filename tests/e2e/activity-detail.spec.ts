import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";

test("all metric surfaces round fractional data without altering raw values", async ({
  page,
}) => {
  const data = demoData("2026-10-28");
  const original = data.activities.find((a) => a.type === "cycling")!;
  const a = {
    ...original,
    date: "2026-10-27",
    distanceKm: 21.560310546875,
    durationSec: 4085.6201171875,
    elevationM: 98.21038627624512 as number | null,
    avgHr: 133.123456,
    maxHr: 159.987654,
    splits: [
      {
        index: 1,
        distanceKm: 0.123456789,
        durationSec: 65.55555,
        avgHr: 132.66666,
      },
    ],
  };
  const w = {
    ...data.workouts.find((w) => w.linkedActivityId === original.id)!,
    date: a.date,
    distanceKm: 3.511234567,
    durationMin: 40.5555555,
    recordedResult: {
      distanceKm: a.distanceKm,
      durationMin: a.durationSec / 60,
      avgHr: a.avgHr,
      maxHr: a.maxHr,
    },
  };
  data.activities = [a];
  data.workouts = [w];
  data.links = [{ id: w.id, revision: "r", workoutId: w.id, activityId: a.id }];
  data.goals[0].distanceKm = 21.11234567;
  await page.route("**/api/data", (r) => r.fulfill({ json: data }));
  await page.route("**/api/activities/*", (r) => r.fulfill({ json: a }));
  await page.goto(`/activities/${a.id}`);
  const elevation = page
    .locator(".detail-metrics .metric-card")
    .filter({ hasText: "ELEVATION GAIN" });
  await expect(elevation.locator(".metric-value")).toHaveText("98.2m");
  await expect(page.locator(".detail-metrics")).toContainText("133 / 160");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await elevation.evaluate((card) => ({
      card: card.getBoundingClientRect().right,
      value: card.querySelector(".metric-value")!.getBoundingClientRect().right,
    }));
    expect(bounds.value).toBeLessThanOrEqual(bounds.card + 1);
  }
  const structured =
    ".metric-value,.comparison,.detail-list,.split-table,.workout-meta,.activity-table,.chart-summary,.goal-distance,.goal-progress-text,.recharts-cartesian-axis-ticks";
  expect(
    (await page.locator(structured).allTextContents()).join(" "),
  ).not.toMatch(/\d+\.\d{3,}/);
  await page
    .getByRole("button", { name: "Edit plan or unlink activity" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: "Activity", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("21.56 km");
  await expect(page.getByRole("dialog")).toContainText("68.1 min");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  for (const path of ["/activities", "/calendar", "/dashboard", "/analytics"]) {
    await page.goto(path);
    if (path === "/calendar") await page.getByLabel("Go to date").fill(a.date);
    await expect(page.locator(structured).first()).toBeVisible();
    expect(
      (await page.locator(structured).allTextContents()).join(" "),
    ).not.toMatch(/\d+\.\d{3,}/);
  }
  a.elevationM = null;
  await page.goto(`/activities/${a.id}`);
  await page.reload();
  await expect(elevation.locator(".metric-value")).toHaveText("—m");
  a.elevationM = 0;
  await page.reload();
  await expect(elevation.locator(".metric-value")).toHaveText("0m");
  expect(a.distanceKm).toBe(21.560310546875);
  expect(w.distanceKm).toBe(3.511234567);
});
