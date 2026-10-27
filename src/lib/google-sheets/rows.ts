import { createHash } from "node:crypto";
import { z } from "zod";
import type { Dataset } from "../domain";
import { AppError } from "../server/errors";
export const HEADERS = [
  "id",
  "revision",
  "parent_revision",
  "updated_at",
  "deleted",
  "payload_json",
  "operation_id",
];
export interface Stored {
  id: string;
  revision: string;
  parent: string;
  updatedAt: string;
  deleted: boolean;
  payload: Record<string, unknown>;
  operationId: string;
  fingerprint: string;
}
export interface Change {
  dataset: Dataset;
  id: string;
  expected: string | null;
  payload: Record<string, unknown>;
  deleted?: boolean;
}
export type Snapshot = Record<Dataset, Stored[]> & {
  trainingPlan?: import("./training-plan").TrainingPlanState;
};
export function fingerprint(row: string[]) {
  return createHash("sha256")
    .update(JSON.stringify(row))
    .digest("hex")
    .slice(0, 20);
}
export function mapRows(values: unknown[][] = []): Stored[] {
  if (JSON.stringify(values[0]) !== JSON.stringify(HEADERS))
    throw new AppError(
      "A PE worksheet has unexpected columns. Restore the documented header before writing; existing data was preserved.",
      409,
    );
  const records = values
    .slice(1)
    .filter((row) => row.some((v) => v !== "" && v != null))
    .map((row) => {
      try {
        const fields = Array.from({ length: 7 }, (_, i) =>
          String(row[i] ?? ""),
        );
        const [id, revision, parent, updatedAt, deleted, json, operationId] =
          fields;
        if (
          !id ||
          !revision ||
          !operationId ||
          !["true", "false"].includes(deleted)
        )
          throw new Error("invalid record");
        const payload = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(json));
        return {
          id,
          revision,
          parent,
          updatedAt,
          deleted: deleted === "true",
          payload,
          operationId,
          fingerprint: fingerprint(fields),
        };
      } catch {
        throw new AppError(
          "A PE worksheet contains an invalid row. Check IDs, revisions and payload_json; no data was overwritten.",
          409,
        );
      }
    });
  // Retry duplicates collapse by revision; divergent writes never silently win.
  const revisions = new Map<string, Stored>();
  for (const r of records) {
    const prior = revisions.get(r.revision);
    if (prior && prior.fingerprint !== r.fingerprint)
      throw new AppError(
        "Conflicting duplicate revision in Sheets. Resolve the retained rows before editing.",
        409,
      );
    revisions.set(r.revision, r);
  }
  const latest = new Map<string, Stored>();
  const children = new Set<string>();
  const byId = new Map<string, Stored[]>();
  for (const r of revisions.values()) {
    const branch = `${r.id}:${r.parent}`;
    if (children.has(branch))
      throw new AppError(
        "Concurrent changes detected in Sheets. Both versions are retained. Resolve the branch before editing.",
        409,
      );
    children.add(branch);
    if (r.parent && !revisions.has(r.parent))
      throw new AppError(
        "Missing revision history in Sheets. Restore the parent row before editing.",
        409,
      );
    if (r.parent && revisions.get(r.parent)?.id !== r.id)
      throw new AppError(
        "A revision references another record's history in Sheets.",
        409,
      );
    const own = byId.get(r.id) ?? [];
    own.push(r);
    byId.set(r.id, own);
    latest.set(r.id, r);
  }
  // Find chain leaves independently of row sort order.
  for (const [id, own] of byId) {
    const parents = new Set(own.map((r) => r.parent));
    const leaves = own.filter((r) => !parents.has(r.revision));
    if (leaves.length !== 1)
      throw new AppError("Invalid revision chain in Sheets.", 409);
    latest.set(id, leaves[0]);
  }
  return [...latest.values()];
}
export function assertExpected(
  current: Stored | undefined,
  expected: string | null,
) {
  if ((current?.fingerprint ?? null) !== expected)
    throw new AppError(
      "This record changed elsewhere. Refresh and review the latest version before saving.",
      409,
    );
}
