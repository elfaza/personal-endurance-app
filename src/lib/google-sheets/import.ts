import { createHash } from "node:crypto";
import { z } from "zod";
import { workoutInput, type WorkoutInput } from "../domain";
import { AppError } from "../server/errors";
export const importFields = [
  "id",
  "date",
  "type",
  "title",
  "time",
  "description",
  "distanceKm",
  "durationMin",
  "targetPace",
  "hrZone",
  "rpe",
  "status",
  "optional",
  "notes",
] as const;
export const importRequest = z.object({
  tab: z
    .string()
    .min(1)
    .max(100)
    .refine(
      (s) => !s.startsWith("PE_"),
      "Choose an existing source worksheet.",
    ),
  mapping: z.partialRecord(z.enum(importFields), z.string().min(1)),
  preview: z.boolean(),
  sourceHash: z.string().optional(),
});
export type ImportRequest = z.infer<typeof importRequest>;
export function mapLegacyRows(
  values: unknown[][],
  mapping: ImportRequest["mapping"],
  namespace: string,
) {
  if (!values.length) throw new AppError("This worksheet is empty.");
  const header = values[0].map(String);
  const indices = new Map<string, number>();
  for (const [field, column] of Object.entries(mapping)) {
    const found = header.flatMap((h, i) => (h === column ? [i] : []));
    if (found.length !== 1)
      throw new AppError(
        `Column ${column} must exist exactly once in the source header.`,
      );
    indices.set(field, found[0]);
  }
  for (const required of ["id", "date", "type", "title"])
    if (!indices.has(required))
      throw new AppError(
        `Map a source column for ${required}. A stable unique ID is required.`,
      );
  const seen = new Set<string>();
  const result = values.slice(1).flatMap((row, index) => {
    if (!row.some((v) => v !== "" && v != null)) return [];
    const read = (key: string) =>
      indices.has(key) ? String(row[indices.get(key)!] ?? "").trim() : "";
    const id = read("id");
    if (!id || seen.has(id))
      throw new AppError(
        `Row ${index + 2}: source workout ID is empty or duplicated.`,
      );
    seen.add(id);
    const candidate: Record<string, unknown> = {};
    for (const field of importFields) {
      if (field === "id" || !indices.has(field)) continue;
      const v = read(field);
      if (["distanceKm", "durationMin", "hrZone", "rpe"].includes(field))
        candidate[field] = v === "" ? null : Number(v);
      else if (field === "optional") {
        if (
          v &&
          !["true", "false", "yes", "no", "1", "0"].includes(v.toLowerCase())
        )
          throw new AppError(
            `Row ${index + 2}: optional must be true/false, yes/no or 1/0.`,
          );
        candidate[field] = ["true", "yes", "1"].includes(v.toLowerCase());
      } else if (v || !["status"].includes(field)) candidate[field] = v;
    }
    let workout: WorkoutInput;
    try {
      workout = workoutInput.parse(candidate);
    } catch {
      throw new AppError(
        `Row ${index + 2}: invalid workout. Use ISO dates, metric numeric targets, and documented workout types/statuses.`,
      );
    }
    if (workout.status === "Rescheduled")
      throw new AppError(
        `Row ${index + 2}: import the active replacement plan; rescheduled history cannot be reconstructed from a single row.`,
      );
    return [
      {
        id: `import-${createHash("sha256").update(`${namespace}:${id}`).digest("hex").slice(0, 28)}`,
        workout,
      },
    ];
  });
  const sourceHash = createHash("sha256")
    .update(JSON.stringify({ values, mapping }))
    .digest("hex");
  return { rows: result, sourceHash };
}
