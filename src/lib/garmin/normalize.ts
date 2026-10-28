import { z } from "zod";
import { Activity } from "../domain";
import { localDate } from "../dates";

const metric = z.number().finite().nonnegative().nullish();
const measurements = z
  .object({
    startTimeGMT: z.string(),
    distance: metric,
    duration: metric,
    movingDuration: metric,
    averageHR: metric,
    maxHR: metric,
    elevationGain: metric,
    calories: metric,
  })
  .passthrough();
const activityType = z.object({
  typeKey: z.string(),
  parentTypeId: z.number().optional(),
});
const split = z.object({
  distance: metric,
  duration: metric,
  averageHR: metric,
  messageIndex: z.number().optional(),
  splitType: z.string().optional(),
});
const searchSchema = measurements.extend({
  activityId: z.union([
    z.number().int().positive().safe(),
    z.string().regex(/^\d+$/),
  ]),
  activityName: z.string().nullish(),
  activityType,
  splitSummaries: z.array(split).nullish(),
  hrTimeInZone_1: metric,
  hrTimeInZone_2: metric,
  hrTimeInZone_3: metric,
  hrTimeInZone_4: metric,
  hrTimeInZone_5: metric,
});
const detailSchema = z.object({
  activityId: z.union([
    z.number().int().positive().safe(),
    z.string().regex(/^\d+$/),
  ]),
  activityName: z.string().nullish(),
  activityTypeDTO: activityType,
  summaryDTO: measurements,
  splitSummaries: z.array(split).nullish(),
});

// Fields and units verified against Garmin's official embedded OpenAPI, 2026-10-26.
export function normalizeActivity(raw: unknown, detail = false): Activity {
  const d = detail ? detailSchema.parse(raw) : null;
  const s = d
    ? {
        ...d.summaryDTO,
        activityId: d.activityId,
        activityName: d.activityName,
        activityType: d.activityTypeDTO,
        splitSummaries: d.splitSummaries,
      }
    : searchSchema.parse(raw);
  const typeKey = s.activityType.typeKey;
  const type: Activity["type"] = /run/.test(typeKey)
    ? "running"
    : /cycl|biking/.test(typeKey)
      ? "cycling"
      : /walk|hiking/.test(typeKey)
        ? "walking"
        : "other";
  const gmt = s.startTimeGMT.replace(" ", "T");
  const startedAt = /(?:Z|[+-]\d\d:\d\d)$/.test(gmt) ? gmt : `${gmt}Z`;
  if (!Number.isFinite(Date.parse(startedAt)))
    throw new Error("Invalid Garmin activity timestamp");
  const distanceKm = s.distance == null ? null : s.distance / 1000;
  const durationSec = s.duration ?? null;
  return {
    id: String(s.activityId),
    title: s.activityName || `${typeKey.replaceAll("_", " ")} activity`,
    type,
    rawType: typeKey,
    startedAt,
    date: localDate(startedAt),
    distanceKm,
    durationSec,
    movingSec: s.movingDuration ?? null,
    avgHr: s.averageHR || null,
    maxHr: s.maxHR || null,
    elevationM: s.elevationGain ?? null,
    ...(s.calories != null ? { calories: s.calories } : {}),
    paceSecKm:
      type === "running" && distanceKm && durationSec != null
        ? durationSec / distanceKm
        : null,
    splits: (s.splitSummaries ?? [])
      .filter((x) => x.distance != null && x.duration != null)
      .map((x, i) => ({
        index: x.messageIndex ?? i + 1,
        distanceKm: x.distance! / 1000,
        durationSec: x.duration!,
        avgHr: x.averageHR || null,
      })),
    hrZones: d
      ? []
      : [1, 2, 3, 4, 5].flatMap((zone) => {
          const v = (s as Record<string, unknown>)[`hrTimeInZone_${zone}`];
          return typeof v === "number" && v > 0 ? [{ zone, seconds: v }] : [];
        }),
    source: "garmin",
  };
}
