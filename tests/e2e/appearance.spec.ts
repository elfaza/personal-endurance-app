import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const raw = hex.trim().slice(1);
    const n = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
    const rgb = [0, 2, 4]
      .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("light and charcoal remain readable, remember selection, and fit desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const data = demoData("2026-10-27");
  const commute = data.workouts.find((w) => w.type === "Bike-to-Work")!;
  const cycling = data.activities.find((a) => a.type === "cycling")!;
  data.workouts = [
    {
      ...commute,
      id: "appearance-commute",
      date: "2026-10-27",
      title: "Bike to Work (Controlled)",
      time: "05:45",
      commuteLegs: 2,
      commuteReturnTime: "16:30",
      status: "Partially Completed",
      distanceKm: null,
      durationMin: null,
    },
  ];
  data.activities = [
    {
      ...cycling,
      id: "appearance-ride",
      date: "2026-10-27",
      distanceKm: 21.56031,
      durationSec: 4085.62,
    },
  ];
  data.links = [
    {
      id: "appearance-commute",
      workoutId: "appearance-commute",
      activityId: "appearance-ride",
      activityIds: ["appearance-ride"],
      revision: "fixture",
    },
  ];
  data.configured = {
    ...data.configured,
    readOnly: false,
    sheets: true,
    initialized: true,
    planSource: "training-plan",
  };
  // Include a current session independently of the host clock.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  data.workouts[0].date = today;
  data.activities[0].date = today;
  await page.route("**/api/data", (route) => route.fulfill({ json: data }));
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto("/dashboard");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const focus = page.getByRole("region", { name: "Featured training session" });
  await expect(focus).toContainText("1 of 2 rides completed");
  await expect(focus).toContainText("21.6 km");
  await expect(focus).toContainText("16:30 WIB");
  await expect(page.locator(".training-chart .recharts-surface")).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Use dark theme", exact: true })
        .click();
    const tokens = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        [
          "text",
          "panel",
          "muted",
          "soft",
          "bg",
          "on-accent",
          "accent",
          "accent-soft",
          "success",
          "success-bg",
          "warning",
          "warning-bg",
          "danger",
          "danger-bg",
          "running",
          "purple",
        ].map((n) => [n, css.getPropertyValue(`--${n}`).trim()]),
      );
    });
    for (const [fg, bg] of [
      ["text", "panel"],
      ["muted", "panel"],
      ["soft", "bg"],
      ["on-accent", "accent"],
      ["success", "success-bg"],
      ["warning", "warning-bg"],
      ["danger", "danger-bg"],
      ["accent-soft", "panel"],
      ["running", "panel"],
      ["purple", "panel"],
    ]) {
      expect(
        contrast(tokens[fg], tokens[bg]),
        `${theme}: ${fg} on ${bg}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      await page
        .locator(".metric-label > span")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(13);
    await page.screenshot({
      path: `.local/redesign-${theme}-desktop.png`,
      fullPage: true,
    });
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Switch to light", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Switch to light", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use dark theme", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/redesign-settings-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/dashboard");
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Use dark theme", exact: true })
        .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      Math.round(
        (await page
          .getByRole("button", {
            name: `Use ${theme === "dark" ? "light" : "dark"} theme`,
            exact: true,
          })
          .boundingBox())!.height,
      ),
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `.local/redesign-${theme}-mobile.png`,
      fullPage: true,
    });
    await page.goto("/calendar");
    await expect(
      page.locator(".calendar-grid.week .calendar-cell"),
    ).toHaveCount(7);
    const dayPositions = await page
      .locator(".calendar-grid.week .calendar-cell")
      .evaluateAll((days) =>
        days.map((day) => ({
          top: day.getBoundingClientRect().top,
          bottom: day.getBoundingClientRect().bottom,
        })),
      );
    expect(dayPositions[6].top).toBeGreaterThan(dayPositions[0].bottom);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/redesign-calendar-${theme}-mobile.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(
      page.getByText("Scroll sideways to see all seven days."),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: ".local/redesign-login-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("switching theme still works when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage unavailable");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage unavailable");
    };
  });
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "Use dark theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Use light theme", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
