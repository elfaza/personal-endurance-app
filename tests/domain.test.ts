import { describe, expect, it } from "vitest";
import { addDays, localDate, pace, weekStart } from "@/lib/dates";
import { summarize, findMatches } from "@/lib/calculations";
import { demoData } from "@/lib/demo";
import { workoutInput } from "@/lib/domain";
import { normalizeActivity } from "@/lib/garmin/normalize";
const raw = {
  activityId: 123,
  activityName: "Morning run",
  activityType: { typeKey: "running" },
  startTimeGMT: "2026-10-25 23:30:00",
  distance: 5000,
  duration: 2100,
  averageHR: 145,
  maxHR: 171,
};
describe("Jakarta calendar and formatting", () => {
  it("assigns UTC evening activities to the next Jakarta date", () =>
    expect(localDate("2026-10-25T23:30:00Z")).toBe("2026-10-26"));
  it("starts weeks on Monday across year boundaries", () => {
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("formats pace without 60-second overflow", () => {
    expect(pace(419.8)).toBe("7:00");
    expect(pace(null)).toBe("—");
  });
  it("rejects impossible dates and invalid target ranges", () => {
    expect(
      workoutInput.safeParse({
        date: "2026-02-31",
        type: "Easy Run",
        title: "test",
      }).success,
    ).toBe(false);
    expect(
      workoutInput.safeParse({
        date: "2026-10-26",
        type: "Easy Run",
        title: "test",
        rpe: 11,
      }).success,
    ).toBe(false);
  });
});
describe("official Garmin normalization", () => {
  it("normalizes list units and handles missing watch measurements", () => {
    const a = normalizeActivity(raw);
    expect(a).toMatchObject({
      id: "123",
      date: "2026-10-26",
      distanceKm: 5,
      durationSec: 2100,
      paceSecKm: 420,
      movingSec: null,
      elevationM: null,
      hrZones: [],
    });
  });
  it("uses the official nested detail DTO fields", () => {
    const a = normalizeActivity(
      {
        activityId: 123,
        activityName: "Detail",
        activityTypeDTO: { typeKey: "road_cycling" },
        summaryDTO: {
          startTimeGMT: "2026-10-25T23:30:00.000",
          distance: 12000,
          duration: 2400,
        },
        splitSummaries: [
          { distance: 6000, duration: 1200, messageIndex: 1, averageHR: 130 },
        ],
      },
      true,
    );
    expect(a.type).toBe("cycling");
    expect(a.splits[0]).toMatchObject({
      distanceKm: 6,
      durationSec: 1200,
      avgHr: 130,
    });
    expect(a.paceSecKm).toBeNull();
  });
  it("rejects invented or malformed response shapes", () => {
    expect(() => normalizeActivity({ id: 1, km: 5 })).toThrow();
    expect(() => normalizeActivity({ ...raw, distance: -3 })).toThrow();
    expect(() =>
      normalizeActivity({ ...raw, startTimeGMT: "yesterday" }),
    ).toThrow();
  });
});
describe("training calculations and conservative matching", () => {
  it("weights pace by distance and HR by time", () => {
    const a = normalizeActivity(raw),
      b = { ...a, id: "124", distanceKm: 10, durationSec: 4800, avgHr: 160 };
    const m = summarize(
      { activities: [a, b], workouts: [] },
      "2026-10-26",
      "2026-10-26",
    );
    expect(m.pace).toBe(460);
    expect(m.avgHr).toBe(155);
    expect(m.consistency).toBeNull();
  });
  it("never counts a plan as recorded distance", () => {
    const data = demoData("2026-10-26");
    const m = summarize(
      { ...data, activities: [] },
      "2026-10-26",
      "2026-11-01",
    );
    expect(m.runningKm).toBe(0);
    expect(m.planned).toBe(5);
    expect(m.completed).toBe(0);
    expect(m.consistency).toBe(0);
  });
  it("matches only unique one-to-one measured candidates", () => {
    const data = demoData("2026-10-26");
    const w = data.workouts.find((w) => w.date === "2026-10-26")!;
    const a = normalizeActivity(raw);
    expect(findMatches([w], [a])).toEqual([
      { workoutId: w.id, activityId: "123" },
    ]);
    expect(findMatches([w], [a, { ...a, id: "124" }])).toEqual([]);
    expect(findMatches([w, { ...w, id: "another" }], [a])).toEqual([]);
    expect(
      findMatches([{ ...w, distanceKm: null, durationMin: null }], [a]),
    ).toEqual([]);
  });
  it("does not match different days, sports or wildly different distances", () => {
    const w = demoData("2026-10-26").workouts.find(
      (w) => w.date === "2026-10-26",
    )!;
    const a = normalizeActivity(raw);
    expect(findMatches([w], [{ ...a, type: "cycling" }])).toEqual([]);
    expect(findMatches([w], [{ ...a, distanceKm: 18 }])).toEqual([]);
    expect(findMatches([w], [{ ...a, date: "2026-10-25" }])).toEqual([]);
  });
});
