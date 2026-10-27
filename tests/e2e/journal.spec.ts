import { test, expect } from "@playwright/test";
import { demoData } from "@/lib/demo";
import type { Feedback } from "@/lib/domain";

test("a saved session RPE appears in the journal and both linked commute activities", async ({
  page,
}) => {
  const fixture = demoData("2026-10-28");
  const morning = fixture.activities.find((a) => a.type === "cycling")!;
  const home = {
    ...morning,
    id: "return-ride",
    title: "Ride home",
    startedAt: `${morning.date}T16:30:00+07:00`,
  };
  const workout = {
    ...fixture.workouts.find((w) => w.linkedActivityId === morning.id)!,
    commuteLegs: 2 as const,
    linkedActivityIds: [morning.id, home.id],
    commuteReturnTime: "16:30",
  };
  fixture.activities = [morning, home];
  fixture.workouts = [workout];
  fixture.links = [
    {
      id: workout.id,
      revision: "link-rev",
      workoutId: workout.id,
      activityId: morning.id,
      activityIds: [morning.id, home.id],
    },
  ];
  fixture.feedback = [
    {
      id: "saved-journal",
      revision: "journal-rev",
      workoutId: workout.id,
      activityId: morning.id,
      date: morning.date,
      rpe: 4,
      energy: 3,
      fatigue: 1,
      soreness: 1,
      sleepQuality: 4,
      notes: "Saved commute notes",
      skippedReason: "",
    },
  ];
  const commands: {
    action: string;
    id: string;
    revision: string;
    feedback: Feedback;
  }[] = [];
  await page.route("**/api/data", (route) => route.fulfill({ json: fixture }));
  await page.route("**/api/activities/*", (route) => {
    const id = route.request().url().split("/").at(-1);
    return route.fulfill({ json: fixture.activities.find((a) => a.id === id) });
  });
  await page.route("**/api/training", (route) => {
    const command = route.request().postDataJSON();
    commands.push(command);
    fixture.feedback = [
      { ...command.feedback, id: command.id, revision: "updated-rev" },
    ];
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/activities/${home.id}`);
  const rpeRow = page
    .locator(".detail-list > div")
    .filter({ hasText: "Personal RPE" });
  await expect(rpeRow).toContainText("4 / 10");
  await page.getByRole("button", { name: "Open workout journal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Journal", exact: true }).click();
  await expect(dialog.getByLabel("Session RPE")).toHaveValue("4");
  await dialog.getByLabel("Session RPE").selectOption("6");
  await dialog
    .getByRole("button", { name: "Save journal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(rpeRow).toContainText("6 / 10");
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({
    action: "feedback",
    id: "saved-journal",
    revision: "journal-rev",
    feedback: { workoutId: workout.id, rpe: 6 },
  });
  await page.goto(`/activities/${morning.id}`);
  await expect(rpeRow).toContainText("6 / 10");
  await page.reload();
  await expect(rpeRow).toContainText("6 / 10");
});
