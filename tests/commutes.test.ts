import { describe, expect, it } from "vitest";
import { findCommuteMatches, uniqueActivityMatches } from "@/lib/calculations";
import { workoutInput, type Workout } from "@/lib/domain";
import { normalizeActivity } from "@/lib/garmin/normalize";
const plan = (overrides: Partial<Workout> = {}): Workout => ({
  ...workoutInput.parse({
    date: "2026-10-27",
    type: "Bike-to-Work",
    title: "Ride AM + PM",
    time: "05:45",
    commuteLegs: 2,
    commuteReturnTime: "16:30",
  }),
  id: "commute",
  revision: "v1",
  createdAt: "2026-10-26T00:00:00Z",
  ...overrides,
});
const morning = normalizeActivity({
  activityId: 1,
  activityName: "Jakarta Cycling",
  activityType: { typeKey: "cycling" },
  startTimeGMT: "2026-10-26T22:33:41Z",
  distance: 21560,
  duration: 4085,
});
const home = { ...morning, id: "2", startedAt: "2026-10-27T09:35:00Z" };
describe("automatic commute progress", () => {
  it("recognizes a unique morning ride for an open-target round trip without completing the return", () => {
    expect(findCommuteMatches([plan()], [morning])).toEqual([
      {
        workoutId: "commute",
        activityIds: ["1"],
        status: "Partially Completed",
      },
    ]);
  });
  it("adds the afternoon ride to the existing morning link and completes once", () => {
    const partial = plan({
      linkedActivityId: "1",
      linkedActivityIds: ["1"],
      status: "Partially Completed",
      completionSource: "garmin",
    });
    expect(
      findCommuteMatches([partial], [morning, home], new Set(["1"])),
    ).toEqual([
      { workoutId: "commute", activityIds: ["1", "2"], status: "Completed" },
    ]);
    expect(findCommuteMatches([partial], [morning], new Set(["1"]))).toEqual(
      [],
    );
    expect(
      findCommuteMatches(
        [
          plan({
            ...partial,
            linkedActivityIds: ["1", "2"],
            status: "Completed",
          }),
        ],
        [morning, home],
      ),
    ).toEqual([]);
  });
  it("can backfill both distinct rides on the first sync, even if records arrive out of order", () => {
    expect(findCommuteMatches([plan()], [home, morning])).toEqual([
      { workoutId: "commute", activityIds: ["1", "2"], status: "Completed" },
    ]);
  });
  it("retains partial progress when the return time is missing", () => {
    expect(
      findCommuteMatches([plan({ commuteReturnTime: "" })], [morning, home]),
    ).toEqual([
      {
        workoutId: "commute",
        activityIds: ["1"],
        status: "Partially Completed",
      },
    ]);
  });
  it("completes an explicitly single-ride commute with a unique scheduled ride", () => {
    expect(findCommuteMatches([plan({ commuteLegs: 1 })], [morning])).toEqual([
      { workoutId: "commute", activityIds: ["1"], status: "Completed" },
    ]);
  });
  it("does not guess from date and sport without a schedule or measured target", () => {
    expect(
      findCommuteMatches(
        [plan({ time: "", commuteReturnTime: "" })],
        [morning],
      ),
    ).toEqual([]);
    expect(
      findCommuteMatches(
        [plan({ commuteLegs: 1, time: "", distanceKm: 22 })],
        [morning],
      ),
    ).toHaveLength(1);
  });
  it("does not claim missing measurements, another day, another sport or an unscheduled afternoon ride", () => {
    for (const wrong of [
      { ...morning, date: "2026-10-26" },
      { ...morning, type: "running" as const },
      { ...morning, distanceKm: null, durationSec: null },
      { ...home, startedAt: "2026-10-27T04:00:00Z" },
    ]) {
      expect(findCommuteMatches([plan()], [wrong])).toEqual([]);
    }
  });
  it("refuses ambiguous rides, competing plans, and activities already claimed elsewhere", () => {
    expect(
      findCommuteMatches(
        [plan()],
        [morning, { ...morning, id: "duplicate-candidate" }],
      ),
    ).toEqual([]);
    expect(
      findCommuteMatches([plan(), plan({ id: "other-plan" })], [morning]),
    ).toEqual([]);
    expect(findCommuteMatches([plan()], [morning], new Set(["1"]))).toEqual([]);
    expect(
      uniqueActivityMatches([
        { workoutId: "commute", activityIds: ["1"] },
        { workoutId: "other-cycling", activityIds: ["1"] },
      ]),
    ).toEqual([]);
  });
  it("never credits one activity as both legs when their time windows overlap", () => {
    expect(
      findCommuteMatches([plan({ commuteReturnTime: "06:00" })], [morning]),
    ).toEqual([]);
  });
  it("preserves skipped sessions and manually confirmed partial completion", () => {
    expect(
      findCommuteMatches([plan({ status: "Skipped" })], [morning]),
    ).toEqual([]);
    expect(
      findCommuteMatches(
        [plan({ status: "Partially Completed", completionSource: "manual" })],
        [morning],
      ),
    ).toEqual([]);
  });
});
