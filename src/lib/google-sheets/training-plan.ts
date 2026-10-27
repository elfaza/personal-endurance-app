import { createHash } from "node:crypto";
import {
  workoutInput,
  workoutTypes,
  sport,
  type WorkoutInput,
  activityIdsForLink,
} from "../domain";
import { AppError } from "../server/errors";
import { fingerprint, type Change, type Snapshot, type Stored } from "./rows";

export const PLAN_TAB = "Training Plan";
export const PLAN_MARKER = "training-plan-source";
export const PLAN_COLUMNS = [
  "Date",
  "Day",
  "Session",
  "Planned detail",
  "Goal",
  "Target km",
  "Target min",
  "Status",
  "Actual km",
  "Actual min",
  "Avg HR",
  "Max HR",
  "RPE",
  "Notes",
];
export const PLAN_ID = "PE_ID",
  PLAN_METADATA = "PE_Metadata";
export interface PlanCell {
  userEnteredValue?: {
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
    formulaValue?: string;
  };
  effectiveValue?: {
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
    errorValue?: unknown;
  };
  formattedValue?: string;
  dataValidation?: {
    strict?: boolean;
    condition?: { type?: string; values?: { userEnteredValue?: string }[] };
  };
}
export interface PlanGrid {
  sheetId: number;
  rowCount: number;
  columnCount: number;
  rows: PlanCell[][];
}
export interface TrainingPlanState {
  grid: PlanGrid;
  shadow: Stored[];
  hash: string;
  positions: Map<string, number>;
  columns: Map<string, number>;
}
const metadataKeys = [
  "time",
  "type",
  "targetPace",
  "hrZone",
  "rpe",
  "optional",
  "commuteLegs",
  "commuteReturnTime",
  "activityCount",
  "allowMixedSports",
  "createdAt",
  "completionSource",
  "rescheduledFrom",
  "rescheduledTo",
];
export function cellValue(cell: PlanCell = {}): string | number | boolean {
  const v = cell.effectiveValue ?? cell.userEnteredValue ?? {};
  if ("errorValue" in v)
    throw new AppError(
      "Training Plan contains a formula error. Correct it before saving.",
      409,
    );
  return v.stringValue ?? v.numberValue ?? v.boolValue ?? "";
}
export function planColumns(grid: PlanGrid, metadataRequired = true) {
  const header = (grid.rows[0] ?? []).map((c) => String(cellValue(c)));
  const columns = new Map<string, number>();
  for (const name of [
    ...PLAN_COLUMNS,
    ...(metadataRequired ? [PLAN_ID, PLAN_METADATA] : []),
  ]) {
    const indices = header.flatMap((v, i) => (v === name ? [i] : []));
    if (indices.length !== 1)
      throw new AppError(
        `Training Plan needs exactly one ${name} column. Existing data was preserved.`,
        409,
      );
    columns.set(name, indices[0]);
  }
  return columns;
}
function isoDate(value: unknown) {
  const text =
    typeof value === "number"
      ? new Date(Date.UTC(1899, 11, 30) + value * 86400000)
          .toISOString()
          .slice(0, 10)
      : String(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(Date.parse(`${text}T12:00:00Z`))
  )
    throw new AppError(
      "Training Plan dates must be ISO YYYY-MM-DD or Google date cells.",
      409,
    );
  return text;
}
function numberOrNull(value: unknown) {
  if (value === "" || value == null) return null;
  return typeof value === "number"
    ? value
    : /^\d+(\.\d+)?$/.test(String(value).trim())
      ? Number(value)
      : null;
}
function classify(title: string): WorkoutInput["type"] {
  if (workoutTypes.includes(title as WorkoutInput["type"]))
    return title as WorkoutInput["type"];
  if (/bike.?to.?work|b2w/i.test(title)) return "Bike-to-Work";
  if (/long run/i.test(title)) return "Long Run";
  if (/interval/i.test(title)) return "Interval Run";
  if (/tempo/i.test(title)) return "Tempo Run";
  if (/recovery run/i.test(title)) return "Recovery Run";
  if (/easy run|run.walk/i.test(title)) return "Easy Run";
  if (/cycling|bike ride/i.test(title)) return "Cycling";
  if (/^rest|recovery/i.test(title)) return "Rest Day";
  if (/strength/i.test(title)) return "Strength Training";
  return "Custom Workout";
}
function mappedStatus(value: string): WorkoutInput["status"] {
  const status: Record<string, WorkoutInput["status"]> = {
    Planned: "Planned",
    Optional: "Planned",
    Tentative: "Planned",
    Completed: "Completed",
    Modified: "Partially Completed",
    "Partially Completed": "Partially Completed",
    Skipped: "Skipped",
    Rescheduled: "Rescheduled",
    Cancelled: "Planned",
  };
  if (!(value in status))
    throw new AppError(
      `Unrecognized Training Plan status: ${value}. Review the row before editing.`,
      409,
    );
  return status[value];
}
function readMetadata(cell: PlanCell) {
  const value = cellValue(cell);
  if (value === "") return {} as Record<string, unknown>;
  try {
    const p = JSON.parse(String(value));
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error();
    return p as Record<string, unknown>;
  } catch {
    throw new AppError(
      "A Training Plan PE_Metadata cell is invalid JSON. No data was changed.",
      409,
    );
  }
}
function metadataFor(payload: Record<string, unknown>, deleted = false) {
  return {
    ...Object.fromEntries(
      metadataKeys
        .filter((k) => payload[k] !== undefined)
        .map((k) => [k, payload[k]]),
    ),
    sourceSession: payload.title,
    sourceDetail: payload.description,
    sourceStatus: deleted
      ? "Skipped"
      : payload.status === "Rescheduled"
        ? "Skipped"
        : payload.optional && payload.status === "Planned"
          ? "Optional"
          : payload.status,
    planStatus: payload.status,
    deleted,
  };
}
export function planState(grid: PlanGrid, shadow: Stored[]): TrainingPlanState {
  return {
    grid,
    shadow,
    columns: planColumns(grid),
    positions: new Map(),
    hash: fingerprint([JSON.stringify(grid)]),
  };
}
export function readPlan(state: TrainingPlanState): Stored[] {
  const { grid, columns } = state;
  state.positions.clear();
  const commuteDefaults = state.shadow
    .filter(
      (w) =>
        !w.deleted &&
        w.payload.type === "Bike-to-Work" &&
        w.payload.commuteLegs === 2,
    )
    .sort((a, b) =>
      String(b.payload.date).localeCompare(String(a.payload.date)),
    )[0]?.payload;
  const records: Stored[] = [];
  for (let index = 1; index < grid.rows.length; index++) {
    const cells = grid.rows[index];
    const read = (name: string) => cellValue(cells[columns.get(name)!]);
    if (PLAN_COLUMNS.every((name) => read(name) === "")) continue;
    const date = isoDate(read("Date")),
      title = String(read("Session"));
    if (!title.trim())
      throw new AppError(`Training Plan row ${index + 1} has no Session.`, 409);
    const meta = readMetadata(cells[columns.get(PLAN_METADATA)!] ?? {});
    const description = String(read("Planned detail"));
    const timeInText = /^([0-2]\d:[0-5]\d)/.exec(description)?.[1] ?? "";
    const id =
      String(read(PLAN_ID)) ||
      `plan-${createHash("sha256").update(`${grid.sheetId}:${date}:${title}:${timeInText}`).digest("hex").slice(0, 28)}`;
    if (state.positions.has(id))
      throw new AppError(
        "Training Plan contains duplicate session IDs. Give each session its own PE_ID before editing.",
        409,
      );
    state.positions.set(id, index);
    const rawStatus = String(read("Status") || "Planned");
    const status =
      meta.sourceStatus === rawStatus && meta.planStatus === "Rescheduled"
        ? "Rescheduled"
        : mappedStatus(rawStatus);
    const durationText = String(read("Target min"));
    const type =
      meta.sourceSession === title
        ? (meta.type ?? classify(title))
        : classify(title);
    const isCommute = type === "Bike-to-Work";
    const payload = {
      ...meta,
      date,
      title,
      type,
      time:
        meta.sourceDetail === description
          ? (meta.time ?? timeInText)
          : timeInText || (isCommute ? commuteDefaults?.time : "") || "",
      commuteLegs: isCommute
        ? (meta.commuteLegs ?? commuteDefaults?.commuteLegs)
        : undefined,
      commuteReturnTime: isCommute
        ? (meta.commuteReturnTime ?? commuteDefaults?.commuteReturnTime)
        : undefined,
      description,
      goal: String(read("Goal")),
      distanceKm: numberOrNull(read("Target km")),
      durationMin: numberOrNull(read("Target min")),
      durationText,
      status,
      optional: ["Optional", "Tentative"].includes(rawStatus),
      notes: String(read("Notes")),
      createdAt:
        typeof meta.createdAt === "string"
          ? meta.createdAt
          : `${date}T00:00:00.000Z`,
      completionSource: ["Completed", "Partially Completed"].includes(status)
        ? (meta.completionSource ?? "manual")
        : undefined,
    };
    const parsed = workoutInput.safeParse(payload);
    if (!parsed.success)
      throw new AppError(
        `Training Plan row ${index + 1} has invalid dates, targets or text. Review it before editing.`,
        409,
      );
    const rowFingerprint = fingerprint([JSON.stringify(cells)]);
    records.push({
      id,
      revision: rowFingerprint,
      parent: "",
      updatedAt: "",
      deleted: meta.deleted === true || rawStatus === "Cancelled",
      payload: {
        ...parsed.data,
        createdAt: payload.createdAt,
        completionSource: payload.completionSource,
        rescheduledFrom: meta.rescheduledFrom,
        rescheduledTo: meta.rescheduledTo,
      },
      operationId: "training-plan",
      fingerprint: rowFingerprint,
    });
  }
  return records;
}
function entered(value: unknown) {
  return value == null || value === ""
    ? {}
    : typeof value === "number"
      ? { numberValue: value }
      : { stringValue: String(value) };
}
function updateCell(
  state: TrainingPlanState,
  row: number,
  column: number,
  value: unknown,
) {
  const cell = state.grid.rows[row]?.[column] ?? {};
  if (
    JSON.stringify(entered(cellValue(cell))) === JSON.stringify(entered(value))
  )
    return null;
  if (cell.userEnteredValue?.formulaValue)
    throw new AppError(
      `Training Plan row ${row + 1} has a formula in the edited column. The formula was preserved.`,
      409,
    );
  const validation = cell.dataValidation;
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
      `Training Plan row ${row + 1} does not allow that value. Check its dropdown options.`,
      409,
    );
  return {
    updateCells: {
      start: {
        sheetId: state.grid.sheetId,
        rowIndex: row,
        columnIndex: column,
      },
      rows: [{ values: [{ userEnteredValue: entered(value) }] }],
      fields: "userEnteredValue",
    },
  };
}
function statusValue(status: unknown, original: unknown, cell?: PlanCell) {
  if (mappedStatus(String(original || "Planned")) === status)
    return original || "Planned";
  const allowed =
    cell?.dataValidation?.condition?.type === "ONE_OF_LIST"
      ? cell.dataValidation.condition.values?.map((v) => v.userEnteredValue)
      : undefined;
  if (
    status === "Partially Completed" &&
    allowed?.includes("Modified") &&
    !allowed.includes("Partially Completed")
  )
    return "Modified";
  return status;
}
export function planWriteRequests(snapshot: Snapshot, changes: Change[]) {
  const state = snapshot.trainingPlan;
  if (!state) return [];
  const requests: unknown[] = [];
  const modifications = new Map<number, Map<number, unknown>>();
  const positions = new Map(state.positions);
  let nextRow = Math.max(
    1,
    state.grid.rows.findLastIndex((row) =>
      row.some((cell) => Object.keys(cell.userEnteredValue ?? {}).length > 0),
    ) + 1,
  );
  const put = (row: number, name: string, value: unknown) => {
    const fields = modifications.get(row) ?? new Map();
    fields.set(state.columns.get(name)!, value);
    modifications.set(row, fields);
  };
  for (const c of changes.filter((c) => c.dataset === "Workouts")) {
    let row = positions.get(c.id);
    const p = c.payload;
    const values: Record<string, unknown> = {
      Date: p.date,
      Session: p.title,
      "Planned detail": p.description,
      Goal: p.goal ?? "",
      "Target km": p.distanceKm ?? "",
      "Target min": p.durationMin ?? p.durationText ?? "",
      Status:
        c.deleted || p.status === "Rescheduled"
          ? "Skipped"
          : p.optional && p.status === "Planned"
            ? "Optional"
            : p.status,
      Notes: p.notes ?? "",
      [PLAN_ID]: c.id,
      [PLAN_METADATA]: JSON.stringify(metadataFor(p, c.deleted)),
    };
    if (row == null) {
      row = nextRow++;
      positions.set(c.id, row);
      values.Day = new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        weekday: "short",
      }).format(new Date(`${p.date}T12:00:00Z`));
    } else {
      const old = snapshot.Workouts.find((w) => w.id === c.id)!.payload;
      if (p.date === old.date)
        values.Date = cellValue(
          state.grid.rows[row][state.columns.get("Date")!],
        );
      if (p.distanceKm === old.distanceKm)
        values["Target km"] = cellValue(
          state.grid.rows[row][state.columns.get("Target km")!],
        );
      if (p.goal === undefined)
        values.Goal = cellValue(
          state.grid.rows[row][state.columns.get("Goal")!],
        );
      if (
        p.durationMin === old.durationMin &&
        p.durationText === old.durationText
      )
        values["Target min"] = cellValue(
          state.grid.rows[row][state.columns.get("Target min")!],
        );
      values.Status =
        c.deleted || p.status === "Rescheduled"
          ? "Skipped"
          : statusValue(
              p.status,
              cellValue(state.grid.rows[row][state.columns.get("Status")!]),
              state.grid.rows[row][state.columns.get("Status")!],
            );
      if (!c.deleted && p.status === "Planned" && p.optional !== old.optional)
        values.Status = p.optional ? "Optional" : "Planned";
    }
    // Remember the actual status literal, including existing dropdown aliases.
    values[PLAN_METADATA] = JSON.stringify({
      ...metadataFor(p, c.deleted),
      sourceStatus: values.Status,
    });
    for (const [name, value] of Object.entries(values)) put(row, name, value);
  }
  const activities = new Map(
    snapshot.Activities.filter((a) => !a.deleted).map((a) => [a.id, a.payload]),
  );
  for (const c of changes.filter(
    (c) => c.dataset === "Activities" && !c.deleted,
  ))
    activities.set(c.id, c.payload);
  const links = new Map(
    snapshot.ActivityLinks.filter((l) => !l.deleted).map((l) => [
      l.id,
      l.payload,
    ]),
  );
  for (const c of changes.filter((c) => c.dataset === "ActivityLinks")) {
    if (c.deleted) links.delete(c.id);
    else links.set(c.id, c.payload);
  }
  for (const link of links.values()) {
    const id = String(link.workoutId),
      row = positions.get(id);
    if (
      row == null ||
      !changes.some(
        (c) =>
          (c.id === id && c.dataset === "Workouts") ||
          (c.dataset === "ActivityLinks" && c.payload.workoutId === id) ||
          (c.dataset === "Activities" &&
            (
              (link.activityIds as string[] | undefined) ?? [
                String(link.activityId),
              ]
            ).includes(c.id)),
      )
    )
      continue;
    const workout =
      changes.find((c) => c.dataset === "Workouts" && c.id === id)?.payload ??
      snapshot.Workouts.find((w) => w.id === id)?.payload;
    if (!workout) continue;
    const ids = activityIdsForLink(
      link as unknown as { activityId: string; activityIds?: string[] },
    );
    const records = ids.flatMap((id) => {
      const a = activities.get(id);
      return a &&
        (sport(String(workout.type)) === "other" ||
          a.type === sport(String(workout.type)))
        ? [a]
        : [];
    });
    const sum = (key: string) =>
      records.some((a) => typeof a[key] === "number")
        ? records.reduce(
            (n, a) => n + (typeof a[key] === "number" ? (a[key] as number) : 0),
            0,
          )
        : null;
    if (!records.length) continue;
    put(row, "Actual km", sum("distanceKm"));
    const duration = sum("durationSec");
    put(row, "Actual min", duration == null ? null : duration / 60);
    const hr = records.filter(
      (a) =>
        typeof a.avgHr === "number" &&
        typeof a.durationSec === "number" &&
        a.durationSec > 0,
    );
    put(
      row,
      "Avg HR",
      hr.length
        ? Math.round(
            hr.reduce(
              (n, a) => n + (a.avgHr as number) * (a.durationSec as number),
              0,
            ) / hr.reduce((n, a) => n + (a.durationSec as number), 0),
          )
        : null,
    );
    const max = records.flatMap((a) =>
      typeof a.maxHr === "number" ? [a.maxHr] : [],
    );
    put(row, "Max HR", max.length ? Math.max(...max) : null);
  }
  for (const c of changes.filter(
    (c) => c.dataset === "Feedback" && c.payload.workoutId,
  )) {
    const row = positions.get(String(c.payload.workoutId));
    if (row == null) continue;
    put(row, "RPE", c.payload.rpe ?? "");
    const workout = snapshot.Workouts.find((w) => w.id === c.payload.workoutId);
    if (
      workout &&
      !cellValue(state.grid.rows[row]?.[state.columns.get(PLAN_ID)!])
    ) {
      put(row, PLAN_ID, workout.id);
      put(row, PLAN_METADATA, JSON.stringify(metadataFor(workout.payload)));
    }
  }
  if (nextRow > state.grid.rowCount)
    requests.push({
      appendDimension: {
        sheetId: state.grid.sheetId,
        dimension: "ROWS",
        length: nextRow - state.grid.rowCount,
      },
    });
  for (const [row, values] of modifications)
    for (const [column, value] of values) {
      const r = updateCell(state, row, column, value);
      if (r) requests.push(r);
    }
  return requests;
}

export function preparePlanSetup(original: PlanGrid, snapshot: Snapshot) {
  planColumns(original, false);
  const grid = structuredClone(original);
  const header = grid.rows[0].map((c) => String(cellValue(c)));
  const headerRequests: unknown[] = [];
  for (const name of [PLAN_ID, PLAN_METADATA]) {
    if (header.filter((v) => v === name).length > 1)
      throw new AppError(`Duplicate ${name} column.`, 409);
    if (header.includes(name)) continue;
    const position = Math.max(
      PLAN_COLUMNS.length,
      header.findLastIndex((v) => v !== "") + 1,
    );
    if (position >= grid.columnCount)
      throw new AppError(
        "Add two empty columns to Training Plan before enabling live calendar access.",
        409,
      );
    if (grid.rows.slice(1).some((row) => cellValue(row[position]) !== ""))
      throw new AppError(
        `The empty ${position + 1} column header has existing data below it. Add empty columns before connecting Training Plan.`,
        409,
      );
    const r = updateCell(
      { grid: original } as TrainingPlanState,
      0,
      position,
      name,
    );
    if (r) headerRequests.push(r);
    grid.rows[0][position] = { userEnteredValue: { stringValue: name } };
    header[position] = name;
  }
  const state = planState(grid, snapshot.Workouts);
  const source = readPlan(state);
  const mapped: Stored[] = [];
  const changes: Change[] = [];
  for (const r of source) {
    const position = state.positions.get(r.id)!;
    const existingId = String(
      cellValue(grid.rows[position][state.columns.get(PLAN_ID)!]),
    );
    const sameDay = snapshot.Workouts.filter(
      (w) => !w.deleted && w.payload.date === r.payload.date,
    );
    const exact = sameDay.filter(
      (w) =>
        w.payload.title === r.payload.title ||
        (w.payload.importSource as Record<string, unknown> | undefined)
          ?.session === r.payload.title,
    );
    const uniqueDate =
      source.filter((s) => s.payload.date === r.payload.date).length === 1;
    const prior = existingId
      ? snapshot.Workouts.find((w) => w.id === existingId)
      : exact.length === 1
        ? exact[0]
        : sameDay.length === 1 && uniqueDate
          ? sameDay[0]
          : undefined;
    const id = existingId || prior?.id || r.id;
    const p = prior
      ? {
          ...r.payload,
          ...prior.payload,
          goal: prior.payload.goal ?? r.payload.goal,
          durationText: prior.payload.durationText ?? r.payload.durationText,
        }
      : r.payload;
    // Earlier imports embedded these already-mapped columns in the description.
    // Remove only that exact generated suffix; keep all original/user prose.
    const suffix = `\n\nGoal: ${r.payload.goal}\n\nOriginal target duration (min): ${r.payload.durationText}`;
    if (typeof p.description === "string" && p.description.endsWith(suffix))
      p.description = p.description.slice(0, -suffix.length);
    // Undo only the exact audit text added by the old one-time import. The
    // source columns already contain these values; keep any later user prose.
    const originalStatus =
      (prior?.payload.importSource as Record<string, unknown> | undefined)
        ?.originalStatus ??
      cellValue(grid.rows[position][state.columns.get("Status")!]);
    const auditStatus = `\n\nOriginal sheet status: ${originalStatus}`;
    const resultFields = [
      ["Actual km", "Distance (km)"],
      ["Actual min", "Duration (min)"],
      ["Avg HR", "Average HR"],
      ["Max HR", "Maximum HR"],
      ["RPE", "Session RPE"],
    ];
    const resultLines = resultFields.flatMap(([column, label]) => {
      const value = cellValue(grid.rows[position][state.columns.get(column)!]);
      return value === "" ? [] : [`${label}: ${value}`];
    });
    const auditResults = resultLines.length
      ? `\n\nRecorded results from Training Plan:\n${resultLines.join("\n")}`
      : "";
    if (typeof p.notes === "string")
      p.notes = p.notes.replace(auditStatus + auditResults, "");
    workoutInput.parse(p);
    state.positions.delete(r.id);
    state.positions.set(id, position);
    mapped.push({ ...r, id });
    changes.push({
      dataset: "Workouts",
      id,
      expected: r.fingerprint,
      payload: p,
    });
  }
  if (new Set(mapped.map((r) => r.id)).size !== mapped.length)
    throw new AppError(
      "The existing plan has ambiguous session identities. Review IDs before connecting.",
      409,
    );
  const working = { ...snapshot, Workouts: mapped, trainingPlan: state };
  return {
    requests: [...headerRequests, ...planWriteRequests(working, changes)],
    state,
    count: mapped.length,
  };
}
