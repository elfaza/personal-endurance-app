import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { datasets, type Dataset } from "../domain";
import { demoData } from "../demo";
import {
  HEADERS,
  assertExpected,
  fingerprint,
  mapRows,
  type Change,
  type Snapshot,
} from "../google-sheets/rows";
import { sheets } from "../google-sheets/client";
import { planWriteRequests } from "../google-sheets/training-plan";
import { trackerWriteRequests } from "../google-sheets/tracker";
import { configuration } from "./config";
import { AppError } from "./errors";

type Logs = Record<Dataset, string[][]>;
export interface Repository {
  read(): Promise<{ snapshot: Snapshot; initialized: boolean }>;
  commit(
    changes: Change[],
    operationId: string,
    expectedSnapshot?: Snapshot,
  ): Promise<void>;
}
const globalState = globalThis as typeof globalThis & {
  peQueue?: Promise<unknown>;
};
export async function withLock<T>(work: () => Promise<T>): Promise<T> {
  const prior = globalState.peQueue ?? Promise.resolve();
  const result = prior.catch(() => {}).then(work);
  globalState.peQueue = result.catch(() => {});
  return result;
}
function seededLogs(): Logs {
  const data = demoData();
  const source: Record<Dataset, unknown[]> = {
    Workouts: data.workouts,
    Activities: data.activities,
    Feedback: [],
    ActivityLinks: data.links,
    Goals: data.goals,
    Meta: [{ id: "sync", ...data.sync }],
  };
  return Object.fromEntries(
    datasets.map((d) => [
      d,
      [
        HEADERS,
        ...source[d].map((item) => {
          const p = item as Record<string, unknown>;
          return [
            String(p.id),
            `seed-${p.id}`,
            "",
            "2026-01-01T00:00:00.000Z",
            "false",
            JSON.stringify(p),
            "seed",
          ];
        }),
      ],
    ]),
  ) as Logs;
}
const storagePath = () =>
  path.join(process.cwd(), ".data", process.env.PE_DEMO_FILE ?? "demo.json");
async function readLogs(): Promise<Logs> {
  try {
    return JSON.parse(await readFile(storagePath(), "utf8")) as Logs;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return seededLogs();
    throw new AppError(
      "The local demo data file is unreadable. Restore it or move it aside to reset demo data.",
      500,
    );
  }
}
function prepare(snapshot: Snapshot, changes: Change[], op: string) {
  if (snapshot.Meta.some((r) => r.id === `op:${op}`)) return [];
  const unique = new Set<string>();
  const now = new Date().toISOString();
  return [
    ...changes,
    {
      dataset: "Meta" as const,
      id: `op:${op}`,
      expected: null,
      payload: { id: `op:${op}`, at: now },
    },
  ].map((c) => {
    if (unique.has(`${c.dataset}:${c.id}`))
      throw new AppError("Duplicate record in one transaction.");
    unique.add(`${c.dataset}:${c.id}`);
    const current = snapshot[c.dataset].find((r) => r.id === c.id);
    assertExpected(current, c.expected);
    const revision = createHash("sha256")
      .update(`${op}:${c.dataset}:${c.id}`)
      .digest("hex")
      .slice(0, 32);
    const values = [
      c.id,
      revision,
      c.dataset === "Workouts" && snapshot.trainingPlan
        ? (snapshot.trainingPlan.shadow.find((r) => r.id === c.id)?.revision ??
          "")
        : c.dataset === "Goals" && snapshot.tracker
          ? (snapshot.tracker.goalShadow.find((r) => r.id === c.id)?.revision ??
            "")
          : current?.synthetic
            ? ""
            : (current?.revision ?? ""),
      now,
      String(c.deleted ?? false),
      JSON.stringify(c.payload),
      op,
    ];
    if (values[5].length > 45000)
      throw new AppError("This record exceeds the Sheets cell size limit.");
    return { dataset: c.dataset, values };
  });
}
function snapshotFingerprint(snapshot: Snapshot) {
  return JSON.stringify([
    snapshot.tracker?.hash ?? "",
    ...datasets.map((d) => [
      d,
      snapshot[d]
        .map((r) => [r.id, r.fingerprint])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ]),
  ]);
}
export class DemoRepository implements Repository {
  async read() {
    const logs = await readLogs();
    return {
      snapshot: Object.fromEntries(
        datasets.map((d) => [d, mapRows(logs[d])]),
      ) as unknown as Snapshot,
      initialized: true,
    };
  }
  async commit(changes: Change[], op: string, expectedSnapshot?: Snapshot) {
    if (configuration().readOnly)
      throw new AppError(
        "This hosted demo is read-only. Configure Google Sheets and switch to live mode to save training across devices.",
        409,
      );
    const logs = await readLogs();
    const snapshot = Object.fromEntries(
      datasets.map((d) => [d, mapRows(logs[d])]),
    ) as unknown as Snapshot;
    if (
      !snapshot.Meta.some((r) => r.id === `op:${op}`) &&
      expectedSnapshot &&
      snapshotFingerprint(snapshot) !== snapshotFingerprint(expectedSnapshot)
    )
      throw new AppError(
        "Training changed elsewhere. Refresh and review the latest data before saving.",
        409,
      );
    const rows = prepare(snapshot, changes, op);
    if (!rows.length) return;
    rows.forEach((r) => logs[r.dataset].push(r.values));
    const file = storagePath();
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(logs), { mode: 0o600 });
    await rename(tmp, file);
  }
}
export class SheetsRepository implements Repository {
  constructor(private client = sheets) {}
  async read() {
    return this.client.read();
  }
  async commit(changes: Change[], op: string, expectedSnapshot?: Snapshot) {
    return this.client.withWriteLock(async (commit) => {
      const { snapshot, initialized } = await this.read();
      if (!initialized)
        throw new AppError(
          "Inspect and initialize the dedicated PE worksheets in Settings first.",
          409,
        );
      // Validate all records used for decisions (including activity-link
      // uniqueness), not just modified IDs, while holding the shared lock.
      if (
        !snapshot.Meta.some((r) => r.id === `op:${op}`) &&
        expectedSnapshot &&
        snapshotFingerprint(snapshot) !== snapshotFingerprint(expectedSnapshot)
      )
        throw new AppError(
          "Training changed elsewhere. Refresh and review the latest data before saving.",
          409,
        );
      const rows = prepare(snapshot, changes, op);
      if (!rows.length) return;
      await this.client.append(
        rows,
        commit,
        [
          ...planWriteRequests(snapshot, changes),
          ...trackerWriteRequests(snapshot, changes),
        ],
        snapshot.trainingPlan,
        snapshot.tracker,
      );
    });
  }
}
export function repository(): Repository {
  return configuration().mode === "live"
    ? new SheetsRepository()
    : new DemoRepository();
}
export function rowRevision(payload: Record<string, unknown>) {
  return fingerprint([JSON.stringify(payload)]);
}
