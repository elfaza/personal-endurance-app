import {
  activityIdsForLink,
  expectedActivityCount,
  sport,
  type Workout,
} from "../domain";
import type { Snapshot, Change } from "./rows";

// A retrospective link needs unique recorded results, never a target alone.
export function historicalLinkChanges(snapshot: Snapshot): Change[] {
  const occupied = new Set(
    snapshot.ActivityLinks.filter((l) => !l.deleted).flatMap((l) =>
      activityIdsForLink(
        l.payload as unknown as { activityId: string; activityIds?: string[] },
      ),
    ),
  );
  const proposals: {
    workout: (typeof snapshot.Workouts)[number];
    ids: string[];
  }[] = [];
  for (const w of snapshot.Workouts.filter(
    (w) =>
      !w.deleted &&
      ["Completed", "Partially Completed"].includes(String(w.payload.status)),
  )) {
    if (
      snapshot.ActivityLinks.some(
        (l) => !l.deleted && l.payload.workoutId === w.id,
      )
    )
      continue;
    const result = w.payload.recordedResult as Workout["recordedResult"];
    if (!result || result.distanceKm == null || result.durationMin == null)
      continue;
    const candidates = snapshot.Activities.filter(
      (a) =>
        !a.deleted &&
        !occupied.has(a.id) &&
        a.payload.date === w.payload.date &&
        a.payload.type === sport(String(w.payload.type)),
    );
    const count = expectedActivityCount(w.payload as unknown as Workout);
    const sets =
      count === 2
        ? candidates.flatMap((a, i) =>
            candidates.slice(i + 1).map((b) => [a, b]),
          )
        : candidates.map((a) => [a]);
    const matches = sets.filter(
      (set) =>
        Math.abs(
          set.reduce((n, a) => n + Number(a.payload.distanceKm ?? 0), 0) -
            result.distanceKm!,
        ) < 0.05 &&
        Math.abs(
          set.reduce((n, a) => n + Number(a.payload.durationSec ?? 0) / 60, 0) -
            result.durationMin!,
        ) < 1,
    );
    if (matches.length === 1)
      proposals.push({
        workout: w,
        ids: matches[0]
          .toSorted((a, b) =>
            String(a.payload.startedAt).localeCompare(
              String(b.payload.startedAt),
            ),
          )
          .map((a) => a.id),
      });
  }
  return proposals
    .filter((p) =>
      p.ids.every(
        (id) => proposals.filter((x) => x.ids.includes(id)).length === 1,
      ),
    )
    .flatMap(
      ({ workout: w, ids }) =>
        [
          {
            dataset: "ActivityLinks",
            id: w.id,
            expected:
              snapshot.ActivityLinks.find((l) => l.id === w.id)?.fingerprint ??
              null,
            payload: { workoutId: w.id, activityId: ids[0], activityIds: ids },
          },
          {
            dataset: "Workouts",
            id: w.id,
            expected: w.fingerprint,
            payload: { ...w.payload, completionSource: "garmin" },
          },
        ] as Change[],
    );
}
