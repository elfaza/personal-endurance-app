import { Activity, AppData, Workout, sport } from "./domain";
import { addDays, weekStart } from "./dates";

export function summarize(
  data: Pick<AppData, "activities" | "workouts">,
  start: string,
  end: string,
) {
  const acts = data.activities.filter((a) => a.date >= start && a.date <= end);
  const plans = data.workouts.filter(
    (w) =>
      w.date >= start &&
      w.date <= end &&
      w.status !== "Rescheduled" &&
      w.type !== "Rest Day",
  );
  const required = plans.filter((w) => !w.optional);
  const completed = plans.filter((w) => w.status === "Completed").length;
  const runs = acts.filter((a) => a.type === "running");
  const bikes = acts.filter((a) => a.type === "cycling");
  const sum = (list: Activity[], key: "distanceKm" | "durationSec") =>
    list.reduce((s, a) => s + (a[key] ?? 0), 0);
  const timedRuns = runs.filter(
    (a) => a.distanceKm != null && a.distanceKm > 0 && a.durationSec != null,
  );
  const hr = acts.filter(
    (a) => a.avgHr != null && a.durationSec != null && a.durationSec > 0,
  );
  const hrDuration = sum(hr, "durationSec");
  const distance = sum(timedRuns, "distanceKm");
  return {
    runningKm: sum(runs, "distanceKm"),
    cyclingKm: sum(bikes, "distanceKm"),
    completed,
    planned: plans.length,
    consistency: required.length
      ? Math.round(
          (required.filter((w) => w.status === "Completed").length /
            required.length) *
            100,
        )
      : null,
    pace: distance > 0 ? sum(timedRuns, "durationSec") / distance : null,
    avgHr: hrDuration
      ? Math.round(
          hr.reduce((s, a) => s + a.avgHr! * a.durationSec!, 0) / hrDuration,
        )
      : null,
    maxHr: acts.some((a) => a.maxHr != null)
      ? Math.max(...acts.flatMap((a) => (a.maxHr == null ? [] : [a.maxHr])))
      : null,
    longestRun: runs.length
      ? Math.max(...runs.map((a) => a.distanceKm ?? 0))
      : 0,
    totalMin: sum(acts, "durationSec") / 60,
    cyclingMin: sum(bikes, "durationSec") / 60,
    plannedKm: plans.reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    plannedRunKm: plans
      .filter((w) => sport(w.type) === "running")
      .reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    actualKm: sum(acts, "distanceKm"),
    count: acts.length,
  };
}
export function weeklySeries(
  data: Pick<AppData, "activities" | "workouts">,
  end: string,
  weeks = 8,
) {
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(weekStart(end), -(weeks - 1 - i) * 7);
    return { date: start, ...summarize(data, start, addDays(start, 6)) };
  });
}
// Only an unambiguous one-to-one match with a measured target can complete a plan.
export function findMatches(workouts: Workout[], activities: Activity[]) {
  const candidates = new Map<string, string[]>();
  for (const w of workouts.filter(
    (w) =>
      (w.status === "Planned" || w.status === "Partially Completed") &&
      !w.linkedActivityId,
  )) {
    const ids = activities
      .filter((a) => {
        if (a.date !== w.date || a.type !== sport(w.type) || a.type === "other")
          return false;
        if (
          w.time &&
          Math.abs(
            new Date(a.startedAt).getTime() -
              new Date(`${w.date}T${w.time}:00+07:00`).getTime(),
          ) >
            90 * 60000
        )
          return false;
        if (w.distanceKm && a.distanceKm)
          return Math.abs(a.distanceKm - w.distanceKm) / w.distanceKm <= 0.25;
        if (w.durationMin && a.durationSec)
          return (
            Math.abs(a.durationSec / 60 - w.durationMin) / w.durationMin <= 0.25
          );
        return false;
      })
      .map((a) => a.id);
    candidates.set(w.id, ids);
  }
  return [...candidates].flatMap(([workoutId, ids]) =>
    ids.length === 1 &&
    [...candidates.values()].filter((x) => x.includes(ids[0])).length === 1
      ? [{ workoutId, activityId: ids[0] }]
      : [],
  );
}

export interface CommuteMatch {
  workoutId: string;
  activityIds: string[];
  status: "Completed" | "Partially Completed";
}
export function uniqueActivityMatches<
  T extends { workoutId: string; activityIds: string[] },
>(matches: T[]): T[] {
  const owners = new Map<string, Set<string>>();
  for (const m of matches)
    for (const id of m.activityIds) {
      const claimed = owners.get(id) ?? new Set<string>();
      claimed.add(m.workoutId);
      owners.set(id, claimed);
    }
  return matches.filter((m) =>
    m.activityIds.every((id) => owners.get(id)?.size === 1),
  );
}
// A scheduled, unique cycling activity is evidence for an open-target commute.
// Multi-ride plans count each distinct ride once; the return leg needs its own
// scheduled time. Missing or ambiguous evidence never completes a round trip.
export function findCommuteMatches(
  workouts: Workout[],
  activities: Activity[],
  reserved: Set<string> = new Set(),
): CommuteMatch[] {
  const eligible = workouts.filter(
    (w) =>
      w.type === "Bike-to-Work" &&
      (w.status === "Planned" ||
        (w.status === "Partially Completed" &&
          w.completionSource === "garmin")),
  );
  const existing = (w: Workout) =>
    w.linkedActivityIds ?? (w.linkedActivityId ? [w.linkedActivityId] : []);
  const unavailable = new Set([...reserved, ...workouts.flatMap(existing)]);
  const near = (activity: Activity, w: Workout, time: string) =>
    Math.abs(
      Date.parse(activity.startedAt) - Date.parse(`${w.date}T${time}:00+07:00`),
    ) <=
    90 * 60000;
  const measured = (a: Activity) =>
    (a.distanceKm != null && a.distanceKm > 0) ||
    (a.durationSec != null && a.durationSec > 0);
  const slots: { workoutId: string; ids: string[] }[] = [];
  for (const w of eligible) {
    const linked = existing(w),
      legs = w.commuteLegs ?? 1;
    if (linked.length >= legs) continue;
    const times = legs === 2 ? [w.time, w.commuteReturnTime] : [w.time];
    for (const [leg, time] of times.entries()) {
      if (
        time &&
        linked.some((id) => {
          const a = activities.find((a) => a.id === id);
          return a && near(a, w, time);
        })
      )
        continue;
      if (
        !time &&
        (leg > 0 || linked.length || (!w.distanceKm && !w.durationMin))
      )
        continue;
      const ids = activities
        .filter((a) => {
          if (
            unavailable.has(a.id) ||
            a.date !== w.date ||
            a.type !== "cycling" ||
            !measured(a)
          )
            return false;
          if (time && !near(a, w, time)) return false;
          // A round-trip target describes both rides, not an individual leg.
          if (legs === 1) {
            if (w.distanceKm && a.distanceKm)
              return (
                Math.abs(a.distanceKm - w.distanceKm) / w.distanceKm <= 0.25
              );
            if (w.durationMin && a.durationSec)
              return (
                Math.abs(a.durationSec / 60 - w.durationMin) / w.durationMin <=
                0.25
              );
          }
          return !!time;
        })
        .map((a) => a.id);
      slots.push({ workoutId: w.id, ids });
    }
  }
  const claims = new Map<string, number>();
  for (const slot of slots)
    for (const id of slot.ids) claims.set(id, (claims.get(id) ?? 0) + 1);
  return eligible.flatMap((w) => {
    const linked = existing(w),
      legs = w.commuteLegs ?? 1;
    const additions = slots
      .filter(
        (s) =>
          s.workoutId === w.id &&
          s.ids.length === 1 &&
          claims.get(s.ids[0]) === 1,
      )
      .map((s) => s.ids[0]);
    const ids = [...new Set([...linked, ...additions])];
    if (!ids.length || ids.length > legs) return [];
    ids.sort((a, b) =>
      (activities.find((x) => x.id === a)?.startedAt ?? "").localeCompare(
        activities.find((x) => x.id === b)?.startedAt ?? "",
      ),
    );
    const status =
      ids.length === legs
        ? ("Completed" as const)
        : ("Partially Completed" as const);
    if (JSON.stringify(ids) === JSON.stringify(linked) && status === w.status)
      return [];
    return [{ workoutId: w.id, activityIds: ids, status }];
  });
}
