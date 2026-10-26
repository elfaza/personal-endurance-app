import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("BROWSER ERROR", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE ERROR", m.text());
  });
  page.on("requestfailed", (r) =>
    console.log("FAILED REQUEST", r.url(), r.failure()?.errorText),
  );
});
test("dashboard renders, navigation works, and mobile stays within the viewport", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Let’s keep moving." }),
  ).toBeVisible();
  await expect(
    page.getByText("Sample training data.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("RUNNING DISTANCE", { exact: true }),
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
    page.getByRole("heading", { name: "Let’s keep moving." }),
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
  await page.getByRole("button", { name: "Switch to light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark" }).click();
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
    page.getByText("RUNNING DISTANCE", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(
    page.getByText("RUNNING DISTANCE", { exact: true }),
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
