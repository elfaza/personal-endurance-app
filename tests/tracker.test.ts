import { describe, it, expect } from "vitest";
import { demoData } from "@/lib/demo";
import {
  feedbackForActivity,
  trainingLoads,
  manualActivities,
} from "@/lib/measurements";
import { historicalLinkChanges } from "@/lib/google-sheets/reconcile";
import {
  trackerState,
  readRoadmapGoals,
  logWriteRequests,
  roadmapWriteRequests,
  LOG_COLUMNS,
} from "@/lib/google-sheets/tracker";
import {
  PLAN_COLUMNS,
  PLAN_ID,
  PLAN_METADATA,
  planState,
  readPlan,
  cellValue,
  type PlanCell,
  type PlanGrid,
} from "@/lib/google-sheets/training-plan";
import type { Snapshot, Stored } from "@/lib/google-sheets/rows";

const cell = (v: unknown): PlanCell => ({
  userEnteredValue:
    typeof v === "number"
      ? { numberValue: v }
      : typeof v === "boolean"
        ? { boolValue: v }
        : { stringValue: String(v ?? "") },
});
const grid = (id: number, rows: unknown[][]): PlanGrid => ({
  sheetId: id,
  rowCount: 100,
  columnCount: 26,
  rows: rows.map((r) => r.map(cell)),
});
const record = (id: string, payload: object): Stored => ({
  id,
  revision: `r-${id}`,
  fingerprint: `fp-${id}`,
  parent: "",
  updatedAt: "",
  deleted: false,
  operationId: "test",
  payload: { ...payload },
});
const empty = (): Snapshot => ({
  Workouts: [],
  Activities: [],
  ActivityLinks: [],
  Feedback: [],
  Goals: [],
  Meta: [],
});
const roadmap = () =>
  grid(3, [
    ["Period", "Long-run target (km)", "Primary focus", "Gate / notes"],
    [
      "Late Jan 2027",
      "21.1 race attempt (conditional)",
      "Finish comfortably",
      "Only if recovered",
    ],
    [
      "Mar 2027",
      "21.1 backup",
      "Safer alternative",
      "Use if January is not ready",
    ],
    ["2027 TBA", "BFI Run 10K", "Performance", "No date announced"],
  ]);
function apply(g: PlanGrid, requests: unknown[]) {
  for (const x of requests as {
    updateCells?: {
      start: { sheetId: number; rowIndex: number; columnIndex: number };
      rows: { values: PlanCell[] }[];
      fields: string;
    };
  }[]) {
    const u = x.updateCells;
    if (!u || u.start.sheetId !== g.sheetId) continue;
    const row = (g.rows[u.start.rowIndex] ??= []);
    if (u.fields === "note")
      row[u.start.columnIndex] = {
        ...row[u.start.columnIndex],
        note: u.rows[0].values[0].note,
      };
    else
      row[u.start.columnIndex] = {
        ...row[u.start.columnIndex],
        userEnteredValue: u.rows[0].values[0].userEnteredValue,
      };
  }
}
describe("all linked activities and scoped feedback", () => {
  it("counts the return ride once, honors its own rating, and never borrows unrelated feedback", () => {
    const d = demoData("2026-10-28"),
      a = d.activities[0],
      b = { ...a, id: "return", durationSec: 1800 };
    const w = d.workouts.find((w) => w.linkedActivityId === a.id)!;
    d.activities = [{ ...a, durationSec: 1800 }, b];
    d.workouts = [w];
    d.links = [
      {
        id: w.id,
        revision: "r",
        workoutId: w.id,
        activityId: a.id,
        activityIds: [a.id, b.id],
      },
    ];
    const f = {
      id: "shared",
      revision: "r",
      workoutId: w.id,
      date: a.date,
      rpe: 4,
      energy: null,
      fatigue: null,
      soreness: null,
      sleepQuality: null,
      notes: "",
      skippedReason: "",
    };
    d.feedback = [f];
    expect(trainingLoads(d).reduce((n, x) => n + x.load, 0)).toBe(240);
    d.feedback.push({
      ...f,
      id: "specific",
      activityId: b.id,
      scope: "activity",
      rpe: 6,
    });
    expect(trainingLoads(d).reduce((n, x) => n + x.load, 0)).toBe(300);
    expect(feedbackForActivity(d, b.id)?.rpe).toBe(6);
    d.feedback = [
      {
        ...f,
        workoutId: undefined,
        scope: "activity",
        activityId: "unrelated",
        rpe: 9,
      },
    ];
    expect(feedbackForActivity(d, b.id)).toBeUndefined();
  });
  it("labels manual results and excludes them when Garmin already supplies the same effort", () => {
    const d = demoData("2026-10-28"),
      a = d.activities[0],
      w = {
        ...d.workouts[0],
        date: a.date,
        type: "Easy Run" as const,
        status: "Completed" as const,
        recordedResult: {
          distanceKm: 5,
          durationMin: 30,
          avgHr: 140,
          maxHr: 160,
        },
      };
    const manual = manualActivities([w], [], []);
    expect(manual[0]).toMatchObject({
      source: "sheet",
      timeKnown: false,
      distanceKm: 5,
      durationSec: 1800,
    });
    expect(
      manualActivities(
        [w],
        [
          {
            ...a,
            date: w.date,
            type: "running",
            distanceKm: 5,
            durationSec: 1800,
          },
        ],
        [],
      ),
    ).toEqual([]);
    expect(
      manualActivities(
        [w],
        [],
        [{ id: "l", revision: "r", workoutId: w.id, activityId: "garmin" }],
      ),
    ).toEqual([]);
  });
});
describe("source adapters preserve data and reconcile history", () => {
  it("retains optional flags after skips, but lets an explicit Planned status remove optionality", () => {
    const g = grid(1, [
      [...PLAN_COLUMNS, PLAN_ID, PLAN_METADATA],
      [
        "2026-10-29",
        "Thu",
        "Bike to Work",
        "Easy",
        "Recovery",
        0,
        0,
        "Skipped",
        "",
        "",
        "",
        "",
        "",
        "",
        "w",
        JSON.stringify({ optional: true }),
      ],
    ]);
    expect(readPlan(planState(g, []))[0].payload.optional).toBe(true);
    g.rows[1][7] = cell("Planned");
    expect(readPlan(planState(g, []))[0].payload.optional).toBe(false);
  });
  it("reconciles only a unique measured effort, preserving a partial result and rejecting ambiguity", () => {
    const s = empty();
    s.Workouts = [
      record("w", {
        date: "2026-10-19",
        type: "Easy Run",
        status: "Partially Completed",
        recordedResult: { distanceKm: 3, durationMin: 24 },
      }),
    ];
    s.Activities = [
      record("a", {
        date: "2026-10-19",
        type: "running",
        distanceKm: 3,
        durationSec: 1440,
      }),
    ];
    const c = historicalLinkChanges(s);
    expect(c).toHaveLength(2);
    expect(c[1].payload.status).toBe("Partially Completed");
    s.Activities.push(record("b", s.Activities[0].payload));
    expect(historicalLinkChanges(s)).toEqual([]);
    s.Activities.pop();
    s.Workouts[0].payload.status = "Skipped";
    expect(historicalLinkChanges(s)).toEqual([]);
  });
  it("mirrors log entries idempotently, retains original elevation and notes, and does not overwrite formulas", () => {
    const s = empty(),
      a = {
        ...demoData("2026-10-28").activities[0],
        date: "2026-10-26",
        distanceKm: 3,
        durationSec: 1800,
        elevationM: 9.55,
      };
    s.Activities = [record(a.id, a)];
    const log = grid(2, [
      LOG_COLUMNS,
      [
        a.date,
        "Running",
        3,
        30,
        a.avgHr,
        a.maxHr,
        75,
        236,
        "N/A",
        "Keep my notes",
      ],
    ]);
    const state = trackerState(log, roadmap(), grid(4, []), []);
    const updates = logWriteRequests(s, [], state);
    apply(log, updates);
    expect(cellValue(log.rows[1][6])).toBe(9.55);
    expect(cellValue(log.rows[1][9])).toBe("Keep my notes");
    expect(
      JSON.parse(String(cellValue(log.rows[1][11]))).originalValues[6],
    ).toBe(75);
    expect(log.rows[1][6].note).toContain("previous log elevation 75");
    expect(
      logWriteRequests(s, [], trackerState(log, roadmap(), grid(4, []), [])),
    ).toEqual([]);
    log.rows[1][2] = {
      userEnteredValue: { formulaValue: "=1+2" },
      effectiveValue: { numberValue: 3 },
    };
    s.Activities[0].payload.distanceKm = 4;
    expect(() => logWriteRequests(s, [], state)).toThrow("formula");
  });
  it("reads conditional and backup goals, preserves undated roadmap rows and writes to the stable goal row", () => {
    const state = trackerState(
      grid(2, [LOG_COLUMNS]),
      roadmap(),
      grid(4, []),
      [],
    );
    const goals = readRoadmapGoals(state);
    expect(goals).toHaveLength(2);
    expect(goals[0].payload).toMatchObject({
      targetMonth: "2027-01",
      date: null,
      priority: "primary",
      notes: "Only if recovered",
    });
    expect(goals[1].payload).toMatchObject({
      targetMonth: "2027-03",
      priority: "backup",
    });
    const s = { ...empty(), Goals: goals };
    apply(state.roadmap, roadmapWriteRequests(s, [], state, true));
    const changed = {
      ...goals[0].payload,
      title: "My updated HM goal",
      targetMonth: "2027-02",
    };
    apply(
      state.roadmap,
      roadmapWriteRequests(
        s,
        [
          {
            dataset: "Goals",
            id: goals[0].id,
            expected: goals[0].fingerprint,
            payload: changed,
          },
        ],
        state,
      ),
    );
    expect(cellValue(state.roadmap.rows[1][0])).toBe("2027-02");
    expect(cellValue(state.roadmap.rows[1][3])).toBe("Only if recovered");
    expect(cellValue(state.roadmap.rows[3][0])).toBe("2027 TBA");
    expect(readRoadmapGoals(state)[0].payload.title).toBe("My updated HM goal");
  });
});
