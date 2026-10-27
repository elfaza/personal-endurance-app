import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Activity,
  ActivityLink,
  AppData,
  Feedback,
  Goal,
  Workout,
  dateSchema,
  feedbackInput,
  goalInput,
  workoutInput,
  activityIdsForLink,
  activityFitsWorkout,
  expectedActivityCount,
} from "../domain";
import { addDays, localDate } from "../dates";
import {
  findMatches,
  findCommuteMatches,
  uniqueActivityMatches,
} from "../calculations";
import { garmin } from "../garmin/client";
import { type Change, type Snapshot, type Stored } from "../google-sheets/rows";
import { configuration } from "./config";
import { repository, withLock } from "./repository";
import { AppError } from "./errors";

const payload = (value: object) => value as Record<string, unknown>;
function decode<T>(
  rows: Stored[],
  parse: (v: unknown) => T,
): (T & { id: string; revision: string })[] {
  return rows
    .filter((r) => !r.deleted)
    .map((r) => ({ ...parse(r.payload), id: r.id, revision: r.fingerprint }));
}
const storedWorkout = workoutInput.extend({
  createdAt: z.string(),
  rescheduledFrom: z.string().optional(),
  rescheduledTo: z.string().optional(),
  linkedActivityId: z.string().optional(),
  completionSource: z.enum(["manual", "garmin"]).optional(),
});
const storedActivity = z.object({
  id: z.string(),
  title: z.string(),
  date: dateSchema,
  startedAt: z.string(),
  type: z.enum(["running", "cycling", "walking", "other"]),
  rawType: z.string(),
  distanceKm: z.number().nonnegative().nullable(),
  durationSec: z.number().nonnegative().nullable(),
  movingSec: z.number().nullable(),
  avgHr: z.number().nullable(),
  maxHr: z.number().nullable(),
  elevationM: z.number().nullable(),
  paceSecKm: z.number().nullable(),
  splits: z.array(
    z.object({
      index: z.number(),
      distanceKm: z.number(),
      durationSec: z.number(),
      avgHr: z.number().nullable(),
    }),
  ),
  hrZones: z.array(z.object({ zone: z.number(), seconds: z.number() })),
  source: z.enum(["garmin", "demo"]),
});
export function toData(snapshot: Snapshot, initialized: boolean): AppData {
  const config = configuration();
  const links = decode(snapshot.ActivityLinks, (v) =>
    z
      .object({
        workoutId: z.string(),
        activityId: z.string(),
        activityIds: z.array(z.string()).min(1).max(2).optional(),
      })
      .parse(v),
  ) as ActivityLink[];
  const workouts = decode(snapshot.Workouts, (v) =>
    storedWorkout.parse(v),
  ) as Workout[];
  for (const w of workouts) {
    const link = links.find((l) => l.workoutId === w.id);
    w.linkedActivityIds = link ? activityIdsForLink(link) : [];
    w.linkedActivityId = w.linkedActivityIds[0];
  }
  const syncRecord = snapshot.Meta.find((r) => r.id === "sync" && !r.deleted);
  const sync = syncRecord
    ? z
        .object({
          lastSuccess: z.string().nullable(),
          count: z.number(),
          error: z.string().nullable(),
        })
        .parse(syncRecord.payload)
    : { lastSuccess: null, count: 0, error: null };
  return {
    mode: config.mode,
    workouts,
    links,
    activities: decode(snapshot.Activities, (v) =>
      storedActivity.parse(v),
    ) as Activity[],
    feedback: decode(snapshot.Feedback, (v) =>
      feedbackInput.parse(v),
    ) as Feedback[],
    goals: decode(snapshot.Goals, (v) => goalInput.parse(v)) as Goal[],
    sync,
    configured: {
      garmin: config.garmin,
      sheets: config.sheets,
      initialized,
      readOnly: config.readOnly,
    },
  };
}
export async function getData() {
  const { snapshot, initialized } = await repository().read();
  return toData(snapshot, initialized);
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("week-template"), start: dateSchema }),
  z.object({
    action: z.literal("create"),
    id: z.string().uuid(),
    workout: workoutInput,
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().max(100),
    revision: z.string(),
    workout: workoutInput,
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().max(100),
    revision: z.string(),
  }),
  z.object({
    action: z.literal("reschedule"),
    id: z.string().max(100),
    revision: z.string(),
    date: dateSchema,
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional()
      .or(z.literal("")),
  }),
  z.object({
    action: z.literal("link"),
    id: z.string().max(100),
    revision: z.string(),
    activityId: z.string().max(100).nullable(),
    activityIds: z.array(z.string().min(1).max(100)).max(2).optional(),
  }),
  z.object({
    action: z.literal("feedback"),
    id: z.string().max(100),
    revision: z.string().nullable(),
    feedback: feedbackInput,
  }),
  z.object({
    action: z.literal("goal"),
    id: z.string().max(100),
    revision: z.string().nullable(),
    goal: goalInput,
  }),
]);
function expected(snapshot: Snapshot, dataset: Change["dataset"], id: string) {
  return snapshot[dataset].find((r) => r.id === id)?.fingerprint ?? null;
}
export async function mutate(input: unknown, op: string) {
  const cmd = actionSchema.parse(input);
  return withLock(async () => {
    const repo = repository();
    const { snapshot, initialized } = await repo.read();
    if (snapshot.Meta.some((r) => r.id === `op:${op}`)) return { ok: true };
    const data = toData(snapshot, initialized);
    const changes: Change[] = [];
    if (cmd.action === "week-template") {
      const template: Workout["type"][] = [
        "Easy Run",
        "Bike-to-Work",
        "Interval Run",
        "Bike-to-Work",
        "Long Run",
        "Rest Day",
        "Rest Day",
      ];
      for (const [i, type] of template.entries()) {
        const date = addDays(cmd.start, i);
        const id = `routine-${date}-${i}`;
        if (
          snapshot.Workouts.some((r) => r.id === id) ||
          data.workouts.some(
            (w) => w.date === date && w.status !== "Rescheduled",
          )
        )
          continue;
        const workout = workoutInput.parse({
          date,
          type,
          title: type,
          optional: i === 3,
          description:
            type === "Rest Day"
              ? "Time to recover."
              : "Choose targets to suit your current training. No automatic intensity increase.",
        });
        changes.push({
          dataset: "Workouts",
          id,
          expected: null,
          payload: payload({ ...workout, createdAt: new Date().toISOString() }),
        });
      }
    } else if (cmd.action === "create") {
      if (cmd.workout.status !== "Planned")
        throw new AppError(
          "Create the plan first, then explicitly confirm completion.",
        );
      changes.push({
        dataset: "Workouts",
        id: cmd.id,
        expected: null,
        payload: payload({
          ...cmd.workout,
          createdAt: new Date().toISOString(),
        }),
      });
    } else if (cmd.action === "feedback") {
      if (
        cmd.feedback.workoutId &&
        !data.workouts.some((w) => w.id === cmd.feedback.workoutId)
      )
        throw new AppError("Workout not found.", 404);
      if (
        cmd.feedback.activityId &&
        !data.activities.some((a) => a.id === cmd.feedback.activityId)
      )
        throw new AppError("Activity not found.", 404);
      changes.push({
        dataset: "Feedback",
        id: cmd.id,
        expected: cmd.revision,
        payload: payload(cmd.feedback),
      });
    } else if (cmd.action === "goal")
      changes.push({
        dataset: "Goals",
        id: cmd.id,
        expected: cmd.revision,
        payload: payload(cmd.goal),
      });
    else {
      const w = data.workouts.find((w) => w.id === cmd.id);
      if (!w) throw new AppError("Workout not found.", 404);
      if (w.revision !== cmd.revision)
        throw new AppError(
          "This workout changed elsewhere. Refresh before saving.",
          409,
        );
      if (cmd.action === "update") {
        if (w.status === "Rescheduled")
          throw new AppError(
            "Edit the replacement workout; this entry preserves rescheduling history.",
            409,
          );
        if (cmd.workout.status === "Rescheduled")
          throw new AppError(
            "Use the reschedule action to preserve workout history.",
          );
        if (cmd.workout.date !== w.date)
          throw new AppError(
            "Use Reschedule to change dates and preserve history.",
          );
        if (w.linkedActivityId && cmd.workout.status !== w.status)
          throw new AppError(
            "Unlink the recorded activity before changing completion status.",
          );
        if (
          w.linkedActivityId &&
          expectedActivityCount(cmd.workout) !== expectedActivityCount(w)
        )
          throw new AppError(
            "Unlink the recorded activities before changing the expected activity count.",
          );
        changes.push({
          dataset: "Workouts",
          id: w.id,
          expected: w.revision,
          payload: payload({
            ...w,
            ...cmd.workout,
            completionSource:
              cmd.workout.status === "Completed" ||
              cmd.workout.status === "Partially Completed"
                ? w.linkedActivityId
                  ? "garmin"
                  : "manual"
                : undefined,
          }),
        });
      } else if (cmd.action === "delete") {
        if (w.status !== "Planned" || w.linkedActivityId)
          throw new AppError(
            "Only unlinked planned sessions can be deleted. Skip a session to retain training history.",
          );
        changes.push({
          dataset: "Workouts",
          id: w.id,
          expected: w.revision,
          payload: payload(w),
          deleted: true,
        });
      } else if (cmd.action === "reschedule") {
        if (w.status !== "Planned" || w.linkedActivityId)
          throw new AppError(
            "Only an unlinked planned session can be rescheduled.",
          );
        if (cmd.date === w.date && (cmd.time ?? w.time) === w.time)
          throw new AppError("Choose a different date or time.");
        const id = randomUUID();
        changes.push(
          {
            dataset: "Workouts",
            id: w.id,
            expected: w.revision,
            payload: payload({
              ...w,
              status: "Rescheduled",
              rescheduledTo: id,
            }),
          },
          {
            dataset: "Workouts",
            id,
            expected: null,
            payload: payload({
              ...w,
              date: cmd.date,
              time: cmd.time ?? w.time,
              status: "Planned",
              rescheduledFrom: w.id,
              rescheduledTo: undefined,
              createdAt: new Date().toISOString(),
            }),
          },
        );
      } else if (cmd.action === "link") {
        const old = data.links.find((l) => l.workoutId === w.id);
        const legs = expectedActivityCount(w);
        const ids = [
          ...new Set(
            cmd.activityIds ??
              (cmd.activityId
                ? legs === 2
                  ? [...(w.linkedActivityIds ?? []), cmd.activityId]
                  : [cmd.activityId]
                : []),
          ),
        ];
        if (ids.length > legs)
          throw new AppError(
            "This session has more linked activities than planned. Review its activity count.",
          );
        if (ids.length) {
          if (
            ["Rescheduled", "Skipped"].includes(w.status) ||
            w.type === "Rest Day"
          )
            throw new AppError(
              "Choose an active training session before linking.",
            );
          if (ids.some((id) => !data.activities.some((a) => a.id === id)))
            throw new AppError("Activity not found.", 404);
          if (
            ids.some((id) => {
              const a = data.activities.find((a) => a.id === id)!;
              return !activityFitsWorkout(w, a);
            })
          )
            throw new AppError(
              "Choose an activity from the same date and sport as this workout. Reschedule the plan first if its date changed.",
            );
          if (
            w.type === "Bike-to-Work" &&
            legs === 2 &&
            ids.some((id) => {
              const a = data.activities.find((a) => a.id === id)!;
              return a.type !== "cycling" || a.date !== w.date;
            })
          )
            throw new AppError(
              "Choose cycling activities from the same date for this round-trip commute.",
            );
          if (
            data.links.some(
              (l) =>
                activityIdsForLink(l).some((id) => ids.includes(id)) &&
                l.workoutId !== w.id,
            )
          )
            throw new AppError(
              "This activity is already linked to another workout.",
              409,
            );
          changes.push({
            dataset: "ActivityLinks",
            id: w.id,
            expected: expected(snapshot, "ActivityLinks", w.id),
            payload: { workoutId: w.id, activityId: ids[0], activityIds: ids },
          });
        } else if (old)
          changes.push({
            dataset: "ActivityLinks",
            id: old.id,
            expected: old.revision,
            payload: payload(old),
            deleted: true,
          });
        changes.push({
          dataset: "Workouts",
          id: w.id,
          expected: w.revision,
          payload: payload({
            ...w,
            status: ids.length
              ? ids.length >= legs &&
                !(legs === 1 && w.status === "Partially Completed")
                ? "Completed"
                : "Partially Completed"
              : "Planned",
            completionSource: ids.length ? "garmin" : undefined,
            linkedActivityId: undefined,
            linkedActivityIds: undefined,
          }),
        });
      }
    }
    await repo.commit(changes, op, snapshot);
    return { ok: true };
  });
}
export async function syncGarmin(input: { start?: string; end?: string } = {}) {
  return withLock(async () => {
    const config = configuration();
    if (config.mode === "demo")
      return {
        demo: true,
        message:
          "Demo mode uses sample activities. Switch to live mode in your environment to sync Garmin.",
      };
    if (!config.garmin)
      throw new AppError(
        "Add your Garmin Personal API key to the server environment.",
        503,
      );
    const repo = repository();
    const { snapshot, initialized } = await repo.read();
    if (!initialized)
      throw new AppError("Initialize Sheets before syncing Garmin.", 409);
    const data = toData(snapshot, initialized);
    if (
      data.sync.lastSuccess &&
      Date.now() - Date.parse(data.sync.lastSuccess) < 60000
    )
      return { count: 0, message: "Already synced within the last minute." };
    const start =
      input.start ??
      (data.sync.lastSuccess
        ? addDays(localDate(data.sync.lastSuccess), -7)
        : addDays(localDate(), -90));
    const end = input.end ?? addDays(localDate(), 1);
    dateSchema.parse(start);
    dateSchema.parse(end);
    if (start > end) throw new AppError("Start date must precede end date.");
    try {
      const activities = await garmin().list(start, end);
      const changes: Change[] = activities.flatMap((a) => {
        const current = snapshot.Activities.find((r) => r.id === a.id);
        const prior = current?.payload;
        // Keep details fetched separately while refreshing authoritative summary metrics.
        const merged = {
          ...a,
          splits: a.splits.length ? a.splits : (prior?.splits ?? []),
          hrZones: a.hrZones.length ? a.hrZones : (prior?.hrZones ?? []),
        };
        return prior && JSON.stringify(prior) === JSON.stringify(merged)
          ? []
          : [
              {
                dataset: "Activities" as const,
                id: a.id,
                expected: current?.fingerprint ?? null,
                payload: payload(merged),
              },
            ];
      });
      const reserved = new Set(data.links.flatMap(activityIdsForLink));
      const unlinked = activities.filter((a) => !reserved.has(a.id));
      const knownActivities = [
        ...new Map(
          [...data.activities, ...activities].map((a) => [a.id, a]),
        ).values(),
      ];
      const matches = uniqueActivityMatches([
        ...findMatches(
          data.workouts.filter(
            (w) => w.type !== "Bike-to-Work" && expectedActivityCount(w) === 1,
          ),
          unlinked,
        ).map((m) => ({
          workoutId: m.workoutId,
          activityIds: [m.activityId],
          status:
            data.workouts.find((w) => w.id === m.workoutId)?.status ===
            "Partially Completed"
              ? ("Partially Completed" as const)
              : ("Completed" as const),
        })),
        ...findCommuteMatches(data.workouts, knownActivities, reserved),
      ]);
      for (const match of matches) {
        const w = data.workouts.find((w) => w.id === match.workoutId)!;
        changes.push(
          {
            dataset: "Workouts",
            id: w.id,
            expected: w.revision,
            payload: payload({
              ...w,
              status: match.status,
              completionSource: "garmin",
            }),
          },
          {
            dataset: "ActivityLinks",
            id: w.id,
            expected: expected(snapshot, "ActivityLinks", w.id),
            payload: {
              workoutId: w.id,
              activityId: match.activityIds[0],
              activityIds: match.activityIds,
            },
          },
        );
      }
      changes.push({
        dataset: "Meta",
        id: "sync",
        expected: expected(snapshot, "Meta", "sync"),
        payload: {
          lastSuccess: new Date().toISOString(),
          count: activities.length,
          error: null,
        },
      });
      await repo.commit(changes, randomUUID(), snapshot);
      return { count: activities.length };
    } catch (e) {
      const message =
        e instanceof AppError
          ? e.message
          : "Garmin sync failed. Saved activity data has been preserved.";
      // A failed/uncertain save must not cause a second automatic Sheets write.
      throw new AppError(message, 502);
    }
  });
}
export async function activityDetail(id: string) {
  return withLock(async () => {
    const repo = repository();
    const { snapshot, initialized } = await repo.read();
    const data = toData(snapshot, initialized);
    const cached = data.activities.find((a) => a.id === id);
    if (!cached) throw new AppError("Activity not found. Sync it first.", 404);
    if (data.mode === "demo") return cached;
    if (!/^\d+$/.test(id)) throw new AppError("Invalid Garmin activity ID.");
    const detail = await garmin().detail(id);
    const merged = { ...detail, hrZones: cached.hrZones };
    await repo.commit(
      [
        {
          dataset: "Activities",
          id,
          expected: expected(snapshot, "Activities", id),
          payload: payload(merged),
        },
      ],
      randomUUID(),
      snapshot,
    );
    return merged;
  });
}
