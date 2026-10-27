import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datasets, workoutInput } from "@/lib/domain";
import { SheetsClient, WRITE_LOCK_TITLE } from "@/lib/google-sheets/client";
import {
  HEADERS,
  mapRows,
  type Change,
  type Snapshot,
} from "@/lib/google-sheets/rows";
import {
  PLAN_COLUMNS,
  PLAN_ID,
  PLAN_METADATA,
  cellValue,
  planState,
  readPlan,
  planWriteRequests,
  preparePlanSetup,
  type PlanCell,
  type PlanGrid,
} from "@/lib/google-sheets/training-plan";
import { SheetsRepository } from "@/lib/server/repository";
import { toData } from "@/lib/server/service";

const cell = (v: unknown): PlanCell => ({
  userEnteredValue:
    typeof v === "number"
      ? { numberValue: v }
      : { stringValue: String(v ?? "") },
});
const sourceRow = (date = "2026-11-02", title = "Easy Run") =>
  [
    date,
    "Mon",
    title,
    "06:00 Easy effort",
    "Build consistency",
    5,
    "40–55",
    "Planned",
    "",
    "",
    "",
    "",
    "",
    "Keep this note",
  ].map(cell);
function grid(connected = true): PlanGrid {
  return {
    sheetId: 10,
    rowCount: 100,
    columnCount: 25,
    rows: [
      [...PLAN_COLUMNS, ...(connected ? [PLAN_ID, PLAN_METADATA] : [])].map(
        cell,
      ),
      sourceRow(),
    ],
  };
}
const empty = (): Snapshot => ({
  Workouts: [],
  Feedback: [],
  Goals: [],
  Activities: [],
  ActivityLinks: [],
  Meta: [],
});
function canonical(g = grid()) {
  const s = empty();
  s.trainingPlan = planState(g, []);
  s.Workouts = readPlan(s.trainingPlan);
  return s;
}
function changed(s: Snapshot, edits: Record<string, unknown>): Change {
  const w = s.Workouts[0];
  return {
    dataset: "Workouts",
    id: w.id,
    expected: w.fingerprint,
    payload: { ...w.payload, ...edits },
  };
}
function fakePlanGoogle() {
  type Tab = { id: number; title: string; rows: PlanCell[][] };
  let tabs: Tab[] = [
    { id: 10, title: "Training Plan", rows: grid(false).rows },
    ...datasets.map((d, i) => ({
      id: 700000 + i,
      title: `PE_${d}`,
      rows: [HEADERS.map(cell)],
    })),
  ];
  // Raw requests are interpreted here just as the Sheets REST endpoint does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batches: Record<string, any>[][] = [];
  let gridReads = 0;
  let onRead: ((n: number) => void) | undefined;
  const response = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status });
  const http = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("oauth2"))
      return response({ access_token: "fake", expires_in: 3600 });
    if (init?.method === "POST") {
      const requests = JSON.parse(String(init.body)).requests;
      batches.push(requests);
      const next = structuredClone(tabs);
      for (const r of requests) {
        if (r.addSheet) {
          const p = r.addSheet.properties;
          if (next.some((t) => t.title === p.title || t.id === p.sheetId))
            return response({}, 400);
          next.push({ id: p.sheetId, title: p.title, rows: [] });
        } else if (r.deleteSheet) {
          const i = next.findIndex((t) => t.id === r.deleteSheet.sheetId);
          if (i < 0) return response({}, 400);
          next.splice(i, 1);
        } else if (r.appendCells) {
          next
            .find((t) => t.id === r.appendCells.sheetId)!
            .rows.push(
              ...r.appendCells.rows.map(
                (row: { values: PlanCell[] }) => row.values,
              ),
            );
        } else if (r.updateCells) {
          const c = r.updateCells;
          const tab = next.find((t) => t.id === c.start.sheetId)!;
          for (const [i, row] of c.rows.entries()) {
            const dest = (tab.rows[c.start.rowIndex + i] ??= []);
            for (const [j, v] of row.values.entries()) {
              const col = c.start.columnIndex + j;
              dest[col] = {
                ...dest[col],
                userEnteredValue: (v as PlanCell).userEnteredValue,
              };
              delete dest[col].effectiveValue;
              delete dest[col].formattedValue;
            }
          }
        } else if (!r.appendDimension) throw new Error("Unexpected request");
      }
      tabs = next;
      return response({ replies: [] });
    }
    const u = new URL(String(url));
    if (u.pathname.includes("values:batchGet"))
      return response({
        valueRanges: u.searchParams.getAll("ranges").map((range) => ({
          values: tabs
            .find((t) => range.startsWith(`'${t.title}'!`))!
            .rows.map((row) => row.map(cellValue)),
        })),
      });
    if (u.searchParams.get("includeGridData")) {
      onRead?.(++gridReads);
      const tab = tabs.find((t) => t.id === 10)!;
      return response({
        sheets: [
          {
            properties: { sheetId: 10, title: tab.title },
            data: [
              {
                rowData: tab.rows.map((values) => ({
                  values: Array.from(
                    { length: values.length },
                    (_, i) => values[i] ?? {},
                  ),
                })),
              },
            ],
          },
        ],
      });
    }
    return response({
      spreadsheetId: "test-sheet",
      properties: { title: "Tracker" },
      sheets: tabs.map((t) => ({
        properties: {
          sheetId: t.id,
          title: t.title,
          gridProperties: { rowCount: 100, columnCount: 25 },
        },
      })),
    });
  });
  return {
    http,
    batches,
    tabs: () => tabs,
    source: () => tabs.find((t) => t.id === 10)!,
    onRead: (f: typeof onRead) => {
      gridReads = 0;
      onRead = f;
    },
  };
}
beforeEach(() => {
  for (const [key, value] of Object.entries({
    GOOGLE_AUTH_MODE: "oauth",
    GOOGLE_CLIENT_ID: "fake",
    GOOGLE_CLIENT_SECRET: "fake",
    GOOGLE_REFRESH_TOKEN: "fake",
    GOOGLE_SHEETS_SPREADSHEET_ID: "test-sheet",
    GOOGLE_SHEETS_WRITES_ENABLED: "true",
    PE_DATA_MODE: "live",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("Training Plan is the canonical calendar", () => {
  it.each([null, 7])(
    "preserves pre-connection journal RPE when the source starts at %s, then follows saved edits and explicit clears",
    async (sourceRpe) => {
      const google = fakePlanGoogle(),
        client = new SheetsClient(google.http),
        repo = new SheetsRepository(client);
      const workout = canonical().Workouts[0];
      const journal = {
        workoutId: "legacy-session",
        date: "2026-11-02",
        rpe: 4,
        energy: 3,
        fatigue: 1,
        soreness: 1,
        sleepQuality: 4,
        notes: "Already saved before connecting",
        skippedReason: "",
      };
      const append = (title: string, id: string, payload: object) => {
        google
          .tabs()
          .find((t) => t.title === title)!
          .rows.push(
            [
              id,
              `revision-${id}`,
              "",
              "2026-11-02T00:00:00Z",
              "false",
              JSON.stringify(payload),
              `op-${id}`,
            ].map(cell),
          );
      };
      append("PE_Workouts", "legacy-session", workout.payload);
      append("PE_Feedback", "journal", journal);
      google.source().rows[1][12] = cell(sourceRpe ?? "");
      await client.enableTrainingPlan();
      let snapshot = (await repo.read()).snapshot;
      expect(cellValue(google.source().rows[1][12])).toBe(sourceRpe ?? 4);
      expect(toData(snapshot, true).feedback[0]).toMatchObject({
        ...journal,
        rpe: sourceRpe ?? 4,
      });
      expect(
        google.tabs().find((t) => t.title === "PE_Feedback")!.rows,
      ).toHaveLength(2);
      // Setup, source RPE and the live marker are committed together.
      const rpeBatch = google.batches.find((b) =>
        b.some((r) => r.updateCells?.start.columnIndex === 12),
      );
      if (sourceRpe == null)
        expect(rpeBatch?.at(-1)).toHaveProperty("deleteSheet");
      else expect(rpeBatch).toBeUndefined();
      await repo.commit(
        [
          {
            dataset: "Feedback",
            id: "journal",
            expected: snapshot.Feedback[0].fingerprint,
            payload: { ...journal, rpe: 6 },
          },
        ],
        "edit-journal",
        snapshot,
      );
      snapshot = (await repo.read()).snapshot;
      expect(cellValue(google.source().rows[1][12])).toBe(6);
      expect(toData(snapshot, true).feedback[0].rpe).toBe(6);
      // Direct spreadsheet edits, including blanking the cell, stay authoritative.
      google.source().rows[1][12] = cell("");
      snapshot = (await repo.read()).snapshot;
      expect(toData(snapshot, true).feedback[0].rpe).toBeNull();
      await repo.commit(
        [
          {
            dataset: "Feedback",
            id: "journal",
            expected: snapshot.Feedback[0].fingerprint,
            payload: { ...journal, rpe: null },
          },
        ],
        "clear-journal",
        snapshot,
      );
      await client.enableTrainingPlan();
      expect(
        toData((await repo.read()).snapshot, true).feedback[0].rpe,
      ).toBeNull();
      expect(google.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(
        false,
      );
    },
  );
  it("applies established round-trip commute preferences to new weekly commute rows", () => {
    const g = grid();
    g.rows[1] = sourceRow("2026-11-03", "Bike to Work (Controlled)");
    g.rows[1][3] = cell("Easy commute both ways");
    const prior = {
      ...canonical().Workouts[0],
      payload: {
        type: "Bike-to-Work",
        date: "2026-10-27",
        time: "05:45",
        commuteLegs: 2,
        commuteReturnTime: "16:30",
      },
    };
    expect(readPlan(planState(g, [prior]))[0].payload).toMatchObject({
      type: "Bike-to-Work",
      time: "05:45",
      commuteLegs: 2,
      commuteReturnTime: "16:30",
    });
  });
  it("reads weekly rows without an import, retains ranges/goals, and follows external edits and deletions", async () => {
    const google = fakePlanGoogle(),
      client = new SheetsClient(google.http);
    await client.enableTrainingPlan();
    google
      .source()
      .rows.push(sourceRow("2026-11-09", "Long Run (Easy Run-Walk)"));
    let s = (await client.read()).snapshot;
    expect(toData(s, true).workouts.map((w) => w.date)).toEqual([
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(s.Workouts[1].payload).toMatchObject({
      type: "Long Run",
      durationMin: null,
      durationText: "40–55",
      goal: "Build consistency",
    });
    google.source().rows[2][2] = cell("Recovery Run");
    expect((await client.read()).snapshot.Workouts[1].payload.type).toBe(
      "Recovery Run",
    );
    google.source().rows.splice(1, 1);
    s = (await client.read()).snapshot;
    expect(s.Workouts).toHaveLength(1);
    expect(s.Workouts[0].payload.date).toBe("2026-11-09");
    const writes = google.batches.length;
    await client.enableTrainingPlan();
    expect(google.batches).toHaveLength(writes + 2); // Lock + validation-only unlock, no migration replay.
  });
  it("saves to the same row with a stable ID, valid shadow history, and no duplicate write on repeated receipt", async () => {
    const google = fakePlanGoogle(),
      client = new SheetsClient(google.http),
      repo = new SheetsRepository(client);
    await client.enableTrainingPlan();
    google.source().rows.push(sourceRow("2026-11-09", "Long Run"));
    let s = (await repo.read()).snapshot;
    const w = s.Workouts[1];
    const c: Change = {
      dataset: "Workouts",
      id: w.id,
      expected: w.fingerprint,
      payload: { ...w.payload, notes: "Updated on web" },
    };
    await repo.commit([c], "first", s);
    expect(cellValue(google.source().rows[2][14])).toBe(w.id);
    expect(cellValue(google.source().rows[2][13])).toBe("Updated on web");
    const before = structuredClone(google.source().rows);
    await repo.commit([c], "first", s);
    expect(google.source().rows).toEqual(before);
    google.source().rows.reverse(); // Keep the header fixed while sorting sessions.
    google.source().rows.reverse();
    [google.source().rows[1], google.source().rows[2]] = [
      google.source().rows[2],
      google.source().rows[1],
    ];
    s = (await repo.read()).snapshot;
    const sorted = s.Workouts.find((x) => x.id === w.id)!;
    await repo.commit(
      [
        {
          ...c,
          expected: sorted.fingerprint,
          payload: { ...sorted.payload, notes: "After sorting" },
        },
      ],
      "second",
      s,
    );
    expect(cellValue(google.source().rows[1][13])).toBe("After sorting");
    const history = google
      .tabs()
      .find((t) => t.title === "PE_Workouts")!
      .rows.map((row) => row.map(cellValue));
    expect(mapRows(history)).toHaveLength(1);
    expect(mapRows(history)[0].payload.notes).toBe("After sorting");
    expect(google.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(false);
    expect(
      google.batches
        .filter((b) => b.some((r) => r.updateCells))
        .every((b) => !!b.at(-1)?.deleteSheet),
    ).toBe(true);
  });
  it("rejects stale browser edits and a scheduler edit immediately before commit", async () => {
    const google = fakePlanGoogle(),
      client = new SheetsClient(google.http),
      repo = new SheetsRepository(client);
    await client.enableTrainingPlan();
    let s = (await repo.read()).snapshot;
    const c = changed(s, { notes: "Stale browser" });
    google.source().rows[1][3] = cell("New weekly instruction");
    await expect(repo.commit([c], "stale", s)).rejects.toThrow(
      "changed elsewhere",
    );
    s = (await repo.read()).snapshot;
    google.onRead((n) => {
      if (n === 2) google.source().rows[1][4] = cell("Scheduler changed goal");
    });
    await expect(
      repo.commit([changed(s, { notes: "Race" })], "race", s),
    ).rejects.toThrow("just before saving");
    expect(cellValue(google.source().rows[1][13])).toBe("Keep this note");
    expect(google.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(false);
  });
  it("preserves date cells, formulas, validation, raw ranges and unknown columns on unrelated edits", () => {
    const g = grid();
    g.rows[1][0] = {
      userEnteredValue: { numberValue: 46328 },
      effectiveValue: { numberValue: 46328 },
    };
    g.rows[1][5] = {
      userEnteredValue: { formulaValue: "=2+3" },
      effectiveValue: { numberValue: 5 },
    };
    g.rows[1][7] = {
      ...cell("Modified"),
      dataValidation: {
        strict: true,
        condition: {
          type: "ONE_OF_LIST",
          values: ["Planned", "Completed", "Modified", "Skipped"].map(
            (userEnteredValue) => ({ userEnteredValue }),
          ),
        },
      },
    };
    g.rows[1][20] = {
      userEnteredValue: { formulaValue: "=SUM(1,2)" },
      effectiveValue: { numberValue: 3 },
    };
    const before = structuredClone(g),
      s = canonical(g);
    const requests = planWriteRequests(s, [
      changed(s, { notes: "Changed" }),
    ]) as { updateCells: { start: { columnIndex: number }; fields: string } }[];
    expect(
      requests
        .map((r) => r.updateCells.start.columnIndex)
        .sort((a, b) => a - b),
    ).toEqual([13, 14, 15]);
    expect(
      requests.every((r) => r.updateCells.fields === "userEnteredValue"),
    ).toBe(true);
    expect(g).toEqual(before);
    expect(() => planWriteRequests(s, [changed(s, { distanceKm: 6 })])).toThrow(
      "formula",
    );
    expect(readPlan(s.trainingPlan!)).toHaveLength(1); // Repeatable parser.
  });
  it("appends new plans and retains soft deletion and reschedule history without changing dropdown rules", async () => {
    const google = fakePlanGoogle(),
      client = new SheetsClient(google.http),
      repo = new SheetsRepository(client);
    await client.enableTrainingPlan();
    let s = (await repo.read()).snapshot;
    const w = s.Workouts[0];
    const p = workoutInput.parse({
      ...w.payload,
      date: "2026-11-03",
      title: "Moved run",
    });
    await repo.commit(
      [
        { ...changed(s, { status: "Rescheduled", rescheduledTo: "moved" }) },
        {
          dataset: "Workouts",
          id: "moved",
          expected: null,
          payload: {
            ...p,
            rescheduledFrom: w.id,
            createdAt: "2026-10-27T00:00:00Z",
          },
        },
      ],
      "move",
      s,
    );
    s = (await repo.read()).snapshot;
    expect(s.Workouts.find((x) => x.id === w.id)?.payload.status).toBe(
      "Rescheduled",
    );
    expect(s.Workouts.find((x) => x.id === "moved")?.payload.date).toBe(
      "2026-11-03",
    );
    const moved = s.Workouts.find((x) => x.id === "moved")!;
    await repo.commit(
      [
        {
          dataset: "Workouts",
          id: moved.id,
          expected: moved.fingerprint,
          deleted: true,
          payload: moved.payload,
        },
      ],
      "delete",
      s,
    );
    expect(
      toData((await repo.read()).snapshot, true).workouts.some(
        (x) => x.id === "moved",
      ),
    ).toBe(false);
    expect(google.source().rows).toHaveLength(3);
  });
  it("mirrors Garmin actuals and journal RPE in the atomic save, while keeping mixed-sport metrics separate", () => {
    const s = canonical();
    const id = s.Workouts[0].id;
    s.ActivityLinks = [
      {
        ...s.Workouts[0],
        payload: {
          workoutId: id,
          activityId: "run",
          activityIds: ["run", "bike"],
        },
      },
    ];
    s.Activities = [
      ...[
        ["run", "running", 3, 1800, 142, 158],
        ["bike", "cycling", 4, 1200, 106, 126],
      ].map(([id, type, distanceKm, durationSec, avgHr, maxHr]) => ({
        ...s.Workouts[0],
        id: String(id),
        payload: { type, distanceKm, durationSec, avgHr, maxHr },
      })),
    ];
    const req = planWriteRequests(s, [
      changed(s, {
        status: "Completed",
        activityCount: 2,
        allowMixedSports: true,
      }),
      {
        dataset: "Feedback",
        id: "journal",
        expected: null,
        payload: { workoutId: id, rpe: 6 },
      },
    ]) as {
      updateCells: {
        start: { columnIndex: number };
        rows: { values: PlanCell[] }[];
      };
    }[];
    const values = new Map(
      req.map((r) => [
        r.updateCells.start.columnIndex,
        cellValue(r.updateCells.rows[0].values[0]),
      ]),
    );
    expect([8, 9, 10, 11, 12].map((col) => values.get(col))).toEqual([
      3, 30, 142, 158, 6,
    ]);
  });
  it("keeps web IDs, commute settings and confirmed family replacement during initial setup", () => {
    const source = grid(false),
      s = empty();
    const existing = {
      ...canonical().Workouts[0],
      id: "existing-web-id",
      payload: {
        ...canonical().Workouts[0].payload,
        title: "Easy Run + Family Bike Ride",
        status: "Completed",
        activityCount: 2,
        allowMixedSports: true,
      },
    };
    s.Workouts = [existing];
    const setup = preparePlanSetup(source, s);
    const req = setup.requests as {
      updateCells: {
        start: { columnIndex: number };
        rows: { values: PlanCell[] }[];
      };
    }[];
    const updates = new Map(
      req
        .filter((r) => r.updateCells.start.columnIndex !== undefined)
        .map((r) => [
          `${r.updateCells.start.columnIndex}`,
          cellValue(r.updateCells.rows[0].values[0]),
        ]),
    );
    expect(updates.get("14")).toBe("existing-web-id");
    expect(JSON.parse(String(updates.get("15")))).toMatchObject({
      activityCount: 2,
      allowMixedSports: true,
    });
    expect(updates.get("7")).toBe("Completed");
    expect(updates.get("2")).toBe("Easy Run + Family Bike Ride");
  });
});
