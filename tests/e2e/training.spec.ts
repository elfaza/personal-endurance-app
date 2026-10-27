import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { demoData } from "@/lib/demo";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("BROWSER ERROR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR", m.text());
  });
  page.on("requestfailed", (r) =>
    console.log("FAILED REQUEST", r.url(), r.failure()?.errorText),
  );
});

test("live plan source is clear and editing keeps sheet goals and duration ranges", async ({
  page,
}) => {
  const fixture = demoData("2026-11-02");
  const workout = {
    ...fixture.workouts[0],
    date: "2026-11-02",
    title: "Weekly generated run",
    type: "Easy Run" as const,
    status: "Planned" as const,
    distanceKm: null,
    durationMin: null,
    durationText: "40–55",
    goal: "Build consistency",
    linkedActivityId: undefined,
    linkedActivityIds: [],
  };
  fixture.workouts = [workout];
  fixture.links = [];
  fixture.configured = {
    ...fixture.configured,
    sheets: true,
    initialized: true,
    readOnly: false,
    planSource: "training-plan",
  };
  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/data", (route) => route.fulfill({ json: fixture }));
  await page.route("**/api/training", (route) => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/settings");
  await expect(
    page.getByText("Training Plan · live", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your calendar reads the Training Plan tab directly.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto("/calendar");
  await page.getByLabel("Go to date").fill(workout.date);
  const card = page.locator(".workout-card").filter({ hasText: workout.title });
  await expect(card).toContainText("40–55 min");
  await card.click();
  await expect(page.getByLabel("Session goal")).toHaveValue(
    "Build consistency",
  );
  await expect(page.getByLabel("Duration range / detail")).toHaveValue("40–55");
  await page.getByLabel("Personal notes").fill("Saved on web");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(posted[0].workout).toMatchObject({
    goal: "Build consistency",
    durationText: "40–55",
    durationMin: null,
    notes: "Saved on web",
  });
});

test("round-trip progress stays partial and the editor adds only a compatible return ride", async ({
  page,
}) => {
  const fixture = demoData("2026-10-27");
  const template = fixture.workouts.find((w) => w.type === "Bike-to-Work")!;
  const commute = {
    ...template,
    id: "browser-commute",
    date: "2026-10-27",
    title: "Commute progress test",
    time: "05:45",
    commuteLegs: 2 as const,
    commuteReturnTime: "16:30",
    status: "Partially Completed" as const,
    completionSource: "garmin" as const,
    linkedActivityId: "am",
    linkedActivityIds: ["am"],
  };
  const activity = fixture.activities.find((a) => a.type === "cycling")!;
  fixture.workouts = [commute];
  fixture.activities = [
    {
      ...activity,
      id: "am",
      title: "Morning commute",
      date: commute.date,
      startedAt: "2026-10-26T22:33:41Z",
    },
    {
      ...activity,
      id: "pm",
      title: "Return commute",
      date: commute.date,
      startedAt: "2026-10-27T09:35:00Z",
    },
    {
      ...activity,
      id: "wrong-sport",
      title: "Other run",
      type: "running",
      date: commute.date,
    },
  ];
  fixture.links = [
    {
      id: commute.id,
      revision: "test",
      workoutId: commute.id,
      activityId: "am",
      activityIds: ["am"],
    },
  ];
  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/data", (route) => route.fulfill({ json: fixture }));
  await page.route("**/api/training", (route) => {
    posted.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/calendar");
  await page.getByLabel("Go to date").fill(commute.date);
  const card = page.locator(".workout-card").filter({ hasText: commute.title });
  await expect(card).toContainText("1 of 2 rides completed");
  await card.click();
  await page
    .getByLabel("Personal notes")
    .fill("Morning ride done; return later.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(posted[0].workout).toMatchObject({
    status: "Partially Completed",
    commuteLegs: 2,
    commuteReturnTime: "16:30",
    notes: "Morning ride done; return later.",
  });
  await card.click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  const select = page.getByLabel("Recorded activity");
  await expect(select.locator("option")).toHaveCount(2);
  await select.selectOption("pm");
  await page
    .getByRole("button", { name: "Save activity link", exact: true })
    .click();
  expect(posted[1]).toMatchObject({
    action: "link",
    activityIds: ["am", "pm"],
  });
  fixture.links[0].activityIds = ["am", "pm"];
  fixture.workouts[0] = {
    ...commute,
    status: "Completed",
    linkedActivityIds: ["am", "pm"],
  };
  await page.route("**/api/activities/pm", (route) =>
    route.fulfill({ json: fixture.activities[1] }),
  );
  await page.goto("/activities/pm");
  await expect(
    page.getByRole("heading", { name: commute.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Linked activities", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Morning commute", exact: true }),
  ).toBeVisible();
});
test("dashboard renders, navigation works, and mobile stays within the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your training overview." }),
  ).toBeVisible();
  await expect(
    page.getByText("Sample training data.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Running distance", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".training-chart .recharts-surface")).toBeVisible();
  await page.screenshot({
    path: ".local/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Training calendar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your training calendar." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "month training calendar" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your training overview." }),
  ).toBeVisible();
  await expect(page.locator(".training-chart .recharts-surface")).toBeVisible();
  await page.screenshot({
    path: ".local/dashboard-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Activities" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your activities." }),
  ).toBeVisible();
  await page.getByLabel("Search activities").fill("no-such-activity");
  await expect(
    page.getByRole("heading", { name: "No activities here yet" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("create, persist, edit, reschedule and explicitly complete a workout", async ({
  page,
}) => {
  const title = `E2E easy run ${randomUUID().slice(0, 8)}`;
  await page.goto("/calendar");
  await page
    .getByRole("button", { name: "Plan a workout", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Session title").fill(title);
  await dialog.getByLabel("Date", { exact: true }).fill("2026-12-18");
  await dialog.getByLabel("Target distance · km").fill("5");
  await dialog
    .getByRole("button", { name: "Add workout", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const getWorkout = async () => {
    const response = await page.request.get("/api/data");
    const data = await response.json();
    return data.workouts.find((w: { title: string }) => w.title === title);
  };
  let w = await getWorkout();
  expect(w.distanceKm).toBe(5);
  expect(w.status).toBe("Planned");
  await page.getByLabel("Go to date").fill("2026-12-18");
  await page
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await dialog.getByLabel("Target distance · km").fill("5.5");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  w = await getWorkout();
  expect(w.distanceKm).toBe(5.5);
  const originalRevision = w.revision;
  await page
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await dialog.getByRole("tab", { name: "Reschedule" }).click();
  await dialog.getByLabel("New date").fill("2026-12-21");
  await dialog.getByRole("button", { name: "Reschedule session" }).click();
  await expect(dialog).not.toBeVisible();
  const snapshot = await (await page.request.get("/api/data")).json();
  const original = snapshot.workouts.find((x: { id: string }) => x.id === w.id);
  expect(original.status).toBe("Rescheduled");
  const replacement = snapshot.workouts.find(
    (x: { id: string }) => x.id === original.rescheduledTo,
  );
  expect(replacement.distanceKm).toBe(5.5);
  expect(replacement.date).toBe("2026-12-21");
  const stale = await page.request.post("/api/training", {
    headers: {
      origin: "http://127.0.0.1:3108",
      "idempotency-key": randomUUID(),
    },
    data: {
      action: "update",
      id: w.id,
      revision: originalRevision,
      workout: { ...w, title: "stale overwrite" },
    },
  });
  expect(stale.status()).toBe(409);
  await page.getByLabel("Go to date").fill("2026-12-21");
  await page
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  await dialog.getByRole("button", { name: "I completed this" }).click();
  await expect(dialog).not.toBeVisible();
  w = (await (await page.request.get("/api/data")).json()).workouts.find(
    (x: { id: string }) => x.id === replacement.id,
  );
  expect(w.completionSource).toBe("manual");
});
test("activity details, chart filters and preferences have working controls", async ({
  page,
}) => {
  await page.goto("/activities");
  await page.locator(".activity-row").first().click();
  await expect(
    page.getByRole("heading", { name: "Session details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available split summaries" }),
  ).toBeVisible();
  await page.goto("/analytics");
  await page.getByLabel("Time range").selectOption("4weeks");
  await page.getByLabel("Time range").selectOption("custom");
  await page.getByLabel("Start date", { exact: true }).fill("");
  await expect(
    page.getByRole("heading", { name: "Session training load" }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Switch to dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("switch", { name: "Offline reading" }).click();
  await expect(
    page.getByRole("switch", { name: "Offline reading" }),
  ).toHaveAttribute("aria-checked", "false");
  expect(
    await page.evaluate(() => localStorage.getItem("pe.offline.v1")),
  ).toBeNull();
});
test("PWA assets and offline fallback read the saved training snapshot", async ({
  page,
  context,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByText("Running distance", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(
    page.getByText("Running distance", { exact: true }),
  ).toBeVisible();
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  await context.setOffline(true);
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "A moment to catch your breath." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Upcoming training" }),
  ).toBeVisible();
  await context.setOffline(false);
});
