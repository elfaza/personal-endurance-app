import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";
import { addDays, localDate, weekStart } from "@/lib/dates";

for (const count of [1, 2, 0]) {
  test(`sparse charts show ${count} recorded points without filling missing days`, async ({
    page,
  }) => {
    const monday = weekStart(localDate());
    const data = demoData(monday);
    const run = data.activities.find((a) => a.type === "running")!;
    const workout = data.workouts[0];
    data.activities = Array.from({ length: count }, (_, i) => ({
      ...run,
      id: `chart-run-${i}`,
      date: addDays(monday, i * 2),
      startedAt: `${addDays(monday, i * 2)}T06:00:00+07:00`,
      distanceKm: 3,
      durationSec: 1653,
      avgHr: 142,
    }));
    data.workouts = data.activities.map((a, i) => ({
      ...workout,
      id: `chart-workout-${i}`,
      date: a.date,
      status: "Completed",
      optional: false,
    }));
    data.links = [];
    await page.route("**/api/data", (route) => route.fulfill({ json: data }));
    await page.goto("/dashboard");
    for (const [label, metric] of [
      ["Pace", "pace"],
      ["Heart rate", "heart"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      const chart = page.getByRole("img", {
        name: `Weekly ${metric} chart`,
        exact: true,
      });
      await expect(chart.locator(".recharts-surface")).toBeVisible();
      await expect(chart.locator(".recharts-area-dot")).toHaveCount(count);
      if (count) {
        const point = chart.locator(".recharts-area-dot").first();
        await expect(point).toBeVisible();
        await point.hover();
        await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText(
          metric === "pace" ? "9:11 /km" : "142 bpm",
        );
      }
    }
    await page.goto("/analytics");
    for (const metric of ["pace", "heart", "consistency"]) {
      const chart = page.getByRole("img", {
        name: `Weekly ${metric} chart`,
        exact: true,
      });
      await chart.scrollIntoViewIfNeeded();
      await expect(chart.locator(".recharts-surface")).toBeVisible();
      await expect(chart.locator(".recharts-area-dot")).toHaveCount(count);
      if (count)
        await expect(chart.locator(".recharts-area-dot").first()).toBeVisible();
    }
    if (count === 1)
      await page.screenshot({
        path: "test-results/sparse-charts.png",
        fullPage: true,
      });
  });
}
