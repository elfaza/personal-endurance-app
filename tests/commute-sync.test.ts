import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workoutInput, type Activity } from "@/lib/domain";
import {
  fingerprint,
  type Snapshot,
  type Stored,
  type Change,
} from "@/lib/google-sheets/rows";
const bridge = vi.hoisted(() => ({
  read: vi.fn(),
  commit: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/server/repository", () => ({
  repository: () => bridge,
  withLock: async (work: () => Promise<unknown>) => work(),
}));
vi.mock("@/lib/garmin/client", () => ({
  garmin: () => ({ list: bridge.list }),
}));
vi.mock("@/lib/server/config", () => ({
  configuration: () => ({
    mode: "live",
    garmin: true,
    sheets: true,
    readOnly: false,
  }),
}));
import { getData, mutate, syncGarmin } from "@/lib/server/service";
let snapshot: Snapshot;
let serial = 0;
function record(id: string, payload: Record<string, unknown>): Stored {
  const revision = `test-${++serial}`;
  return {
    id,
    payload,
    revision,
    fingerprint: fingerprint([id, revision, JSON.stringify(payload)]),
    parent: "",
    updatedAt: "2026-10-27T00:00:00Z",
    operationId: revision,
    deleted: false,
  };
}
const morning: Activity = {
  id: "1",
  title: "Morning ride",
  date: "2026-10-27",
  startedAt: "2026-10-26T22:33:41Z",
  type: "cycling",
  rawType: "cycling",
  distanceKm: 21.56,
  durationSec: 4085,
  movingSec: null,
  avgHr: 133,
  maxHr: 159,
  elevationM: null,
  paceSecKm: null,
  splits: [],
  hrZones: [],
  source: "garmin",
};
const home: Activity = {
  ...morning,
  id: "2",
  title: "Ride home",
  startedAt: "2026-10-27T09:35:00Z",
};
beforeEach(() => {
  serial = 0;
  snapshot = {
    Workouts: [
      record("commute", {
        ...workoutInput.parse({
          date: morning.date,
          type: "Bike-to-Work",
          title: "AM + PM",
          time: "05:45",
          commuteLegs: 2,
          commuteReturnTime: "16:30",
        }),
        createdAt: "2026-10-26T00:00:00Z",
      }),
    ],
    Activities: [],
    ActivityLinks: [],
    Feedback: [],
    Goals: [],
    Meta: [],
  };
  bridge.read.mockImplementation(async () => ({
    snapshot: structuredClone(snapshot),
    initialized: true,
  }));
  bridge.commit.mockImplementation(async (changes: Change[]) => {
    for (const c of changes) {
      const old = snapshot[c.dataset].find((r) => r.id === c.id);
      expect(old?.fingerprint ?? null).toBe(c.expected);
      const next = { ...record(c.id, c.payload), deleted: c.deleted ?? false };
      snapshot[c.dataset] = [
        ...snapshot[c.dataset].filter((r) => r.id !== c.id),
        next,
      ];
    }
  });
  bridge.list.mockResolvedValue([morning]);
});
afterEach(() => vi.clearAllMocks());
const allowNextSync = () => {
  const sync = snapshot.Meta.find((r) => r.id === "sync");
  if (sync) sync.payload.lastSuccess = "2026-10-26T00:00:00Z";
};
describe("commute matching through sync, storage and API data", () => {
  it("keeps an intentional mixed-sport replacement and associates both recorded activities", async () => {
    snapshot.Workouts = [
      record("combined", {
        ...workoutInput.parse({
          date: morning.date,
          type: "Easy Run",
          title: "Run + family bike ride",
          activityCount: 2,
          allowMixedSports: true,
        }),
        createdAt: "2026-10-26T00:00:00Z",
      }),
    ];
    const run = {
      ...morning,
      id: "run",
      type: "running",
      title: "Morning run",
    };
    snapshot.Activities = [record("1", { ...morning }), record("run", run)];
    let data = await getData();
    await mutate(
      {
        action: "link",
        id: "combined",
        revision: data.workouts[0].revision,
        activityId: "1",
      },
      "replace-strength-with-bike",
    );
    data = await getData();
    expect(data.workouts[0].status).toBe("Partially Completed");
    await mutate(
      {
        action: "link",
        id: "combined",
        revision: data.workouts[0].revision,
        activityId: "run",
      },
      "attach-run-too",
    );
    data = await getData();
    expect(data.workouts[0]).toMatchObject({
      status: "Completed",
      linkedActivityIds: ["1", "run"],
    });
    expect(data.links[0].activityIds).toEqual(["1", "run"]);
    expect(data.activities.find((a) => a.id === "1")).toMatchObject(morning);
  });
  it("persists partial progress, adds the return later, and keeps both activity associations on repeat sync", async () => {
    await syncGarmin();
    let data = await getData();
    expect(data.workouts[0]).toMatchObject({
      status: "Partially Completed",
      linkedActivityId: "1",
      linkedActivityIds: ["1"],
      completionSource: "garmin",
    });
    allowNextSync();
    bridge.list.mockResolvedValue([morning, home]);
    await syncGarmin();
    data = await getData();
    expect(data.workouts[0]).toMatchObject({
      status: "Completed",
      linkedActivityIds: ["1", "2"],
    });
    expect(data.links).toHaveLength(1);
    expect(data.links[0].activityIds).toEqual(["1", "2"]);
    expect(data.activities).toHaveLength(2);
    const savedRevision = data.workouts[0].revision;
    allowNextSync();
    await syncGarmin();
    data = await getData();
    expect(data.workouts[0].revision).toBe(savedRevision);
    expect(data.links).toHaveLength(1);
    expect(data.activities).toHaveLength(2);
  });
  it("supports manual ride additions, prevents wrong sport/date and duplicate ownership, and unlinks both together", async () => {
    snapshot.Activities = [
      record("1", { ...morning }),
      record("2", { ...home }),
      record("run", { ...morning, id: "run", type: "running" }),
      record("yesterday", { ...morning, id: "yesterday", date: "2026-10-26" }),
    ];
    let data = await getData();
    for (const wrong of ["run", "yesterday"])
      await expect(
        mutate(
          {
            action: "link",
            id: "commute",
            revision: data.workouts[0].revision,
            activityId: wrong,
          },
          `wrong-${wrong}`,
        ),
      ).rejects.toThrow("same date and sport");
    await mutate(
      {
        action: "link",
        id: "commute",
        revision: data.workouts[0].revision,
        activityId: "1",
      },
      "manual-am",
    );
    data = await getData();
    expect(data.workouts[0].status).toBe("Partially Completed");
    await mutate(
      {
        action: "link",
        id: "commute",
        revision: data.workouts[0].revision,
        activityId: "2",
      },
      "manual-pm",
    );
    data = await getData();
    expect(data.workouts[0].linkedActivityIds).toEqual(["1", "2"]);
    expect(data.workouts[0].status).toBe("Completed");
    snapshot.Workouts.push(
      record("other", {
        ...workoutInput.parse({
          date: morning.date,
          type: "Cycling",
          title: "Other ride",
        }),
        createdAt: "2026-10-26T00:00:00Z",
      }),
    );
    data = await getData();
    const other = data.workouts.find((w) => w.id === "other")!;
    await expect(
      mutate(
        {
          action: "link",
          id: other.id,
          revision: other.revision,
          activityId: "2",
        },
        "duplicate-link",
      ),
    ).rejects.toThrow("already linked");
    await mutate(
      {
        action: "link",
        id: "commute",
        revision: data.workouts[0].revision,
        activityId: null,
      },
      "unlink-both",
    );
    data = await getData();
    expect(data.workouts.find((w) => w.id === "commute")).toMatchObject({
      status: "Planned",
      linkedActivityIds: [],
    });
    expect(data.links).toHaveLength(0);
    expect(data.activities.find((a) => a.id === "1")).toMatchObject(morning);
  });
  it("does not let a commute and another cycling plan both claim the same activity", async () => {
    snapshot.Workouts.push(
      record("other", {
        ...workoutInput.parse({
          date: morning.date,
          type: "Cycling",
          title: "Other ride",
          distanceKm: 22,
          time: "05:45",
        }),
        createdAt: "2026-10-26T00:00:00Z",
      }),
    );
    await syncGarmin();
    const data = await getData();
    expect(data.links).toHaveLength(0);
    expect(data.workouts.every((w) => w.status === "Planned")).toBe(true);
  });
  it("links evidence to a manually partial session without declaring its skipped components complete", async () => {
    snapshot.Workouts = [
      record("run-plan", {
        ...workoutInput.parse({
          date: morning.date,
          type: "Easy Run",
          title: "Run + strength",
          distanceKm: 3.5,
          status: "Partially Completed",
        }),
        createdAt: "2026-10-26T00:00:00Z",
        completionSource: "manual",
      }),
    ];
    const run = {
      ...morning,
      id: "run",
      type: "running",
      distanceKm: 3.01,
      durationSec: 1644,
    };
    bridge.list.mockResolvedValue([run]);
    await syncGarmin();
    const data = await getData();
    expect(data.workouts[0]).toMatchObject({
      linkedActivityId: "run",
      status: "Partially Completed",
    });
  });
});
