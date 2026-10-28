import { createHash } from "node:crypto";
import {
  goalInput,
  type Activity,
  type Workout,
  type ActivityLink,
  type Feedback,
} from "../domain";
import { manualActivities, feedbackForActivity } from "../measurements";
import { AppError } from "../server/errors";
import { cellValue, type PlanGrid, type PlanCell } from "./training-plan";
import { fingerprint, type Stored, type Snapshot, type Change } from "./rows";

export const TRACKER_MARKER = "tracker-sources";
export const LOG_TAB = "Workout Log",
  ROADMAP_TAB = "HM Roadmap 2027",
  DASHBOARD_TAB = "Dashboard";
export const LOG_COLUMNS = [
  "Date",
  "Activity",
  "Distance km",
  "Duration min",
  "Avg HR",
  "Max HR",
  "Elevation gain m",
  "Calories",
  "HR drift",
  "Notes",
];
export const LOG_EXTRA = [
  "PE_Activity_ID",
  "PE_Source_Metadata",
  "PE_Active",
  "PE_Sport",
  "Journal RPE",
  "Journal scope",
  "Energy (1-5)",
  "Fatigue (1-5)",
  "Soreness (1-5)",
  "Sleep quality (1-5)",
  "Journal notes",
];
export const GOAL_EXTRA = ["PE_Goal_ID", "PE_Goal_Metadata"];
export interface TrackerState {
  log: PlanGrid;
  roadmap: PlanGrid;
  dashboard: PlanGrid;
  goalShadow: Stored[];
  hash: string;
  goalPositions: Map<string, number>;
}
const scalar = (grid: PlanGrid, row: number, col: number) =>
  cellValue(grid.rows[row]?.[col]);
function json(cell: PlanCell | undefined): Record<string, unknown> {
  const value = cellValue(cell);
  if (value === "") return {};
  try {
    const result = JSON.parse(String(value));
    if (result && typeof result === "object" && !Array.isArray(result))
      return result;
  } catch {
    /* fail closed */
  }
  throw new AppError(
    "Tracker source metadata is invalid. Existing cells were preserved.",
    409,
  );
}
export function sourceDate(v: unknown) {
  return typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v);
}
function number(v: unknown) {
  return v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}
function typeFor(label: unknown): Activity["type"] {
  const s = String(label);
  return /run|interval/i.test(s)
    ? "running"
    : /cycl|bike|b2w/i.test(s)
      ? "cycling"
      : /walk/i.test(s)
        ? "walking"
        : "other";
}
export function trackerState(
  log: PlanGrid,
  roadmap: PlanGrid,
  dashboard: PlanGrid,
  goalShadow: Stored[],
): TrackerState {
  if (
    !LOG_COLUMNS.every((s, i) => scalar(log, 0, i) === s) ||
    !["Period", "Long-run target (km)", "Primary focus", "Gate / notes"].every(
      (s, i) => scalar(roadmap, 0, i) === s,
    )
  )
    throw new AppError(
      "Workout Log or HM Roadmap columns changed. Review the adapter before saving.",
      409,
    );
  return {
    log,
    roadmap,
    dashboard,
    goalShadow,
    goalPositions: new Map(),
    hash: fingerprint([
      JSON.stringify(log),
      JSON.stringify(roadmap),
      JSON.stringify(dashboard),
    ]),
  };
}
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function readRoadmapGoals(state: TrackerState): Stored[] {
  state.goalPositions.clear();
  return state.roadmap.rows.slice(1).flatMap((cells, index) => {
    const row = index + 1,
      period = String(cellValue(cells[0])),
      target = String(cellValue(cells[1]));
    const metadata = json(cells[5]);
    if (metadata.deleted === true) return [];
    const year = /20\d{2}/.exec(period)?.[0];
    const month = /^(20\d{2})-(0[1-9]|1[0-2])$/.test(period)
      ? period
      : year && months.findIndex((m) => period.toLowerCase().includes(m)) >= 0
        ? `${year}-${String(months.findIndex((m) => period.toLowerCase().includes(m)) + 1).padStart(2, "0")}`
        : null;
    if (
      !month ||
      (!scalar(state.roadmap, row, 4) &&
        !/race|backup|binloop|bfi/i.test(target))
    )
      return [];
    const distance = number(
      /^\d+(?:\.\d+)?$/.test(target)
        ? target
        : /\d+(?:\.\d+)?/.exec(target)?.[0],
    );
    if (!distance || distance > 1000)
      throw new AppError("A roadmap race distance needs review.", 409);
    const id = String(
      cellValue(cells[4]) ||
        `roadmap-${createHash("sha256")
          .update(period + ":" + target)
          .digest("hex")
          .slice(0, 24)}`,
    );
    if (state.goalPositions.has(id))
      throw new AppError(
        "Duplicate roadmap goal IDs. Review before saving.",
        409,
      );
    state.goalPositions.set(id, row);
    const focus = String(cellValue(cells[2]));
    const priority =
      metadata.priority ??
      (/backup/i.test(target + " " + focus)
        ? "backup"
        : /conditional/i.test(target)
          ? "primary"
          : "other");
    const title =
      metadata.sourceFocus && metadata.sourceFocus !== focus
        ? focus
        : metadata.sourceFocus === focus && typeof metadata.title === "string"
          ? metadata.title
          : /21\.1/.test(target)
            ? `First half marathon · ${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}${priority === "backup" ? " backup" : " (conditional)"}`
            : target;
    const p = goalInput.parse({
      title,
      distanceKm: distance,
      targetMonth: month,
      date: metadata.date ?? null,
      targetTimeMin: metadata.targetTimeMin ?? null,
      notes: String(cellValue(cells[3])),
      priority,
    });
    const hash = fingerprint([JSON.stringify(cells)]);
    return [
      {
        id,
        revision: hash,
        parent: "",
        updatedAt: "",
        deleted: false,
        payload: p,
        operationId: "roadmap",
        fingerprint: hash,
        synthetic: true,
      },
    ];
  });
}

type Update = {
  updateCells: {
    start: { sheetId: number; rowIndex: number; columnIndex: number };
    rows: { values: PlanCell[] }[];
    fields: string;
  };
};
export function cellUpdate(
  grid: PlanGrid,
  row: number,
  col: number,
  value: unknown,
): Update | null {
  const before = grid.rows[row]?.[col] ?? {};
  const entered =
    value == null || value === ""
      ? {}
      : typeof value === "number"
        ? { numberValue: value }
        : typeof value === "boolean"
          ? { boolValue: value }
          : { stringValue: String(value) };
  if (
    JSON.stringify(before.userEnteredValue ?? {}) === JSON.stringify(entered) ||
    cellValue(before) === value
  )
    return null;
  if (before.userEnteredValue?.formulaValue)
    throw new AppError(
      "A tracker formula occupies an edited cell. It was preserved.",
      409,
    );
  const validation = before.dataValidation;
  if (
    validation?.strict &&
    validation.condition?.type === "ONE_OF_LIST" &&
    value !== "" &&
    value != null &&
    !validation.condition.values?.some(
      (v) => v.userEnteredValue === String(value),
    )
  )
    throw new AppError(
      "A tracker value conflicts with its dropdown. Existing validation was preserved.",
      409,
    );
  return {
    updateCells: {
      start: { sheetId: grid.sheetId, rowIndex: row, columnIndex: col },
      rows: [{ values: [{ userEnteredValue: entered }] }],
      fields: "userEnteredValue",
    },
  };
}
function headers(grid: PlanGrid, start: number, names: string[]) {
  return names.flatMap((name, i) => {
    const old = scalar(grid, 0, start + i);
    if (old !== "" && old !== name)
      throw new AppError(
        "Reserved tracker columns contain other data. Add empty columns before connecting.",
        409,
      );
    if (
      old === "" &&
      grid.rows.slice(1).some((r) => cellValue(r[start + i]) !== "")
    )
      throw new AppError(
        "A reserved tracker column has existing data below its header.",
        409,
      );
    const update = cellUpdate(grid, 0, start + i, name);
    return update ? [update] : [];
  });
}
function merged(
  snapshot: Snapshot,
  dataset: keyof Pick<
    Snapshot,
    "Workouts" | "Activities" | "ActivityLinks" | "Feedback"
  >,
  changes: Change[],
) {
  const records = new Map(
    snapshot[dataset].filter((r) => !r.deleted).map((r) => [r.id, r.payload]),
  );
  changes
    .filter((c) => c.dataset === dataset)
    .forEach((c) => {
      if (c.deleted) records.delete(c.id);
      else records.set(c.id, { ...records.get(c.id), ...c.payload });
    });
  return [...records].map(([id, p]) => ({ ...p, id }));
}
export function logWriteRequests(
  snapshot: Snapshot,
  changes: Change[],
  state: TrackerState,
) {
  const grid = state.log,
    updates: unknown[] = headers(grid, 10, LOG_EXTRA);
  const acts = merged(snapshot, "Activities", changes) as unknown as Activity[];
  const workouts = merged(
    snapshot,
    "Workouts",
    changes,
  ) as unknown as Workout[];
  const links = merged(
    snapshot,
    "ActivityLinks",
    changes,
  ) as unknown as ActivityLink[];
  const feedback = merged(
    snapshot,
    "Feedback",
    changes,
  ) as unknown as Feedback[];
  const all = [...acts, ...manualActivities(workouts, acts, links)];
  const seen = new Map<string, number>();
  for (let i = 1; i < grid.rows.length; i++) {
    const id = String(scalar(grid, i, 10));
    if (id) {
      if (seen.has(id))
        throw new AppError(
          "Duplicate Workout Log activity IDs. Resolve them before saving.",
          409,
        );
      seen.set(id, i);
    }
  }
  const claimed = new Set<number>(seen.values());
  let next = Math.max(
    1,
    grid.rows.findLastIndex((r) => r.some((c) => cellValue(c) !== "")) + 1,
  );
  const put = (row: number, col: number, value: unknown) => {
    const u = cellUpdate(grid, row, col, value);
    if (u) updates.push(u);
  };
  for (const a of all) {
    let row = seen.get(a.id),
      fresh = false;
    if (row == null) {
      const candidates = grid.rows.flatMap((r, i) =>
        i > 0 &&
        !claimed.has(i) &&
        !scalar(grid, i, 10) &&
        sourceDate(cellValue(r[0])) === a.date &&
        typeFor(cellValue(r[1])) === a.type &&
        number(cellValue(r[2])) != null &&
        a.distanceKm != null &&
        Math.abs(Number(cellValue(r[2])) - a.distanceKm) < 0.05 &&
        number(cellValue(r[3])) != null &&
        a.durationSec != null &&
        Math.abs(Number(cellValue(r[3])) - a.durationSec / 60) < 1
          ? [i]
          : [],
      );
      if (candidates.length > 1)
        throw new AppError(
          "Several Workout Log rows match one Garmin activity. Review them to avoid duplicates.",
          409,
        );
      row = candidates[0] ?? next++;
      fresh = !candidates.length;
    }
    claimed.add(row);
    seen.set(a.id, row);
    const meta = json(grid.rows[row]?.[11]);
    const alreadyManaged = Array.isArray(meta.originalValues);
    if (!meta.originalValues)
      meta.originalValues = fresh
        ? []
        : grid.rows[row].slice(0, 10).map(cellValue);
    meta.source = a.source;
    meta.activityId = a.id;
    const values: [number, unknown][] = [
      [10, a.id],
      [12, true],
      [13, a.type],
    ];
    const journal = a.sourceWorkoutId
      ? feedback.find(
          (f) => f.workoutId === a.sourceWorkoutId && f.scope !== "activity",
        )
      : feedbackForActivity({ feedback, links, workouts }, a.id);
    values.push(
      [14, journal?.rpe],
      [
        15,
        journal
          ? journal.scope === "activity"
            ? "Activity"
            : "Shared session"
          : "",
      ],
      [16, journal?.energy],
      [17, journal?.fatigue],
      [18, journal?.soreness],
      [19, journal?.sleepQuality],
      [20, journal?.notes ?? ""],
    );
    if (fresh)
      values.push(
        [0, a.date],
        [
          1,
          `${a.type[0].toUpperCase() + a.type.slice(1)}${a.source === "sheet" ? " · manual" : ""}`,
        ],
      );
    values.push(
      [2, a.distanceKm],
      [3, a.durationSec == null ? null : a.durationSec / 60],
      [4, a.avgHr],
      [5, a.maxHr],
    );
    if (a.elevationM != null) {
      values.push([6, a.elevationM]);
      const old = scalar(grid, row, 6);
      if (old !== "" && old !== a.elevationM) {
        const previous = grid.rows[row]?.[6]?.note ?? "";
        const note = `Garmin source reconciliation: previous log elevation ${old} m; current Garmin summary ${a.elevationM.toFixed(2)} m. Original values are retained in PE_Source_Metadata.`;
        updates.push({
          updateCells: {
            start: { sheetId: grid.sheetId, rowIndex: row, columnIndex: 6 },
            rows: [
              {
                values: [{ note: [previous, note].filter(Boolean).join("\n") }],
              },
            ],
            fields: "note",
          },
        });
      }
    }
    if (a.calories != null) values.push([7, a.calories]);
    if (
      alreadyManaged &&
      values.some(
        ([col, value]) =>
          col >= 2 && col <= 7 && scalar(grid, row, col) !== (value ?? ""),
      )
    ) {
      const history = Array.isArray(meta.previousMeasurements)
        ? meta.previousMeasurements
        : [];
      meta.previousMeasurements = [
        ...history,
        {
          recordedAt: new Date().toISOString(),
          values: grid.rows[row].slice(0, 10).map(cellValue),
        },
      ];
    }
    const serialized = JSON.stringify(meta);
    if (serialized.length > 45000)
      throw new AppError(
        "Workout Log measurement history needs archiving before another correction. Existing data was preserved.",
        409,
      );
    values.push([11, serialized]);
    for (const [col, value] of values) put(row, col, value);
  }
  for (let row = 1; row < grid.rows.length; row++)
    if (!claimed.has(row) && scalar(grid, row, 0) !== "") {
      const id = String(scalar(grid, row, 10));
      put(row, 12, !id.startsWith("sheet-"));
      put(row, 13, typeFor(scalar(grid, row, 1)));
    }
  if (next > grid.rowCount)
    updates.unshift({
      appendDimension: {
        sheetId: grid.sheetId,
        dimension: "ROWS",
        length: next - grid.rowCount,
      },
    });
  return updates;
}

export function roadmapWriteRequests(
  snapshot: Snapshot,
  changes: Change[],
  state: TrackerState,
  setup = false,
) {
  const requests: unknown[] = headers(state.roadmap, 4, GOAL_EXTRA);
  let next = Math.max(
    1,
    state.roadmap.rows.findLastIndex((r) =>
      r.some((c) => cellValue(c) !== ""),
    ) + 1,
  );
  const goals = setup
    ? readRoadmapGoals(state).map((r) => ({
        dataset: "Goals" as const,
        id: r.id,
        expected: r.fingerprint,
        payload: r.payload,
      }))
    : changes.filter((c) => c.dataset === "Goals");
  for (const c of goals) {
    const row = state.goalPositions.get(c.id) ?? next++,
      p = c.payload;
    const old = snapshot.Goals.find((g) => g.id === c.id)?.payload;
    const meta = json(state.roadmap.rows[row]?.[5]);
    const focus =
      old?.title === p.title || setup ? scalar(state.roadmap, row, 2) : p.title;
    const values: [number, unknown][] = [
      [4, c.id],
      [
        5,
        JSON.stringify({
          ...meta,
          title: p.title,
          priority: p.priority ?? "other",
          date: p.date ?? null,
          targetTimeMin: p.targetTimeMin ?? null,
          sourceFocus: focus,
        }),
      ],
    ];
    if (!setup) {
      if (!old || old.targetMonth !== p.targetMonth)
        values.push([0, p.targetMonth]);
      if (!old || old.distanceKm !== p.distanceKm)
        values.push([1, p.distanceKm]);
      values.push([2, focus]);
      if (p.notes !== undefined) values.push([3, p.notes]);
    }
    for (const [col, value] of values) {
      const update = cellUpdate(state.roadmap, row, col, value);
      if (update) requests.push(update);
    }
  }
  if (next > state.roadmap.rowCount)
    requests.unshift({
      appendDimension: {
        sheetId: state.roadmap.sheetId,
        dimension: "ROWS",
        length: next - state.roadmap.rowCount,
      },
    });
  return requests;
}
export function trackerWriteRequests(snapshot: Snapshot, changes: Change[]) {
  if (!snapshot.tracker) return [];
  return [
    ...logWriteRequests(snapshot, changes, snapshot.tracker),
    ...roadmapWriteRequests(snapshot, changes, snapshot.tracker),
  ];
}
