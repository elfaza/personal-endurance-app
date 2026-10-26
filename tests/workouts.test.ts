import { beforeEach, describe, expect, it, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getData, mutate } from "@/lib/server/service";
import { workoutInput } from "@/lib/domain";
process.env.PE_DATA_MODE = "demo";
process.env.PE_DEMO_FILE = "unit-test-demo.json";
const input = () =>
  workoutInput.parse({
    date: "2026-12-18",
    type: "Long Run",
    title: "A careful long run",
    distanceKm: 8,
    durationMin: 60,
  });
beforeEach(async () => {
  await rm(".data/unit-test-demo.json", { force: true });
});
afterAll(async () => {
  await rm(".data/unit-test-demo.json", { force: true });
});
describe("workout persistence", () => {
  it("creates, edits and deletes a planned workout; retries do not duplicate it", async () => {
    const id = randomUUID(),
      op = randomUUID();
    await mutate({ action: "create", id, workout: input() }, op);
    await mutate({ action: "create", id, workout: input() }, op);
    let data = await getData();
    expect(data.workouts.filter((w) => w.id === id)).toHaveLength(1);
    let w = data.workouts.find((w) => w.id === id)!;
    await mutate(
      {
        action: "update",
        id,
        revision: w.revision,
        workout: { ...w, title: "Updated" },
      },
      randomUUID(),
    );
    data = await getData();
    w = data.workouts.find((w) => w.id === id)!;
    expect(w.title).toBe("Updated");
    await mutate({ action: "delete", id, revision: w.revision }, randomUUID());
    expect((await getData()).workouts.some((w) => w.id === id)).toBe(false);
  });
  it("reschedules atomically with original history and unchanged intensity", async () => {
    const id = randomUUID();
    await mutate({ action: "create", id, workout: input() }, randomUUID());
    const w = (await getData()).workouts.find((w) => w.id === id)!;
    await mutate(
      { action: "reschedule", id, revision: w.revision, date: "2026-12-21" },
      randomUUID(),
    );
    const data = await getData();
    const original = data.workouts.find((w) => w.id === id)!;
    const replacement = data.workouts.find(
      (w) => w.id === original.rescheduledTo,
    )!;
    expect(original.status).toBe("Rescheduled");
    expect(original.date).toBe("2026-12-18");
    expect(replacement).toMatchObject({
      date: "2026-12-21",
      status: "Planned",
      rescheduledFrom: id,
      distanceKm: 8,
      durationMin: 60,
    });
  });
  it("rejects stale writes and date changes that bypass history", async () => {
    const id = randomUUID();
    await mutate({ action: "create", id, workout: input() }, randomUUID());
    const w = (await getData()).workouts.find((w) => w.id === id)!;
    await expect(
      mutate(
        { action: "update", id, revision: "stale", workout: input() },
        randomUUID(),
      ),
    ).rejects.toThrow("changed elsewhere");
    await expect(
      mutate(
        {
          action: "update",
          id,
          revision: w.revision,
          workout: { ...input(), date: "2026-12-19" },
        },
        randomUUID(),
      ),
    ).rejects.toThrow("Reschedule");
  });
  it("manual completion creates no recorded activity or actual distance", async () => {
    const id = randomUUID();
    await mutate({ action: "create", id, workout: input() }, randomUUID());
    let data = await getData();
    const before = data.activities.length;
    const w = data.workouts.find((w) => w.id === id)!;
    await mutate(
      {
        action: "update",
        id,
        revision: w.revision,
        workout: { ...w, status: "Completed" },
      },
      randomUUID(),
    );
    data = await getData();
    expect(data.activities).toHaveLength(before);
    expect(data.workouts.find((w) => w.id === id)?.completionSource).toBe(
      "manual",
    );
  });
  it("links and unlinks activities without altering Garmin metrics", async () => {
    const id = randomUUID();
    await mutate({ action: "create", id, workout: input() }, randomUUID());
    let data = await getData();
    const a = data.activities[0];
    const linked = data.links.find((l) => l.activityId === a.id)!;
    const original = data.workouts.find((w) => w.id === linked.workoutId)!;
    await mutate(
      {
        action: "link",
        id: original.id,
        revision: original.revision,
        activityId: null,
      },
      randomUUID(),
    );
    data = await getData();
    let w = data.workouts.find((w) => w.id === id)!;
    await mutate(
      { action: "link", id, revision: w.revision, activityId: a.id },
      randomUUID(),
    );
    data = await getData();
    expect(data.activities.find((x) => x.id === a.id)).toEqual(a);
    w = data.workouts.find((w) => w.id === id)!;
    expect(w.status).toBe("Completed");
    await expect(
      mutate(
        {
          action: "update",
          id,
          revision: w.revision,
          workout: { ...w, status: "Skipped" },
        },
        randomUUID(),
      ),
    ).rejects.toThrow("Unlink");
    await mutate(
      { action: "link", id, revision: w.revision, activityId: null },
      randomUUID(),
    );
    expect((await getData()).workouts.find((w) => w.id === id)?.status).toBe(
      "Planned",
    );
  });
});
