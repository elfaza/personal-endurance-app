import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";
import { manualActivities } from "@/lib/measurements";
import type { Feedback } from "@/lib/domain";

test("both commute rides appear, individual journals override shared RPE, and analytics counts both", async ({
  page,
}) => {
  const d = demoData("2026-10-28"),
    a = d.activities.find((a) => a.type === "cycling")!;
  const morning = {
    ...a,
    id: "am",
    date: "2026-10-27",
    startedAt: "2026-10-27T05:45:00+07:00",
    durationSec: 1800,
  };
  const home = {
    ...morning,
    id: "pm",
    title: "Ride home",
    startedAt: "2026-10-27T16:30:00+07:00",
  };
  const w = {
    ...d.workouts.find((w) => w.type === "Bike-to-Work")!,
    date: morning.date,
    commuteLegs: 2 as const,
    linkedActivityId: "am",
    linkedActivityIds: ["am", "pm"],
  };
  d.activities = [morning, home];
  d.workouts = [w];
  d.links = [
    {
      id: w.id,
      revision: "r",
      workoutId: w.id,
      activityId: "am",
      activityIds: ["am", "pm"],
    },
  ];
  d.feedback = [
    {
      id: "shared",
      revision: "r",
      workoutId: w.id,
      date: w.date,
      scope: "session",
      rpe: 4,
      energy: null,
      fatigue: null,
      soreness: null,
      sleepQuality: null,
      notes: "Shared commute",
      skippedReason: "",
    },
  ];
  await page.route("**/api/data", (r) => r.fulfill({ json: d }));
  await page.route("**/api/activities/*", (r) =>
    r.fulfill({
      json: d.activities.find((a) => r.request().url().endsWith(`/${a.id}`)),
    }),
  );
  await page.route("**/api/training", (r) => {
    const c = r.request().postDataJSON();
    expect(c.action).toBe("feedback");
    d.feedback = [
      ...d.feedback.filter((f) => f.id !== c.id),
      { ...c.feedback, id: c.id, revision: "saved" } as Feedback,
    ];
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/activities");
  await page.locator(".activity-filters select").selectOption("commute");
  await expect(page.locator(".activity-row")).toHaveCount(2);
  await expect(
    page.locator(".activity-row").filter({ hasText: "Linked" }),
  ).toHaveCount(2);
  await page.goto("/activities/pm");
  const score = page
    .locator(".detail-list > div")
    .filter({ hasText: "Personal RPE" });
  await expect(score).toContainText("4 / 10");
  await page.getByRole("button", { name: "Open workout journal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Journal", exact: true }).click();
  await dialog.getByLabel("Journal for").selectOption("pm");
  await dialog.getByLabel("Activity RPE").selectOption("6");
  await dialog
    .getByRole("button", { name: "Save journal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(score).toContainText("6 / 10");
  await page.goto("/activities/am");
  await expect(score).toContainText("4 / 10");
  await page.goto("/analytics");
  await expect(page.locator(".load-value")).toContainText("300");
  await expect(page.locator(".load-card")).toContainText("2 of 2");
});

test("manual source results are distinct from Garmin and roadmap goal conditions survive editing", async ({
  page,
}) => {
  const d = demoData("2026-10-28");
  const w = {
    ...d.workouts[0],
    id: "manual",
    date: "2026-10-27",
    title: "Manual easy run",
    status: "Completed" as const,
    linkedActivityId: undefined,
    linkedActivityIds: [],
    recordedResult: { distanceKm: 5, durationMin: 30, avgHr: 140, maxHr: 160 },
  };
  d.workouts = [w];
  d.links = [];
  d.activities = manualActivities([w], [], []);
  d.goals = [
    {
      id: "primary",
      revision: "r",
      title: "First half marathon",
      distanceKm: 21.1,
      targetMonth: "2027-01",
      date: null,
      targetTimeMin: null,
      priority: "primary",
      notes: "Only if recovered; March is the backup",
    },
    {
      id: "backup",
      revision: "r",
      title: "March backup",
      distanceKm: 21.1,
      targetMonth: "2027-03",
      date: null,
      targetTimeMin: null,
      priority: "backup",
      notes: "Use if January is not ready",
    },
  ];
  await page.route("**/api/data", (r) => r.fulfill({ json: d }));
  await page.route("**/api/training", (r) => {
    const c = r.request().postDataJSON();
    expect(c.action).toBe("goal");
    expect(c.goal.notes).toBe(d.goals[0].notes);
    d.goals = d.goals.map((g) =>
      g.id === c.id ? { ...c.goal, id: g.id, revision: "saved" } : g,
    );
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/activities/sheet-manual");
  await expect(
    page.getByText("GOOGLE SHEETS · MANUAL RESULT", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Time not recorded", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Original activity ZIP", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/analytics");
  await expect(page.getByText("March backup", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit race goal" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Exact date", { exact: false })).toHaveValue(
    "",
  );
  await dialog.getByLabel("Goal name").fill("My first HM (conditional)");
  await dialog.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByText("My first HM (conditional)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Only if recovered; March is the backup", { exact: true }),
  ).toBeVisible();
});
