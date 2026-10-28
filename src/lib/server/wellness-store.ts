import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { Snapshot, Change, Stored } from "../google-sheets/rows";
import { repository, withLock, type Repository } from "./repository";
import { configuration } from "./config";
import { AppError } from "./errors";
import {
  profileInput,
  weightInput,
  mealInput,
  type Meal,
  type Profile,
  type Weight,
} from "../wellness";

export const PREFIX = "wellness:";
export const liveRows = (snapshot: Snapshot, prefix: string) =>
  snapshot.Meta.filter((r) => !r.deleted && r.id.startsWith(PREFIX + prefix));
export const record = (snapshot: Snapshot, id: string) =>
  snapshot.Meta.find((r) => r.id === PREFIX + id && !r.deleted);
export function change(
  snapshot: Snapshot,
  id: string,
  payload: object,
  deleted = false,
): Change {
  const row = snapshot.Meta.find((r) => r.id === PREFIX + id);
  return {
    dataset: "Meta",
    id: PREFIX + id,
    expected: row?.fingerprint ?? null,
    payload: payload as Record<string, unknown>,
    deleted,
  };
}
export function assertWritable(initialized: boolean) {
  if (configuration().readOnly || !initialized)
    throw new AppError(
      "Finish writable Google Sheets setup before saving. Your draft is still available.",
      409,
    );
}
export function personalData(snapshot: Snapshot) {
  const row = record(snapshot, "profile");
  const profile: Profile | null = row
    ? { ...profileInput.parse(row.payload), revision: row.fingerprint }
    : null;
  const weights: Weight[] = liveRows(snapshot, "weight:")
    .map((r) => ({ ...weightInput.parse(r.payload), revision: r.fingerprint }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const meals: Meal[] = liveRows(snapshot, "meal:")
    .map((r) => ({
      ...mealInput.parse(r.payload),
      id: r.id.slice((PREFIX + "meal:").length),
      hasPhoto: typeof r.payload.photoId === "string",
      revision: r.fingerprint,
      updatedAt: r.updatedAt,
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt),
    );
  return { profile, weights, meals };
}
function isSmallJpeg(bytes: Buffer) {
  if (
    bytes.length > 48000 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return false;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const h = bytes.readUInt16BE(offset + 5),
        w = bytes.readUInt16BE(offset + 7);
      return h > 0 && w > 0 && h <= 640 && w <= 640;
    }
    offset += length + 2;
  }
  return false;
}
export const photoInput = z
  .string()
  .max(66000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine((v) => {
    const bytes = Buffer.from(v.split(",")[1] ?? "", "base64");
    return isSmallJpeg(bytes);
  }, "Use a JPEG preview up to 640px and 48 KB.");
const revision = z.string().min(1).max(100).nullable();
const commandInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), revision, profile: profileInput }),
  z.object({ action: z.literal("weight"), revision, weight: weightInput }),
  z.object({
    action: z.literal("delete-weight"),
    revision: z.string(),
    date: z.iso.date(),
  }),
  z.object({
    action: z.literal("meal"),
    id: z.string().uuid(),
    revision,
    meal: mealInput,
    photo: photoInput.optional(),
    removePhoto: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("delete-meal"),
    id: z.string().uuid(),
    revision: z.string(),
  }),
]);
function checkRevision(row: Stored | undefined, expected: string | null) {
  if ((row?.fingerprint ?? null) !== expected)
    throw new AppError(
      "This entry changed elsewhere. Refresh and reopen it before saving; your draft is still available.",
      409,
    );
}
export async function saveWellness(
  raw: unknown,
  op: string,
  repo: Repository = repository(),
) {
  const command = commandInput.parse(raw);
  return withLock(async () => {
    const { snapshot, initialized } = await repo.read();
    assertWritable(initialized);
    if (snapshot.Meta.some((r) => r.id === `op:${op}`)) return { ok: true };
    let id: string;
    let payload: object;
    let deleted = false;
    const changes: Change[] = [];
    if (command.action === "profile") {
      id = "profile";
      payload = command.profile;
    } else if (command.action === "weight") {
      id = `weight:${command.weight.date}`;
      payload = command.weight;
    } else if (command.action === "delete-weight") {
      id = `weight:${command.date}`;
      payload = {};
      deleted = true;
    } else if (command.action === "delete-meal") {
      id = `meal:${command.id}`;
      payload = {};
      deleted = true;
    } else {
      id = `meal:${command.id}`;
      const existing = record(snapshot, id);
      let photoId = command.removePhoto ? undefined : existing?.payload.photoId;
      if (command.photo) {
        photoId = createHash("sha256").update(command.photo).digest("hex");
        const encoded = command.photo.split(",")[1];
        for (let index = 0; index * 30000 < encoded.length; index++) {
          const chunkId = `photo:${photoId}:${index}`;
          if (!record(snapshot, chunkId))
            changes.push(
              change(snapshot, chunkId, {
                chunk: encoded.slice(index * 30000, (index + 1) * 30000),
              }),
            );
        }
      }
      payload = {
        ...command.meal,
        ...(photoId ? { photoId } : {}),
        confirmedAt: new Date().toISOString(),
      };
    }
    // Deleted records also have history; restoring needs the prior fingerprint.
    const existing = snapshot.Meta.find((r) => r.id === PREFIX + id);
    checkRevision(existing?.deleted ? undefined : existing, command.revision);
    changes.push(change(snapshot, id, payload, deleted));
    await repo.commit(changes, op, snapshot);
    return { ok: true };
  });
}
export async function readMealPhoto(
  id: string,
  repo: Repository = repository(),
) {
  z.string().uuid().parse(id);
  const { snapshot } = await repo.read();
  const meal = record(snapshot, `meal:${id}`);
  const photoId = meal?.payload.photoId;
  if (typeof photoId !== "string")
    throw new AppError("This meal has no saved photo.", 404);
  const chunks = liveRows(snapshot, `photo:${photoId}:`).sort(
    (a, b) => Number(a.id.split(":").at(-1)) - Number(b.id.split(":").at(-1)),
  );
  if (!chunks.length)
    throw new AppError("The saved photo is unavailable.", 404);
  const encoded = chunks.map((r) => String(r.payload.chunk)).join("");
  const dataUrl = `data:image/jpeg;base64,${encoded}`;
  if (
    createHash("sha256").update(dataUrl).digest("hex") !== photoId ||
    !photoInput.safeParse(dataUrl).success
  )
    throw new AppError(
      "The saved photo needs review in your Sheet. Its content may be incomplete.",
      409,
    );
  return Buffer.from(encoded, "base64");
}
export async function wellnessBody(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 100000)
    throw new AppError(
      "This request is too large. Choose a smaller photo.",
      413,
    );
  const text = await req.text();
  if (Buffer.byteLength(text) > 100000)
    throw new AppError(
      "This request is too large. Choose a smaller photo.",
      413,
    );
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("The request must contain valid JSON.");
  }
}
